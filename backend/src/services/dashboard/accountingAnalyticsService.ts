import type pg from 'pg';
import { GLOBAL_SYSTEM_TENANT_ID } from '../../constants/globalSystemChart.js';
import { listAccounts } from '../accountsService.js';
import { getBalanceSheetReportJson } from '../balanceSheetReportService.js';
import {
  computeProfitLossFromPrepared,
  extractPlRevenueAndExpenses,
  getProfitLossReportJson,
  prepareProfitLossState,
  type ProfitLossReportJson,
} from '../profitLossReportService.js';
import { parseDateOnly, toDateOnlyString } from './dashboardMetricsHelpers.js';
import type {
  AccountingAnalyticsFilters,
  AccountingAnalyticsResponse,
  AccountingKpiValue,
} from './accountingAnalyticsTypes.js';

const EXCLUDED_PL_CATEGORY_NAMES = [
  'Owner Equity',
  'Owner Withdrawn',
  'Security Deposit',
  'Rental Income',
  'Security Deposit Refund',
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

async function excludedCategoryIds(client: pg.PoolClient, tenantId: string): Promise<string[]> {
  const r = await client.query<{ id: string }>(
    `SELECT id FROM categories
     WHERE (tenant_id = $1 OR tenant_id = $2) AND deleted_at IS NULL AND name = ANY($3::text[])`,
    [tenantId, GLOBAL_SYSTEM_TENANT_ID, EXCLUDED_PL_CATEGORY_NAMES]
  );
  return r.rows.map((row) => row.id);
}

function plExpenseTotal(pl: Pick<ProfitLossReportJson, 'total_revenue' | 'net_profit' | 'cost_of_sales' | 'operating_expenses' | 'finance_cost' | 'tax'>): number {
  return extractPlRevenueAndExpenses(pl).expenses;
}

export async function getAccountingAnalyticsJson(
  client: pg.PoolClient,
  tenantId: string,
  filters: AccountingAnalyticsFilters
): Promise<AccountingAnalyticsResponse> {
  const { from, to, projectId } = filters;
  const project = projectId ?? 'all';
  const year = parseDateOnly(to).getFullYear();
  const excludedIds = await excludedCategoryIds(client, tenantId);

  const [bs, pl, accounts] = await Promise.all([
    getBalanceSheetReportJson(client, tenantId, to, project),
    getProfitLossReportJson(client, tenantId, from, to, project),
    listAccounts(client, tenantId),
  ]);

  const income = Number(pl.total_revenue ?? 0);
  const expenses = plExpenseTotal(pl);
  const netProfit = Number(pl.net_profit ?? 0);

  const kpis: AccountingKpiValue[] = [
    { id: 'assets', label: 'Total Assets', value: Number(bs.totals?.assets ?? 0), format: 'currency' },
    { id: 'liabilities', label: 'Total Liabilities', value: Number(bs.totals?.liabilities ?? 0), format: 'currency' },
    { id: 'equity', label: 'Total Equity', value: Number(bs.totals?.equity ?? 0), format: 'currency' },
    { id: 'income', label: 'Income (period)', value: income, format: 'currency' },
    { id: 'expenses', label: 'Expenses (period)', value: expenses, format: 'currency' },
    { id: 'netProfit', label: 'Net Profit (period)', value: netProfit, format: 'currency' },
  ];

  const prepared = await prepareProfitLossState(client, tenantId, `${year}-12-31`);
  const incomeVsExpenseTrend = await Promise.all(
    monthRangeForYear(year).map(async (m) => {
      const monthPl = await computeProfitLossFromPrepared(prepared, m.from, m.to, project);
      const { revenue, expenses } = extractPlRevenueAndExpenses(monthPl);
      return {
        month: m.key,
        label: m.label,
        income: revenue,
        expenses,
      };
    })
  );

  const cashPosition = accounts
    .filter((a) => !a.deleted_at && String(a.type).toLowerCase() === 'bank')
    .map((a) => ({ id: a.id, name: a.name, balance: Number(a.balance) }))
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
    .slice(0, 12);

  const expenseParams: unknown[] = [tenantId, from, to];
  const expenseClauses = [
    't.tenant_id = $1',
    't.deleted_at IS NULL',
    't.type = \'Expense\'',
    't.date >= $2::date',
    't.date <= $3::date',
    't.category_id IS NOT NULL',
  ];
  if (excludedIds.length) {
    expenseParams.push(excludedIds);
    expenseClauses.push(`t.category_id <> ALL($${expenseParams.length}::text[])`);
  }
  if (projectId) {
    expenseParams.push(projectId);
    expenseClauses.push(`t.project_id = $${expenseParams.length}`);
  }
  const catR = await client.query<{ name: string; total: string }>(
    `SELECT COALESCE(c.name, 'Uncategorized') AS name, SUM(t.amount)::text AS total
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE ${expenseClauses.join(' AND ')}
     GROUP BY c.name
     ORDER BY SUM(t.amount) DESC
     LIMIT 12`,
    expenseParams
  );

  return {
    filters,
    generatedAt: new Date().toISOString(),
    kpis,
    incomeVsExpenseTrend,
    balanceSheetSnapshot: {
      assets: Number(bs.totals?.assets ?? 0),
      liabilities: Number(bs.totals?.liabilities ?? 0),
      equity: Number(bs.totals?.equity ?? 0),
    },
    cashPosition,
    categoryBreakdown: catR.rows.map((row) => ({ name: row.name, value: Number(row.total) })),
  };
}
