/**
 * Restore simulation / recovery testing (no actual DB restore).
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { getBackupRun } from '../backupSchedulerService.js';
import { analyzeBackupFileFromPath } from './drVerificationService.js';

export type DrRestoreTestRow = {
  id: string;
  backup_run_id: string | null;
  test_type: 'simulation' | 'recovery';
  status: 'pending' | 'running' | 'passed' | 'failed';
  duration_ms: number | null;
  simulation_details: Record<string, unknown> | null;
  failure_reason: string | null;
  started_at: string;
  completed_at: string | null;
  requested_by: string | null;
  created_at: string;
};

function mapRow(row: pg.QueryResultRow): DrRestoreTestRow {
  return {
    id: row.id,
    backup_run_id: row.backup_run_id,
    test_type: row.test_type,
    status: row.status,
    duration_ms: row.duration_ms,
    simulation_details:
      row.simulation_details && typeof row.simulation_details === 'object'
        ? (row.simulation_details as Record<string, unknown>)
        : null,
    failure_reason: row.failure_reason,
    started_at: row.started_at,
    completed_at: row.completed_at,
    requested_by: row.requested_by,
    created_at: row.created_at,
  };
}

async function executeRestoreTest(
  client: pg.PoolClient,
  opts: {
    backupRunId: string;
    filePath: string;
    testType: 'simulation' | 'recovery';
    requestedBy: string | null;
  }
): Promise<DrRestoreTestRow> {
  const id = randomUUID();
  const t0 = Date.now();

  await client.query(
    `INSERT INTO dr_restore_tests (id, backup_run_id, test_type, status, started_at, requested_by)
     VALUES ($1, $2, $3, 'running', NOW(), $4)`,
    [id, opts.backupRunId, opts.testType, opts.requestedBy]
  );

  const analysis = await analyzeBackupFileFromPath(opts.filePath);
  const durationMs = Date.now() - t0;

  const minScore = opts.testType === 'recovery' ? 90 : 80;
  const passed =
    analysis.pgRestoreListOk &&
    analysis.coreTablesMissing.length === 0 &&
    analysis.integrityScore >= minScore;

  const simulationDetails = {
    tocEntryCount: analysis.tocEntryCount,
    integrityScore: analysis.integrityScore,
    coreTablesFound: analysis.coreTablesFound,
    coreTablesMissing: analysis.coreTablesMissing,
    sha256: analysis.sha256,
    fileSizeBytes: analysis.fileSizeBytes,
    simulatedRestore: true,
    testType: opts.testType,
  };

  const status = passed ? 'passed' : 'failed';
  const failureReason = passed
    ? null
    : analysis.issues.join(' ') ||
      `Integrity score ${analysis.integrityScore} below threshold ${minScore}.`;

  await client.query(
    `UPDATE dr_restore_tests SET
       status = $2,
       duration_ms = $3,
       simulation_details = $4::jsonb,
       completed_at = NOW(),
       failure_reason = $5
     WHERE id = $1`,
    [id, status, durationMs, JSON.stringify(simulationDetails), failureReason]
  );

  const { rows } = await client.query(`SELECT * FROM dr_restore_tests WHERE id = $1`, [id]);
  return mapRow(rows[0]);
}

export async function runRestoreSimulation(
  client: pg.PoolClient,
  backupRunId: string,
  requestedBy: string | null
): Promise<DrRestoreTestRow> {
  const run = await getBackupRun(client, backupRunId);
  if (!run?.storage_path) {
    throw new Error('Backup run not found or has no dump file.');
  }
  return executeRestoreTest(client, {
    backupRunId,
    filePath: run.storage_path,
    testType: 'simulation',
    requestedBy,
  });
}

export async function runRecoveryTest(
  client: pg.PoolClient,
  backupRunId: string,
  requestedBy: string | null
): Promise<DrRestoreTestRow> {
  const run = await getBackupRun(client, backupRunId);
  if (!run?.success || !run.storage_path) {
    throw new Error('Backup run not found or backup was not successful.');
  }
  return executeRestoreTest(client, {
    backupRunId,
    filePath: run.storage_path,
    testType: 'recovery',
    requestedBy,
  });
}

export async function runRestoreTestForLatest(
  client: pg.PoolClient,
  testType: 'simulation' | 'recovery',
  requestedBy: string | null
): Promise<DrRestoreTestRow> {
  const { rows } = await client.query(
    `SELECT id, storage_path, success FROM backup_job_runs
     WHERE storage_path IS NOT NULL
     ORDER BY completed_at DESC NULLS LAST
     LIMIT 1`
  );
  if (rows.length === 0) {
    throw new Error('No backup run with a dump file found.');
  }
  const row = rows[0];
  if (testType === 'recovery' && !row.success) {
    throw new Error('Latest backup run was not successful.');
  }
  return executeRestoreTest(client, {
    backupRunId: row.id,
    filePath: row.storage_path,
    testType,
    requestedBy,
  });
}

export async function listRestoreTests(
  client: pg.PoolClient,
  limit = 50
): Promise<DrRestoreTestRow[]> {
  const { rows } = await client.query(
    `SELECT * FROM dr_restore_tests ORDER BY started_at DESC LIMIT $1`,
    [limit]
  );
  return rows.map(mapRow);
}

export async function getLastPassedRestoreTest(
  client: pg.PoolClient
): Promise<DrRestoreTestRow | null> {
  const { rows } = await client.query(
    `SELECT * FROM dr_restore_tests WHERE status = 'passed' ORDER BY completed_at DESC NULLS LAST LIMIT 1`
  );
  return rows.length ? mapRow(rows[0]) : null;
}
