import type pg from 'pg';
import {
  MONEY_EPSILON,
  roundMoney,
  type JournalLineInput,
  validateBalanced,
} from '../../../financial/validation.js';
import {
  SYS_CLEARING,
  SYS_CURRENT_YEAR_EARNINGS,
  SYS_EXPENSE_SUMMARY,
  SYS_INCOME_SUMMARY,
  SYS_RETAINED_EARNINGS,
} from '../../../constants/fiscalAccounts.js';
import { createFinancialPostingService } from './FinancialPostingService.js';
import { getProfitLossReportJson } from './profitLossReportService.js';
import {
  getAccountingPeriodById,
  markAccountingPeriodClosed,
  rowToAccountingPeriodApi,
  type AccountingPeriodRow,
} from './accountingPeriodService.js';
import { recordDomainMutation } from '../../../core/recordDomainMutation.js';

export const FISCAL_CLOSE_SOURCE_MODULE = 'fiscal_close';
export const FISCAL_YEAR_END_SOURCE_MODULE = 'fiscal_year_end';

export type PeriodCloseTotals = {
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
};

/** Derive income/expense totals from P&L report payload. */
export function totalsFromProfitLossReport(pl: {
  total_revenue?: number;
  totalRevenue?: number;
  net_profit: number;
  gross_profit?: number;
  operating_profit?: number;
  profit_before_tax?: number;
}): PeriodCloseTotals {
  const totalRevenue = roundMoney(Number(pl.total_revenue ?? pl.totalRevenue ?? 0));
  const netIncome = roundMoney(Number(pl.net_profit ?? 0));
  const profitBeforeTax = pl.profit_before_tax != null ? roundMoney(Number(pl.profit_before_tax)) : null;
  const totalIncome =
    profitBeforeTax != null && profitBeforeTax > totalRevenue
      ? profitBeforeTax
      : totalRevenue;
  const totalExpenses = roundMoney(Math.max(0, totalIncome - netIncome));
  return { totalIncome, totalExpenses, netIncome };
}

/** Consolidate lines by account (debits minus credits per account). */
export function consolidateJournalLines(lines: JournalLineInput[]): JournalLineInput[] {
  const netByAccount = new Map<string, number>();
  for (const l of lines) {
    const d = roundMoney(l.debitAmount);
    const c = roundMoney(l.creditAmount);
    const prev = netByAccount.get(l.accountId) ?? 0;
    netByAccount.set(l.accountId, roundMoney(prev + d - c));
  }
  const out: JournalLineInput[] = [];
  for (const [accountId, netDebit] of netByAccount) {
    if (Math.abs(netDebit) < MONEY_EPSILON) continue;
    if (netDebit > 0) {
      out.push({ accountId, debitAmount: netDebit, creditAmount: 0 });
    } else {
      out.push({ accountId, debitAmount: 0, creditAmount: -netDebit });
    }
  }
  return out;
}

/**
 * Build period-end closing entry: close income/expense activity through summary accounts to CYE.
 * Uses clearing as the P&L counterparty (matches transaction journal mirrors).
 */
export function buildPeriodClosingLines(totals: PeriodCloseTotals): JournalLineInput[] {
  const I = roundMoney(totals.totalIncome);
  const E = roundMoney(totals.totalExpenses);
  const net = roundMoney(totals.netIncome);

  if (I < MONEY_EPSILON && E < MONEY_EPSILON && Math.abs(net) < MONEY_EPSILON) {
    return [];
  }

  const raw: JournalLineInput[] = [];

  if (I >= MONEY_EPSILON) {
    raw.push({ accountId: SYS_CLEARING, debitAmount: I, creditAmount: 0 });
    raw.push({ accountId: SYS_INCOME_SUMMARY, debitAmount: 0, creditAmount: I });
  }
  if (E >= MONEY_EPSILON) {
    raw.push({ accountId: SYS_EXPENSE_SUMMARY, debitAmount: E, creditAmount: 0 });
    raw.push({ accountId: SYS_CLEARING, debitAmount: 0, creditAmount: E });
  }
  if (I >= MONEY_EPSILON) {
    raw.push({ accountId: SYS_INCOME_SUMMARY, debitAmount: I, creditAmount: 0 });
  }
  if (E >= MONEY_EPSILON) {
    raw.push({ accountId: SYS_EXPENSE_SUMMARY, debitAmount: 0, creditAmount: E });
  }
  if (net >= MONEY_EPSILON) {
    raw.push({ accountId: SYS_CURRENT_YEAR_EARNINGS, debitAmount: 0, creditAmount: net });
  } else if (net <= -MONEY_EPSILON) {
    raw.push({ accountId: SYS_CURRENT_YEAR_EARNINGS, debitAmount: -net, creditAmount: 0 });
  }

  const lines = consolidateJournalLines(raw);
  const err = validateBalanced(lines);
  if (err && lines.length > 0) {
    throw new Error(`Closing entry is unbalanced: ${err}`);
  }
  return lines;
}

