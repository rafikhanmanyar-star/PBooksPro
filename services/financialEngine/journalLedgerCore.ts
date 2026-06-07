/**
 * Unified GL computation from journal_lines / journal_entries.
 * Single source of truth for account balances, P&L eligibility, and financial reconciliation.
 */

import { roundMoney, MONEY_EPSILON } from './validation';
import {
  applyOpeningBalances,
  buildTrialBalanceReport,
  mergeRawRowsByAccount,
  normalBalanceDirection,
  openingAmountToGross,
  type AccountOpeningInput,
  type TrialBalanceBasis,
  type TrialBalanceRawRow,
  type TrialBalanceReportPayload,
} from './trialBalanceCore';

/** Minimal account shape for GL engines (avoids coupling to full AppState types). */
export interface LedgerAccount {
  id: string;
  name: string;
  type: string;
  openingBalance?: number;
  parentAccountId?: string | null;
  accountCode?: string | null;
  subType?: string | null;
  isActive?: boolean;
}

/** Minimal transaction shape for journal-linked P&L classification. */
export interface LedgerTransaction {
  id: string;
  type: string;
  amount: number;
  date: string;
  categoryId?: string;
  accountId?: string;
  projectId?: string;
  billId?: string;
  invoiceId?: string;
  deletedAt?: string;
}

/** Minimal journal line row (SQLite or API). */
export interface JournalLineRow {
  journalEntryId: string;
  accountId: string;
  debitAmount: number;
  creditAmount: number;
  lineNumber: number;
  projectId?: string | null;
}

/** Minimal journal entry header. */
export interface JournalEntryRow {
  id: string;
  entryDate: string;
  reference?: string;
  description?: string | null;
  sourceModule?: string | null;
  sourceId?: string | null;
  projectId?: string | null;
  /** True when entry has been reversed (original leg). */
  isReversed?: boolean;
}

export interface JournalLedgerInput {
  journalLines: JournalLineRow[];
  journalEntries: JournalEntryRow[];
  accounts: LedgerAccount[];
  /** Operational transactions — used for P&L category lookup via journal source_id. */
  transactions?: LedgerTransaction[];
}

export interface JournalAccountBalance {
  accountId: string;
  signedBalance: number;
  grossDebit: number;
  grossCredit: number;
}

export interface FinancialReconciliationResult {
  trialBalance: TrialBalanceReportPayload;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  netProfit: number;
  equityChangeFromPl: number;
  isBalanced: boolean;
  assetsEqualLiabilitiesPlusEquity: boolean;
  trialBalanceMatchesBalanceSheet: boolean;
  netProfitMatchesEquityChange: boolean;
  issues: string[];
}

const SYS_CLEARING = 'sys-acc-clearing';
const SYS_AR = 'sys-acc-ar';
const SYS_AP = 'sys-acc-ap';

function ymd(d: string): string {
  return d.slice(0, 10);
}

function inDateRange(dateStr: string, from: string, to: string, basis: TrialBalanceBasis): boolean {
  const d = ymd(dateStr);
  if (basis === 'cumulative') return d <= to;
  return d >= from && d <= to;
}

function priorTo(dateStr: string, before: string): boolean {
  return ymd(dateStr) < before;
}

/** Active entries: not marked reversed (reversal workflow creates new entries; originals may still exist). */
export function activeJournalEntries(entries: JournalEntryRow[]): JournalEntryRow[] {
  return entries.filter((e) => !e.isReversed);
}

export function journalEntryMap(entries: JournalEntryRow[]): Map<string, JournalEntryRow> {
  return new Map(entries.map((e) => [e.id, e]));
}

