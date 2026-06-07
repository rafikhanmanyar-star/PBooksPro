import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { MonitoringCategory, MonitoringSeverity } from '../../constants/monitoring.js';

export type MonitoringEventRow = {
  id: string;
  category: MonitoringCategory;
  severity: MonitoringSeverity;
  message: string;
  code: string | null;
  tenant_id: string | null;
  user_id: string | null;
  route: string | null;
  method: string | null;
  status_code: number | null;
  duration_ms: number | null;
  request_id: string | null;
  stack_trace: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type RecordMonitoringEventInput = {
  category: MonitoringCategory;
  severity?: MonitoringSeverity;
  message: string;
  code?: string;
  tenantId?: string | null;
  userId?: string | null;
  route?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  requestId?: string;
  stackTrace?: string;
  metadata?: Record<string, unknown>;
};

function mapRow(row: pg.QueryResultRow): MonitoringEventRow {
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

export async function recordMonitoringEvent(
  client: pg.PoolClient,
  input: RecordMonitoringEventInput
): Promise<MonitoringEventRow> {
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
  const { rows } = await client.query(`SELECT * FROM monitoring_events WHERE id = $1`, [id]);
  return mapRow(rows[0]);
}

export type ListMonitoringEventsOptions = {
  category?: MonitoringCategory;
  severity?: MonitoringSeverity;
  tenantId?: string;
  search?: string;
  since?: string;
  limit?: number;
  offset?: number;
};

export async function listMonitoringEvents(
  client: pg.PoolClient,
  options: ListMonitoringEventsOptions = {}
): Promise<{ items: MonitoringEventRow[]; total: number }> {
  const limit = Math.min(options.limit ?? 100, 500);
  const offset = options.offset ?? 0;
  const search = options.search?.trim().toLowerCase();

  const { rows: countRows } = await client.query<{ count: string }>(
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
      search ?? null,
    ]
  );

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
      search ?? null,
      limit,
      offset,
    ]
  );

  return {
    items: rows.map(mapRow),
    total: Number(countRows[0]?.count ?? 0),
  };
}

export async function getMonitoringStats(
  client: pg.PoolClient,
  hours = 24
): Promise<{
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
  recentErrors: number;
  slowRequests: number;
}> {
  const { rows: catRows } = await client.query<{ category: string; count: string }>(
    `SELECT category, COUNT(*)::text AS count FROM monitoring_events
     WHERE created_at >= NOW() - ($1::int * INTERVAL '1 hour')
     GROUP BY category`,
    [hours]
  );
  const { rows: sevRows } = await client.query<{ severity: string; count: string }>(
    `SELECT severity, COUNT(*)::text AS count FROM monitoring_events
     WHERE created_at >= NOW() - ($1::int * INTERVAL '1 hour')
     GROUP BY severity`,
    [hours]
  );

  const byCategory: Record<string, number> = {};
  for (const r of catRows) byCategory[r.category] = Number(r.count);

  const bySeverity: Record<string, number> = {};
  for (const r of sevRows) bySeverity[r.severity] = Number(r.count);

  return {
    byCategory,
    bySeverity,
    recentErrors: (bySeverity.error ?? 0) + (bySeverity.critical ?? 0),
    slowRequests: byCategory.performance ?? 0,
  };
}
