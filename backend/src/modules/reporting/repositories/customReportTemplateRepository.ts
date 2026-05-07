import { getPool } from '../../../db/pool.js';

export type CustomReportTemplateRow = {
  id: string;
  tenant_id: string;
  name: string;
  module: string;
  configuration_json: unknown;
  created_by: string | null;
  is_public: boolean;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
};

export async function listTemplates(params: {
  tenantId: string;
  userId: string;
  module?: string;
  isAdminLike: boolean;
}): Promise<CustomReportTemplateRow[]> {
  const pool = getPool();
  const mod = params.module?.trim();
  const res = await pool.query<CustomReportTemplateRow>(
    `
    SELECT *
    FROM custom_report_templates
    WHERE tenant_id = $1
      AND ($2::text IS NULL OR module = $2)
      AND (
        $3::boolean IS TRUE
        OR is_public IS TRUE
        OR created_by = $4::text
      )
    ORDER BY is_default DESC, updated_at DESC
  `,
    [params.tenantId, mod ?? null, params.isAdminLike, params.userId]
  );
  return res.rows;
}

export async function getTemplateById(
  tenantId: string,
  id: string
): Promise<CustomReportTemplateRow | null> {
  const pool = getPool();
  const res = await pool.query<CustomReportTemplateRow>(
    `SELECT * FROM custom_report_templates WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id]
  );
  return res.rows[0] ?? null;
}

export async function insertTemplate(row: Omit<CustomReportTemplateRow, 'created_at' | 'updated_at'>) {
  const pool = getPool();
  await pool.query(
    `
    INSERT INTO custom_report_templates
      (id, tenant_id, name, module, configuration_json, created_by, is_public, is_default)
    VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)
  `,
    [
      row.id,
      row.tenant_id,
      row.name,
      row.module,
      JSON.stringify(row.configuration_json ?? {}),
      row.created_by,
      row.is_public,
      row.is_default,
    ]
  );
}

export async function updateTemplate(params: {
  tenantId: string;
  id: string;
  name?: string;
  configuration_json?: unknown;
  is_public?: boolean;
  is_default?: boolean;
}) {
  const pool = getPool();
  await pool.query(
    `
    UPDATE custom_report_templates
    SET
      name = COALESCE($3, name),
      configuration_json = COALESCE($4::jsonb, configuration_json),
      is_public = COALESCE($5, is_public),
      is_default = COALESCE($6, is_default),
      updated_at = NOW()
    WHERE tenant_id = $1 AND id = $2
  `,
    [
      params.tenantId,
      params.id,
      params.name ?? null,
      params.configuration_json !== undefined ? JSON.stringify(params.configuration_json) : null,
      params.is_public ?? null,
      params.is_default ?? null,
    ]
  );
}

export async function clearDefaultFlagForOwnerModule(params: {
  tenantId: string;
  module: string;
  userId: string;
}) {
  const pool = getPool();
  await pool.query(
    `
    UPDATE custom_report_templates
    SET is_default = FALSE, updated_at = NOW()
    WHERE tenant_id = $1 AND module = $2 AND created_by = $3 AND is_default IS TRUE
  `,
    [params.tenantId, params.module, params.userId]
  );
}

export async function deleteTemplate(tenantId: string, id: string) {
  const pool = getPool();
  await pool.query(`DELETE FROM custom_report_templates WHERE tenant_id = $1 AND id = $2`, [
    tenantId,
    id,
  ]);
}
