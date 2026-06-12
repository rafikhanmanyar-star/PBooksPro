import { getPool } from '../../../db/pool.js';

export type ReportTemplateCatalogRow = {
  id: string;
  module: string;
  name: string;
  description: string | null;
  report_type: string;
  category: string | null;
  configuration_json: unknown;
  sort_order: number;
};

export async function listCatalogTemplates(module?: string): Promise<ReportTemplateCatalogRow[]> {
  const pool = getPool();
  const mod = module?.trim() || null;
  const res = await pool.query<ReportTemplateCatalogRow>(
    `SELECT id, module, name, description, report_type, category, configuration_json, sort_order
     FROM report_templates
     WHERE ($1::text IS NULL OR module = $1)
     ORDER BY sort_order ASC, name ASC`,
    [mod]
  );
  return res.rows;
}
