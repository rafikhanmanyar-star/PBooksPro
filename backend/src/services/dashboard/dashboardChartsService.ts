import type pg from 'pg';
import { GLOBAL_SYSTEM_TENANT_ID } from '../../constants/globalSystemChart.js';
import {
  computeProfitLossFromPrepared,
  extractPlRevenueAndExpenses,
  prepareProfitLossState,
} from '../profitLossReportService.js';
import { appendBuildingFilter, invoiceCollectionQuery, parseDateOnly, toDateOnlyString } from './dashboardMetricsHelpers.js';
import type { DashboardFilters } from './dashboardMetricsTypes.js';
import type { DashboardChartsResponse } from './dashboardChartsTypes.js';

const EXCLUDED_PL_CATEGORY_NAMES = [
  'Owner Equity',
  'Owner Withdrawn',
  'Security Deposit',
  'Rental Income',
  'Security Deposit Refund',
  'Owner Payout',
  'Owner Security Payout',
];

async function excludedCategoryIds(client: pg.PoolClient, tenantId: string): Promise<string[]> {
  const r = await client.query<{ id: string }>(
    `SELECT id FROM categories
     WHERE (tenant_id = $1 OR tenant_id = $2) AND deleted_at IS NULL AND name = ANY($3::text[])`,
    [tenantId, GLOBAL_SYSTEM_TENANT_ID, EXCLUDED_PL_CATEGORY_NAMES]
  );
  return r.rows.map((row) => row.id);
}

function monthRangeForYear(year: number): { from: string; to: string; months: { key: string; label: string; from: string; to: string }[] } {
  const months: { key: string; label: string; from: string; to: string }[] = [];
  for (let m = 0; m < 12; m++) {
    const start = new Date(year, m, 1);
    const end = new Date(year, m + 1, 0);
    const key = `${year}-${String(m + 1).padStart(2, '0')}`;
    months.push({
      key,
      label: start.toLocaleString('en-US', { month: 'short' }),
      from: toDateOnlyString(start),
      to: toDateOnlyString(end),
    });
  }
  return { from: `${year}-01-01`, to: `${year}-12-31`, months };
}

function filterYear(filters: DashboardFilters): number {
  const y = parseDateOnly(filters.to).getFullYear();
  return Number.isFinite(y) ? y : new Date().getFullYear();
}

async function revenueVsExpensesByMonth(
  client: pg.PoolClient,
  tenantId: string,
  year: number,
  projectId?: string
): Promise<DashboardChartsResponse['revenueVsExpenses']> {
  const { months } = monthRangeForYear(year);
  const project = projectId ?? 'all';
  const prepared = await prepareProfitLossState(client, tenantId, `${year}-12-31`);

  return Promise.all(
    months.map(async (m) => {
      const pl = await computeProfitLossFromPrepared(prepared, m.from, m.to, project);
      const { revenue, expenses } = extractPlRevenueAndExpenses(pl);
      return { month: m.key, label: m.label, revenue, expenses };
    })
  );
}

async function cashFlowTrendByMonth(
  client: pg.PoolClient,
  tenantId: string,
  year: number,
  excludedIds: string[],
  filters: Pick<DashboardFilters, 'projectId' | 'buildingId'>
): Promise<DashboardChartsResponse['cashFlowTrend']> {
  const { months } = monthRangeForYear(year);

  return Promise.all(
    months.map(async (m) => {
      const params: unknown[] = [tenantId, m.from, m.to];
      const clauses = [
        't.tenant_id = $1',
        't.deleted_at IS NULL',
        't.date >= $2::date',
        't.date <= $3::date',
      ];
      if (excludedIds.length) {
        params.push(excludedIds);
        clauses.push(`(t.category_id IS NULL OR t.category_id <> ALL($${params.length}::text[]))`);
      }
      if (filters.projectId) {
        params.push(filters.projectId);
        clauses.push(`t.project_id = $${params.length}`);
      }
      appendBuildingFilter('t', filters.buildingId, params, clauses);
      const r = await client.query<{ inflow: string; outflow: string }>(
        `SELECT
           COALESCE(SUM(CASE WHEN t.type = 'Income' THEN t.amount ELSE 0 END), 0)::text AS inflow,
           COALESCE(SUM(CASE WHEN t.type = 'Expense' THEN t.amount ELSE 0 END), 0)::text AS outflow
         FROM transactions t WHERE ${clauses.join(' AND ')}`,
        params
      );
      const inflow = Number(r.rows[0]?.inflow ?? 0);
      const outflow = Number(r.rows[0]?.outflow ?? 0);
      return { month: m.key, label: m.label, inflow, outflow, net: inflow - outflow };
    })
  );
}

