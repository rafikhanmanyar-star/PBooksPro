/**
 * Automated backup scheduler — daily / weekly / monthly full PostgreSQL backups.
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type pg from 'pg';
import { getPool } from '../db/pool.js';
import {
  isPgBackupAvailable,
  runFullPgBackupToDirectory,
} from './fullPgBackupService.js';
import { queueOffsiteUploadAfterBackup } from './backup/backupOffsiteService.js';
import { onBackupJobFinished } from './dr/drHookService.js';
import {
  encryptBackupForStorage,
  sha256Hex,
} from './backup/backupCryptoService.js';
import { getBackupSecuritySettings } from './backup/backupSecuritySettingsService.js';
import { logBackupAudit } from './backup/backupAuditService.js';

export type BackupFrequency = 'daily' | 'weekly' | 'monthly';
export type BackupJobStatus = 'idle' | 'running' | 'failed' | 'disabled';
export type BackupType = 'full_pg' | 'tenant';

export type BackupJobRow = {
  id: string;
  job_name: string;
  backup_type: BackupType;
  frequency: BackupFrequency;
  last_run: string | null;
  next_run: string;
  status: BackupJobStatus;
  retention_days: number;
  storage_location: string;
  created_at: string;
  updated_at: string;
};

export type BackupJobRunRow = {
  id: string;
  job_id: string;
  started_at: string;
  completed_at: string | null;
  size_bytes: string | null;
  duration_ms: number | null;
  success: boolean;
  failure_reason: string | null;
  storage_path: string | null;
  attempt_number: number;
  created_at: string;
  encrypted?: boolean;
  encryption_mode?: string | null;
  content_sha256?: string | null;
  job_name?: string;
  backup_type?: BackupType;
  frequency?: BackupFrequency;
};

export const MAX_BACKUP_ATTEMPTS = 3;
export const RETRY_DELAYS_MS = [60_000, 300_000, 900_000] as const;

const DEFAULT_JOBS: Array<{
  id: string;
  job_name: string;
  frequency: BackupFrequency;
  retention_days: number;
}> = [
  { id: 'backup-daily-full', job_name: 'Daily Full Backup', frequency: 'daily', retention_days: 7 },
  { id: 'backup-weekly-full', job_name: 'Weekly Full Backup', frequency: 'weekly', retention_days: 30 },
  { id: 'backup-monthly-full', job_name: 'Monthly Full Backup', frequency: 'monthly', retention_days: 365 },
];

const runningJobIds = new Set<string>();
const pendingRetries = new Map<string, ReturnType<typeof setTimeout>>();

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

export function getBackupStorageRoot(): string {
  const configured = process.env.BACKUP_STORAGE_PATH?.trim();
  if (configured) return path.resolve(configured);
  return path.resolve(process.cwd(), 'backups', 'pg');
}

/** Compute next scheduled run in server local time. */
export function computeNextRun(frequency: BackupFrequency, from: Date = new Date()): Date {
  if (frequency === 'daily') {
    const next = new Date(from);
    next.setHours(2, 0, 0, 0);
    if (next <= from) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  }

  if (frequency === 'weekly') {
    const next = new Date(from);
    next.setHours(1, 0, 0, 0);
    const day = next.getDay();
    const daysUntilSunday = (7 - day) % 7;
    next.setDate(next.getDate() + daysUntilSunday);
    if (next <= from) {
      next.setDate(next.getDate() + 7);
    }
    return next;
  }

  const next = new Date(from);
  next.setDate(1);
  next.setHours(1, 0, 0, 0);
  if (next <= from) {
    next.setMonth(next.getMonth() + 1);
    next.setDate(1);
    next.setHours(1, 0, 0, 0);
  }
  return next;
}

export function retryDelayMs(attemptNumber: number): number {
  const idx = Math.min(Math.max(attemptNumber - 1, 0), RETRY_DELAYS_MS.length - 1);
  return RETRY_DELAYS_MS[idx] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
}

export function isBackupSchedulerEnabled(): boolean {
  const flag = process.env.ENABLE_BACKUP_SCHEDULER?.trim().toLowerCase();
  if (flag === 'false' || flag === '0' || flag === 'no') return false;
  return isPgBackupAvailable();
}

