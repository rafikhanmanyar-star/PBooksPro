/**
 * Offsite backup upload, verification, retry, and cloud restore.
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type pg from 'pg';
import { getPool } from '../../../../db/pool.js';
import { getBackupRun } from '../backupSchedulerService.js';
import { runPgRestoreFromFile } from '../pgRestoreService.js';
import {
  decryptBackupPayload,
  encryptBackupPayload,
  isEncryptedBackupPayload,
  sha256Hex,
} from './backupCryptoService.js';
import {
  getConfiguredProvider,
  getStorageSettingsRow,
} from './backupStorageSettingsService.js';
import { BackupOffsiteRepository } from '../../repositories/BackupSettingsRepository.js';

const offsiteRepo = new BackupOffsiteRepository();

export type OffsiteUploadStatus = 'pending' | 'uploading' | 'verifying' | 'completed' | 'failed';

export type OffsiteUploadRow = {
  id: string;
  run_id: string;
  object_key: string;
  provider: string;
  status: OffsiteUploadStatus;
  local_sha256: string | null;
  remote_sha256: string | null;
  remote_etag: string | null;
  encrypted: boolean;
  size_bytes: string | null;
  started_at: string | null;
  completed_at: string | null;
  failure_reason: string | null;
  attempt_number: number;
  created_at: string;
  updated_at: string;
};

export const MAX_OFFSITE_UPLOAD_ATTEMPTS = 3;
export const OFFSITE_RETRY_DELAYS_MS = [30_000, 120_000, 600_000] as const;

const pendingOffsiteRetries = new Map<string, ReturnType<typeof setTimeout>>();

function mapUpload(row: pg.QueryResultRow): OffsiteUploadRow {
  return row as OffsiteUploadRow;
}

export function offsiteRetryDelayMs(attemptNumber: number): number {
  const idx = Math.min(Math.max(attemptNumber - 1, 0), OFFSITE_RETRY_DELAYS_MS.length - 1);
  return OFFSITE_RETRY_DELAYS_MS[idx] ?? OFFSITE_RETRY_DELAYS_MS[OFFSITE_RETRY_DELAYS_MS.length - 1];
}

function buildObjectKey(runId: string, localPath: string): string {
  const base = path.basename(localPath).replace(/\.dump$/i, '');
  return `pbooks/backups/${runId}/${base}.pbkenc`;
}

export async function getOffsiteUpload(
  client: pg.PoolClient,
  uploadId: string
): Promise<OffsiteUploadRow | null> {
  return offsiteRepo.getById(client, uploadId);
}

export async function getOffsiteUploadByRunId(
  client: pg.PoolClient,
  runId: string
): Promise<OffsiteUploadRow | null> {
  return offsiteRepo.getByRunId(client, runId);
}

export async function listOffsiteUploads(
  client: pg.PoolClient,
  opts: { runId?: string; limit?: number } = {}
): Promise<OffsiteUploadRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  return offsiteRepo.list(client, { runId: opts.runId, limit });
}

export async function queueOffsiteUploadAfterBackup(
  runId: string,
  localPath: string
): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const settings = await getStorageSettingsRow(client);
    if (!settings?.enabled || !settings.auto_upload) return;

    const existing = await getOffsiteUploadByRunId(client, runId);
    if (existing && existing.status === 'completed') return;

    if (!existing) {
      const uploadId = randomUUID();
      const objectKey = buildObjectKey(runId, localPath);
      await offsiteRepo.insertPending(client, {
        id: uploadId,
        runId,
        objectKey,
        provider: settings.provider,
        attemptNumber: 1,
      });
    }
  } finally {
    client.release();
  }

  void executeOffsiteUploadForRun(runId, 1).catch((e) => {
    console.error(`[OffsiteBackup] Upload failed for run ${runId}:`, e);
  });
}

async function updateUploadStatus(
  client: pg.PoolClient,
  uploadId: string,
  patch: Partial<{
    status: OffsiteUploadStatus;
    local_sha256: string;
    remote_sha256: string;
    remote_etag: string;
    size_bytes: number;
    started_at: string;
    completed_at: string;
    failure_reason: string | null;
    attempt_number: number;
  }>
): Promise<void> {
  await offsiteRepo.updateStatus(client, uploadId, patch);
}

export async function executeOffsiteUploadForRun(
  runId: string,
  attemptNumber = 1
): Promise<OffsiteUploadRow> {
  const pool = getPool();
  const client = await pool.connect();
  let upload: OffsiteUploadRow | null = null;
  let localPath: string | null = null;

  try {
    const run = await getBackupRun(client, runId);
    if (!run?.success || !run.storage_path) {
      throw new Error('Backup run is not successful or has no local file.');
    }
    localPath = run.storage_path;

    upload = await getOffsiteUploadByRunId(client, runId);
    if (!upload) {
      const settings = await getStorageSettingsRow(client);
      if (!settings?.enabled) {
        throw new Error('Offsite storage is not enabled.');
      }
      const uploadId = randomUUID();
      const objectKey = buildObjectKey(runId, localPath);
      await offsiteRepo.insertPending(client, {
        id: uploadId,
        runId,
        objectKey,
        provider: settings.provider,
        attemptNumber,
      });
      upload = await getOffsiteUpload(client, uploadId);
    }

    if (!upload) throw new Error('Failed to create offsite upload record.');

    const provider = await getConfiguredProvider(client);
    if (!provider) {
      throw new Error('Offsite storage is not configured or enabled.');
    }

    const startedAt = new Date().toISOString();
    await updateUploadStatus(client, upload.id, {
      status: 'uploading',
      started_at: startedAt,
      attempt_number: attemptNumber,
      failure_reason: null,
    });

    const fileBytes = await fs.readFile(localPath);
    const alreadyEncrypted = isEncryptedBackupPayload(fileBytes);
    const securityClient = await pool.connect();
    let encryptBeforeUpload = true;
    try {
      const { getBackupSecuritySettings } = await import('./backupSecuritySettingsService.js');
      const sec = await getBackupSecuritySettings(securityClient);
      encryptBeforeUpload = sec.encrypt_before_upload;
    } finally {
      securityClient.release();
    }

    let plainSha: string;
    let encrypted: Buffer;
    if (alreadyEncrypted) {
      encrypted = fileBytes;
      plainSha =
        (run.content_sha256 as string | undefined) ??
        sha256Hex(decryptBackupPayload(fileBytes));
    } else if (encryptBeforeUpload) {
      plainSha = sha256Hex(fileBytes);
      encrypted = encryptBackupPayload(fileBytes);
    } else {
      plainSha = sha256Hex(fileBytes);
      encrypted = fileBytes;
    }
    const remoteSha = sha256Hex(encrypted);

    const metadata = {
      'plain-sha256': plainSha,
      'content-sha256': remoteSha,
      encrypted: 'true',
      format: 'pbkenc-v1',
      'run-id': runId,
    };

    const result = await provider.upload({
      key: upload.object_key,
      body: encrypted,
      metadata,
    });

    await updateUploadStatus(client, upload.id, {
      status: 'verifying',
      local_sha256: remoteSha,
      size_bytes: encrypted.length,
    });

    const head = await provider.head(upload.object_key);
    const remoteMetaSha = head.metadata['content-sha256'];
    if (remoteMetaSha && remoteMetaSha !== remoteSha) {
      throw new Error('Remote checksum metadata mismatch after upload.');
    }
    if (head.sizeBytes !== encrypted.length) {
      throw new Error(
        `Remote size mismatch: expected ${encrypted.length}, got ${head.sizeBytes}.`
      );
    }

    await updateUploadStatus(client, upload.id, {
      status: 'completed',
      remote_sha256: remoteMetaSha || remoteSha,
      remote_etag: result.etag || head.etag,
      completed_at: new Date().toISOString(),
      failure_reason: null,
    });

    const finalUpload = await getOffsiteUpload(client, upload.id);
    if (!finalUpload) throw new Error('Upload record missing after success.');
    return finalUpload;
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    if (upload) {
      await updateUploadStatus(client, upload.id, {
        status: 'failed',
        failure_reason: reason,
        completed_at: new Date().toISOString(),
      });
    }

    if (attemptNumber < MAX_OFFSITE_UPLOAD_ATTEMPTS) {
      scheduleOffsiteRetry(runId, attemptNumber + 1);
    }

    const failed = upload ? await getOffsiteUpload(client, upload.id) : null;
    if (failed) return failed;
    throw e;
  } finally {
    client.release();
  }
}

function scheduleOffsiteRetry(runId: string, nextAttempt: number): void {
  const key = `${runId}:${nextAttempt}`;
  if (pendingOffsiteRetries.has(key)) return;
  const delay = offsiteRetryDelayMs(nextAttempt);
  const timer = setTimeout(() => {
    pendingOffsiteRetries.delete(key);
    void executeOffsiteUploadForRun(runId, nextAttempt).catch((err) => {
      console.error(`[OffsiteBackup] Retry #${nextAttempt} failed for run ${runId}:`, err);
    });
  }, delay);
  pendingOffsiteRetries.set(key, timer);
}

export async function retryOffsiteUpload(runId: string): Promise<OffsiteUploadRow> {
  return executeOffsiteUploadForRun(runId, 1);
}

export async function restoreDatabaseFromCloudRun(runId: string): Promise<{ ok: true; message: string }> {
  const pool = getPool();
  const client = await pool.connect();
  let objectKey: string;
  try {
    const upload = await getOffsiteUploadByRunId(client, runId);
    if (!upload || upload.status !== 'completed') {
      throw new Error('No completed offsite upload exists for this backup run.');
    }
    objectKey = upload.object_key;
  } finally {
    client.release();
  }

  const providerClient = await pool.connect();
  let provider;
  try {
    provider = await getConfiguredProvider(providerClient);
  } finally {
    providerClient.release();
  }
  if (!provider) {
    throw new Error('Offsite storage is not configured.');
  }

  const encrypted = await provider.download(objectKey);
  if (!isEncryptedBackupPayload(encrypted)) {
    throw new Error('Downloaded object is not a PBooks encrypted backup.');
  }
  const plain = decryptBackupPayload(encrypted);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pbooks-cloud-restore-'));
  const dumpPath = path.join(tmpDir, 'restore.dump');
  try {
    await fs.writeFile(dumpPath, plain);
    await runPgRestoreFromFile(dumpPath);
    return {
      ok: true,
      message: 'Database restored from cloud backup. Reload the application to reconnect.',
    };
  } finally {
    try {
      await fs.unlink(dumpPath);
      await fs.rmdir(tmpDir);
    } catch {
      /* ignore cleanup errors */
    }
  }
}

/** Test hook */
export function _resetOffsiteRetriesForTests(): void {
  for (const t of pendingOffsiteRetries.values()) clearTimeout(t);
  pendingOffsiteRetries.clear();
}
