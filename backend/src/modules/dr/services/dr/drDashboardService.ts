/**
 * Disaster Recovery dashboard aggregation.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type pg from 'pg';
import { getBackupStorageRoot, isBackupSchedulerEnabled } from '../../../backup/services/backupSchedulerService.js';
import { computeBackupHealthScore } from './drHealthScore.js';
import {
  checkAndRaiseStaleBackupAlert,
  countUnacknowledgedCritical,
  getNotificationSettings,
} from './drAlertService.js';
import { getLastPassedRestoreTest } from './drRestoreTestService.js';
import { getLastPassedVerification } from './drVerificationService.js';
import { BackupJobRepository } from '../../../backup/repositories/BackupJobRepository.js';
import { BackupOffsiteRepository } from '../../../backup/repositories/BackupSettingsRepository.js';

const jobRepo = new BackupJobRepository();
const offsiteRepo = new BackupOffsiteRepository();

export type DrDashboard = {
  lastBackup: {
    runId: string;
    at: string;
    jobName: string | null;
    success: boolean;
    sizeBytes: string | null;
  } | null;
  lastSuccessfulBackup: {
    runId: string;
    at: string;
    jobName: string | null;
    sizeBytes: string | null;
  } | null;
  lastRestoreTest: {
    id: string;
    at: string;
    testType: string;
    status: string;
  } | null;
  backupSizeBytes: string | null;
  backupHealth: ReturnType<typeof computeBackupHealthScore>;
  storageUsage: {
    localBytes: number;
    offsiteBytes: number;
    totalBytes: number;
    localPath: string;
    fileCount: number;
  };
};

async function sumLocalBackupBytes(root: string): Promise<{ bytes: number; fileCount: number }> {
  let bytes = 0;
  let fileCount = 0;
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isFile() || !ent.name.endsWith('.dump')) continue;
      try {
        const stat = await fs.stat(path.join(root, ent.name));
        bytes += stat.size;
        fileCount += 1;
      } catch {
        /* skip */
      }
    }
  } catch {
    /* missing dir */
  }
  return { bytes, fileCount };
}

async function sumOffsiteBytes(client: pg.PoolClient): Promise<number> {
  return offsiteRepo.sumCompletedBytes(client);
}

export async function getDrDashboard(client: pg.PoolClient): Promise<DrDashboard> {
  await checkAndRaiseStaleBackupAlert(client);

  const lastBackupRow = await jobRepo.getLastRun(client);
  const lastSuccessRow = await jobRepo.getLastSuccessfulRun(client);

  const lastRestore = await getLastPassedRestoreTest(client);
  const lastVerification = await getLastPassedVerification(client);
  const settings = await getNotificationSettings(client);
  const criticalAlerts = await countUnacknowledgedCritical(client);

  const offsiteUploadOk = await offsiteRepo.hasCompletedForSuccessfulRun(client);

  const storageRoot = getBackupStorageRoot();
  const local = await sumLocalBackupBytes(storageRoot);
  const offsiteBytes = await sumOffsiteBytes(client);

  const backupHealth = computeBackupHealthScore({
    lastSuccessfulBackupAt: lastSuccessRow?.completed_at ?? null,
    lastVerificationPassedAt: lastVerification?.completed_at ?? null,
    lastRestoreTestPassedAt: lastRestore?.completed_at ?? null,
    offsiteUploadOk,
    unacknowledgedCriticalAlerts: criticalAlerts,
    schedulerEnabled: isBackupSchedulerEnabled(),
    staleBackupHours: settings.stale_backup_hours,
  });

  return {
    lastBackup: lastBackupRow
      ? {
          runId: lastBackupRow.id,
          at: lastBackupRow.completed_at ?? lastBackupRow.started_at,
          jobName: lastBackupRow.job_name,
          success: lastBackupRow.success,
          sizeBytes: lastBackupRow.size_bytes != null ? String(lastBackupRow.size_bytes) : null,
        }
      : null,
    lastSuccessfulBackup: lastSuccessRow
      ? {
          runId: lastSuccessRow.id,
          at: lastSuccessRow.completed_at,
          jobName: lastSuccessRow.job_name,
          sizeBytes: lastSuccessRow.size_bytes != null ? String(lastSuccessRow.size_bytes) : null,
        }
      : null,
    lastRestoreTest: lastRestore
      ? {
          id: lastRestore.id,
          at: lastRestore.completed_at ?? lastRestore.started_at,
          testType: lastRestore.test_type,
          status: lastRestore.status,
        }
      : null,
    backupSizeBytes: lastSuccessRow?.size_bytes != null ? String(lastSuccessRow.size_bytes) : null,
    backupHealth,
    storageUsage: {
      localBytes: local.bytes,
      offsiteBytes,
      totalBytes: local.bytes + offsiteBytes,
      localPath: storageRoot,
      fileCount: local.fileCount,
    },
  };
}
