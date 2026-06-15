/**
 * Financial reconciliation certification API — loads tenant GL data and runs certification.
 */

import type pg from 'pg';
import { getProfitLossReportJson } from './profitLossReportService.js';
import { getBalanceSheetReportJson } from './balanceSheetReportService.js';
import { loadJournalLedgerInput } from './journalLedgerLoadService.js';
import { listAccounts, rowToAccountApi } from './accountsService.js';
import { listTransactions, rowToTransactionApi } from './transactionsService.js';
import {
  runFinancialReconciliationCertification,
  type FinancialReconciliationCertification,
} from '../../../financial/financialReconciliationEngine.js';
import type { JournalLedgerInput, LedgerAccount, LedgerTransaction } from '../../../financial/journalLedgerCore.js';

export type { FinancialReconciliationCertification };

/** Matches balanceSheetEngine BS_PL_CUMULATIVE_START for retained-earnings alignment. */
const BS_PL_CUMULATIVE_START = '2000-01-01';

function priorDay(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function mapAccount(row: Record<string, unknown>): LedgerAccount {
  const a = rowToAccountApi(row as never);
  return {
    id: String(a.id),
    name: String(a.name),
    type: String(a.type),
    openingBalance: Number(a.openingBalance ?? 0),
    parentAccountId: strOrNull(a.parentAccountId),
    accountCode: strOrNull(a.accountCode),
    subType: strOrNull(a.accountSubType ?? a.subType),
    isActive: a.isActive !== false,
  };
}

export async function getFinancialReconciliationCertification(
  client: pg.PoolClient,
  tenantId: string,
  options: { from: string; to: string; projectId?: string }
): Promise<FinancialReconciliationCertification> {
  const projectId = options.projectId ?? 'all';

  const [accountRows, txRows, journalData] = await Promise.all([
    listAccounts(client, tenantId),
    listTransactions(client, tenantId, {
      startDate: options.from,
      endDate: options.to,
      limit: 500_000,
      offset: 0,
    }),
    loadJournalLedgerInput(client, tenantId, { asOfDate: options.to }),
  ]);

  const accounts = accountRows.map((r) => mapAccount(r as Record<string, unknown>));
  const transactions: LedgerTransaction[] = txRows.map((r) => {
    const t = rowToTransactionApi(r);
    return {
      id: String(t.id),
      type: String(t.type),
      amount: Number(t.amount),
      date: String(t.date).slice(0, 10),
      categoryId: typeof t.categoryId === 'string' ? t.categoryId : undefined,
      accountId: typeof t.accountId === 'string' ? t.accountId : undefined,
      projectId: typeof t.projectId === 'string' ? t.projectId : undefined,
      billId: typeof t.billId === 'string' ? t.billId : undefined,
      invoiceId: typeof t.invoiceId === 'string' ? t.invoiceId : undefined,
      deletedAt: typeof t.deletedAt === 'string' ? t.deletedAt : undefined,
    };
  });

  const journalLedger: JournalLedgerInput = {
    ...journalData,
    accounts,
    transactions,
  };

  const priorDate = priorDay(options.from);

  const [plReport, plCumulative, plCumulativePrior, bsReport, bsPrior] = await Promise.all([
    getProfitLossReportJson(client, tenantId, options.from, options.to, projectId),
    getProfitLossReportJson(client, tenantId, BS_PL_CUMULATIVE_START, options.to, projectId),
    getProfitLossReportJson(client, tenantId, BS_PL_CUMULATIVE_START, priorDate, projectId),
    getBalanceSheetReportJson(client, tenantId, options.to, projectId),
    getBalanceSheetReportJson(client, tenantId, priorDate, projectId),
  ]);

  const netProfit = Number(plReport.net_profit ?? 0);

  return runFinancialReconciliationCertification({
    journalLedger,
    period: { from: options.from, to: options.to },
    netProfit,
    cumulativeNetProfit: Number(plCumulative.net_profit ?? 0),
    cumulativeNetProfitPrior: Number(plCumulativePrior.net_profit ?? 0),
    priorBalanceSheetEquity: bsPrior.totals.equity,
    balanceSheetTotals: {
      assets: bsReport.totals.assets,
      liabilities: bsReport.totals.liabilities,
      equity: bsReport.totals.equity,
      isBalanced: bsReport.isBalanced,
    },
  });
}