/** Aggregate signed balance per account from journal lines through asOfDate. */
export function computeAccountBalancesFromJournal(
  input: JournalLedgerInput,
  asOfDate: string,
  options?: { projectId?: string | null; fromDate?: string }
): Map<string, JournalAccountBalance> {
  const entryById = journalEntryMap(activeJournalEntries(input.journalEntries));
  const accountType = new Map(input.accounts.map((a) => [a.id, a.type]));
  const agg = new Map<string, { gd: number; gc: number }>();

  for (const line of input.journalLines) {
    const entry = entryById.get(line.journalEntryId);
    if (!entry) continue;
    if (ymd(entry.entryDate) > asOfDate) continue;
    if (options?.fromDate && priorTo(entry.entryDate, options.fromDate)) continue;

    if (options?.projectId && options.projectId !== 'all') {
      const pid = line.projectId ?? entry.projectId;
      if (pid !== options.projectId) continue;
    }

    const cur = agg.get(line.accountId) ?? { gd: 0, gc: 0 };
    cur.gd = roundMoney(cur.gd + roundMoney(line.debitAmount));
    cur.gc = roundMoney(cur.gc + roundMoney(line.creditAmount));
    agg.set(line.accountId, cur);
  }

  const result = new Map<string, JournalAccountBalance>();
  for (const [accountId, { gd, gc }] of agg) {
    const type = accountType.get(accountId) ?? 'Asset';
    const dir = normalBalanceDirection(type);
    const signed = roundMoney(dir * (gd - gc));
    result.set(accountId, { accountId, signedBalance: signed, grossDebit: gd, grossCredit: gc });
  }

  // Opening balances
  for (const acc of input.accounts) {
    const ob = roundMoney(Number(acc.openingBalance ?? 0));
    if (Math.abs(ob) < MONEY_EPSILON) continue;
    const { grossDebit, grossCredit } = openingAmountToGross(ob, acc.type);
    const dir = normalBalanceDirection(acc.type);
    const obSigned = roundMoney(dir * (grossDebit - grossCredit));
    const ex = result.get(acc.id);
    if (ex) {
      ex.grossDebit = roundMoney(ex.grossDebit + grossDebit);
      ex.grossCredit = roundMoney(ex.grossCredit + grossCredit);
      ex.signedBalance = roundMoney(ex.signedBalance + obSigned);
    } else {
      result.set(acc.id, {
        accountId: acc.id,
        signedBalance: obSigned,
        grossDebit,
        grossCredit,
      });
    }
  }

  return result;
}

/** Transaction IDs with an active journal mirror in the ledger input. */
export function mirroredTransactionIds(input: JournalLedgerInput): Set<string> {
  const ids = new Set<string>();
  for (const e of activeJournalEntries(input.journalEntries)) {
    if (e.sourceModule === 'transaction' && e.sourceId) ids.add(e.sourceId);
  }
  return ids;
}

/** Filter transactions to those posted to the GL (journal mirror exists). */
export function filterTransactionsForJournalLedger(
  transactions: LedgerTransaction[],
  mirroredIds: Set<string>
): LedgerTransaction[] {
  if (mirroredIds.size === 0) return transactions;
  return transactions.filter((t) => mirroredIds.has(t.id));
}

/** Build trial balance raw rows from journal aggregates (+ opening equity offset). */
export function buildTrialBalanceFromJournal(
  input: JournalLedgerInput,
  options: { from: string; to: string; basis: TrialBalanceBasis; projectId?: string }
): TrialBalanceReportPayload {
  const entryById = journalEntryMap(activeJournalEntries(input.journalEntries));
  const activityRows: TrialBalanceRawRow[] = [];
  const agg = new Map<string, { gd: number; gc: number }>();

  for (const line of input.journalLines) {
    const entry = entryById.get(line.journalEntryId);
    if (!entry) continue;

    const inPeriod = inDateRange(entry.entryDate, options.from, options.to, 'period');
    const inCumulative = inDateRange(entry.entryDate, options.from, options.to, 'cumulative');
    const inPrior =
      options.basis === 'period' && priorTo(entry.entryDate, options.from);

    if (options.basis === 'period' && !inPeriod && !inPrior) continue;
    if (options.basis === 'cumulative' && !inCumulative) continue;

    if (options.projectId && options.projectId !== 'all') {
      const pid = line.projectId ?? entry.projectId;
      if (pid !== options.projectId) continue;
    }

    const cur = agg.get(line.accountId) ?? { gd: 0, gc: 0 };
    cur.gd = roundMoney(cur.gd + roundMoney(line.debitAmount));
    cur.gc = roundMoney(cur.gc + roundMoney(line.creditAmount));
    agg.set(line.accountId, cur);
  }

  const accountById = new Map(input.accounts.map((a) => [a.id, a]));
  for (const [accountId, { gd, gc }] of agg) {
    const acc = accountById.get(accountId);
    activityRows.push({
      accountId,
      accountName: acc?.name ?? accountId,
      accountType: acc?.type ?? 'Asset',
      parentAccountId: acc?.parentAccountId ?? null,
      accountCode: acc?.accountCode ?? null,
      subType: acc?.subType ?? null,
      isActive: acc?.isActive !== false,
      grossDebit: gd,
      grossCredit: gc,
    });
  }

  const openings: AccountOpeningInput[] = input.accounts
    .filter((a) => Math.abs(Number(a.openingBalance ?? 0)) >= MONEY_EPSILON)
    .map((a) => ({
      accountId: a.id,
      accountName: a.name,
      accountType: a.type,
      parentAccountId: a.parentAccountId,
      accountCode: a.accountCode,
      subType: a.subType,
      isActive: a.isActive !== false,
      openingBalance: roundMoney(Number(a.openingBalance ?? 0)),
    }));

  const merged = applyOpeningBalances(mergeRawRowsByAccount(activityRows), openings);
  return buildTrialBalanceReport(merged);
}

