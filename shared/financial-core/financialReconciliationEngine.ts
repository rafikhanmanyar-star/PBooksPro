/**
 * Financial reconciliation certification — prove TB, GL, P&L, and BS agree on journal-backed data.
 */

import { roundMoney, MONEY_EPSILON } from './validation';
import {
  buildTrialBalanceFromJournal,
  computeAccountBalancesFromJournal,
  mirroredTransactionIds,
  reconcileFinancialStatements,
  sumBalanceSheetSectionsForJournalCertification,
  type FinancialReconciliationResult,
  type JournalEntryRow,
  type JournalLedgerInput,
  type LedgerAccount,
  type LedgerTransaction,
} from './journalLedgerCore';

export type ReportSourceKind = 'journal' | 'transactions' | 'subledger' | 'hybrid';

export type ReportUnificationStatus = 'unified' | 'partial' | 'legacy';

export interface FinancialReportSourceAudit {
  reportId: string;
  reportName: string;
  primarySource: ReportSourceKind;
  status: ReportUnificationStatus;
  notes: string;
}

export interface MissingJournalMirror {
  transactionId: string;
  date: string;
  type: string;
  amount: number;
  description?: string;
  accountId?: string;
}

export interface ReconciliationCheck {
  id: string;
  label: string;
  passed: boolean;
  expected?: string;
  actual?: string;
  difference?: number;
  severity: 'info' | 'warning' | 'error';
}

export interface ReconciliationDifference {
  code: string;
  message: string;
  severity: 'warning' | 'error';
  amount?: number;
}

export type CertificationStatus = 'reconciled' | 'differences' | 'critical';

export interface FinancialReconciliationCertification {
  certifiedAt: string;
  period: { from: string; to: string; asOfDate: string };
  overallStatus: CertificationStatus;
  score: number;
  checks: ReconciliationCheck[];
  reportSources: FinancialReportSourceAudit[];
  missingJournals: MissingJournalMirror[];
  missingJournalCount: number;
  missingJournalTotalAmount: number;
  transactionCount: number;
  journalEntryCount: number;
  reconciliation: FinancialReconciliationResult;
  differences: ReconciliationDifference[];
  summary: string;
}

/** Registry of core financial reports and their data sources (audit reference). */
export function getFinancialReportSourceRegistry(): FinancialReportSourceAudit[] {
  return [
    {
      reportId: 'trial_balance',
      reportName: 'Trial Balance',
      primarySource: 'journal',
      status: 'unified',
      notes: 'journal_lines + journal_entries + opening balances',
    },
    {
      reportId: 'general_ledger',
      reportName: 'General Ledger',
      primarySource: 'journal',
      status: 'unified',
      notes: 'Per-account journal lines with running balance',
    },
    {
      reportId: 'profit_loss',
      reportName: 'Profit & Loss',
      primarySource: 'hybrid',
      status: 'partial',
      notes: 'Journal-mirrored transactions only; category plSubType aggregation',
    },
    {
      reportId: 'balance_sheet',
      reportName: 'Balance Sheet',
      primarySource: 'hybrid',
      status: 'partial',
      notes: 'Journal account balances; AR/AP from sys-acc-ar/ap; retained earnings from P&L; received assets subledger',
    },
    {
      reportId: 'fiscal_close',
      reportName: 'Fiscal Period Close',
      primarySource: 'hybrid',
      status: 'partial',
      notes: 'Closing entries from P&L engine totals; period lock on journal + transactions',
    },
    {
      reportId: 'cash_flow',
      reportName: 'Cash Flow',
      primarySource: 'journal',
      status: 'unified',
      notes: 'journal_lines on Bank/Cash accounts; dimension scope from GL project_id/building_id/cost_center_id',
    },
    {
      reportId: 'tenant_ledger',
      reportName: 'Tenant Ledger',
      primarySource: 'subledger',
      status: 'legacy',
      notes: 'Invoice + transaction subledger — not GL-certified',
    },
    {
      reportId: 'client_ledger',
      reportName: 'Client / Owner Ledger',
      primarySource: 'subledger',
      status: 'legacy',
      notes: 'Invoice + payment subledger',
    },
    {
      reportId: 'vendor_ledger',
      reportName: 'Vendor Ledger',
      primarySource: 'subledger',
      status: 'legacy',
      notes: 'Bill + payment subledger',
    },
  ];
}

const MIRRORABLE_TYPES = new Set(['Income', 'Expense', 'Transfer', 'Loan', 'INCOME', 'EXPENSE', 'TRANSFER', 'LOAN']);

function isDeleted(tx: LedgerTransaction): boolean {
  return Boolean((tx as { deletedAt?: string }).deletedAt);
}

