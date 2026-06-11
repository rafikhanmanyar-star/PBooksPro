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
import { BackupJobRepository } from '../modules/backup/repositories/BackupJobRepository.js';
import { TenantBackupRepository } from '../modules/backup/repositories/TenantBackupRepository.js';

const jobRepo = new BackupJobRepository();
const tenantBackupRepo = new TenantBackupRepository();

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
  const userData = process.env.PBOOKS_USER_DATA_DIR?.trim();
  if (userData) return path.resolve(userData, 'backend', 'backups', 'pg');
  const cwd = process.cwd();
  if (/program files/i.test(cwd)) {
    const appData = process.env.APPDATA?.trim() || process.env.HOME?.trim();
    if (appData) return path.resolve(appData, 'PBooksPro', 'backups', 'pg');
  }
  return path.resolve(cwd, 'backups', 'pg');
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
    if (await jobRepo.jobExists(client, def.id)) continue;

    const nextRun = computeNextRun(def.frequency);
    await jobRepo.insertDefaultJob(client, {
      id: def.id,
      jobName: def.job_name,
      frequency: def.frequency,
      nextRun: nextRun.toISOString(),
      retentionDays: def.retention_days,
      storageLocation: storageRoot,
    });
  }
}

export async function listBackupJobs(client: pg.PoolClient): Promise<BackupJobRow[]> {
  return jobRepo.listJobs(client);
}

export async function listBackupHistory(
  client: pg.PoolClient,
  opts: { jobId?: string; limit?: number; offset?: number } = {}
): Promise<{ items: BackupJobRunRow[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  const total = await jobRepo.countRuns(client, opts.jobId);
  const items = await jobRepo.listRuns(client, { jobId: opts.jobId, limit, offset });
  return { items, total };
}

export async function getBackupJob(client: pg.PoolClient, jobId: string): Promise<BackupJobRow | null> {
  return jobRepo.getJob(client, jobId);
}

export async function getBackupRun(client: pg.PoolClient, runId: string): Promise<BackupJobRunRow | null> {
  return jobRepo.getRun(client, runId);
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

  await jobRepo.insertRunStart(client, runId, job.id, startedAt.toISOString(), attemptNumber);
  await jobRepo.setJobStatus(client, job.id, 'running');

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

  await jobRepo.completeRun(client, runId, {
    completedAt: completedAt.toISOString(),
    sizeBytes,
    durationMs,
    success,
    failureReason,
    storagePath,
    encrypted: encrypted ?? false,
    encryptionMode,
    contentSha256,
  });

  const nextRun = computeNextRun(job.frequency, completedAt);
  const jobStatus: BackupJobStatus = success ? 'idle' : 'failed';

  await jobRepo.updateJobAfterRun(
    client,
    job.id,
    completedAt.toISOString(),
    nextRun.toISOString(),
    jobStatus
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
      const tenantId = await tenantBackupRepo.getFirstTenantId(client);
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
  await jobRepo.deleteRun(client, runId);
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
    dueJobs = await jobRepo.listDueJobs(client);
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