function mapJob(row: pg.QueryResultRow): BackupJobRow {
  return row as BackupJobRow;
}

function mapRun(row: pg.QueryResultRow): BackupJobRunRow {
  return row as BackupJobRunRow;
}

export async function ensureDefaultBackupJobs(client: pg.PoolClient): Promise<void> {
  const storageRoot = getBackupStorageRoot();
  await fs.mkdir(storageRoot, { recursive: true });

  for (const def of DEFAULT_JOBS) {
    const existing = await client.query(`SELECT id FROM backup_jobs WHERE id = $1`, [def.id]);
    if (existing.rows.length > 0) continue;

    const nextRun = computeNextRun(def.frequency);
    await client.query(
      `INSERT INTO backup_jobs (
         id, job_name, backup_type, frequency, next_run, status, retention_days, storage_location
       ) VALUES ($1, $2, 'full_pg', $3, $4, 'idle', $5, $6)`,
      [def.id, def.job_name, def.frequency, nextRun.toISOString(), def.retention_days, storageRoot]
    );
  }
}

export async function listBackupJobs(client: pg.PoolClient): Promise<BackupJobRow[]> {
  const r = await client.query(
    `SELECT * FROM backup_jobs ORDER BY
       CASE frequency WHEN 'daily' THEN 1 WHEN 'weekly' THEN 2 ELSE 3 END,
       job_name`
  );
  return r.rows.map(mapJob);
}

