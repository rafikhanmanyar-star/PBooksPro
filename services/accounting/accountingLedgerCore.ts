/**
 * Central accounting rules: project-scoped cash, report reconciliation, project-close hint.
 * P&L category exclusions live in `plExclusions.ts` (imported by projectProfitLossComputation).
 */

import type { AppState, Transaction } from '../../types';
import { AccountType, LoanSubtype, TransactionType } from '../../types';
import { resolveProjectIdForTransaction } from '../../components/reports/reportUtils';
import { computeProfitLossReport } from '../../components/reports/profitLossEngine';
import { computeBalanceSheetReport } from '../../components/reports/balanceSheetEngine';
import { computeCashFlowReport } from '../../components/reports/cashFlowEngine';

const EPS = 0.01;

function isBankCashAccount(
  acc: { id: string; type: AccountType } | undefined,
  clearingId: string | undefined,
  bankAccountId: string
): boolean {
  if (!acc || acc.id !== bankAccountId) return false;
  if (clearingId && acc.id === clearingId) return false;
  return acc.type === AccountType.BANK || acc.type === AccountType.CASH;
}

/** Net change to one bank/cash account from a single transaction (project filter applied by caller). */
function getCashDeltaForAccount(
  tx: Transaction,
  bankAccountId: string,
  accountsById: Map<string, { id: string; type: AccountType; name?: string }>,
  clearingId?: string
): number {
  const acc = (id: string | undefined) => (id ? accountsById.get(id) : undefined);
  if (tx.type === TransactionType.INCOME || tx.type === TransactionType.EXPENSE) {
    if (!isBankCashAccount(acc(tx.accountId), clearingId, bankAccountId)) return 0;
    return tx.type === TransactionType.INCOME ? tx.amount : -tx.amount;
  }
  if (tx.type === TransactionType.LOAN) {
    if (!isBankCashAccount(acc(tx.accountId), clearingId, bankAccountId)) return 0;
    const st = tx.subtype as LoanSubtype | undefined;
    if (st === LoanSubtype.RECEIVE || st === LoanSubtype.COLLECT) return tx.amount;
    if (st === LoanSubtype.GIVE || st === LoanSubtype.REPAY) return -tx.amount;
    return 0;
  }
  if (tx.type === TransactionType.TRANSFER) {
    let d = 0;
    if (tx.fromAccountId === bankAccountId && isBankCashAccount(acc(tx.fromAccountId), clearingId, bankAccountId)) {
      d -= tx.amount;
    }
    if (tx.toAccountId === bankAccountId && isBankCashAccount(acc(tx.toAccountId), clearingId, bankAccountId)) {
      d += tx.amount;
    }
    return d;
  }
  return 0;
}

/**
 * Project-scoped running balance on one bank/cash account: sum of cash deltas for transactions
 * attributed to `projectId` through `asOfDate` (inclusive).
 */
export function computeProjectScopedBankCashBalance(
  state: Pick<AppState, 'accounts' | 'transactions'>,
  bankAccountId: string,
  projectId: string,
  asOfDateYyyyMmDd: string,
  options?: { excludeTransactionId?: string }
): number {
  const accountsById = new Map((state.accounts || []).map((a) => [a.id, a]));
  const clearingId = state.accounts?.find((a) => a.name === 'Internal Clearing')?.id;
  const limit = new Date(asOfDateYyyyMmDd);
  limit.setHours(23, 59, 59, 999);

  let sum = 0;
  for (const tx of state.transactions || []) {
    if (options?.excludeTransactionId && tx.id === options.excludeTransactionId) continue;
    const d = new Date(tx.date);
    if (d > limit) continue;
    const pid = resolveProjectIdForTransaction(tx, state as AppState);
    if (pid !== projectId) continue;
    sum += getCashDeltaForAccount(tx, bankAccountId, accountsById, clearingId);
  }
  return Math.round(sum * 100) / 100;
}

