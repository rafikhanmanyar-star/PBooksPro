/**
 * DR alerts and email notification dispatch.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { sendDrEmail } from './drEmailService.js';

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

function mapAlert(row: pg.QueryResultRow): DrAlertRow {
  return {
    id: row.id,
    alert_type: row.alert_type,
    severity: row.severity,
    title: row.title,
    message: row.message,
    related_run_id: row.related_run_id,
    related_job_id: row.related_job_id,
    acknowledged: row.acknowledged,
    acknowledged_at: row.acknowledged_at,
    acknowledged_by: row.acknowledged_by,
    email_sent: row.email_sent,
    email_error: row.email_error,
    created_at: row.created_at,
  };
}

function mapSettings(row: pg.QueryResultRow): DrNotificationSettings {
  return {
    id: row.id,
    enabled: row.enabled,
    email_recipients: Array.isArray(row.email_recipients) ? row.email_recipients : [],
    alert_on_backup_failure: row.alert_on_backup_failure,
    alert_on_verification_failure: row.alert_on_verification_failure,
    alert_on_stale_backup: row.alert_on_stale_backup,
    stale_backup_hours: row.stale_backup_hours,
    updated_at: row.updated_at,
  };
}

export async function getNotificationSettings(
  client: pg.PoolClient
): Promise<DrNotificationSettings> {
  const { rows } = await client.query(`SELECT * FROM dr_notification_settings WHERE id = 'default'`);
  if (rows.length === 0) {
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
  return mapSettings(rows[0]);
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

  await client.query(
    `UPDATE dr_notification_settings SET
       enabled = $1,
       email_recipients = $2,
       alert_on_backup_failure = $3,
       alert_on_verification_failure = $4,
       alert_on_stale_backup = $5,
       stale_backup_hours = $6,
       updated_at = NOW()
     WHERE id = 'default'`,
    [
      next.enabled,
      next.email_recipients,
      next.alert_on_backup_failure,
      next.alert_on_verification_failure,
      next.alert_on_stale_backup,
      next.stale_backup_hours,
    ]
  );
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

  await client.query(
    `UPDATE dr_alerts SET email_sent = $2, email_error = $3 WHERE id = $1`,
    [alertId, result.sent, result.error ?? null]
  );
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
  const id = randomUUID();
  await client.query(
    `INSERT INTO dr_alerts (id, alert_type, severity, title, message, related_run_id, related_job_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      alert.alert_type,
      alert.severity,
      alert.title,
      alert.message,
      alert.related_run_id ?? null,
      alert.related_job_id ?? null,
    ]
  );

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

  const { rows } = await client.query(`SELECT * FROM dr_alerts WHERE id = $1`, [id]);
  return mapAlert(rows[0]);
}

export async function listAlerts(
  client: pg.PoolClient,
  opts: { acknowledged?: boolean; limit?: number } = {}
): Promise<DrAlertRow[]> {
  const limit = opts.limit ?? 50;
  if (opts.acknowledged === undefined) {
    const { rows } = await client.query(
      `SELECT * FROM dr_alerts ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return rows.map(mapAlert);
  }
  const { rows } = await client.query(
    `SELECT * FROM dr_alerts WHERE acknowledged = $1 ORDER BY created_at DESC LIMIT $2`,
    [opts.acknowledged, limit]
  );
  return rows.map(mapAlert);
}

export async function acknowledgeAlert(
  client: pg.PoolClient,
  alertId: string,
  userId: string
): Promise<DrAlertRow | null> {
  const { rowCount } = await client.query(
    `UPDATE dr_alerts SET acknowledged = true, acknowledged_at = NOW(), acknowledged_by = $2
     WHERE id = $1 AND acknowledged = false`,
    [alertId, userId]
  );
  if (!rowCount) return null;
  const { rows } = await client.query(`SELECT * FROM dr_alerts WHERE id = $1`, [alertId]);
  return mapAlert(rows[0]);
}

export async function countUnacknowledgedCritical(client: pg.PoolClient): Promise<number> {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS c FROM dr_alerts WHERE acknowledged = false AND severity = 'critical'`
  );
  return rows[0]?.c ?? 0;
}

export async function checkAndRaiseStaleBackupAlert(client: pg.PoolClient): Promise<void> {
  const settings = await getNotificationSettings(client);
  if (!settings.alert_on_stale_backup) return;

  const { rows } = await client.query(
    `SELECT completed_at FROM backup_job_runs WHERE success = true ORDER BY completed_at DESC LIMIT 1`
  );
  const lastSuccess = rows[0]?.completed_at as string | undefined;
  if (!lastSuccess) {
    const recent = await client.query(
      `SELECT id FROM dr_alerts WHERE alert_type = 'stale_backup' AND acknowledged = false
       AND created_at > NOW() - INTERVAL '24 hours' LIMIT 1`
    );
    if (recent.rows.length === 0) {
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

  const recent = await client.query(
    `SELECT id FROM dr_alerts WHERE alert_type = 'stale_backup' AND acknowledged = false
     AND created_at > NOW() - INTERVAL '24 hours' LIMIT 1`
  );
  if (recent.rows.length > 0) return;

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
