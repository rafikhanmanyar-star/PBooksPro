import type pg from 'pg';
import { GLOBAL_SYSTEM_TENANT_ID } from '../../constants/globalSystemChart.js';
import { parseDateOnly, toDateOnlyString } from './dashboardMetricsHelpers.js';
import type {
  ExpenseAnalyticsFilters,
  ExpenseAnalyticsResponse,
  ExpenseKpiValue,
  ExpenseScope,
} from './expenseAnalyticsTypes.js';

const EXCLUDED_CATEGORY_NAMES = [
  'Owner Equity',
  'Owner Withdrawn',
  'Security Deposit',
  'Owner Payout',
  'Owner Security Payout',
];

function monthRangeForYear(year: number) {
  const months: { key: string; label: string; from: string; to: string }[] = [];
  for (let m = 0; m < 12; m++) {
    const start = new Date(year, m, 1);
    const end = new Date(year, m + 1, 0);
    months.push({
      key: `${year}-${String(m + 1).padStart(2, '0')}`,
      label: start.toLocaleString('en-US', { month: 'short' }),
      from: toDateOnlyString(start),
      to: toDateOnlyString(end),
    });
  }
  return months;
}

function billFilterSql(
  scope: ExpenseScope,
  baseParamCount: number,
  projectId?: string,
  propertyId?: string
): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let idx = baseParamCount;
  if (scope === 'project') clauses.push('b.project_id IS NOT NULL');
  else if (scope === 'rental') clauses.push('b.project_id IS NULL');
  if (projectId) {
    params.push(projectId);
    idx += 1;
    clauses.push(`b.project_id = $${idx}`);
  }
  if (propertyId) {
    params.push(propertyId);
    idx += 1;
    clauses.push(`b.property_id = $${idx}`);
  }
  return { sql: clauses.length ? ` AND ${clauses.join(' AND ')}` : '', params };
}

async function excludedCategoryIds(client: pg.PoolClient, tenantId: string): Promise<string[]> {
  const r = await client.query<{ id: string }>(
    `SELECT id FROM categories
     WHERE (tenant_id = $1 OR tenant_id = $2) AND deleted_at IS NULL AND name = ANY($3::text[])`,
    [tenantId, GLOBAL_SYSTEM_TENANT_ID, EXCLUDED_CATEGORY_NAMES]
  );
  return r.rows.map((row) => row.id);
}

