import type { PoolClient } from 'pg';

export type ReportDashboardPinRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  report_definition_id: string;
  sort_order: number;
  created_at: Date | string;
  definition_name?: string;
  definition_module?: string;
  definition_report_type?: string;
  configuration_json?: unknown;
};

export async function listDashboardPins(
  client: PoolClient,
  tenantId: string,
  userId: string
): Promise<ReportDashboardPinRow[]> {
  const res = await client.query<ReportDashboardPinRow>(
    `SELECT p.*,
            d.name AS definition_name,
            d.module AS definition_module,
            d.report_type AS definition_report_type,
            d.configuration_json
     FROM report_dashboard_pins p
     JOIN report_definitions d
       ON d.id = p.report_definition_id AND d.tenant_id = p.tenant_id AND d.is_archived IS FALSE
     WHERE p.tenant_id = $1 AND p.user_id = $2
     ORDER BY p.sort_order ASC, p.created_at ASC`,
    [tenantId, userId]
  );
  return res.rows;
}

export async function upsertDashboardPin(
  client: PoolClient,
  row: {
    id: string;
    tenant_id: string;
    user_id: string;
    report_definition_id: string;
    sort_order?: number;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO report_dashboard_pins (id, tenant_id, user_id, report_definition_id, sort_order)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (tenant_id, user_id, report_definition_id)
     DO UPDATE SET sort_order = EXCLUDED.sort_order`,
    [
      row.id,
      row.tenant_id,
      row.user_id,
      row.report_definition_id,
      row.sort_order ?? 0,
    ]
  );
}

export async function removeDashboardPin(
  client: PoolClient,
  tenantId: string,
  userId: string,
  definitionId: string
): Promise<boolean> {
  const res = await client.query(
    `DELETE FROM report_dashboard_pins
     WHERE tenant_id = $1 AND user_id = $2 AND report_definition_id = $3`,
    [tenantId, userId, definitionId]
  );
  return (res.rowCount ?? 0) > 0;
}