async function receivablesAging(
  client: pg.PoolClient,
  tenantId: string,
  filters: DashboardFilters
): Promise<DashboardChartsResponse['receivablesAging']> {
  const params: unknown[] = [tenantId];
  const invoiceClauses = [
    'i.tenant_id = $1',
    'i.deleted_at IS NULL',
    'i.status <> \'Paid\'',
    '(i.description IS NULL OR i.description NOT LIKE \'%VOIDED%\')',
    '(i.agreement_id IS NULL OR pa.status IS NULL OR pa.status <> \'Cancelled\')',
  ];
  if (filters.projectId) {
    params.push(filters.projectId);
    invoiceClauses.push(`i.project_id = $${params.length}`);
  }
  appendBuildingFilter('i', filters.buildingId, params, invoiceClauses);
  const r = await client.query<{ bucket: string; total: string }>(
    `SELECT bucket, COALESCE(SUM(balance), 0)::text AS total FROM (
       SELECT
         CASE
           WHEN i.due_date >= CURRENT_DATE THEN 'Current'
           WHEN CURRENT_DATE - i.due_date <= 30 THEN '30 Days'
           WHEN CURRENT_DATE - i.due_date <= 60 THEN '60 Days'
           WHEN CURRENT_DATE - i.due_date <= 90 THEN '90 Days'
           ELSE '120+ Days'
         END AS bucket,
         GREATEST(i.amount - COALESCE(i.paid_amount, 0), 0) AS balance
       FROM invoices i
       LEFT JOIN project_agreements pa ON pa.id = i.agreement_id AND pa.tenant_id = i.tenant_id
       WHERE ${invoiceClauses.join(' AND ')}
     ) sub
     GROUP BY bucket
     ORDER BY CASE bucket
       WHEN 'Current' THEN 1 WHEN '30 Days' THEN 2 WHEN '60 Days' THEN 3
       WHEN '90 Days' THEN 4 ELSE 5 END`,
    params
  );
  const order = ['Current', '30 Days', '60 Days', '90 Days', '120+ Days'];
  const map = new Map(r.rows.map((row) => [row.bucket, Number(row.total)]));
  return order.map((label) => ({ label, value: map.get(label) ?? 0 }));
}

async function salesPipeline(
  client: pg.PoolClient,
  tenantId: string,
  projectId?: string
): Promise<DashboardChartsResponse['salesPipeline']> {
  const params: unknown[] = [tenantId];
  let projectSql = '';
  if (projectId) {
    params.push(projectId);
    projectSql = ' AND u.project_id = $2';
  }
  const [available, sold, reserved] = await Promise.all([
    client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM units u
       WHERE u.tenant_id = $1 AND u.deleted_at IS NULL AND u.status = 'available'${projectSql}`,
      params
    ),
    client.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM units u
       WHERE u.tenant_id = $1 AND u.deleted_at IS NULL AND u.status = 'sold'${projectSql}`,
      params
    ),
    client.query<{ c: string }>(
      `SELECT COUNT(DISTINCT pau.unit_id)::text AS c
       FROM project_agreement_units pau
       INNER JOIN project_agreements pa ON pa.id = pau.agreement_id
       INNER JOIN units u ON u.id = pau.unit_id AND u.tenant_id = pa.tenant_id
       WHERE pa.tenant_id = $1 AND pa.deleted_at IS NULL
         AND pa.status NOT IN ('Cancelled', 'Completed')
         AND u.deleted_at IS NULL
         AND u.status <> 'sold'
         ${projectId ? ' AND pa.project_id = $2' : ''}`,
      params
    ),
  ]);
  return [
    { name: 'Available', value: Number(available.rows[0]?.c ?? 0) },
    { name: 'Reserved', value: Number(reserved.rows[0]?.c ?? 0) },
    { name: 'Sold', value: Number(sold.rows[0]?.c ?? 0) },
  ];
}