export async function getExpenseAnalyticsJson(
  client: pg.PoolClient,
  tenantId: string,
  filters: ExpenseAnalyticsFilters
): Promise<ExpenseAnalyticsResponse> {
  const { from, to, projectId, propertyId } = filters;
  const scope: ExpenseScope = filters.scope ?? 'all';
  const year = parseDateOnly(to).getFullYear();
  const excludedIds = await excludedCategoryIds(client, tenantId);

  const billFilter = billFilterSql(scope, 3, projectId, propertyId);
  const billBaseParams: unknown[] = [tenantId, from, to, ...billFilter.params];
  const billScope = billFilter.sql;
  const unpaidFilter = billFilterSql(scope, 1, projectId, propertyId);
  const unpaidParams: unknown[] = [tenantId, ...unpaidFilter.params];

  const [txTotal, billStats, unpaid, vendorTop] = await Promise.all([
    (async () => {
      const params: unknown[] = [tenantId, from, to];
      const clauses = [
        't.tenant_id = $1',
        't.deleted_at IS NULL',
        't.type = \'Expense\'',
        't.date >= $2::date',
        't.date <= $3::date',
      ];
      if (excludedIds.length) {
        params.push(excludedIds);
        clauses.push(`(t.category_id IS NULL OR t.category_id <> ALL($${params.length}::text[]))`);
      }
      if (scope === 'project') clauses.push('t.project_id IS NOT NULL');
      else if (scope === 'rental') clauses.push('t.project_id IS NULL');
      if (projectId) {
        params.push(projectId);
        clauses.push(`t.project_id = $${params.length}`);
      }
      const r = await client.query<{ total: string }>(
        `SELECT COALESCE(SUM(t.amount), 0)::text AS total FROM transactions t WHERE ${clauses.join(' AND ')}`,
        params
      );
      return Number(r.rows[0]?.total ?? 0);
    })(),
    client.query<{ count: string; billed: string; paid: string }>(
      `SELECT COUNT(*)::text AS count,
              COALESCE(SUM(b.amount), 0)::text AS billed,
              COALESCE(SUM(b.paid_amount), 0)::text AS paid
       FROM bills b
       WHERE b.tenant_id = $1 AND b.deleted_at IS NULL
         AND b.issue_date >= $2::date AND b.issue_date <= $3::date
         ${billScope}`,
      billBaseParams
    ),
    client.query<{ total: string }>(
      `SELECT COALESCE(SUM(GREATEST(b.amount - COALESCE(b.paid_amount, 0), 0)), 0)::text AS total
       FROM bills b
       WHERE b.tenant_id = $1 AND b.deleted_at IS NULL AND b.status <> 'Paid'
         ${unpaidFilter.sql}`,
      unpaidParams
    ),
    client.query<{ vendor_id: string; vendor_name: string; total: string }>(
      `SELECT COALESCE(b.vendor_id, 'unknown') AS vendor_id,
              COALESCE(v.name, 'Unknown vendor') AS vendor_name,
              SUM(b.amount)::text AS total
       FROM bills b
       LEFT JOIN vendors v ON v.id = b.vendor_id AND v.tenant_id = b.tenant_id
       WHERE b.tenant_id = $1 AND b.deleted_at IS NULL
         AND b.issue_date >= $2::date AND b.issue_date <= $3::date
         ${billScope}
       GROUP BY b.vendor_id, v.name
       ORDER BY SUM(b.amount) DESC
       LIMIT 15`,
      billBaseParams
    ),
  ]);

  const billCount = Number(billStats.rows[0]?.count ?? 0);
  const billedAmount = Number(billStats.rows[0]?.billed ?? 0);
  const paidAmount = Number(billStats.rows[0]?.paid ?? 0);
  const unpaidAmount = Number(unpaid.rows[0]?.total ?? 0);

  const kpis: ExpenseKpiValue[] = [
    { id: 'totalExpenses', label: 'Expense Transactions', value: txTotal, format: 'currency' },
    { id: 'billsIssued', label: 'Bills Issued', value: billedAmount, format: 'currency' },
    { id: 'billsPaid', label: 'Bills Paid', value: paidAmount, format: 'currency' },
    { id: 'unpaidBills', label: 'Outstanding Bills', value: unpaidAmount, format: 'currency' },
    { id: 'billCount', label: 'Bill Count', value: billCount, format: 'count' },
    {
      id: 'topVendor',
      label: 'Top Vendor Spend',
      value: Number(vendorTop.rows[0]?.total ?? 0),
      format: 'currency',
    },
  ];

  const expenseTrend = await Promise.all(
    monthRangeForYear(year).map(async (m) => {
      const params: unknown[] = [tenantId, m.from, m.to];
      const clauses = [
        't.tenant_id = $1',
        't.deleted_at IS NULL',
        't.type = \'Expense\'',
        't.date >= $2::date',
        't.date <= $3::date',
      ];
      if (excludedIds.length) {
        params.push(excludedIds);
        clauses.push(`(t.category_id IS NULL OR t.category_id <> ALL($${params.length}::text[]))`);
      }
      if (scope === 'project') clauses.push('t.project_id IS NOT NULL');
      else if (scope === 'rental') clauses.push('t.project_id IS NULL');
      if (projectId) {
        params.push(projectId);
        clauses.push(`t.project_id = $${params.length}`);
      }
      const r = await client.query<{ total: string }>(
        `SELECT COALESCE(SUM(t.amount), 0)::text AS total FROM transactions t WHERE ${clauses.join(' AND ')}`,
        params
      );
      return { month: m.key, label: m.label, amount: Number(r.rows[0]?.total ?? 0) };
    })
  );

  const catParams: unknown[] = [tenantId, from, to];
  const catClauses = [
    't.tenant_id = $1',
    't.deleted_at IS NULL',
    't.type = \'Expense\'',
    't.date >= $2::date',
    't.date <= $3::date',
    't.category_id IS NOT NULL',
  ];
  if (excludedIds.length) {
    catParams.push(excludedIds);
    catClauses.push(`t.category_id <> ALL($${catParams.length}::text[])`);
  }
  if (scope === 'project') catClauses.push('t.project_id IS NOT NULL');
  else if (scope === 'rental') catClauses.push('t.project_id IS NULL');
  if (projectId) {
    catParams.push(projectId);
    catClauses.push(`t.project_id = $${catParams.length}`);
  }
  const catR = await client.query<{ name: string; total: string }>(
    `SELECT COALESCE(c.name, 'Uncategorized') AS name, SUM(t.amount)::text AS total
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE ${catClauses.join(' AND ')}
     GROUP BY c.name
     ORDER BY SUM(t.amount) DESC
     LIMIT 12`,
    catParams
  );

  const statusR = await client.query<{ status: string; total: string }>(
    `SELECT
       CASE
         WHEN b.status = 'Paid' THEN 'Paid'
         WHEN COALESCE(b.paid_amount, 0) > 0 THEN 'Partial'
         ELSE 'Unpaid'
       END AS status,
       COUNT(*)::text AS total
     FROM bills b
     WHERE b.tenant_id = $1 AND b.deleted_at IS NULL
       AND b.issue_date >= $2::date AND b.issue_date <= $3::date
       ${billScope}
     GROUP BY 1`,
    billBaseParams
  );

  return {
    filters: { ...filters, scope },
    generatedAt: new Date().toISOString(),
    kpis,
    expenseTrend,
    categoryBreakdown: catR.rows.map((row) => ({ name: row.name, value: Number(row.total) })),
    billStatus: statusR.rows.map((row) => ({ name: row.status, value: Number(row.total) })),
    vendorSpend: vendorTop.rows.map((row) => ({
      vendorId: row.vendor_id,
      vendorName: row.vendor_name,
      amount: Number(row.total),
    })),
  };
}
