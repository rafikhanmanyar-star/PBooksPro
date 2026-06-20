/**
 * IAS 7 direct-method cash flow from operational bank/cash transactions.
 * Used when journal GL cash lines are missing or incomplete (e.g. unmirrored payments).
 */

import type { Account, Category, Transaction } from '../../types';
import { AccountType, LoanSubtype, TransactionType } from '../../types';
import {
  isTransactionFromVoidedOrCancelledInvoice,
  resolveBuildingIdForTransaction,
  resolveProjectIdForTransaction,
  type ReportStateSlice,
} from './reportUtils';
import {
  isDimensionScopeActive,
  matchesDimensionScope,
  scopeFromReportFilters,
  type FinancialDimensionScope,
} from '../../shared/financial-core/dimensionScope';
import { roundMoney } from '../../services/financialEngine/validation';
import type { CashFlowJournalReportResult, CashflowSection } from '../../shared/financial-core/cashFlowJournalCore';
import { addDaysYmd } from '../../shared/financial-core/cashFlowJournalCore';

const EPS = 0.02;

type Bucket = Map<string, { label: string; amount: number; ids: string[] }>;

export interface CashFlowTransactionState extends ReportStateSlice {
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
}

function isBankCashAccount(
  acc: Account | undefined,
  clearingId: string | undefined
): boolean {
  if (!acc) return false;
  if (clearingId && acc.id === clearingId) return false;
  const t = String(acc.type).toLowerCase();
  return t === 'bank' || t === 'cash';
}

/** Net cash effect of one transaction across all bank/cash accounts. */
export function transactionNetCashEffect(
  tx: Transaction,
  accountsById: Map<string, Account>,
  clearingId: string | undefined
): number {
  if (tx.type === TransactionType.INCOME || tx.type === TransactionType.EXPENSE) {
    const acc = tx.accountId ? accountsById.get(tx.accountId) : undefined;
    if (!isBankCashAccount(acc, clearingId)) return 0;
    return tx.type === TransactionType.INCOME ? tx.amount : -tx.amount;
  }
  if (tx.type === TransactionType.LOAN) {
    const acc = tx.accountId ? accountsById.get(tx.accountId) : undefined;
    if (!isBankCashAccount(acc, clearingId)) return 0;
    const st = tx.subtype as LoanSubtype | undefined;
    if (st === LoanSubtype.RECEIVE || st === LoanSubtype.COLLECT) return tx.amount;
    if (st === LoanSubtype.GIVE || st === LoanSubtype.REPAY) return -tx.amount;
    return 0;
  }
  if (tx.type === TransactionType.TRANSFER) {
    let d = 0;
    const fromAcc = tx.fromAccountId ? accountsById.get(tx.fromAccountId) : undefined;
    const toAcc = tx.toAccountId ? accountsById.get(tx.toAccountId) : undefined;
    if (tx.fromAccountId && isBankCashAccount(fromAcc, clearingId)) d -= tx.amount;
    if (tx.toAccountId && isBankCashAccount(toAcc, clearingId)) d += tx.amount;
    return d;
  }
  return 0;
}

function classifyTransaction(
  tx: Transaction,
  categoriesById: Map<string, Category>
): { section: CashflowSection; label: string } {
  const st = String(tx.subtype ?? '');
  if (st === 'equity_investment' || st === 'equity_withdrawal') {
    return {
      section: 'financing',
      label:
        st === 'equity_investment'
          ? 'Financing — owner / investor contributions'
          : 'Financing — owner / investor withdrawals',
    };
  }
  if (tx.type === TransactionType.LOAN) {
    const loanSt = tx.subtype as LoanSubtype | undefined;
    if (loanSt === LoanSubtype.RECEIVE || loanSt === LoanSubtype.COLLECT) {
      return { section: 'financing', label: 'Financing — proceeds from borrowings' };
    }
    if (loanSt === LoanSubtype.GIVE || loanSt === LoanSubtype.REPAY) {
      return { section: 'financing', label: 'Financing — repayment of borrowings' };
    }
  }
  const cat = tx.categoryId ? categoriesById.get(tx.categoryId) : undefined;
  const catName = cat?.name?.toLowerCase() ?? '';
  if (/owner equity|owner withdrawn|share capital|investor capital/i.test(catName)) {
    return { section: 'financing', label: 'Financing — equity movements' };
  }
  if (/fixed asset|property plant|equipment|capex|asset purchase/i.test(catName)) {
    return { section: 'investing', label: 'Investing — asset purchases and sales' };
  }
  if (tx.type === TransactionType.INCOME) {
    return { section: 'operating', label: 'Operating — cash receipts from customers' };
  }
  if (tx.type === TransactionType.EXPENSE) {
    return { section: 'operating', label: 'Operating — cash paid to suppliers and employees' };
  }
  if (tx.type === TransactionType.TRANSFER) {
    return { section: 'operating', label: 'Operating — inter-account transfers' };
  }
  return { section: 'operating', label: 'Operating cash flows' };
}

