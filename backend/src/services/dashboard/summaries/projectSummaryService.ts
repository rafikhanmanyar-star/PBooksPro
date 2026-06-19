import type pg from 'pg';
import type { ProjectSummaryFilters, ProjectSummaryResponse } from './types.js';

export function parseProjectSummaryFilters(query: Record<string, unknown>): ProjectSummaryFilters {
  return {
    from: typeof query.from === 'string' ? query.from : undefined,
    to: typeof query.to === 'string' ? query.to : undefined,
    projectId: typeof query.projectId === 'string' ? query.projectId : undefined,
    clientId: typeof query.clientId === 'string' ? query.clientId : undefined,
    unitId: typeof query.unitId === 'string' ? query.unitId : undefined,
    search: typeof query.search === 'string' ? query.search : undefined,
  };
}

export async function getProjectAgreementSummary(
  client: pg.PoolClient,
  tenantId: string,
  filters: ProjectSummaryFilters
): Promise<ProjectSummaryResponse> {
  const params: unknown[] = [tenantId];
  let idx = 2;
  const clauses: string[] = ['pa.tenant_id = $1', 'pa.deleted_at IS NULL', `pa.status <> 'Cancelled'`];

  if (filters.from) {
    clauses.push(`pa.issue_date >= $${idx++}::date`);
    params.push(filters.from);
  }
  if (filters.to) {
    clauses.push(`pa.issue_date <= $${idx++}::date`);
    params.push(filters.to);
  }
  if (filters.projectId) {
    clauses.push(`pa.project_id = $${idx++}`);
    params.push(filters.projectId);
  }
  if (filters.clientId) {
    clauses.push(`pa.client_id = $${idx++}`);
    params.push(filters.clientId);
  }
  if (filters.unitId) {
    clauses.push(`EXISTS (
      SELECT 1 FROM project_agreement_units pau
      WHERE pau.agreement_id = pa.id AND pau.unit_id = $${idx}
    )`);
    params.push(filters.unitId);
    idx++;
  }

  const search = filters.search?.trim();
  if (search) {
    clauses.push(`(
      pa.agreement_number ILIKE $${idx}
      OR EXISTS (SELECT 1 FROM contacts c WHERE c.id = pa.client_id AND c.tenant_id = pa.tenant_id AND c.name ILIKE $${idx})
      OR EXISTS (SELECT 1 FROM projects p WHERE p.id = pa.project_id AND p.tenant_id = pa.tenant_id AND p.name ILIKE $${idx})
    )`);
    params.push(`%${search}%`);
    idx++;
  }

  const where = clauses.join(' AND ');

  const r = await client.query<{
    total_value: string;
    total_paid: string;
    total_outstanding: string;
    agreement_count: string;
    unit_count: string;
  }>(
    `WITH scoped AS (
       SELECT pa.id, pa.selling_price
       FROM project_agreements pa
       WHERE ${where}
     ),
     paid AS (
       SELECT s.id,
         COALESCE((
           SELECT SUM(COALESCE(i.paid_amount, 0))
           FROM invoices i
           WHERE i.agreement_id = s.id AND i.tenant_id = $1 AND i.deleted_at IS NULL
         ), 0) AS paid_amount
       FROM scoped s
     ),
     units AS (
       SELECT COUNT(DISTINCT pau.unit_id)::bigint AS c
       FROM project_agreement_units pau
       INNER JOIN scoped s ON s.id = pau.agreement_id
     )
     SELECT
       COALESCE(SUM(s.selling_price), 0)::text AS total_value,
       COALESCE(SUM(p.paid_amount), 0)::text AS total_paid,
       COALESCE(SUM(GREATEST(s.selling_price - p.paid_amount, 0)), 0)::text AS total_outstanding,
       COUNT(s.id)::text AS agreement_count,
       (SELECT c::text FROM units) AS unit_count
     FROM scoped s
     INNER JOIN paid p ON p.id = s.id`,
    params
  );

  const row = r.rows[0]!;
  return {
    generatedAt: new Date().toISOString(),
    totalValue: Number(row.total_value ?? 0),
    totalPaid: Number(row.total_paid ?? 0),
    totalOutstanding: Number(row.total_outstanding ?? 0),
    totalAgreements: Number(row.agreement_count ?? 0),
    totalUnits: Number(row.unit_count ?? 0),
  };
}
