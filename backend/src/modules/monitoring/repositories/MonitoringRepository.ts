import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { MonitoringCategory, MonitoringSeverity } from '../../../constants/monitoring.js';
import type { MonitoringEventRow, RecordMonitoringEventInput } from '../../../services/monitoring/monitoringEventService.js';

function mapEventRow(row: pg.QueryResultRow): MonitoringEventRow {
  return {
    id: row.id,
    category: row.category,
    severity: row.severity,
    message: row.message,
    code: row.code ?? null,
    tenant_id: row.tenant_id ?? null,
    user_id: row.user_id ?? null,
    route: row.route ?? null,
    method: row.method ?? null,
    status_code: row.status_code ?? null,
    duration_ms: row.duration_ms ?? null,
    request_id: row.request_id ?? null,
    stack_trace: row.stack_trace ?? null,
    metadata:
      row.metadata && typeof row.metadata === 'object'
        ? (row.metadata as Record<string, unknown>)
        : {},
    created_at: row.created_at,
  };
}

export class MonitoringEventRepository {
  async insert(client: pg.PoolClient, input: RecordMonitoringEventInput): Promise<string> {
    const id = randomUUID();
    await client.query(
      `INSERT INTO monitoring_events (
         id, category, severity, message, code, tenant_id, user_id, route, method,
         status_code, duration_ms, request_id, stack_trace, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)`,
      [
        id,
        input.category,
        input.severity ?? 'info',
        input.message.slice(0, 4000),
        input.code ?? null,
        input.tenantId ?? null,
        input.userId ?? null,
        input.route ?? null,
        input.method ?? null,
        input.statusCode ?? null,
        input.durationMs ?? null,
        input.requestId ?? null,
        input.stackTrace?.slice(0, 12000) ?? null,
        JSON.stringify(input.metadata ?? {}),
      ]
    );
    return id;
  }

  async getById(client: pg.PoolClient, id: string): Promise<MonitoringEventRow | null> {
    const { rows } = await client.query(`SELECT * FROM monitoring_events WHERE id = $1`, [id]);
    return rows[0] ? mapEventRow(rows[0]) : null;
  }

