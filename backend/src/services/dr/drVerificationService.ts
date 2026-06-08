/**
 * Backup file integrity verification (checksum, pg_restore --list, TOC analysis).
 */

import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import type pg from 'pg';
import { getBackupRun } from '../backupSchedulerService.js';
import { readBackupPlaintextFromPath } from '../backup/backupFileService.js';

export type DrVerificationRunRow = {
  id: string;
  backup_run_id: string | null;
  offsite_upload_id: string | null;
  status: 'pending' | 'running' | 'passed' | 'failed';
  verification_type: string;
  file_path: string | null;
  file_size_bytes: string | null;
  sha256: string | null;
  pg_restore_list_ok: boolean | null;
  toc_entry_count: number | null;
  integrity_score: number | null;
  issues: unknown[];
  started_at: string;
  completed_at: string | null;
  failure_reason: string | null;
  requested_by: string | null;
  created_at: string;
};

const CORE_TABLES = [
  'tenants',
  'accounts',
  'transactions',
  'journal_entries',
  'invoices',
  'bills',
] as const;

function runCommand(
  command: string,
  args: string[],
  logLabel: string
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (stderr.trim()) console.error(`[${logLabel}]`, stderr.trim());
      resolve({ code, stdout, stderr });
    });
  });
}

async function sha256File(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  return createHash('sha256').update(buf).digest('hex');
}

export type VerificationAnalysis = {
  fileExists: boolean;
  fileSizeBytes: number;
  sha256: string;
  pgRestoreListOk: boolean;
  tocEntryCount: number;
  coreTablesFound: string[];
  coreTablesMissing: string[];
  issues: string[];
  integrityScore: number;
};

export async function analyzeBackupFileFromPath(
  filePath: string,
  opts?: { password?: string }
): Promise<VerificationAnalysis> {
  const plain = await readBackupPlaintextFromPath(filePath, opts);
  const tmpPath = `${filePath}.verify-tmp.dump`;
  await fs.writeFile(tmpPath, plain);
  try {
    return await analyzeBackupFile(tmpPath);
  } finally {
    await fs.unlink(tmpPath).catch(() => undefined);
  }
}