/** Transactions that should have a journal mirror but do not. */
export function findMissingJournalMirrors(
  transactions: LedgerTransaction[],
  journalEntries: JournalEntryRow[],
  options?: { from?: string; to?: string; limit?: number }
): MissingJournalMirror[] {
  const mirrored = mirroredTransactionIds({ journalLines: [], journalEntries, accounts: [] });
  const from = options?.from;
  const to = options?.to;
  const limit = options?.limit ?? 500;

  const missing: MissingJournalMirror[] = [];

  for (const tx of transactions) {
    if (isDeleted(tx)) continue;
    if (!MIRRORABLE_TYPES.has(tx.type)) continue;
    if (mirrored.has(tx.id)) continue;

    const d = tx.date.slice(0, 10);
    if (from && d < from) continue;
    if (to && d > to) continue;

    missing.push({
      transactionId: tx.id,
      date: d,
      type: tx.type,
      amount: roundMoney(Number(tx.amount)),
      description: (tx as { description?: string }).description,
      accountId: tx.accountId,
    });

    if (missing.length >= limit) break;
  }

  return missing;
}

function priorDay(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function computeCertificationScore(input: {
  tbBalanced: boolean;
  assetsEqual: boolean;
  netProfitMatch: boolean;
  missingRatio: number;
  bsBalanced?: boolean;
}): number {
  let score = 100;
  if (!input.tbBalanced) score -= 35;
  if (!input.assetsEqual) score -= 25;
  if (!input.netProfitMatch) score -= 15;
  if (input.missingRatio > 0.1) score -= 20;
  else if (input.missingRatio > 0) score -= Math.min(15, Math.round(input.missingRatio * 100));
  if (input.bsBalanced === false) score -= 10;
  return Math.max(0, Math.min(100, score));
}

function deriveOverallStatus(
  checks: ReconciliationCheck[],
  missingCount: number,
  transactionCount: number
): CertificationStatus {
  const critical = checks.some((c) => !c.passed && c.severity === 'error');
  if (critical) return 'critical';

  const missingRatio = transactionCount > 0 ? missingCount / transactionCount : 0;
  if (missingRatio > 0.05) return 'differences';

  const anyFailed = checks.some((c) => !c.passed);
  if (anyFailed || missingCount > 0) return 'differences';

  return 'reconciled';
}

export interface RunCertificationInput {
  journalLedger: JournalLedgerInput;
  period: { from: string; to: string };
  /** Period net profit from journal-backed P&L */
  netProfit: number;
  /** Cumulative P&L net through period end (matches BS engine retainedEarningsFromPL). */
  cumulativeNetProfit?: number;
  /** Cumulative P&L net through day before period start (for prior equity rollup). */
  cumulativeNetProfitPrior?: number;
  /** Equity from BS engine at day before period start. */
  priorBalanceSheetEquity?: number;
  /** BS engine totals at period end — authoritative for A=L+E when provided. */
  balanceSheetTotals?: { assets: number; liabilities: number; equity: number; isBalanced: boolean };
  missingJournalLimit?: number;
}

/**
 * Run full financial reconciliation certification for a period.
 */
export function runFinancialReconciliationCertification(
  input: RunCertificationInput
): FinancialReconciliationCertification {
  const { journalLedger, period, netProfit } = input;
  const asOfDate = period.to;
  const transactions = journalLedger.transactions ?? [];

  const tb = buildTrialBalanceFromJournal(journalLedger, {
    from: period.from,
    to: period.to,
    basis: 'period',
  });

  const balancesAtEnd = computeAccountBalancesFromJournal(journalLedger, asOfDate);
  const priorEquityDate = priorDay(period.from);
  const balancesPrior = computeAccountBalancesFromJournal(journalLedger, priorEquityDate);
  const priorEquity =
    input.priorBalanceSheetEquity ??
    sumBalanceSheetSectionsForJournalCertification(balancesPrior, journalLedger.accounts, {
      cumulativeNetProfit: input.cumulativeNetProfitPrior,
    }).equity;

  const reconciliation = reconcileFinancialStatements(
    tb,
    balancesAtEnd,
    journalLedger.accounts,
    netProfit,
    priorEquity,
    {
      balanceSheetSections: input.balanceSheetTotals
        ? {
            assets: input.balanceSheetTotals.assets,
            liabilities: input.balanceSheetTotals.liabilities,
            equity: input.balanceSheetTotals.equity,
          }
        : undefined,
      cumulativeNetProfit: input.cumulativeNetProfit,
    }
  );

  const missingJournals = findMissingJournalMirrors(transactions, journalLedger.journalEntries, {
    from: period.from,
    to: period.to,
    limit: input.missingJournalLimit ?? 200,
  });

  const missingJournalTotalAmount = roundMoney(
    missingJournals.reduce((s, m) => s + Math.abs(m.amount), 0)
  );

  const mirrorableCount = transactions.filter(
    (t) => !isDeleted(t) && MIRRORABLE_TYPES.has(t.type)
  ).length;
  const missingRatio = mirrorableCount > 0 ? missingJournals.length / mirrorableCount : 0;

  const checks: ReconciliationCheck[] = [
    {
      id: 'tb_debits_equal_credits',
      label: 'Trial Balance: Debits = Credits',
      passed: tb.isBalanced,
      expected: String(tb.totals.totalDebit),
      actual: String(tb.totals.totalCredit),
      difference: roundMoney(Math.abs(tb.totals.totalDebit - tb.totals.totalCredit)),
      severity: 'error',
    },
    {
      id: 'assets_equal_liabilities_equity',
      label: 'Balance Sheet Equation: Assets = Liabilities + Equity',
      passed: reconciliation.assetsEqualLiabilitiesPlusEquity,
      expected: String(reconciliation.totalAssets),
      actual: String(roundMoney(reconciliation.totalLiabilities + reconciliation.totalEquity)),
      difference: roundMoney(
        Math.abs(reconciliation.totalAssets - (reconciliation.totalLiabilities + reconciliation.totalEquity))
      ),
      severity: 'error',
    },
    {
      id: 'net_profit_equals_equity_change',
      label: 'Net Profit = Change in Equity',
      passed: reconciliation.netProfitMatchesEquityChange,
      expected: String(netProfit),
      actual: String(reconciliation.equityChangeFromPl),
      difference: roundMoney(Math.abs(netProfit - reconciliation.equityChangeFromPl)),
      severity: 'warning',
    },
    {
      id: 'no_missing_journal_mirrors',
      label: 'All transactions posted to journal',
      passed: missingJournals.length === 0,
      expected: '0 missing',
      actual: `${missingJournals.length} missing (${mirrorableCount} mirrorable in period)`,
      severity: missingRatio > 0.05 ? 'error' : 'warning',
    },
  ];

  if (input.balanceSheetTotals) {
    const bs = input.balanceSheetTotals;
    const journalAligned = sumBalanceSheetSectionsForJournalCertification(
      balancesAtEnd,
      journalLedger.accounts,
      { cumulativeNetProfit: input.cumulativeNetProfit }
    );
    const assetDiff = roundMoney(Math.abs(journalAligned.assets - bs.assets));
    const liabDiff = roundMoney(Math.abs(journalAligned.liabilities - bs.liabilities));
    const eqDiff = roundMoney(Math.abs(journalAligned.equity - bs.equity));
    const totalsDiff = roundMoney(assetDiff + liabDiff + eqDiff);
    checks.push({
      id: 'bs_engine_matches_journal',
      label: 'Balance Sheet engine totals align with journal rollup',
      passed: totalsDiff < 1 && bs.isBalanced,
      expected: `A ${bs.assets} L ${bs.liabilities} E ${bs.equity} (balanced)`,
      actual: `A ${journalAligned.assets} L ${journalAligned.liabilities} E ${journalAligned.equity}`,
      difference: totalsDiff,
      severity: 'warning',
    });
  }

  const differences: ReconciliationDifference[] = [];

  for (const issue of reconciliation.issues) {
    differences.push({ code: 'RECON_ISSUE', message: issue, severity: 'error' });
  }

  if (missingJournals.length > 0) {
    differences.push({
      code: 'MISSING_JOURNALS',
      message: `${missingJournals.length} transaction(s) in period lack journal mirrors — run backfill-transaction-journal`,
      severity: missingRatio > 0.05 ? 'error' : 'warning',
      amount: missingJournalTotalAmount,
    });
  }

  const partialReports = getFinancialReportSourceRegistry().filter((r) => r.status !== 'unified');
  if (partialReports.length > 0) {
    differences.push({
      code: 'PARTIAL_UNIFICATION',
      message: `${partialReports.map((r) => r.reportName).join(', ')} still use hybrid/legacy sources`,
      severity: 'warning',
    });
  }

  const score = computeCertificationScore({
    tbBalanced: tb.isBalanced,
    assetsEqual: reconciliation.assetsEqualLiabilitiesPlusEquity,
    netProfitMatch: reconciliation.netProfitMatchesEquityChange,
    missingRatio,
    bsBalanced: input.balanceSheetTotals?.isBalanced,
  });

  const overallStatus = deriveOverallStatus(checks, missingJournals.length, mirrorableCount);

  const summary =
    overallStatus === 'reconciled'
      ? 'Core financial statements reconcile on journal-backed data.'
      : overallStatus === 'differences'
        ? 'Reconciliation differences detected — review missing journals and hybrid report paths.'
        : 'Critical reconciliation failure — trial balance or material journal gaps.';

  return {
    certifiedAt: new Date().toISOString(),
    period: { ...period, asOfDate },
    overallStatus,
    score,
    checks,
    reportSources: getFinancialReportSourceRegistry(),
    missingJournals,
    missingJournalCount: missingJournals.length,
    missingJournalTotalAmount,
    transactionCount: transactions.length,
    journalEntryCount: journalLedger.journalEntries.length,
    reconciliation,
    differences,
    summary,
  };
}

export type { FinancialReconciliationResult };
