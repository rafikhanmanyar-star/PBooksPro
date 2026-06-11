import type pg from 'pg';
import { randomUUID } from 'crypto';
import type { DrAlertRow, DrNotificationSettings } from '../../../services/dr/drAlertService.js';

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

export class DrAlertRepository {
  async getNotificationSettings(client: pg.PoolClient): Promise<DrNotificationSettings | null> {
    const r = await client.query(`SELECT * FROM dr_notification_settings WHERE id = 'default'`);
    return r.rows[0] ? mapSettings(r.rows[0]) : null;
  }

  async updateNotificationSettings(
    client: pg.PoolClient,
    next: Omit<DrNotificationSettings, 'id' | 'updated_at'>
  ): Promise<void> {
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
  }

  async insertAlert(
    client: pg.PoolClient,
    input: {
      id: string;
      alertType: string;
      severity: 'critical' | 'warning' | 'info';
      title: string;
      message: string;
      relatedRunId?: string | null;
      relatedJobId?: string | null;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO dr_alerts (id, alert_type, severity, title, message, related_run_id, related_job_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.id,
        input.alertType,
        input.severity,
        input.title,
        input.message,
        input.relatedRunId ?? null,
        input.relatedJobId ?? null,
      ]
    );
  }

  async getAlertById(client: pg.PoolClient, id: string): Promise<DrAlertRow | null> {
    const r = await client.query(`SELECT * FROM dr_alerts WHERE id = $1`, [id]);
    return r.rows[0] ? mapAlert(r.rows[0]) : null;
  }

  async listAlerts(
    client: pg.PoolClient,
    opts: { acknowledged?: boolean; limit: number }
  ): Promise<DrAlertRow[]> {
    if (opts.acknowledged === undefined) {
      const r = await client.query(
        `SELECT * FROM dr_alerts ORDER BY created_at DESC LIMIT $1`,
        [opts.limit]
      );
      return r.rows.map(mapAlert);
    }
    const r = await client.query(
      `SELECT * FROM dr_alerts WHERE acknowledged = $1 ORDER BY created_at DESC LIMIT $2`,
      [opts.acknowledged, opts.limit]
    );
    return r.rows.map(mapAlert);
  }