export interface ExpenseCashValidationInput {
  amount: number;
  accountId: string;
  projectId?: string;
  dateYyyyMmDd: string;
  /** When editing, exclude this transaction id from the running balance. */
  excludeTransactionId?: string;
}

/**
 * Block expenses that would drive project-scoped bank balance below zero (unless `allowNegativeCash` is set on account — future).
 */
export function validateExpenseCashForProject(
  state: AppState,
  input: ExpenseCashValidationInput
): { ok: boolean; available: number; shortfall: number } {
  const acc = state.accounts.find((a) => a.id === input.accountId);
  if (!acc || (acc.type !== AccountType.BANK && acc.type !== AccountType.CASH)) {
    return { ok: true, available: 0, shortfall: 0 };
  }
  if (acc.name === 'Internal Clearing') {
    return { ok: true, available: 0, shortfall: 0 };
  }
  if (!input.projectId) {
    return { ok: true, available: 0, shortfall: 0 };
  }

  const available = computeProjectScopedBankCashBalance(
    state,
    input.accountId,
    input.projectId,
    input.dateYyyyMmDd.slice(0, 10),
    { excludeTransactionId: input.excludeTransactionId }
  );
  const shortfall = input.amount - available;
  if (shortfall > EPS) {
    return { ok: false, available, shortfall };
  }
  return { ok: true, available, shortfall: 0 };
}

export interface UnifiedAccountingSnapshot {
  profitLossNet: number;
  balanceSheetBalanced: boolean;
  balanceSheetDiscrepancy: number;
  cashFlowReconciled: boolean;
  cashFlowDiscrepancy: number;
  messages: string[];
}

/**
 * Runs P&L, Balance Sheet, and Cash Flow with the same scope and returns cross-checks.
 */
export function computeUnifiedAccountingSnapshot(
  state: AppState,
  opts: {
    fromDate: string;
    toDate: string;
    selectedProjectId: string;
  }
): UnifiedAccountingSnapshot {
  const { fromDate, toDate, selectedProjectId } = opts;
  const pl = computeProfitLossReport(state, { startDate: fromDate, endDate: toDate, selectedProjectId });
  const bs = computeBalanceSheetReport(state, { asOfDate: toDate, selectedProjectId });
  const cf = computeCashFlowReport(state, { fromDate, toDate, selectedProjectId });

  const messages: string[] = [];
  if (!bs.isBalanced) {
    messages.push(`Balance sheet: Assets ≠ Liabilities + Equity by ${bs.discrepancy.toFixed(2)}.`);
  }
  if (!cf.validation.reconciled) {
    messages.push(...cf.validation.messages);
  }
  if (pl.validation.issues.some((i) => i.severity === 'error')) {
    messages.push('P&L has validation errors — review uncategorized or mapping issues.');
  }

  return {
    profitLossNet: pl.net_profit,
    balanceSheetBalanced: bs.isBalanced,
    balanceSheetDiscrepancy: bs.discrepancy,
    cashFlowReconciled: cf.validation.reconciled,
    cashFlowDiscrepancy: cf.validation.discrepancy,
    messages,
  };
}

/** True when the project has no material cash, balance-sheet assets, or liabilities — candidate for CLOSED status. */
export function suggestProjectClosed(
  state: AppState,
  projectId: string,
  asOfDate: string
): boolean {
  if (!projectId || projectId === 'all') return false;
  const bs = computeBalanceSheetReport(state, { asOfDate, selectedProjectId: projectId });
  const cash = bs.assets.current
    .filter((l) => l.groupKey === 'cash_equivalents' || l.groupKey === 'bank_accounts')
    .reduce((s, l) => s + l.amount, 0);
  const assets = bs.totals.assets;
  const liab = bs.totals.liabilities;
  return Math.abs(cash) < EPS && Math.abs(assets) < EPS && Math.abs(liab) < EPS && bs.isBalanced;
}
