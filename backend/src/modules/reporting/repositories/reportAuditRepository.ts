import { getPool } from '../../../db/pool.js';

export async function appendReportAudit(params: {
  id: string;
  tenantId: string;
  userId: string | undefined;
  action: string;
  module: string;
  reportName?: string;
  templateId?: string;
  detail: Record<string, unknown>;
}) {
  const pool = getPool();
  await pool.query(
    `
    INSERT INTO report_builder_audit_log
      (id, tenant_id, user_id, action, module, report_name, template_id, detail_json)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
  `,
    [
      params.id,
      params.tenantId,
      params.userId ?? null,
      params.action,
      params.module,
      params.reportName ?? null,
      params.templateId ?? null,
      JSON.stringify(params.detail ?? {}),
    ]
  );
}
