import type { PoolClient } from 'pg';

export type ReportScheduleRow = {
  id: string;
  tenant_id: string;
  report_definition_id: string;
  cadence: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  timezone: string;
  recipients_json: unknown;
  export_format: 'pdf' | 'xlsx' | 'csv';
  is_active: boolean;
  next_run_at: Date | string | null;
  last_run_at: Date | string | null;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  definition_name?: string;
  definition_module?: string;
  definition_report_type?: string;
  configuration_json?: unknown;
};

export function computeNextRunAt(
  cadence: ReportScheduleRow['cadence'],
  from: Date = new Date()
): Date {
  const next = new Date(from);
  next.setUTCHours(6, 0, 0, 0);
  if (next <= from) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  switch (cadence) {
    case 'daily':
      break;
    case 'weekly':
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case 'monthly':
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
    case 'quarterly':
      next.setUTCMonth(next.getUTCMonth() + 3);
      break;
    default:
      break;
  }
  return next;
}

export async function listSchedulesForDefinition(
  client: PoolClient,
  tenantId: string,
  definitionId: string
): Promise<ReportScheduleRow[]> {
  const res = await client.query<ReportScheduleRow>(
    `SELECT s.*, d.name AS definition_name, d.module AS definition_module
     FROM report_schedules s
     JOIN report_definitions d ON d.id = s.report_definition_id AND d.tenant_id = s.tenant_id
     WHERE s.tenant_id = $1 AND s.report_definition_id = $2
     ORDER BY s.created_at DESC`,
    [tenantId, definitionId]
  );
  return res.rows;
}

export async function insertSchedule(
  client: PoolClient,
  row: {
    id: string;
    tenant_id: string;
    report_definition_id: string;
    cadence: ReportScheduleRow['cadence'];
    timezone?: string;
    recipients_json: string[];
    export_format: ReportScheduleRow['export_format'];
    created_by: string | null;
    next_run_at: Date;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO report_schedules (
      id, tenant_id, report_definition_id, cadence, timezone, recipients_json,
      export_format, is_active, next_run_at, created_by, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,TRUE,$8,$9,NOW())`,
    [
      row.id,
      row.tenant_id,
      row.report_definition_id,
      row.cadence,
      row.timezone ?? 'UTC',
      JSON.stringify(row.recipients_json),
      row.export_format,
      row.next_run_at.toISOString(),
      row.created_by,
    ]
  );
}

export async function updateSchedule(
  client: PoolClient,
  tenantId: string,
  scheduleId: string,
  patch: {
    cadence?: ReportScheduleRow['cadence'];
    recipients_json?: string[];
    export_format?: ReportScheduleRow['export_format'];
    is_active?: boolean;
    next_run_at?: Date;
  }
): Promise<boolean> {
  const sets: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [tenantId, scheduleId];
  let idx = 3;
  if (patch.cadence) {
    sets.push(`cadence = $${idx++}`);
    params.push(patch.cadence);
  }
  if (patch.recipients_json) {
    sets.push(`recipients_json = $${idx++}::jsonb`);
    params.push(JSON.stringify(patch.recipients_json));
  }
  if (patch.export_format) {
    sets.push(`export_format = $${idx++}`);
    params.push(patch.export_format);
  }
  if (patch.is_active !== undefined) {
    sets.push(`is_active = $${idx++}`);
    params.push(patch.is_active);
  }
  if (patch.next_run_at) {
    sets.push(`next_run_at = $${idx++}`);
    params.push(patch.next_run_at.toISOString());
  }
  const res = await client.query(
    `UPDATE report_schedules SET ${sets.join(', ')}
     WHERE tenant_id = $1 AND id = $2`,
    params
  );
  return (res.rowCount ?? 0) > 0;
}

export async function deleteSchedule(
  client: PoolClient,
  tenantId: string,
  scheduleId: string
): Promise<boolean> {
  const res = await client.query(
    `DELETE FROM report_schedules WHERE tenant_id = $1 AND id = $2`,
    [tenantId, scheduleId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function claimDueSchedules(
  client: PoolClient,
  limit = 10
): Promise<ReportScheduleRow[]> {
  const res = await client.query<ReportScheduleRow>(
    `SELECT s.*,
            d.name AS definition_name,
            d.module AS definition_module,
            d.report_type AS definition_report_type,
            d.configuration_json
     FROM report_schedules s
     JOIN report_definitions d
       ON d.id = s.report_definition_id AND d.tenant_id = s.tenant_id AND d.is_archived IS FALSE
     WHERE s.is_active IS TRUE
       AND s.next_run_at IS NOT NULL
       AND s.next_run_at <= NOW()
     ORDER BY s.next_run_at ASC
     LIMIT $1
     FOR UPDATE OF s SKIP LOCKED`,
    [limit]
  );
  return res.rows;
}

export async function markScheduleRun(
  client: PoolClient,
  scheduleId: string,
  tenantId: string,
  cadence: ReportScheduleRow['cadence']
): Promise<void> {
  const next = computeNextRunAt(cadence, new Date());
  await client.query(
    `UPDATE report_schedules
     SET last_run_at = NOW(), next_run_at = $3, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [scheduleId, tenantId, next.toISOString()]
  );
}