export async function analyzeBackupFile(filePath: string): Promise<VerificationAnalysis> {
  const issues: string[] = [];
  let fileExists = false;
  let fileSizeBytes = 0;
  let sha256 = '';
  let pgRestoreListOk = false;
  let tocEntryCount = 0;
  const coreTablesFound: string[] = [];
  const coreTablesMissing: string[] = [];

  try {
    const stat = await fs.stat(filePath);
    fileExists = true;
    fileSizeBytes = stat.size;
    if (fileSizeBytes <= 0) {
      issues.push('Backup file is empty.');
    }
  } catch {
    issues.push('Backup file not found or unreadable.');
    return {
      fileExists,
      fileSizeBytes,
      sha256,
      pgRestoreListOk,
      tocEntryCount,
      coreTablesFound,
      coreTablesMissing: [...CORE_TABLES],
      issues,
      integrityScore: 0,
    };
  }

  try {
    sha256 = await sha256File(filePath);
  } catch {
    issues.push('Failed to compute SHA-256 checksum.');
  }

  try {
    const { code, stdout, stderr } = await runCommand(
      'pg_restore',
      ['--list', filePath],
      'pg_restore_list'
    );
    if (code === 0 && stdout.trim()) {
      pgRestoreListOk = true;
      const lines = stdout.split('\n').filter((l) => l.trim());
      tocEntryCount = lines.length;

      for (const table of CORE_TABLES) {
        const pattern = new RegExp(`TABLE DATA.*\\b${table}\\b`, 'i');
        if (pattern.test(stdout)) {
          coreTablesFound.push(table);
        } else {
          coreTablesMissing.push(table);
        }
      }
      if (coreTablesMissing.length > 0) {
        issues.push(`Missing core tables in dump: ${coreTablesMissing.join(', ')}.`);
      }
    } else {
      const msg = stderr.trim() || `pg_restore --list exited with code ${code}`;
      issues.push(`pg_restore --list failed: ${msg}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('ENOENT') || msg.toLowerCase().includes('spawn')) {
      issues.push('pg_restore not found on PATH.');
    } else {
      issues.push(`pg_restore error: ${msg}`);
    }
  }

  let score = 0;
  if (fileExists && fileSizeBytes > 0) score += 20;
  if (sha256) score += 20;
  if (pgRestoreListOk) score += 30;
  if (coreTablesFound.length === CORE_TABLES.length) score += 30;
  else score += Math.round((coreTablesFound.length / CORE_TABLES.length) * 30);

  return {
    fileExists,
    fileSizeBytes,
    sha256,
    pgRestoreListOk,
    tocEntryCount,
    coreTablesFound,
    coreTablesMissing,
    issues,
    integrityScore: Math.min(100, score),
  };
}

function mapRow(row: pg.QueryResultRow): DrVerificationRunRow {
  return {
    id: row.id,
    backup_run_id: row.backup_run_id,
    offsite_upload_id: row.offsite_upload_id,
    status: row.status,
    verification_type: row.verification_type,
    file_path: row.file_path,
    file_size_bytes: row.file_size_bytes != null ? String(row.file_size_bytes) : null,
    sha256: row.sha256,
    pg_restore_list_ok: row.pg_restore_list_ok,
    toc_entry_count: row.toc_entry_count,
    integrity_score: row.integrity_score,
    issues: Array.isArray(row.issues) ? row.issues : [],
    started_at: row.started_at,
    completed_at: row.completed_at,
    failure_reason: row.failure_reason,
    requested_by: row.requested_by,
    created_at: row.created_at,
  };
}

export async function getLatestSuccessfulBackupRun(
  client: pg.PoolClient
): Promise<{ id: string; storage_path: string; size_bytes: string | null } | null> {
  const { rows } = await client.query(
    `SELECT id, storage_path, size_bytes FROM backup_job_runs
     WHERE success = true AND storage_path IS NOT NULL
     ORDER BY completed_at DESC NULLS LAST
     LIMIT 1`
  );
  if (rows.length === 0) return null;
  return rows[0];
}

export async function runVerificationForBackupRun(
  client: pg.PoolClient,
  backupRunId: string,
  requestedBy: string | null
): Promise<DrVerificationRunRow> {
  const run = await getBackupRun(client, backupRunId);
  if (!run || !run.success || !run.storage_path) {
    throw new Error('Backup run not found or has no successful dump file.');
  }
  return executeVerification(client, {
    backupRunId,
    filePath: run.storage_path,
    requestedBy,
  });
}

export async function runVerificationForLatestBackup(
  client: pg.PoolClient,
  requestedBy: string | null
): Promise<DrVerificationRunRow> {
  const latest = await getLatestSuccessfulBackupRun(client);
  if (!latest?.storage_path) {
    throw new Error('No successful backup with a dump file found.');
  }
  return executeVerification(client, {
    backupRunId: latest.id,
    filePath: latest.storage_path,
    requestedBy,
  });
}

async function executeVerification(
  client: pg.PoolClient,
  opts: { backupRunId: string; filePath: string; requestedBy: string | null }
): Promise<DrVerificationRunRow> {
  const id = randomUUID();
  const startedAt = new Date().toISOString();

  await client.query(
    `INSERT INTO dr_verification_runs (id, backup_run_id, status, verification_type, file_path, started_at, requested_by)
     VALUES ($1, $2, 'running', 'integrity', $3, $4, $5)`,
    [id, opts.backupRunId, opts.filePath, startedAt, opts.requestedBy]
  );

  const analysis = await analyzeBackupFileFromPath(opts.filePath);
  const passed = analysis.issues.length === 0 && analysis.integrityScore >= 80;
  const status = passed ? 'passed' : 'failed';
  const failureReason = passed ? null : analysis.issues.join(' ');

  await client.query(
    `UPDATE dr_verification_runs SET
       status = $2,
       file_size_bytes = $3,
       sha256 = $4,
       pg_restore_list_ok = $5,
       toc_entry_count = $6,
       integrity_score = $7,
       issues = $8::jsonb,
       completed_at = NOW(),
       failure_reason = $9
     WHERE id = $1`,
    [
      id,
      status,
      analysis.fileSizeBytes,
      analysis.sha256 || null,
      analysis.pgRestoreListOk,
      analysis.tocEntryCount,
      analysis.integrityScore,
      JSON.stringify(analysis.issues),
      failureReason,
    ]
  );

  const { rows } = await client.query(`SELECT * FROM dr_verification_runs WHERE id = $1`, [id]);
  return mapRow(rows[0]);
}

export async function listVerificationRuns(
  client: pg.PoolClient,
  limit = 50
): Promise<DrVerificationRunRow[]> {
  const { rows } = await client.query(
    `SELECT * FROM dr_verification_runs ORDER BY started_at DESC LIMIT $1`,
    [limit]
  );
  return rows.map(mapRow);
}

export async function getLastPassedVerification(
  client: pg.PoolClient
): Promise<DrVerificationRunRow | null> {
  const { rows } = await client.query(
    `SELECT * FROM dr_verification_runs WHERE status = 'passed' ORDER BY completed_at DESC NULLS LAST LIMIT 1`
  );
  return rows.length ? mapRow(rows[0]) : null;
}