async function expenseBreakdown(
  client: pg.PoolClient,
  tenantId: string,
  filters: DashboardFilters,
  excludedIds: string[]
): Promise<DashboardChartsResponse['expenseBreakdown']> {
  const params: unknown[] = [tenantId, filters.from, filters.to];
  const clauses = [
    't.tenant_id = $1',
    't.deleted_at IS NULL',
    't.type = \'Expense\'',
    't.date >= $2::date',
    't.date <= $3::date',
    't.category_id IS NOT NULL',
  ];
  if (excludedIds.length) {
    params.push(excludedIds);
    clauses.push(`t.category_id <> ALL($${params.length}::text[])`);
  }
  if (filters.projectId) {
    params.push(filters.projectId);
    clauses.push(`t.project_id = $${params.length}`);
  }
  appendBuildingFilter('t', filters.buildingId, params, clauses);
  const r = await client.query<{ name: string; total: string }>(
    `SELECT COALESCE(c.name, 'Uncategorized') AS name, SUM(t.amount)::text AS total
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE ${clauses.join(' AND ')}
     GROUP BY c.name
     ORDER BY SUM(t.amount) DESC
     LIMIT 12`,
    params
  );
  return r.rows.map((row) => ({ name: row.name, value: Number(row.total) }));
}

async function collectionsPerformance(
  client: pg.PoolClient,
  tenantId: string,
  year: number,
  filters: Pick<DashboardFilters, 'projectId' | 'buildingId'>
): Promise<DashboardChartsResponse['collectionsPerformance']> {
  const { months } = monthRangeForYear(year);

  return Promise.all(
    months.map(async (m) => {
      const q = invoiceCollectionQuery(tenantId, m.from, m.to, filters);
      const r = await client.query<{ due: string; collected: string }>(q.sql, q.params);
      const due = Number(r.rows[0]?.due ?? 0);
      const collected = Number(r.rows[0]?.collected ?? 0);
      return {
        month: m.key,
        label: m.label,
        due,
        collected,
        outstanding: Math.max(0, due - collected),
      };
    })
  );
}

export async function getDashboardChartsJson(
  client: pg.PoolClient,
  tenantId: string,
  filters: DashboardFilters,
  yearOverride?: number
): Promise<DashboardChartsResponse> {
  const year = yearOverride ?? filterYear(filters);
  const excludedIds = await excludedCategoryIds(client, tenantId);
  const projectId = filters.projectId;

  const [
    revenueVsExpenses,
    cashFlowTrend,
    receivablesAgingBuckets,
    salesPipelineSlices,
    expenseBreakdownSlices,
    collectionsPerformancePoints,
  ] = await Promise.all([
    revenueVsExpensesByMonth(client, tenantId, year, projectId),
    cashFlowTrendByMonth(client, tenantId, year, excludedIds, filters),
    receivablesAging(client, tenantId, filters),
    salesPipeline(client, tenantId, projectId),
    expenseBreakdown(client, tenantId, filters, excludedIds),
    collectionsPerformance(client, tenantId, year, filters),
  ]);

  return {
    filters,
    year,
    generatedAt: new Date().toISOString(),
    revenueVsExpenses,
    cashFlowTrend,
    receivablesAging: receivablesAgingBuckets,
    salesPipeline: salesPipelineSlices,
    expenseBreakdown: expenseBreakdownSlices,
    collectionsPerformance: collectionsPerformancePoints,
  };
}
