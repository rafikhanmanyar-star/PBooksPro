import type pg from 'pg';
import { GLOBAL_SYSTEM_TENANT_ID } from '../../constants/globalSystemChart.js';
import { listAccounts, type AccountRow } from '../accountsService.js';
import { getProfitLossReportJson } from '../profitLossReportService.js';
import {
  computeTrendPercent,
  metricStatusForTrend,
  resolveComparisonRange,
} from './dashboardMetricsHelpers.js';
import type {
  DashboardFilters,
  DashboardMetricValue,
  DashboardMetricsResponse,
  RawMetricSnapshot,
} from './dashboardMetricsTypes.js';

const EXCLUDED_PL_CATEGORY_NAMES = [
  'Owner Equity',
  'Owner Withdrawn',
  'Security Deposit',
  'Rental Income',
  'Security Deposit Refund',
  'Owner Payout',
  'Owner Security Payout',
];

async function fetchExcludedCategoryIds(client: pg.PoolClient, tenantId: string): Promise<string[]> {
  const r = await client.query<{ id: string }>(
    `SELECT id FROM categories
     WHERE (tenant_id = $1 OR tenant_id = $2)
       AND deleted_at IS NULL
       AND name = ANY($3::text[])`,
    [tenantId, GLOBAL_SYSTEM_TENANT_ID, EXCLUDED_PL_CATEGORY_NAMES]
  );
  return r.rows.map((row) => row.id);
}

function sumAccountBalancesFromList(accounts: AccountRow[], types: string[]): number {
  const typeSet = new Set(types.map((t) => t.toLowerCase()));
  return accounts
    .filter(
      (a) =>
        typeSet.has(a.type.toLowerCase()) &&
        a.name !== 'Internal Clearing' &&
        !a.deleted_at
    )
    .reduce((s, a) => s + Number(a.balance), 0);
}

function securityDepositBalanceFromList(accounts: AccountRow[]): number {
  const sec = accounts.find(
    (a) => a.name.toLowerCase() === 'security deposit' && !a.deleted_at
  );
  return sec ? Number(sec.balance) : 0;
}

type FilterClause = { sql: string; params: unknown[] };

function entityFilter(
  filters: DashboardFilters,
  columnMap: { project?: string; property?: string; vendor?: string; customer?: string }
): FilterClause {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let idx = 0;
  const add = (col: string | undefined, val: string | undefined) => {
    if (!col || !val) return;
    idx += 1;
    clauses.push(`${col} = $${idx}`);
    params.push(val);
  };
  add(columnMap.project, filters.projectId);
  add(columnMap.property, filters.propertyId);
  add(columnMap.vendor, filters.vendorId);
  add(columnMap.customer, filters.customerId);
  return { sql: clauses.length ? ` AND ${clauses.join(' AND ')}` : '', params };
}

async function sumAccountsReceivable(
  client: pg.PoolClient,
  tenantId: string,
  filters: DashboardFilters
): Promise<number> {
  const ef = entityFilter(filters, { project: 'i.project_id', property: 'i.property_id' });
  const r = await client.query<{ total: string }>(
    `SELECT COALESCE(SUM(i.amount - i.paid_amount), 0)::text AS total
     FROM invoices i
     LEFT JOIN project_agreements pa ON pa.id = i.agreement_id AND pa.tenant_id = i.tenant_id
     WHERE i.tenant_id = $1
       AND i.deleted_at IS NULL
       AND i.status <> 'Paid'
       AND (i.description IS NULL OR i.description NOT LIKE '%VOIDED%')
       AND (i.agreement_id IS NULL OR pa.status IS NULL OR pa.status <> 'Cancelled')
       ${ef.sql}`,
    [tenantId, ...ef.params]
  );
  return Number(r.rows[0]?.total ?? 0);
}

async function sumAccountsPayable(
  client: pg.PoolClient,
  tenantId: string,
  filters: DashboardFilters
): Promise<number> {
  const ef = entityFilter(filters, { project: 'b.project_id', property: 'b.property_id', vendor: 'b.vendor_id' });
  const r = await client.query<{ total: string }>(
    `SELECT COALESCE(SUM(GREATEST(b.amount - COALESCE(b.paid_amount, 0), 0)), 0)::text AS total
     FROM bills b
     WHERE b.tenant_id = $1
       AND b.deleted_at IS NULL
       AND COALESCE(b.paid_amount, 0) < b.amount - 0.01
       ${ef.sql}`,
    [tenantId, ...ef.params]
  );
  return Number(r.rows[0]?.total ?? 0);
}

