import type pg from 'pg';
import { getDashboardMetricsJson } from '../../../services/dashboard/dashboardMetricsService.js';
import { getRentalAnalyticsJson } from '../../../services/dashboard/rentalAnalyticsService.js';
import { getCollectionsAnalyticsJson } from '../../../services/dashboard/collectionsAnalyticsService.js';
import { getExpenseAnalyticsJson } from '../../../services/dashboard/expenseAnalyticsService.js';
import {
  parseDashboardFilters,
  toDateOnlyString,
} from '../../../services/dashboard/dashboardMetricsHelpers.js';
import type { MobileDashboardResponse, MobileMetric } from '../types/index.js';

function todayRange(): { from: string; to: string } {
  const to = toDateOnlyString(new Date());
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 30);
  return { from: toDateOnlyString(fromDate), to };
}

function monthRange(): { from: string; to: string } {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const to = toDateOnlyString(now);
  return { from, to };
}

function metric(id: string, label: string, value: number, format: MobileMetric['format'] = 'currency', trend?: number | null): MobileMetric {
  return { id, label, value, format, trend: trend ?? null };
}

export async function getMobileDashboardSummary(
  client: pg.PoolClient,
  tenantId: string
): Promise<MobileDashboardResponse> {
  const { from, to } = todayRange();
  const filters = parseDashboardFilters({ from, to, comparisonPeriod: 'previous_period' });
  const metricsData = await getDashboardMetricsJson(client, tenantId, filters);
  const all = [...metricsData.financial, ...metricsData.realEstate, ...metricsData.activity];
  const find = (id: string) => all.find((m) => m.id === id)?.value ?? 0;

  return {
    generatedAt: new Date().toISOString(),
    metrics: [
      metric('totalCashBalance', 'Cash Position', find('totalCashBalance')),
      metric('bankBalance', 'Bank Balances', find('bankBalance')),
      metric('accountsReceivable', 'Receivables', find('accountsReceivable')),
      metric('accountsPayable', 'Payables', find('accountsPayable')),
      metric('revenue', 'Monthly Collections', find('revenue')),
      metric('expenses', 'Monthly Payments', find('expenses')),
      metric('netIncome', 'Profit Snapshot', find('netIncome')),
    ],
  };
}

export async function getMobileFinanceSummary(
  client: pg.PoolClient,
  tenantId: string
): Promise<MobileDashboardResponse> {
  return getMobileDashboardSummary(client, tenantId);
}

export async function getMobileSalesSummary(
  client: pg.PoolClient,
  tenantId: string
): Promise<MobileDashboardResponse> {
  const { from, to } = monthRange();
  const collections = await getCollectionsAnalyticsJson(client, tenantId, { from, to });

  const kpis = collections.kpis ?? [];
  const find = (id: string) => kpis.find((k) => k.id === id)?.value ?? 0;

  const leadsR = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM installment_plans
     WHERE tenant_id = $1 AND deleted_at IS NULL AND created_at >= $2::date`,
    [tenantId, from]
  );

  const bookingsR = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM project_agreements
     WHERE tenant_id = $1 AND deleted_at IS NULL AND status NOT IN ('Cancelled')
       AND created_at >= $2::date`,
    [tenantId, from]
  );

  return {
    generatedAt: new Date().toISOString(),
    metrics: [
      metric('leads', 'Leads', Number(leadsR.rows[0]?.count ?? 0), 'number'),
      metric('bookings', 'Bookings', Number(bookingsR.rows[0]?.count ?? 0), 'number'),
      metric('collectedInPeriod', 'Collections', find('collectedInPeriod')),
      metric('totalReceivable', 'Outstanding', find('totalReceivable')),
      metric('overdueAmount', 'Overdue', find('overdueAmount')),
      metric('collectionRate', 'Collection Rate', find('collectionRate'), 'percent'),
    ],
  };
}