  async countFiltered(
    client: pg.PoolClient,
    options: {
      category?: MonitoringCategory;
      severity?: MonitoringSeverity;
      tenantId?: string;
      since?: string;
      search?: string | null;
    }
  ): Promise<number> {
    const { rows } = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM monitoring_events
       WHERE ($1::text IS NULL OR category = $1)
         AND ($2::text IS NULL OR severity = $2)
         AND ($3::text IS NULL OR tenant_id = $3)
         AND ($4::timestamptz IS NULL OR created_at >= $4)
         AND ($5::text IS NULL OR LOWER(message) LIKE '%' || $5 || '%' OR LOWER(COALESCE(code, '')) LIKE '%' || $5 || '%')`,
      [
        options.category ?? null,
        options.severity ?? null,
        options.tenantId ?? null,
        options.since ?? null,
        options.search ?? null,
      ]
    );
    return Number(rows[0]?.count ?? 0);
  }

  async listFiltered(
    client: pg.PoolClient,
    options: {
      category?: MonitoringCategory;
      severity?: MonitoringSeverity;
      tenantId?: string;
      since?: string;
      search?: string | null;
      limit: number;
      offset: number;
    }
  ): Promise<MonitoringEventRow[]> {
    const { rows } = await client.query(
      `SELECT * FROM monitoring_events
       WHERE ($1::text IS NULL OR category = $1)
         AND ($2::text IS NULL OR severity = $2)
         AND ($3::text IS NULL OR tenant_id = $3)
         AND ($4::timestamptz IS NULL OR created_at >= $4)
         AND ($5::text IS NULL OR LOWER(message) LIKE '%' || $5 || '%' OR LOWER(COALESCE(code, '')) LIKE '%' || $5 || '%')
       ORDER BY created_at DESC
       LIMIT $6 OFFSET $7`,
      [
        options.category ?? null,
        options.severity ?? null,
        options.tenantId ?? null,
        options.since ?? null,
        options.search ?? null,
        options.limit,
        options.offset,
      ]
    );
    return rows.map(mapEventRow);
  }

  async countByCategorySinceHours(client: pg.PoolClient, hours: number): Promise<Array<{ category: string; count: string }>> {
    const { rows } = await client.query<{ category: string; count: string }>(
      `SELECT category, COUNT(*)::text AS count FROM monitoring_events
       WHERE created_at >= NOW() - ($1::int * INTERVAL '1 hour')
       GROUP BY category`,
      [hours]
    );
    return rows;
  }

  async countBySeveritySinceHours(client: pg.PoolClient, hours: number): Promise<Array<{ severity: string; count: string }>> {
    const { rows } = await client.query<{ severity: string; count: string }>(
      `SELECT severity, COUNT(*)::text AS count FROM monitoring_events
       WHERE created_at >= NOW() - ($1::int * INTERVAL '1 hour')
       GROUP BY severity`,
      [hours]
    );
    return rows;
  }

  async countRecentErrors(client: pg.PoolClient): Promise<number> {
    const { rows } = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM monitoring_events
       WHERE severity IN ('error', 'critical') AND created_at >= NOW() - INTERVAL '1 hour'`
    );
    return Number(rows[0]?.count ?? 0);
  }

  async countSeverityEventsInWindow(
    client: pg.PoolClient,
    category: MonitoringCategory,
    windowMinutes: number
  ): Promise<number> {
    const { rows } = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM monitoring_events
       WHERE category = $1
         AND created_at >= NOW() - ($2::int * INTERVAL '1 minute')
         AND severity IN ('warn', 'error', 'critical')`,
      [category, windowMinutes]
    );
    return Number(rows[0]?.count ?? 0);
  }
}

export class MonitoringAlertRepository {
  async listEnabledRulesForCategory(
    client: pg.PoolClient,
    category: MonitoringCategory
  ): Promise<
    Array<{
      id: string;
      name: string;
      min_severity: MonitoringSeverity;
      threshold_count: number;
      window_minutes: number;
      notify_channels: string[];
    }>
  > {
    const { rows } = await client.query(
      `SELECT id, name, min_severity, threshold_count, window_minutes, notify_channels
       FROM monitoring_alert_rules
       WHERE enabled = TRUE AND category = $1`,
      [category]
    );
    return rows as Array<{
      id: string;
      name: string;
      min_severity: MonitoringSeverity;
      threshold_count: number;
      window_minutes: number;
      notify_channels: string[];
    }>;
  }

  async hasOpenIncidentInWindow(
    client: pg.PoolClient,
    ruleId: string,
    windowMinutes: number
  ): Promise<boolean> {
    const open = await client.query(
      `SELECT id FROM monitoring_alert_incidents
       WHERE rule_id = $1 AND status = 'open' AND triggered_at >= NOW() - ($2::int * INTERVAL '1 minute')
       LIMIT 1`,
      [ruleId, windowMinutes]
    );
    return open.rows.length > 0;
  }

  async insertIncident(
    client: pg.PoolClient,
    input: {
      id: string;
      ruleId: string;
      eventCount: number;
      sampleMessage: string;
      sampleEventId: string;
      metadataJson: string;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO monitoring_alert_incidents (
         id, rule_id, status, event_count, sample_message, sample_event_id, metadata
       ) VALUES ($1, $2, 'open', $3, $4, $5, $6::jsonb)`,
      [
        input.id,
        input.ruleId,
        input.eventCount,
        input.sampleMessage,
        input.sampleEventId,
        input.metadataJson,
      ]
    );
  }

  async listOpen(client: pg.PoolClient, limit: number): Promise<pg.QueryResultRow[]> {
    const { rows } = await client.query(
      `SELECT i.*, r.name AS rule_name
       FROM monitoring_alert_incidents i
       INNER JOIN monitoring_alert_rules r ON r.id = i.rule_id
       WHERE i.status IN ('open', 'acknowledged')
       ORDER BY i.triggered_at DESC
       LIMIT $1`,
      [limit]
    );
    return rows;
  }

  async acknowledge(client: pg.PoolClient, incidentId: string, userId: string): Promise<void> {
    await client.query(
      `UPDATE monitoring_alert_incidents
       SET status = 'acknowledged', acknowledged_at = NOW(), acknowledged_by = $2
       WHERE id = $1 AND status = 'open'`,
      [incidentId, userId]
    );
  }

  async resolve(client: pg.PoolClient, incidentId: string): Promise<void> {
    await client.query(
      `UPDATE monitoring_alert_incidents
       SET status = 'resolved', resolved_at = NOW()
       WHERE id = $1 AND status IN ('open', 'acknowledged')`,
      [incidentId]
    );
  }
}

export class MonitoringHealthRepository {
  async upsert(
    client: pg.PoolClient,
    component: string,
    status: string,
    message: string,
    detailsJson: string
  ): Promise<void> {
    await client.query(
      `INSERT INTO monitoring_health_checks (component, status, message, details, checked_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())
       ON CONFLICT (component) DO UPDATE SET
         status = EXCLUDED.status,
         message = EXCLUDED.message,
         details = EXCLUDED.details,
         checked_at = NOW()`,
      [component, status, message, detailsJson]
    );
  }

  async ping(client: pg.PoolClient): Promise<void> {
    await client.query('SELECT 1');
  }

  async getEmailQueueStats(client: pg.PoolClient): Promise<{ failed: string; pending: string } | null> {
    const { rows } = await client.query<{ failed: string; pending: string }>(
      `SELECT
         (SELECT COUNT(*)::text FROM email_automation_queue WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '24 hours') AS failed,
         (SELECT COUNT(*)::text FROM email_automation_queue WHERE status = 'pending') AS pending`
    );
    return rows[0] ?? null;
  }

  async getFailedPaddleWebhooks24h(client: pg.PoolClient): Promise<number> {
    const { rows } = await client.query<{ failed: string }>(
      `SELECT COUNT(*)::text AS failed FROM paddle_webhook_deliveries
       WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '24 hours'`
    );
    return Number(rows[0]?.failed ?? 0);
  }

  async listStored(client: pg.PoolClient): Promise<pg.QueryResultRow[]> {
    const { rows } = await client.query(
      `SELECT component, status, message, details, checked_at FROM monitoring_health_checks ORDER BY component`
    );
    return rows;
  }
}
