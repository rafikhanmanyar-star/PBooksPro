import type pg from 'pg';
import { listAccounts } from '../accountsService.js';
import { parseDateOnly, toDateOnlyString } from './dashboardMetricsHelpers.js';
import type {
  BankingAnalyticsFilters,
  BankingAnalyticsResponse,
  BankingKpiValue,
} from './bankingAnalyticsTypes.js';

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

function isCashAccount(type: string): boolean {
  const t = type.toLowerCase();
  return t === 'bank' || t === 'cash';
}

function accountFilterSql(accountId: string | undefined, baseParamCount: number, column: string): { sql: string; params: unknown[] } {
  if (!accountId) return { sql: '', params: [] };
  return { sql: ` AND ${column} = $${baseParamCount + 1}`, params: [accountId] };
}

async function cashAccountIds(client: pg.PoolClient, tenantId: string): Promise<string[]> {
  const accounts = await listAccounts(client, tenantId);
  return accounts.filter((a) => !a.deleted_at && isCashAccount(String(a.type))).map((a) => a.id);
}

export async function getBankingAnalyticsJson(
  client: pg.PoolClient,
  tenantId: string,
  filters: BankingAnalyticsFilters
): Promise<BankingAnalyticsResponse> {
  const { from, to, accountId } = filters;
  const year = parseDateOnly(to).getFullYear();
  const cashIds = await cashAccountIds(client, tenantId);

  const accounts = await listAccounts(client, tenantId);
  const cashAccounts = accounts.filter((a) => !a.deleted_at && isCashAccount(String(a.type)));
  const totalBalance = cashAccounts.reduce((s, a) => s + Number(a.balance), 0);

  const acctFilterIncome = accountFilterSql(accountId, 3, 't.account_id');
  const acctFilterExpense = accountFilterSql(accountId, 3, 't.account_id');
  const periodIncomeParams = [tenantId, from, to, ...acctFilterIncome.params];
  const periodExpenseParams = [tenantId, from, to, ...acctFilterExpense.params];

  const cashIdClause = cashIds.length
    ? ` AND t.account_id = ANY($${periodIncomeParams.length + 1}::text[])`
    : ' AND FALSE';
  const cashIdClauseExpense = cashIds.length
    ? ` AND t.account_id = ANY($${periodExpenseParams.length + 1}::text[])`
    : ' AND FALSE';

  const [inflows, outflows, transferStats] = await Promise.all([
    client.query<{ total: string }>(
      `SELECT COALESCE(SUM(t.amount), 0)::text AS total FROM transactions t
       WHERE t.tenant_id = $1 AND t.deleted_at IS NULL AND t.type = 'Income'
         AND t.date >= $2::date AND t.date <= $3::date
         ${acctFilterIncome.sql}${accountId ? '' : cashIdClause}`,
      accountId ? periodIncomeParams : [...periodIncomeParams, cashIds]
    ),
    client.query<{ total: string }>(
      `SELECT COALESCE(SUM(t.amount), 0)::text AS total FROM transactions t
       WHERE t.tenant_id = $1 AND t.deleted_at IS NULL AND t.type = 'Expense'
         AND t.date >= $2::date AND t.date <= $3::date
         ${acctFilterExpense.sql}${accountId ? '' : cashIdClauseExpense}`,
      accountId ? periodExpenseParams : [...periodExpenseParams, cashIds]
    ),
    client.query<{ count: string; volume: string }>(
      `SELECT COUNT(*)::text AS count, COALESCE(SUM(t.amount), 0)::text AS volume
       FROM transactions t
       WHERE t.tenant_id = $1 AND t.deleted_at IS NULL AND t.type = 'Transfer'
         AND t.date >= $2::date AND t.date <= $3::date`,
      [tenantId, from, to]
    ),
  ]);

  const inflow = Number(inflows.rows[0]?.total ?? 0);
  const outflow = Number(outflows.rows[0]?.total ?? 0);

  const kpis: BankingKpiValue[] = [
    { id: 'totalBalance', label: 'Total Cash Balance', value: totalBalance, format: 'currency' },
    { id: 'accountCount', label: 'Bank/Cash Accounts', value: cashAccounts.length, format: 'count' },
    { id: 'inflows', label: 'Inflows (period)', value: inflow, format: 'currency' },
    { id: 'outflows', label: 'Outflows (period)', value: outflow, format: 'currency' },
    { id: 'netCashFlow', label: 'Net Cash Flow', value: inflow - outflow, format: 'currency' },
    { id: 'transferCount', label: 'Transfers', value: Number(transferStats.rows[0]?.count ?? 0), format: 'count' },
  ];

  const cashFlowTrend = await Promise.all(
    monthRangeForYear(year).map(async (m) => {
      const incomeParams = [tenantId, m.from, m.to, ...(accountId ? [accountId] : cashIds.length ? [cashIds] : [])];
      const incomeFilter = accountId
        ? ` AND t.account_id = $4`
        : cashIds.length
          ? ` AND t.account_id = ANY($4::text[])`
          : ' AND FALSE';
      const [incR, expR] = await Promise.all([
        client.query<{ total: string }>(
          `SELECT COALESCE(SUM(t.amount), 0)::text AS total FROM transactions t
           WHERE t.tenant_id = $1 AND t.deleted_at IS NULL AND t.type = 'Income'
             AND t.date >= $2::date AND t.date <= $3::date${incomeFilter}`,
          incomeParams
        ),
        client.query<{ total: string }>(
          `SELECT COALESCE(SUM(t.amount), 0)::text AS total FROM transactions t
           WHERE t.tenant_id = $1 AND t.deleted_at IS NULL AND t.type = 'Expense'
             AND t.date >= $2::date AND t.date <= $3::date${incomeFilter}`,
          incomeParams
        ),
      ]);
      const mIn = Number(incR.rows[0]?.total ?? 0);
      const mOut = Number(expR.rows[0]?.total ?? 0);
      return { month: m.key, label: m.label, inflow: mIn, outflow: mOut, net: mIn - mOut };
    })
  );

  const accountBalances = cashAccounts
    .filter((a) => !accountId || a.id === accountId)
    .map((a) => ({
      accountId: a.id,
      accountName: a.name,
      balance: Number(a.balance),
      type: String(a.type),
    }))
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

  const transferVolume = Number(transferStats.rows[0]?.volume ?? 0);
  const movementBreakdown = [
    { name: 'Income', value: inflow },
    { name: 'Expense', value: outflow },
    { name: 'Transfers', value: transferVolume },
  ].filter((s) => s.value > 0);

  return {
    filters,
    generatedAt: new Date().toISOString(),
    kpis,
    cashFlowTrend,
    accountBalances,
    movementBreakdown,
  };
}