async function plTotals(
  client: pg.PoolClient,
  tenantId: string,
  from: string,
  to: string,
  projectId?: string
): Promise<{ netIncome: number; revenue: number; expenses: number }> {
  const project = projectId ?? 'all';
  const pl = await getProfitLossReportJson(client, tenantId, from, to, project);
  const revenue = Number(pl.total_revenue ?? 0);
  const netIncome = Number(pl.net_profit ?? 0);
  const expenseItems = [
    ...(Array.isArray(pl.cost_of_sales) ? pl.cost_of_sales : []),
    ...(Array.isArray(pl.operating_expenses) ? pl.operating_expenses : []),
    ...(Array.isArray(pl.finance_cost) ? pl.finance_cost : []),
    ...(Array.isArray(pl.tax) ? pl.tax : []),
  ] as { amount?: number }[];
  const expensesFromLines = expenseItems.reduce((s, row) => s + Number(row.amount ?? 0), 0);
  const expenses = expensesFromLines > 0 ? expensesFromLines : Math.max(0, revenue - netIncome);
  return { netIncome, revenue, expenses };
}

async function operatingCashFlow(
  client: pg.PoolClient,
  tenantId: string,
  from: string,
  to: string,
  filters: DashboardFilters,
  excludedCategoryIds: string[]
): Promise<number> {
  const clauses = [
    't.tenant_id = $1',
    't.deleted_at IS NULL',
    't.date >= $2::date',
    't.date <= $3::date',
  ];
  const params: unknown[] = [tenantId, from, to];

  if (excludedCategoryIds.length) {
    params.push(excludedCategoryIds);
    clauses.push(`(t.category_id IS NULL OR t.category_id <> ALL($${params.length}::text[]))`);
  }
  if (filters.projectId) {
    params.push(filters.projectId);
    clauses.push(`t.project_id = $${params.length}`);
  }
  if (filters.propertyId) {
    params.push(filters.propertyId);
    clauses.push(`t.property_id = $${params.length}`);
  }
  if (filters.vendorId) {
    params.push(filters.vendorId);
    clauses.push(`t.vendor_id = $${params.length}`);
  }
  if (filters.customerId) {
    params.push(filters.customerId);
    clauses.push(`t.contact_id = $${params.length}`);
  }

  const r = await client.query<{ net: string }>(
    `SELECT (
      COALESCE(SUM(CASE WHEN t.type = 'Income' THEN t.amount ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN t.type = 'Expense' THEN t.amount ELSE 0 END), 0)
    )::text AS net
     FROM transactions t
     WHERE ${clauses.join(' AND ')}`,
    params
  );
  return Number(r.rows[0]?.net ?? 0);
}

async function countInPeriod(
  client: pg.PoolClient,
  sql: string,
  params: unknown[]
): Promise<number> {
  const r = await client.query<{ c: string }>(sql, params);
  return Number(r.rows[0]?.c ?? 0);
}