function classifyAccountPosition(type: string): 'asset' | 'liability' | 'equity' {
  const t = type.toLowerCase();
  if (t === 'liability') return 'liability';
  if (t === 'equity') return 'equity';
  return 'asset';
}

/** Sum TB sections for balance sheet reconciliation. */
export function sumBalanceSheetSectionsFromJournal(
  balances: Map<string, JournalAccountBalance>,
  accounts: LedgerAccount[]
): { assets: number; liabilities: number; equity: number } {
  let assets = 0;
  let liabilities = 0;
  let equity = 0;
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  for (const [accountId, bal] of balances) {
    const acc = accountById.get(accountId);
    if (!acc) continue;
    const pos = classifyAccountPosition(acc.type);
    // Display convention: assets debit-normal positive; liability/equity credit-normal positive
    const display =
      pos === 'asset' ? bal.signedBalance : pos === 'liability' ? -bal.signedBalance : -bal.signedBalance;

    if (pos === 'asset') assets = roundMoney(assets + display);
    else if (pos === 'liability') liabilities = roundMoney(liabilities + display);
    else equity = roundMoney(equity + display);
  }

  return { assets, liabilities, equity };
}

/**
 * Reconcile trial balance, balance sheet totals, and net P&L.
 * @param netProfit — period net profit from journal-backed P&L
 * @param priorEquity — equity balance at start of period (for change comparison)
 */
export function reconcileFinancialStatements(
  trialBalance: TrialBalanceReportPayload,
  balances: Map<string, JournalAccountBalance>,
  accounts: LedgerAccount[],
  netProfit: number,
  priorEquity?: number
): FinancialReconciliationResult {
  const { assets, liabilities, equity } = sumBalanceSheetSectionsFromJournal(balances, accounts);
  const totalEquity = equity;
  const diff = roundMoney(assets - (liabilities + totalEquity));
  const assetsEqual = Math.abs(diff) < 1;

  const tbNet = roundMoney(trialBalance.totals.totalDebit - trialBalance.totals.totalCredit);
  const trialBalanceMatchesBalanceSheet =
    trialBalance.isBalanced && Math.abs(tbNet) < MONEY_EPSILON;

  let equityChangeFromPl = netProfit;
  let netProfitMatchesEquityChange = true;
  if (priorEquity !== undefined) {
    equityChangeFromPl = roundMoney(totalEquity - priorEquity);
    netProfitMatchesEquityChange = Math.abs(equityChangeFromPl - netProfit) < 1;
  }

  const issues: string[] = [];
  if (!trialBalance.isBalanced) {
    issues.push(
      `Trial balance out of balance: debits ${trialBalance.totals.totalDebit} vs credits ${trialBalance.totals.totalCredit}`
    );
  }
  if (!assetsEqual) {
    issues.push(`Balance sheet equation imbalance: Assets ${assets} ≠ Liabilities ${liabilities} + Equity ${totalEquity} (diff ${diff})`);
  }
  if (!netProfitMatchesEquityChange && priorEquity !== undefined) {
    issues.push(
      `Net profit ${netProfit} does not match equity change ${equityChangeFromPl} (prior equity ${priorEquity})`
    );
  }

  return {
    trialBalance,
    totalAssets: assets,
    totalLiabilities: liabilities,
    totalEquity,
    netProfit,
    equityChangeFromPl,
    isBalanced: trialBalance.isBalanced && assetsEqual,
    assetsEqualLiabilitiesPlusEquity: assetsEqual,
    trialBalanceMatchesBalanceSheet,
    netProfitMatchesEquityChange,
    issues,
  };
}

export { SYS_CLEARING, SYS_AR, SYS_AP };
