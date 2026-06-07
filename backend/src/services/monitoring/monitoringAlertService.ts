import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { MonitoringCategory, MonitoringSeverity } from '../../constants/monitoring.js';
import { logger } from '../../utils/logger.js';

const SEVERITY_RANK: Record<MonitoringSeverity, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  critical: 4,
};

export type AlertIncidentRow = {
  id: string;
  rule_id: string;
  rule_name?: string;
  status: string;
  event_count: number;
  sample_message: string | null;
  triggered_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
};

export async function evaluateAlertRules(
  client: pg.PoolClient,
  category: MonitoringCategory,
  severity: MonitoringSeverity,
  sampleEventId: string,
  sampleMessage: string
): Promise<void> {
  const { rows: rules } = await client.query<{
    id: string;
    name: string;
    min_severity: MonitoringSeverity;
    threshold_count: number;
    window_minutes: number;
    notify_channels: string[];
  }>(
    `SELECT id, name, min_severity, threshold_count, window_minutes, notify_channels
     FROM monitoring_alert_rules
     WHERE enabled = TRUE AND category = $1`,
    [category]
  );

  for (const rule of rules) {
    if (SEVERITY_RANK[severity] < SEVERITY_RANK[rule.min_severity]) continue;

    const { rows: countRows } = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM monitoring_events
       WHERE category = $1
         AND created_at >= NOW() - ($2::int * INTERVAL '1 minute')
         AND severity IN ('warn', 'error', 'critical')`,
      [category, rule.window_minutes]
    );
    const count = Number(countRows[0]?.count ?? 0);
    if (count < rule.threshold_count) continue;

    const open = await client.query(
      `SELECT id FROM monitoring_alert_incidents
       WHERE rule_id = $1 AND status = 'open' AND triggered_at >= NOW() - ($2::int * INTERVAL '1 minute')
       LIMIT 1`,
      [rule.id, rule.window_minutes]
    );
    if (open.rows.length > 0) continue;

    const incidentId = randomUUID();
    await client.query(
      `INSERT INTO monitoring_alert_incidents (
         id, rule_id, status, event_count, sample_message, sample_event_id, metadata
       ) VALUES ($1, $2, 'open', $3, $4, $5, $6::jsonb)`,
      [
        incidentId,
        rule.id,
        count,
        sampleMessage.slice(0, 500),
        sampleEventId,
        JSON.stringify({ category, severity }),
      ]
    );

    const channels = Array.isArray(rule.notify_channels) ? rule.notify_channels : ['log'];
    if (channels.includes('log')) {
      logger.error('[monitoring-alert] Threshold breached', {
        rule: rule.name,
        category,
        count,
        windowMinutes: rule.window_minutes,
        incidentId,
      });
    }
  }
}

export async function listOpenAlerts(client: pg.PoolClient, limit = 50): Promise<AlertIncidentRow[]> {
  const { rows } = await client.query(
    `SELECT i.*, r.name AS rule_name
     FROM monitoring_alert_incidents i
     INNER JOIN monitoring_alert_rules r ON r.id = i.rule_id
     WHERE i.status IN ('open', 'acknowledged')
     ORDER BY i.triggered_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map((row) => ({
    id: row.id,
    rule_id: row.rule_id,
    rule_name: row.rule_name,
    status: row.status,
    event_count: row.event_count,
    sample_message: row.sample_message,
    triggered_at: row.triggered_at,
    acknowledged_at: row.acknowledged_at,
    resolved_at: row.resolved_at,
  }));
}

export async function acknowledgeAlert(
  client: pg.PoolClient,
  incidentId: string,
  userId: string
): Promise<void> {
  await client.query(
    `UPDATE monitoring_alert_incidents
     SET status = 'acknowledged', acknowledged_at = NOW(), acknowledged_by = $2
     WHERE id = $1 AND status = 'open'`,
    [incidentId, userId]
  );
}

export async function resolveAlert(client: pg.PoolClient, incidentId: string): Promise<void> {
  await client.query(
    `UPDATE monitoring_alert_incidents
     SET status = 'resolved', resolved_at = NOW()
     WHERE id = $1 AND status IN ('open', 'acknowledged')`,
    [incidentId]
  );
}
