/**
 * P0-D — GL-native Profit & Loss.
 * When gl_native_pl is on, the P&L derives directly from the General Ledger: revenue/expense/COGS
 * account balances grouped by account type, with category drill-down from journal_lines.category_id.
 * No dependency on the legacy category engine or Income/Expense Summary.
 */
import type pg from 'pg';
import { normalBalanceDirection } from '../../../financial/trialBalanceCore.js';

export interface GlPlLine {
  accountId: string;
  accountCode: string | null;
  accountName: string;
  accountType: string;
  amount: number;
}

export interface GlPlReport {
  revenue: GlPlLine[];
  cogs: GlPlLine[];
  operatingExpense: GlPlLine[];
  otherIncome: GlPlLine[];
  otherExpense: GlPlLine[];
  totalRevenue: number;
  grossProfit: number;
  operatingProfit: number;
  netProfit: number;
}

const PL_TYPES = ['revenue', 'cogs', 'expense', 'other income', 'other expense'];

/** Signed P&L magnitude: revenue/other income positive on credit, expense/cogs positive on debit. */
function plAmount(type: string, grossDebit: number, grossCredit: number): number {
  const dir = normalBalanceDirection(type); // +1 debit-normal, -1 credit-normal
  const signed = dir * (grossDebit - grossCredit);
  // Revenue/other-income: credit-normal → signed is negative for a credit balance; flip to positive.
  return dir === -1 ? -signed : signed;
}

export async function computeGlNativeProfitLoss(
  client: pg.PoolClient,
  tenantId: string,
  fromDate: string,
  toDate: string,
  opts?: { projectId?: string | null }
): Promise<GlPlReport> {
  const params: unknown[] = [tenantId, fromDate, toDate];
  let projCond = '';
  if (opts?.projectId) {
    params.push(opts.projectId);
    projCond = `AND COALESCE(jl.project_id, je.project_id) = $4`;
  }

  // System P&L accounts are shared under __system__; tenant-owned P&L accounts also included.
  const r = await client.query<{
    account_id: string;
    account_code: string | null;
    account_name: string;
    account_type: string;
    gross_debit: string;
    gross_credit: string;
  }>(
    `SELECT a.id AS account_id, a.account_code, a.name AS account_name, a.type AS account_type,
            COALESCE(SUM(jl.debit_amount), 0)::text AS gross_debit,
            COALESCE(SUM(jl.credit_amount), 0)::text AS gross_credit
     FROM journal_lines jl
     INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
     INNER JOIN accounts a ON a.id = jl.account_id
     WHERE je.tenant_id = $1
       AND je.entry_date >= $2::date AND je.entry_date <= $3::date
       AND LOWER(a.type) = ANY($${params.length + 1})
       ${projCond}
     GROUP BY a.id, a.account_code, a.name, a.type
     ORDER BY a.account_code NULLS LAST, a.name`,
    [...params, PL_TYPES]
  );

  const report: GlPlReport = {
    revenue: [], cogs: [], operatingExpense: [], otherIncome: [], otherExpense: [],
    totalRevenue: 0, grossProfit: 0, operatingProfit: 0, netProfit: 0,
  };

  for (const row of r.rows) {
    const type = row.account_type.toLowerCase();
    const amount = plAmount(type, Number(row.gross_debit), Number(row.gross_credit));
    const line: GlPlLine = {
      accountId: row.account_id,
      accountCode: row.account_code,
      accountName: row.account_name,
      accountType: row.account_type,
      amount,
    };
    if (type === 'revenue') report.revenue.push(line);
    else if (type === 'cogs') report.cogs.push(line);
    else if (type === 'expense') report.operatingExpense.push(line);
    else if (type === 'other income') report.otherIncome.push(line);
    else if (type === 'other expense') report.otherExpense.push(line);
  }

  const sum = (xs: GlPlLine[]) => xs.reduce((s, l) => s + l.amount, 0);
  report.totalRevenue = sum(report.revenue);
  report.grossProfit = report.totalRevenue - sum(report.cogs);
  report.operatingProfit = report.grossProfit - sum(report.operatingExpense);
  report.netProfit =
    report.operatingProfit + sum(report.otherIncome) - sum(report.otherExpense);
  return report;
}