export async function listBackupHistory(
  client: pg.PoolClient,
  opts: { jobId?: string; limit?: number; offset?: number } = {}
): Promise<{ items: BackupJobRunRow[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  const params: unknown[] = [];
  let where = '';
  if (opts.jobId) {
    params.push(opts.jobId);
    where = `WHERE r.job_id = $${params.length}`;
  }

  const countSql = `SELECT COUNT(*)::int AS c FROM backup_job_runs r ${where}`;
  const countR = await client.query(countSql, params);
  const total = Number(countR.rows[0]?.c ?? 0);

  params.push(limit, offset);
  const listSql = `
    SELECT r.*, j.job_name, j.backup_type, j.frequency
    FROM backup_job_runs r
    JOIN backup_jobs j ON j.id = r.job_id
    ${where}
    ORDER BY r.started_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}`;
  const listR = await client.query(listSql, params);
  return { items: listR.rows.map(mapRun), total };
}

export async function getBackupJob(client: pg.PoolClient, jobId: string): Promise<BackupJobRow | null> {
  const r = await client.query(`SELECT * FROM backup_jobs WHERE id = $1`, [jobId]);
  return r.rows[0] ? mapJob(r.rows[0]) : null;
}

export async function getBackupRun(client: pg.PoolClient, runId: string): Promise<BackupJobRunRow | null> {
  const r = await client.query(
    `SELECT r.*, j.job_name, j.backup_type, j.frequency
     FROM backup_job_runs r
     JOIN backup_jobs j ON j.id = r.job_id
     WHERE r.id = $1`,
    [runId]
  );
  return r.rows[0] ? mapRun(r.rows[0]) : null;
}

async function applyRetention(storageDir: string, retentionDays: number): Promise<void> {
  if (retentionDays <= 0) return;
  let entries: string[];
  try {
    entries = await fs.readdir(storageDir);
  } catch {
    return;
  }
  const cutoff = Date.now() - retentionDays * 86_400_000;
  for (const name of entries) {
    if (!name.endsWith('.dump') && !name.endsWith('.pbkenc')) continue;
    const full = path.join(storageDir, name);
    try {
      const stat = await fs.stat(full);
      if (stat.mtimeMs < cutoff) {
        await fs.unlink(full);
      }
    } catch {
      /* ignore per-file errors */
    }
  }
}

async function executeBackupJob(
  client: pg.PoolClient,
  job: BackupJobRow,
  attemptNumber: number
): Promise<BackupJobRunRow> {
  const runId = randomUUID();
  const startedAt = new Date();

  await client.query(
    `INSERT INTO backup_job_runs (id, job_id, started_at, attempt_number, success)
     VALUES ($1, $2, $3, $4, false)`,
    [runId, job.id, startedAt.toISOString(), attemptNumber]
  );

  await client.query(
    `UPDATE backup_jobs SET status = 'running', updated_at = NOW() WHERE id = $1`,
    [job.id]
  );

  let storagePath: string | null = null;
  let sizeBytes: number | null = null;
  let failureReason: string | null = null;
  let success = false;
  let encrypted = false;
  let encryptionMode: string | null = null;
  let contentSha256: string | null = null;

  try {
    if (job.backup_type !== 'full_pg') {
      throw new Error(`Backup type "${job.backup_type}" is not supported by the scheduler yet.`);
    }
    await fs.mkdir(job.storage_location, { recursive: true });
    const result = await runFullPgBackupToDirectory(job.storage_location, `pbooks-${job.id}`);
    storagePath = result.path;
    sizeBytes = result.sizeBytes;

    const security = await getBackupSecuritySettings(client);

    if (security.encrypt_at_rest) {
      const plain = await fs.readFile(storagePath);
      contentSha256 = sha256Hex(plain);
      const enc = encryptBackupForStorage(plain);
      const encPath = storagePath.replace(/\.dump$/i, '.pbkenc');
      await fs.writeFile(encPath, enc);
      await fs.unlink(storagePath);
      storagePath = encPath;
      sizeBytes = enc.length;
      encrypted = true;
      encryptionMode = 'server';
    }

    success = true;
    await applyRetention(job.storage_location, job.retention_days);
  } catch (e) {
    failureReason = e instanceof Error ? e.message : String(e);
  }

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();

  await client.query(
    `UPDATE backup_job_runs SET
       completed_at = $2,
       size_bytes = $3,
       duration_ms = $4,
       success = $5,
       failure_reason = $6,
       storage_path = $7,
       encrypted = $8,
       encryption_mode = $9,
       content_sha256 = $10
     WHERE id = $1`,
    [
      runId,
      completedAt.toISOString(),
      sizeBytes,
      durationMs,
      success,
      failureReason,
      storagePath,
      encrypted ?? false,
      encryptionMode,
      contentSha256,
    ]
  );

  const nextRun = computeNextRun(job.frequency, completedAt);
  const jobStatus: BackupJobStatus = success ? 'idle' : 'failed';

  await client.query(
    `UPDATE backup_jobs SET
       last_run = $2,
       next_run = $3,
       status = $4,
       updated_at = NOW()
     WHERE id = $1`,
    [job.id, completedAt.toISOString(), nextRun.toISOString(), jobStatus]
  );

  const run = await getBackupRun(client, runId);
  if (!run) {
    throw new Error('Failed to load backup run after execution.');
  }

  if (!success && attemptNumber < MAX_BACKUP_ATTEMPTS) {
    scheduleAutoRetry(job.id, attemptNumber + 1);
  }

  if (success && storagePath) {
    void queueOffsiteUploadAfterBackup(runId, storagePath);
  }

  void onBackupJobFinished(runId, success);

  if (success) {
    try {
      const { rows } = await client.query(`SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1`);
      const tenantId = rows[0]?.id as string | undefined;
      if (tenantId) {
        await logBackupAudit(client, {
          tenantId,
          action: 'backup_created',
          entityId: runId,
          summary: `Scheduled backup completed: ${job.job_name}`,
          details: {
            jobId: job.id,
            sizeBytes,
            encrypted,
            encryptionMode,
            storagePath,
          },
        });
      }
    } catch (auditErr) {
      console.warn('[BackupAudit] Failed to log scheduled backup:', auditErr);
    }
  }

  return run;
}

function scheduleAutoRetry(jobId: string, nextAttempt: number): void {
  const key = `${jobId}:${nextAttempt}`;
  if (pendingRetries.has(key)) return;

  const delay = retryDelayMs(nextAttempt);
  const timer = setTimeout(() => {
    pendingRetries.delete(key);
    void runBackupJobById(jobId, nextAttempt).catch((e) => {
      console.error(`[BackupScheduler] Auto-retry failed for job ${jobId}:`, e);
    });
  }, delay);
  pendingRetries.set(key, timer);
  console.log(
    `[BackupScheduler] Scheduled retry #${nextAttempt} for job ${jobId} in ${Math.round(delay / 1000)}s`
  );
}

export async function deleteBackupRun(
  client: pg.PoolClient,
  runId: string
): Promise<{ deleted: true; storagePath: string | null }> {
  const run = await getBackupRun(client, runId);
  if (!run) {
    throw new Error('Backup run not found.');
  }
  if (run.storage_path) {
    try {
      await fs.unlink(run.storage_path);
    } catch {
      /* file may already be gone */
    }
  }
  await client.query(`DELETE FROM backup_job_runs WHERE id = $1`, [runId]);
  return { deleted: true, storagePath: run.storage_path };
}

export async function runBackupJobById(
  jobId: string,
  attemptNumber = 1
): Promise<BackupJobRunRow> {
  if (runningJobIds.has(jobId)) {
    throw new Error('Backup job is already running.');
  }
  if (!isPgBackupAvailable()) {
    throw new Error('PostgreSQL backup is not available on this server.');
  }

  runningJobIds.add(jobId);
  const pool = getPool();
  const client = await pool.connect();
  try {
    const job = await getBackupJob(client, jobId);
    if (!job) {
      throw new Error('Backup job not found.');
    }
    if (job.status === 'disabled') {
      throw new Error('Backup job is disabled.');
    }
    return await executeBackupJob(client, job, attemptNumber);
  } finally {
    runningJobIds.delete(jobId);
    client.release();
  }
}

export async function retryFailedRun(runId: string): Promise<BackupJobRunRow> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const run = await getBackupRun(client, runId);
    if (!run) {
      throw new Error('Backup run not found.');
    }
    if (run.success) {
      throw new Error('Cannot retry a successful backup run.');
    }
    return await runBackupJobById(run.job_id, 1);
  } finally {
    client.release();
  }
}

