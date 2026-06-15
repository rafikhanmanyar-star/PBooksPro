/**
 * Restore simulation / recovery testing (no actual DB restore).
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { getBackupRun } from '../../../backup/services/backupSchedulerService.js';
import { analyzeBackupFileFromPath } from './drVerificationService.js';
import { BackupJobRepository } from '../../../backup/repositories/BackupJobRepository.js';
import { DrRestoreTestRepository } from '../../repositories/DrRepository.js';

const jobRepo = new BackupJobRepository();
const restoreTestRepo = new DrRestoreTestRepository();

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

  await restoreTestRepo.insertRunning(client, {
    id,
    backupRunId: opts.backupRunId,
    testType: opts.testType,
    requestedBy: opts.requestedBy,
  });

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

  const row = await restoreTestRepo.complete(client, id, {
    status,
    durationMs,
    simulationDetails,
    failureReason,
  });

  return mapRow(row);
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
  const row = await jobRepo.getLatestRunWithPath(client);
  if (!row) {
    throw new Error('No backup run with a dump file found.');
  }
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
  const rows = await restoreTestRepo.list(client, limit);
  return rows.map(mapRow);
}

export async function getLastPassedRestoreTest(
  client: pg.PoolClient
): Promise<DrRestoreTestRow | null> {
  const row = await restoreTestRepo.getLastPassed(client);
  return row ? mapRow(row) : null;
}