  async acknowledge(client: pg.PoolClient, alertId: string, userId: string): Promise<boolean> {
    const r = await client.query(
      `UPDATE dr_alerts SET acknowledged = true, acknowledged_at = NOW(), acknowledged_by = $2
       WHERE id = $1 AND acknowledged = false`,
      [alertId, userId]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async countUnacknowledgedCritical(client: pg.PoolClient): Promise<number> {
    const r = await client.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM dr_alerts WHERE acknowledged = false AND severity = 'critical'`
    );
    return r.rows[0]?.c ?? 0;
  }

  async hasRecentStaleAlert(client: pg.PoolClient): Promise<boolean> {
    const r = await client.query(
      `SELECT id FROM dr_alerts WHERE alert_type = 'stale_backup' AND acknowledged = false
       AND created_at > NOW() - INTERVAL '24 hours' LIMIT 1`
    );
    return r.rows.length > 0;
  }

  async updateAlertEmailStatus(
    client: pg.PoolClient,
    alertId: string,
    sent: boolean,
    error: string | null
  ): Promise<void> {
    await client.query(
      `UPDATE dr_alerts SET email_sent = $2, email_error = $3 WHERE id = $1`,
      [alertId, sent, error]
    );
  }
}

export class DrReportRepository {
  async insert(
    client: pg.PoolClient,
    input: {
      id: string;
      reportType: string;
      healthScore: number;
      summary: unknown;
      requestedBy: string | null;
    }
  ): Promise<pg.QueryResultRow> {
    await client.query(
      `INSERT INTO dr_reports (id, report_type, health_score, summary, requested_by)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [
        input.id,
        input.reportType,
        input.healthScore,
        JSON.stringify(input.summary),
        input.requestedBy,
      ]
    );
    const r = await client.query(`SELECT * FROM dr_reports WHERE id = $1`, [input.id]);
    return r.rows[0]!;
  }

  async list(client: pg.PoolClient, limit: number): Promise<pg.QueryResultRow[]> {
    const r = await client.query(
      `SELECT * FROM dr_reports ORDER BY generated_at DESC LIMIT $1`,
      [limit]
    );
    return r.rows;
  }

  async getById(client: pg.PoolClient, reportId: string): Promise<pg.QueryResultRow | null> {
    const r = await client.query(`SELECT * FROM dr_reports WHERE id = $1`, [reportId]);
    return r.rows[0] ?? null;
  }
}

export class DrVerificationRepository {
  async insertRunning(
    client: pg.PoolClient,
    input: {
      id: string;
      backupRunId: string;
      filePath: string;
      startedAt: string;
      requestedBy: string | null;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO dr_verification_runs (id, backup_run_id, status, verification_type, file_path, started_at, requested_by)
       VALUES ($1, $2, 'running', 'integrity', $3, $4, $5)`,
      [input.id, input.backupRunId, input.filePath, input.startedAt, input.requestedBy]
    );
  }

  async complete(
    client: pg.PoolClient,
    id: string,
    patch: {
      status: string;
      fileSizeBytes: number;
      sha256: string | null;
      pgRestoreListOk: boolean;
      tocEntryCount: number;
      integrityScore: number;
      issues: string[];
      failureReason: string | null;
    }
  ): Promise<pg.QueryResultRow> {
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
        patch.status,
        patch.fileSizeBytes,
        patch.sha256,
        patch.pgRestoreListOk,
        patch.tocEntryCount,
        patch.integrityScore,
        JSON.stringify(patch.issues),
        patch.failureReason,
      ]
    );
    const r = await client.query(`SELECT * FROM dr_verification_runs WHERE id = $1`, [id]);
    return r.rows[0]!;
  }

  async list(client: pg.PoolClient, limit: number): Promise<pg.QueryResultRow[]> {
    const r = await client.query(
      `SELECT * FROM dr_verification_runs ORDER BY started_at DESC LIMIT $1`,
      [limit]
    );
    return r.rows;
  }

  async getLastPassed(client: pg.PoolClient): Promise<pg.QueryResultRow | null> {
    const r = await client.query(
      `SELECT * FROM dr_verification_runs WHERE status = 'passed' ORDER BY completed_at DESC NULLS LAST LIMIT 1`
    );
    return r.rows[0] ?? null;
  }
}

export class DrRestoreTestRepository {
  async insertRunning(
    client: pg.PoolClient,
    input: { id: string; backupRunId: string; testType: string; requestedBy: string | null }
  ): Promise<void> {
    await client.query(
      `INSERT INTO dr_restore_tests (id, backup_run_id, test_type, status, started_at, requested_by)
       VALUES ($1, $2, $3, 'running', NOW(), $4)`,
      [input.id, input.backupRunId, input.testType, input.requestedBy]
    );
  }

  async complete(
    client: pg.PoolClient,
    id: string,
    patch: {
      status: string;
      durationMs: number;
      simulationDetails: Record<string, unknown>;
      failureReason: string | null;
    }
  ): Promise<pg.QueryResultRow> {
    await client.query(
      `UPDATE dr_restore_tests SET
         status = $2,
         duration_ms = $3,
         simulation_details = $4::jsonb,
         completed_at = NOW(),
         failure_reason = $5
       WHERE id = $1`,
      [id, patch.status, patch.durationMs, JSON.stringify(patch.simulationDetails), patch.failureReason]
    );
    const r = await client.query(`SELECT * FROM dr_restore_tests WHERE id = $1`, [id]);
    return r.rows[0]!;
  }

  async list(client: pg.PoolClient, limit: number): Promise<pg.QueryResultRow[]> {
    const r = await client.query(
      `SELECT * FROM dr_restore_tests ORDER BY started_at DESC LIMIT $1`,
      [limit]
    );
    return r.rows;
  }

  async getLastPassed(client: pg.PoolClient): Promise<pg.QueryResultRow | null> {
    const r = await client.query(
      `SELECT * FROM dr_restore_tests WHERE status = 'passed' ORDER BY completed_at DESC NULLS LAST LIMIT 1`
    );
    return r.rows[0] ?? null;
  }
}

export { randomUUID as newDrId };