export async function runDueBackupJobs(): Promise<number> {
  if (!isBackupSchedulerEnabled()) return 0;

  const pool = getPool();
  const client = await pool.connect();
  let dueJobs: BackupJobRow[] = [];
  try {
    await ensureDefaultBackupJobs(client);
    const r = await client.query(
      `SELECT * FROM backup_jobs
       WHERE status NOT IN ('running', 'disabled')
         AND next_run <= NOW()
       ORDER BY next_run ASC`
    );
    dueJobs = r.rows.map(mapJob);
  } finally {
    client.release();
  }

  let executed = 0;
  for (const job of dueJobs) {
    if (runningJobIds.has(job.id)) continue;
    try {
      await runBackupJobById(job.id, 1);
      executed += 1;
    } catch (e) {
      console.error(`[BackupScheduler] Failed to run job ${job.id}:`, e);
    }
  }
  return executed;
}

const SCHEDULER_POLL_MS = 60_000;

export function startBackupScheduler(): void {
  if (!isBackupSchedulerEnabled()) {
    console.log('[BackupScheduler] Disabled (ENABLE_BACKUP_SCHEDULER or pg backup not available).');
    return;
  }
  if (schedulerInterval) return;

  void (async () => {
    try {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await ensureDefaultBackupJobs(client);
      } finally {
        client.release();
      }
    } catch (e) {
      console.error('[BackupScheduler] Failed to seed default jobs:', e);
    }
  })();

  schedulerInterval = setInterval(() => {
    void runDueBackupJobs().catch((e) => {
      console.error('[BackupScheduler] Poll error:', e);
    });
  }, SCHEDULER_POLL_MS);

  console.log(
    `[BackupScheduler] Started (poll every ${SCHEDULER_POLL_MS / 1000}s, storage: ${getBackupStorageRoot()})`
  );
}

export function stopBackupScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  for (const timer of pendingRetries.values()) {
    clearTimeout(timer);
  }
  pendingRetries.clear();
}

/** Test hook — reset module state. */
export function _resetSchedulerForTests(): void {
  stopBackupScheduler();
  runningJobIds.clear();
}