function txMatchesScope(tx: Transaction, state: CashFlowTransactionState, scope: FinancialDimensionScope): boolean {
  if (!isDimensionScopeActive(scope)) return true;
  return matchesDimensionScope(scope, {
    projectId: resolveProjectIdForTransaction(tx, state),
    buildingId: resolveBuildingIdForTransaction(tx, state),
  });
}

function inDateRange(tx: Transaction, from: string, to: string): boolean {
  const d = String(tx.date).slice(0, 10);
  return d >= from && d <= to;
}

function onOrBefore(tx: Transaction, ymd: string): boolean {
  return String(tx.date).slice(0, 10) <= ymd;
}

export function buildCashFlowReportFromTransactions(input: {
  from: string;
  to: string;
  state: CashFlowTransactionState;
  selectedProjectId: string;
  selectedBuildingId?: string;
  selectedCostCenterId?: string;
}): CashFlowJournalReportResult {
  const scope = scopeFromReportFilters(
    input.selectedProjectId,
    input.selectedBuildingId ?? 'all',
    input.selectedCostCenterId ?? 'all'
  );
  const { state, from, to } = input;
  const accountsById = new Map(state.accounts.map((a) => [a.id, a]));
  const categoriesById = new Map(state.categories.map((c) => [c.id, c]));
  const clearingId = state.accounts.find((a) => a.name === 'Internal Clearing')?.id;

  const operating: Bucket = new Map();
  const investing: Bucket = new Map();
  const financing: Bucket = new Map();

  let openingCash = 0;
  let closingCash = 0;
  const dayBefore = addDaysYmd(from, -1);

  for (const tx of state.transactions) {
    if ((tx as { deletedAt?: string }).deletedAt) continue;
    if (isTransactionFromVoidedOrCancelledInvoice(tx, state)) continue;
    if (!txMatchesScope(tx, state, scope)) continue;

    const net = roundMoney(transactionNetCashEffect(tx, accountsById, clearingId));
    if (Math.abs(net) < EPS) continue;

    if (onOrBefore(tx, dayBefore)) openingCash = roundMoney(openingCash + net);
    if (onOrBefore(tx, to)) closingCash = roundMoney(closingCash + net);

    if (!inDateRange(tx, from, to)) continue;

    const { section, label } = classifyTransaction(tx, categoriesById);
    const bucket = section === 'operating' ? operating : section === 'investing' ? investing : financing;
    const key = `${section}_${label}`;
    const cur = bucket.get(key);
    if (!cur) {
      bucket.set(key, { label, amount: net, ids: [tx.id] });
    } else {
      cur.amount = roundMoney(cur.amount + net);
      if (!cur.ids.includes(tx.id)) cur.ids.push(tx.id);
    }
  }

  const toItems = (b: Bucket) =>
    [...b.entries()]
      .sort((a, x) => a[1].label.localeCompare(x[1].label))
      .map(([key, v]) => ({
        key,
        label: v.label,
        amount: v.amount,
        transactionIds: v.ids,
      }));

  const opItems = toItems(operating);
  const invItems = toItems(investing);
  const finItems = toItems(financing);
  const netOperating = roundMoney(opItems.reduce((s, i) => s + i.amount, 0));
  const netInvesting = roundMoney(invItems.reduce((s, i) => s + i.amount, 0));
  const netFinancing = roundMoney(finItems.reduce((s, i) => s + i.amount, 0));
  const netChange = roundMoney(netOperating + netInvesting + netFinancing);
  const computedClosing = roundMoney(openingCash + netChange);
  const discrepancy = roundMoney(computedClosing - closingCash);
  const reconciled = Math.abs(discrepancy) <= EPS;

  const messages: string[] = [];
  if (openingCash < -EPS) {
    messages.push('Opening cash is negative — verify bank/cash balances for this scope.');
  }
  if (!reconciled) {
    messages.push(
      `Cash flow reconciliation (transactions): computed closing ${computedClosing.toFixed(2)} vs activity closing ${closingCash.toFixed(2)} (discrepancy ${discrepancy.toFixed(2)}).`
    );
  }
  messages.push(
    'Cash flow derived from operational bank/cash transactions — GL journal mirrors may be incomplete for this tenant.'
  );

  return {
    from,
    to,
    operating: { items: opItems, total: netOperating },
    investing: { items: invItems, total: netInvesting },
    financing: { items: finItems, total: netFinancing },
    summary: {
      net_change: netChange,
      opening_cash: openingCash,
      closing_cash: closingCash,
      computed_closing_cash: computedClosing,
    },
    validation: {
      reconciled,
      discrepancy,
      balance_sheet_cash: closingCash,
      messages,
    },
    flags: { negative_opening_cash: openingCash < -EPS, source: 'transactions' },
    audit: [],
    meta: { cashLineCount: opItems.length + invItems.length + finItems.length },
  };
}
