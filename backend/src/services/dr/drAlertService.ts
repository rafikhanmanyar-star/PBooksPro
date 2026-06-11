/**
 * DR alerts and email notification dispatch.
 */

import type pg from 'pg';
import { sendDrEmail } from './drEmailService.js';
import {
  DrAlertRepository,
  newDrId,
} from '../../modules/dr/repositories/DrRepository.js';
import { BackupJobRepository } from '../../modules/backup/repositories/BackupJobRepository.js';

const alertRepo = new DrAlertRepository();
const jobRepo = new BackupJobRepository();

export type DrAlertRow = {
  id: string;
  alert_type: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  related_run_id: string | null;
  related_job_id: string | null;
  acknowledged: boolean;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  email_sent: boolean;
  email_error: string | null;
  created_at: string;
};

export type DrNotificationSettings = {
  id: string;
  enabled: boolean;
  email_recipients: string[];
  alert_on_backup_failure: boolean;
  alert_on_verification_failure: boolean;
  alert_on_stale_backup: boolean;
  stale_backup_hours: number;
  updated_at: string;
};

export async function getNotificationSettings(
  client: pg.PoolClient
): Promise<DrNotificationSettings> {
  const row = await alertRepo.getNotificationSettings(client);
  if (!row) {
    return {
      id: 'default',
      enabled: false,
      email_recipients: [],
      alert_on_backup_failure: true,
      alert_on_verification_failure: true,
      alert_on_stale_backup: true,
      stale_backup_hours: 48,
      updated_at: new Date().toISOString(),
    };
  }
  return row;
}

export async function updateNotificationSettings(
  client: pg.PoolClient,
  patch: Partial<Omit<DrNotificationSettings, 'id' | 'updated_at'>>
): Promise<DrNotificationSettings> {
  const current = await getNotificationSettings(client);
  const next = {
    enabled: patch.enabled ?? current.enabled,
    email_recipients: patch.email_recipients ?? current.email_recipients,
    alert_on_backup_failure: patch.alert_on_backup_failure ?? current.alert_on_backup_failure,
    alert_on_verification_failure:
      patch.alert_on_verification_failure ?? current.alert_on_verification_failure,
    alert_on_stale_backup: patch.alert_on_stale_backup ?? current.alert_on_stale_backup,
    stale_backup_hours: patch.stale_backup_hours ?? current.stale_backup_hours,
  };

  await alertRepo.updateNotificationSettings(client, next);
  return getNotificationSettings(client);
}

async function dispatchAlertEmail(
  client: pg.PoolClient,
  alertId: string,
  settings: DrNotificationSettings,
  title: string,
  message: string
): Promise<void> {
  if (!settings.enabled) return;

  const result = await sendDrEmail(settings.email_recipients, {
    subject: `[PBooks DR] ${title}`,
    text: message,
  });

  await alertRepo.updateAlertEmailStatus(client, alertId, result.sent, result.error ?? null);
}

export async function createAlert(
  client: pg.PoolClient,
  alert: {
    alert_type: string;
    severity: 'critical' | 'warning' | 'info';
    title: string;
    message: string;
    related_run_id?: string | null;
    related_job_id?: string | null;
    sendEmail?: boolean;
  }
): Promise<DrAlertRow> {
  const id = newDrId();
  await alertRepo.insertAlert(client, {
    id,
    alertType: alert.alert_type,
    severity: alert.severity,
    title: alert.title,
    message: alert.message,
    relatedRunId: alert.related_run_id,
    relatedJobId: alert.related_job_id,
  });

  if (alert.sendEmail !== false) {
    const settings = await getNotificationSettings(client);
    const shouldEmail =
      settings.enabled &&
      ((alert.alert_type === 'backup_failure' && settings.alert_on_backup_failure) ||
        (alert.alert_type === 'verification_failure' && settings.alert_on_verification_failure) ||
        (alert.alert_type === 'stale_backup' && settings.alert_on_stale_backup) ||
        !['backup_failure', 'verification_failure', 'stale_backup'].includes(alert.alert_type));

    if (shouldEmail) {
      await dispatchAlertEmail(client, id, settings, alert.title, alert.message);
    }
  }

  const created = await alertRepo.getAlertById(client, id);
  return created!;
}

export async function listAlerts(
  client: pg.PoolClient,
  opts: { acknowledged?: boolean; limit?: number } = {}
): Promise<DrAlertRow[]> {
  return alertRepo.listAlerts(client, {
    acknowledged: opts.acknowledged,
    limit: opts.limit ?? 50,
  });
}

export async function acknowledgeAlert(
  client: pg.PoolClient,
  alertId: string,
  userId: string
): Promise<DrAlertRow | null> {
  const ok = await alertRepo.acknowledge(client, alertId, userId);
  if (!ok) return null;
  return alertRepo.getAlertById(client, alertId);
}

export async function countUnacknowledgedCritical(client: pg.PoolClient): Promise<number> {
  return alertRepo.countUnacknowledgedCritical(client);
}

export async function checkAndRaiseStaleBackupAlert(client: pg.PoolClient): Promise<void> {
  const settings = await getNotificationSettings(client);
  if (!settings.alert_on_stale_backup) return;

  const lastSuccess = await jobRepo.getLastSuccessfulCompletedAt(client);
  if (!lastSuccess) {
    if (!(await alertRepo.hasRecentStaleAlert(client))) {
      await createAlert(client, {
        alert_type: 'stale_backup',
        severity: 'critical',
        title: 'No successful backup',
        message: 'No successful backup has been recorded. Immediate action required.',
      });
    }
    return;
  }

  const hoursSince = (Date.now() - new Date(lastSuccess).getTime()) / 3_600_000;
  if (hoursSince <= settings.stale_backup_hours) return;

  if (await alertRepo.hasRecentStaleAlert(client)) return;

  await createAlert(client, {
    alert_type: 'stale_backup',
    severity: 'critical',
    title: 'Backup is stale',
    message: `Last successful backup was ${hoursSince.toFixed(1)} hours ago (threshold: ${settings.stale_backup_hours}h).`,
  });
}

export async function raiseBackupFailureAlert(
  client: pg.PoolClient,
  runId: string,
  jobId: string,
  reason: string
): Promise<void> {
  await createAlert(client, {
    alert_type: 'backup_failure',
    severity: 'critical',
    title: 'Scheduled backup failed',
    message: `Backup job failed: ${reason}`,
    related_run_id: runId,
    related_job_id: jobId,
  });
}

export async function raiseVerificationFailureAlert(
  client: pg.PoolClient,
  runId: string,
  reason: string
): Promise<void> {
  await createAlert(client, {
    alert_type: 'verification_failure',
    severity: 'warning',
    title: 'Backup verification failed',
    message: reason,
    related_run_id: runId,
  });
}