async function computeSnapshot(
  client: pg.PoolClient,
  tenantId: string,
  filters: DashboardFilters
): Promise<RawMetricSnapshot> {
  const { from, to, projectId } = filters;
  const [accounts, excludedIds] = await Promise.all([
    listAccounts(client, tenantId),
    fetchExcludedCategoryIds(client, tenantId),
  ]);
  const totalCashBalance = sumAccountBalancesFromList(accounts, ['bank', 'cash']);
  const bankBalance = sumAccountBalancesFromList(accounts, ['bank']);
  const securityDepositsHeld = securityDepositBalanceFromList(accounts);

  const [
    accountsReceivable,
    accountsPayable,
    pl,
    ocf,
    activeProjects,
    unitsAvailable,
    unitsSold,
    collectionStats,
    activeRentalProperties,
    occupancyStats,
    newCustomers,
    newVendors,
    newRentalAgreements,
    newProjectAgreements,
    newReceipts,
    newPayments,
  ] = await Promise.all([
    sumAccountsReceivable(client, tenantId, filters),
    sumAccountsPayable(client, tenantId, filters),
    plTotals(client, tenantId, from, to, projectId),
    operatingCashFlow(client, tenantId, from, to, filters, excludedIds),
    countInPeriod(
      client,
      `SELECT COUNT(*)::text AS c FROM projects
       WHERE tenant_id = $1 AND deleted_at IS NULL
         AND LOWER(COALESCE(status, 'active')) NOT IN ('completed', 'cancelled', 'closed')
         ${projectId ? ' AND id = $2' : ''}`,
      projectId ? [tenantId, projectId] : [tenantId]
    ),
    countInPeriod(
      client,
      `SELECT COUNT(*)::text AS c FROM units u
       WHERE u.tenant_id = $1 AND u.deleted_at IS NULL AND u.status = 'available'
         ${projectId ? ' AND u.project_id = $2' : ''}`,
      projectId ? [tenantId, projectId] : [tenantId]
    ),
    countInPeriod(
      client,
      `SELECT COUNT(*)::text AS c FROM units u
       WHERE u.tenant_id = $1 AND u.deleted_at IS NULL AND u.status = 'sold'
         ${projectId ? ' AND u.project_id = $2' : ''}`,
      projectId ? [tenantId, projectId] : [tenantId]
    ),
    client.query<{ due: string; collected: string }>(
      `SELECT
         COALESCE(SUM(i.amount), 0)::text AS due,
         COALESCE(SUM(i.paid_amount), 0)::text AS collected
       FROM invoices i
       WHERE i.tenant_id = $1 AND i.deleted_at IS NULL
         AND i.issue_date >= $2::date AND i.issue_date <= $3::date
         ${projectId ? ' AND i.project_id = $4' : ''}`,
      projectId ? [tenantId, from, to, projectId] : [tenantId, from, to]
    ),
    countInPeriod(
      client,
      `SELECT COUNT(DISTINCT ra.property_id)::text AS c
       FROM rental_agreements ra
       WHERE ra.tenant_id = $1 AND ra.deleted_at IS NULL
         AND ra.status = 'Active'
         ${filters.propertyId ? ' AND ra.property_id = $2' : ''}`,
      filters.propertyId ? [tenantId, filters.propertyId] : [tenantId]
    ),
    client.query<{ occupied: string; total: string }>(
      `SELECT
         (SELECT COUNT(DISTINCT ra.property_id)::text FROM rental_agreements ra
          WHERE ra.tenant_id = $1 AND ra.deleted_at IS NULL AND ra.status = 'Active') AS occupied,
         (SELECT COUNT(*)::text FROM properties p
          WHERE p.tenant_id = $1 AND p.deleted_at IS NULL) AS total`,
      [tenantId]
    ),
    countInPeriod(
      client,
      `SELECT COUNT(*)::text AS c FROM contacts
       WHERE tenant_id = $1 AND deleted_at IS NULL
         AND LOWER(type) IN ('customer', 'client', 'owner')
         AND created_at >= $2::timestamptz AND created_at < ($3::date + INTERVAL '1 day')`,
      [tenantId, from, to]
    ),
    countInPeriod(
      client,
      `SELECT COUNT(*)::text AS c FROM vendors
       WHERE tenant_id = $1 AND deleted_at IS NULL
         AND created_at >= $2::timestamptz AND created_at < ($3::date + INTERVAL '1 day')`,
      [tenantId, from, to]
    ),
    countInPeriod(
      client,
      `SELECT COUNT(*)::text AS c FROM rental_agreements
       WHERE tenant_id = $1 AND deleted_at IS NULL
         AND created_at >= $2::timestamptz AND created_at < ($3::date + INTERVAL '1 day')`,
      [tenantId, from, to]
    ),
    countInPeriod(
      client,
      `SELECT COUNT(*)::text AS c FROM project_agreements
       WHERE tenant_id = $1 AND deleted_at IS NULL
         AND created_at >= $2::timestamptz AND created_at < ($3::date + INTERVAL '1 day')
         ${projectId ? ' AND project_id = $4' : ''}`,
      projectId ? [tenantId, from, to, projectId] : [tenantId, from, to]
    ),
    countInPeriod(
      client,
      `SELECT COUNT(*)::text AS c FROM transactions
       WHERE tenant_id = $1 AND deleted_at IS NULL AND type = 'Income'
         AND date >= $2::date AND date <= $3::date`,
      [tenantId, from, to]
    ),
    countInPeriod(
      client,
      `SELECT COUNT(*)::text AS c FROM transactions
       WHERE tenant_id = $1 AND deleted_at IS NULL AND type = 'Expense'
         AND date >= $2::date AND date <= $3::date`,
      [tenantId, from, to]
    ),
  ]);

  const due = Number(collectionStats.rows[0]?.due ?? 0);
  const collected = Number(collectionStats.rows[0]?.collected ?? 0);
  const collectionRate = due > 0 ? (collected / due) * 100 : 0;

  const occupied = Number(occupancyStats.rows[0]?.occupied ?? 0);
  const totalProps = Number(occupancyStats.rows[0]?.total ?? 0);
  const occupancyRate = totalProps > 0 ? (occupied / totalProps) * 100 : 0;

  return {
    totalCashBalance,
    bankBalance,
    accountsReceivable,
    accountsPayable,
    netIncome: pl.netIncome,
    revenue: pl.revenue,
    expenses: pl.expenses,
    operatingCashFlow: ocf,
    activeProjects,
    unitsAvailable,
    unitsSold,
    collectionRate,
    outstandingReceivables: accountsReceivable,
    activeRentalProperties,
    occupancyRate,
    securityDepositsHeld,
    newCustomers,
    newVendors,
    newAgreements: newRentalAgreements + newProjectAgreements,
    newBookings: newProjectAgreements,
    newReceipts,
    newPayments,
  };
}