/** Transfer Current Year Earnings balance to Retained Earnings (year-end). */
export function buildYearEndTransferLines(cyeCreditBalance: number): JournalLineInput[] {
  const bal = roundMoney(cyeCreditBalance);
  if (Math.abs(bal) < MONEY_EPSILON) return [];
  if (bal > 0) {
    return [
      { accountId: SYS_CURRENT_YEAR_EARNINGS, debitAmount: bal, creditAmount: 0 },
      { accountId: SYS_RETAINED_EARNINGS, debitAmount: 0, creditAmount: bal },
    ];
  }
  const abs = -bal;
  return [
    { accountId: SYS_RETAINED_EARNINGS, debitAmount: abs, creditAmount: 0 },
    { accountId: SYS_CURRENT_YEAR_EARNINGS, debitAmount: 0, creditAmount: abs },
  ];
}

async function signedEquityBalanceThroughDate(
  client: pg.PoolClient,
  tenantId: string,
  accountId: string,
  throughDate: string
): Promise<number> {
  const r = await client.query<{ bal: string }>(
    `SELECT COALESCE(SUM(jl.credit_amount - jl.debit_amount), 0)::text AS bal
     FROM journal_lines jl
     INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
     WHERE je.tenant_id = $1 AND jl.account_id = $2 AND je.entry_date <= $3::date`,
    [tenantId, accountId, throughDate.slice(0, 10)]
  );
  return roundMoney(Number(r.rows[0]?.bal ?? 0));
}

export type CloseAccountingPeriodOptions = {
  actorUserId: string | null;
  selectedProjectId?: string;
  performYearEndTransfer?: boolean;
};

export type CloseAccountingPeriodResult = {
  period: AccountingPeriodRow;
  closingJournalEntryId: string | null;
  yearEndTransferJournalEntryId: string | null;
  totals: PeriodCloseTotals;
};

export async function closeAccountingPeriod(
  client: pg.PoolClient,
  tenantId: string,
  periodId: string,
  options: CloseAccountingPeriodOptions
): Promise<CloseAccountingPeriodResult> {
  const period = await getAccountingPeriodById(client, tenantId, periodId);
  if (!period) throw new Error('Accounting period not found.');
  if (period.status === 'closed') throw new Error('Accounting period is already closed.');

  const startDate = String(period.start_date).slice(0, 10);
  const endDate = String(period.end_date).slice(0, 10);
  const projectId = options.selectedProjectId ?? 'all';

  const pl = await getProfitLossReportJson(client, tenantId, startDate, endDate, projectId);
  const totals = totalsFromProfitLossReport(pl);
  const closingLines = buildPeriodClosingLines(totals);

  let closingJournalEntryId: string | null = null;
  if (closingLines.length >= 2) {
    const ref = `PERIOD-CLOSE-${startDate}-${endDate}`;
    const { journalEntryId } = await createFinancialPostingService(tenantId).postJournal(client, {
      entryDate: endDate,
      reference: ref,
      description: `Fiscal period close ${startDate} to ${endDate}`,
      sourceModule: FISCAL_CLOSE_SOURCE_MODULE,
      sourceId: periodId,
      createdBy: options.actorUserId,
      lines: closingLines,
    }, { actorUserId: options.actorUserId });
    closingJournalEntryId = journalEntryId;
  }

  let yearEndTransferJournalEntryId: string | null = null;
  const yearEnd =
    options.performYearEndTransfer ??
    endDate.endsWith('-12-31');

  if (yearEnd) {
    const cyeBal = await signedEquityBalanceThroughDate(
      client,
      tenantId,
      SYS_CURRENT_YEAR_EARNINGS,
      endDate
    );
    const transferLines = buildYearEndTransferLines(cyeBal);
    if (transferLines.length >= 2) {
      const ref = `YEAR-END-${endDate.slice(0, 4)}`;
      const { journalEntryId } = await createFinancialPostingService(tenantId).postJournal(client, {
        entryDate: endDate,
        reference: ref,
        description: `Transfer current year earnings to retained earnings (${endDate.slice(0, 4)})`,
        sourceModule: FISCAL_YEAR_END_SOURCE_MODULE,
        sourceId: periodId,
        createdBy: options.actorUserId,
        lines: transferLines,
      }, { actorUserId: options.actorUserId });
      yearEndTransferJournalEntryId = journalEntryId;
    }
  }

  const updated = await markAccountingPeriodClosed(
    client,
    tenantId,
    periodId,
    options.actorUserId,
    closingJournalEntryId,
    yearEndTransferJournalEntryId
  );

  const oldApi = rowToAccountingPeriodApi(period);
  const newApi = rowToAccountingPeriodApi(updated);
  await recordDomainMutation(client, {
    tenantId,
    userId: options.actorUserId,
    module: 'accounting_periods',
    entityType: 'accounting_period',
    entityId: periodId,
    action: 'update',
    auditAction: 'close',
    summary: `Accounting period closed ${startDate} – ${endDate}`,
    oldValue: oldApi,
    newValue: {
      ...newApi,
      totals,
      closingJournalEntryId,
      yearEndTransferJournalEntryId,
      performYearEndTransfer: yearEnd,
    },
  });

  return {
    period: updated,
    closingJournalEntryId: closingLines.length >= 2 ? closingJournalEntryId : null,
    yearEndTransferJournalEntryId,
    totals,
  };
}