export async function getMobileCrmSummary(
  client: pg.PoolClient,
  tenantId: string
): Promise<MobileDashboardResponse> {
  const { from } = monthRange();
  const [contactsR, leadsR, vendorsR, newLeadsR] = await Promise.all([
    client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM contacts
       WHERE tenant_id = $1 AND deleted_at IS NULL AND type = 'Customer'`,
      [tenantId]
    ),
    client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM installment_plans
       WHERE tenant_id = $1 AND deleted_at IS NULL
         AND status NOT IN ('Sale Recognized', 'Rejected')`,
      [tenantId]
    ),
    client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM vendors
       WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [tenantId]
    ),
    client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM installment_plans
       WHERE tenant_id = $1 AND deleted_at IS NULL AND created_at >= $2::date`,
      [tenantId, from]
    ),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    metrics: [
      metric('customers', 'Customers', Number(contactsR.rows[0]?.count ?? 0), 'number'),
      metric('leads', 'Active Leads', Number(leadsR.rows[0]?.count ?? 0), 'number'),
      metric('vendors', 'Vendors', Number(vendorsR.rows[0]?.count ?? 0), 'number'),
      metric('newLeads', 'New Leads (Month)', Number(newLeadsR.rows[0]?.count ?? 0), 'number'),
    ],
  };
}

export async function getMobileProjectSummary(
  client: pg.PoolClient,
  tenantId: string
): Promise<MobileDashboardResponse> {
  const [activeR, budgetR, billsR] = await Promise.all([
    client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM projects
       WHERE tenant_id = $1 AND deleted_at IS NULL AND status = 'Active'`,
      [tenantId]
    ),
    client.query<{ budget: string }>(
      `SELECT COALESCE(SUM(b.amount), 0)::text AS budget
       FROM budgets b
       WHERE b.tenant_id = $1 AND b.deleted_at IS NULL`,
      [tenantId]
    ),
    client.query<{ count: string; total: string }>(
      `SELECT COUNT(*)::text AS count, COALESCE(SUM(amount - paid_amount), 0)::text AS total
       FROM bills
       WHERE tenant_id = $1 AND deleted_at IS NULL AND status <> 'Paid'`,
      [tenantId]
    ),
  ]);

  const budget = Number(budgetR.rows[0]?.budget ?? 0);
  const pendingBillAmount = Number(billsR.rows[0]?.total ?? 0);
  const utilization = budget > 0 ? Math.min(100, (pendingBillAmount / budget) * 100) : 0;

  return {
    generatedAt: new Date().toISOString(),
    metrics: [
      metric('activeProjects', 'Active Projects', Number(activeR.rows[0]?.count ?? 0), 'number'),
      metric('budgetUtilization', 'Budget Utilization', utilization, 'percent'),
      metric('pendingBills', 'Pending Bills', Number(billsR.rows[0]?.count ?? 0), 'number'),
      metric('pendingBillAmount', 'Pending Bill Amount', Number(billsR.rows[0]?.total ?? 0)),
    ],
  };
}

export async function getMobileConstructionSummary(
  client: pg.PoolClient,
  tenantId: string
): Promise<MobileDashboardResponse> {
  const { from, to } = monthRange();
  const expense = await getExpenseAnalyticsJson(client, tenantId, { from, to });

  const kpis = expense.kpis ?? [];
  const find = (id: string) => kpis.find((k) => k.id === id)?.value ?? 0;

  return {
    generatedAt: new Date().toISOString(),
    metrics: [
      metric('totalExpenses', 'Site Expenses', find('totalExpenses')),
      metric('billsPaid', 'Vendor Payments', find('billsPaid')),
      metric('billsIssued', 'Material Cost', find('billsIssued')),
      metric('unpaidBills', 'Outstanding Bills', find('unpaidBills')),
    ],
  };
}

export async function getMobileRentalSummary(
  client: pg.PoolClient,
  tenantId: string
): Promise<MobileDashboardResponse> {
  const { from, to } = monthRange();
  const rental = await getRentalAnalyticsJson(client, tenantId, { from, to });

  const find = (id: string) => rental.kpis.find((k) => k.id === id)?.value ?? 0;

  return {
    generatedAt: new Date().toISOString(),
    metrics: [
      metric('occupancyRate', 'Occupancy Rate', find('occupancyRate'), 'percent'),
      metric('outstandingRent', 'Due Rentals', find('outstandingRent')),
      metric('expiringAgreements', 'Expiring Contracts', find('expiringAgreements'), 'number'),
      metric('monthlyRentalIncome', 'Collection Summary', find('monthlyRentalIncome')),
    ],
  };
}

export async function getMobileHrSummary(
  client: pg.PoolClient,
  tenantId: string
): Promise<MobileDashboardResponse> {
  const today = toDateOnlyString(new Date());
  const [employeesR, leaveR, payrollR] = await Promise.all([
    client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM payroll_employees
       WHERE tenant_id = $1 AND deleted_at IS NULL AND is_active = TRUE`,
      [tenantId]
    ),
    client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM payroll_leave_requests
       WHERE tenant_id = $1 AND deleted_at IS NULL AND status = 'pending'`,
      [tenantId]
    ).catch(() => ({ rows: [{ count: '0' }] })),
    client.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count FROM payroll_runs
       WHERE tenant_id = $1 AND deleted_at IS NULL
       GROUP BY status`,
      [tenantId]
    ).catch(() => ({ rows: [] as { status: string; count: string }[] })),
  ]);

  const draftPayroll = payrollR.rows.find((r) => r.status === 'DRAFT')?.count ?? '0';

  return {
    generatedAt: new Date().toISOString(),
    metrics: [
      metric('employees', 'Employees', Number(employeesR.rows[0]?.count ?? 0), 'number'),
      metric('attendanceToday', 'Attendance Today', 0, 'number'),
      metric('leaveRequests', 'Leave Requests', Number(leaveR.rows[0]?.count ?? 0), 'number'),
      metric('payrollDraft', 'Payroll Draft Runs', Number(draftPayroll), 'number'),
    ],
  };
}
