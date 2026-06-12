import type { PoolClient } from 'pg';

import { PROJECT_SELLING_MODULE_KEY } from '../metadata/projectSellingFields.js';
import { RENTAL_AGREEMENTS_MODULE_KEY } from '../metadata/rentalAgreementsFields.js';
import type { CustomReportGeneratePayload } from '../validators/reportConfigurationSchema.js';
import type { GeneratedColumnMeta, GeneratedReportResult } from './customReportRunService.js';

const AGING_COLUMNS: GeneratedColumnMeta[] = [
  { key: 'entity_name', label: 'Customer / Tenant', type: 'string' },
  { key: 'project_name', label: 'Project', type: 'string' },
  { key: 'property_name', label: 'Property', type: 'string' },
  { key: 'aging_bucket', label: 'Aging bucket', type: 'string' },
  { key: 'balance', label: 'Balance', type: 'number' },
  { key: 'document_count', label: 'Documents', type: 'number' },
];

const AGING_BUCKET_EXPR = `
CASE
  WHEN i.due_date IS NULL OR i.due_date >= $2::date THEN 'Current'
  WHEN ($2::date - i.due_date) BETWEEN 1 AND 30 THEN '1-30 days'
  WHEN ($2::date - i.due_date) BETWEEN 31 AND 60 THEN '31-60 days'
  WHEN ($2::date - i.due_date) BETWEEN 61 AND 90 THEN '61-90 days'
  ELSE '90+ days'
END`;

const MAX_EXPORT_ROWS = 5000;
const MAX_PREVIEW_ROWS = 500;

function resolveAsOfDate(payload: CustomReportGeneratePayload): string {
  const raw = (payload as CustomReportGeneratePayload & { agingAsOf?: string }).agingAsOf;
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return new Date().toISOString().slice(0, 10);
}

function normalizeRow(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'balance' || k === 'document_count') {
      out[k] = v === null || v === undefined ? null : Number(v);
    } else {
      out[k] = v instanceof Date ? v.toISOString().slice(0, 10) : v;
    }
  }
  return out;
}

function projectSellingAgingSql(mode: 'preview' | 'export', page: number, pageSize: number): string {
  const limit = mode === 'export' ? MAX_EXPORT_ROWS : pageSize;
  const offset = mode === 'export' ? 0 : (page - 1) * pageSize;
  return `
SELECT
  COALESCE(client.name, 'Unknown') AS entity_name,
  COALESCE(proj.name, '') AS project_name,
  '' AS property_name,
  ${AGING_BUCKET_EXPR} AS aging_bucket,
  SUM(GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0)) AS balance,
  COUNT(*)::int AS document_count
FROM invoices i
LEFT JOIN contacts client
  ON client.id = i.contact_id AND client.tenant_id = i.tenant_id AND client.deleted_at IS NULL
LEFT JOIN projects proj
  ON proj.id = i.project_id AND proj.tenant_id = i.tenant_id AND proj.deleted_at IS NULL
WHERE i.tenant_id = $1
  AND i.deleted_at IS NULL
  AND i.invoice_type = 'Installment'
  AND GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0) > 0.005
GROUP BY client.name, proj.name, ${AGING_BUCKET_EXPR}
ORDER BY entity_name, aging_bucket
LIMIT ${limit} OFFSET ${offset}`;
}

function rentalAgingSql(mode: 'preview' | 'export', page: number, pageSize: number): string {
  const limit = mode === 'export' ? MAX_EXPORT_ROWS : pageSize;
  const offset = mode === 'export' ? 0 : (page - 1) * pageSize;
  return `
SELECT
  COALESCE(tenant.name, 'Unknown') AS entity_name,
  '' AS project_name,
  COALESCE(prop.name, '') AS property_name,
  ${AGING_BUCKET_EXPR} AS aging_bucket,
  SUM(GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0)) AS balance,
  COUNT(*)::int AS document_count
FROM invoices i
LEFT JOIN contacts tenant
  ON tenant.id = i.contact_id AND tenant.tenant_id = i.tenant_id AND tenant.deleted_at IS NULL
LEFT JOIN properties prop
  ON prop.id = i.property_id AND prop.tenant_id = i.tenant_id AND prop.deleted_at IS NULL
WHERE i.tenant_id = $1
  AND i.deleted_at IS NULL
  AND i.invoice_type IN ('Rental', 'Security Deposit', 'Service Charge')
  AND GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0) > 0.005
GROUP BY tenant.name, prop.name, ${AGING_BUCKET_EXPR}
ORDER BY entity_name, aging_bucket
LIMIT ${limit} OFFSET ${offset}`;
}

function countSqlForModule(module: string): string {
  if (module === PROJECT_SELLING_MODULE_KEY) {
    return `
SELECT COUNT(*)::bigint AS c FROM (
  SELECT 1
  FROM invoices i
  WHERE i.tenant_id = $1
    AND i.deleted_at IS NULL
    AND i.invoice_type = 'Installment'
    AND GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0) > 0.005
  GROUP BY i.contact_id, i.project_id, ${AGING_BUCKET_EXPR}
) sub`;
  }
  return `
SELECT COUNT(*)::bigint AS c FROM (
  SELECT 1
  FROM invoices i
  WHERE i.tenant_id = $1
    AND i.deleted_at IS NULL
    AND i.invoice_type IN ('Rental', 'Security Deposit', 'Service Charge')
    AND GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0) > 0.005
  GROUP BY i.contact_id, i.property_id, ${AGING_BUCKET_EXPR}
) sub`;
}

export async function runAgingReport(
  client: PoolClient,
  tenantId: string,
  payload: CustomReportGeneratePayload,
  mode: 'preview' | 'export'
): Promise<GeneratedReportResult> {
  const module = payload.module;
  if (module !== PROJECT_SELLING_MODULE_KEY && module !== RENTAL_AGREEMENTS_MODULE_KEY) {
    throw new Error(`AGING_MODULE_NOT_SUPPORTED:${module}`);
  }

  const asOf = resolveAsOfDate(payload);
  const params = [tenantId, asOf];
  const page = payload.page ?? 1;
  const pageSize = Math.min(payload.pageSize ?? 50, mode === 'export' ? MAX_EXPORT_ROWS : MAX_PREVIEW_ROWS);

  const listSql =
    module === PROJECT_SELLING_MODULE_KEY
      ? projectSellingAgingSql(mode, page, pageSize)
      : rentalAgingSql(mode, page, pageSize);

  await client.query(`SET LOCAL statement_timeout TO '35000'`);
  const [listRes, countRes] = await Promise.all([
    client.query(listSql, params),
    client.query<{ c: string }>(countSqlForModule(module), params),
  ]);

  const columns =
    module === PROJECT_SELLING_MODULE_KEY
      ? AGING_COLUMNS.filter((c) => c.key !== 'property_name')
      : AGING_COLUMNS.filter((c) => c.key !== 'project_name');

  return {
    columns,
    rows: listRes.rows.map((r) => normalizeRow(r as Record<string, unknown>)),
    totalCount: Number(countRes.rows[0]?.c ?? 0),
    page,
    pageSize,
  };
}