function buildMetric(
  id: string,
  label: string,
  group: DashboardMetricValue['group'],
  value: number,
  previous: number | undefined,
  format: DashboardMetricValue['format'],
  higherIsBetter = true,
  description?: string
): DashboardMetricValue {
  const trendPercent = computeTrendPercent(value, previous);
  return {
    id,
    label,
    group,
    value,
    previousValue: previous,
    trendPercent,
    format,
    status: metricStatusForTrend(trendPercent, higherIsBetter),
    description,
  };
}

function snapshotToMetrics(
  current: RawMetricSnapshot,
  previous?: RawMetricSnapshot
): Pick<DashboardMetricsResponse, 'financial' | 'realEstate' | 'activity'> {
  const p = previous;
  return {
    financial: [
      buildMetric('totalCashBalance', 'Total Cash Balance', 'financial', current.totalCashBalance, p?.totalCashBalance, 'currency'),
      buildMetric('bankBalance', 'Bank Balance', 'financial', current.bankBalance, p?.bankBalance, 'currency'),
      buildMetric('accountsReceivable', 'Accounts Receivable', 'financial', current.accountsReceivable, p?.accountsReceivable, 'currency', false),
      buildMetric('accountsPayable', 'Accounts Payable', 'financial', current.accountsPayable, p?.accountsPayable, 'currency', false),
      buildMetric('netIncome', 'Net Income', 'financial', current.netIncome, p?.netIncome, 'currency'),
      buildMetric('revenue', 'Revenue', 'financial', current.revenue, p?.revenue, 'currency'),
      buildMetric('expenses', 'Expenses', 'financial', current.expenses, p?.expenses, 'currency', false),
      buildMetric('operatingCashFlow', 'Operating Cash Flow', 'financial', current.operatingCashFlow, p?.operatingCashFlow, 'currency'),
    ],
    realEstate: [
      buildMetric('activeProjects', 'Active Projects', 'realEstate', current.activeProjects, p?.activeProjects, 'count'),
      buildMetric('unitsAvailable', 'Units Available', 'realEstate', current.unitsAvailable, p?.unitsAvailable, 'count'),
      buildMetric('unitsSold', 'Units Sold', 'realEstate', current.unitsSold, p?.unitsSold, 'count'),
      buildMetric('collectionRate', 'Collection Rate', 'realEstate', current.collectionRate, p?.collectionRate, 'percent'),
      buildMetric('outstandingReceivables', 'Outstanding Receivables', 'realEstate', current.outstandingReceivables, p?.outstandingReceivables, 'currency', false),
      buildMetric('activeRentalProperties', 'Active Rental Properties', 'realEstate', current.activeRentalProperties, p?.activeRentalProperties, 'count'),
      buildMetric('occupancyRate', 'Occupancy Rate', 'realEstate', current.occupancyRate, p?.occupancyRate, 'percent'),
      buildMetric('securityDepositsHeld', 'Security Deposits Held', 'realEstate', current.securityDepositsHeld, p?.securityDepositsHeld, 'currency'),
    ],
    activity: [
      buildMetric('newCustomers', 'New Customers', 'activity', current.newCustomers, p?.newCustomers, 'count'),
      buildMetric('newVendors', 'New Vendors', 'activity', current.newVendors, p?.newVendors, 'count'),
      buildMetric('newAgreements', 'New Agreements', 'activity', current.newAgreements, p?.newAgreements, 'count'),
      buildMetric('newBookings', 'New Bookings', 'activity', current.newBookings, p?.newBookings, 'count'),
      buildMetric('newReceipts', 'New Receipts', 'activity', current.newReceipts, p?.newReceipts, 'count'),
      buildMetric('newPayments', 'New Payments', 'activity', current.newPayments, p?.newPayments, 'count'),
    ],
  };
}

export async function getDashboardMetricsJson(
  client: pg.PoolClient,
  tenantId: string,
  filters: DashboardFilters
): Promise<DashboardMetricsResponse> {
  const cmpRange = resolveComparisonRange(filters);
  const [current, previous] = await Promise.all([
    computeSnapshot(client, tenantId, filters),
    cmpRange
      ? computeSnapshot(client, tenantId, { ...filters, from: cmpRange.from, to: cmpRange.to })
      : Promise.resolve(undefined as RawMetricSnapshot | undefined),
  ]);
  const groups = snapshotToMetrics(current, previous);
  return {
    filters,
    generatedAt: new Date().toISOString(),
    ...groups,
  };
}
