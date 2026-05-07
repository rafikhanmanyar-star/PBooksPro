import type { AppState, Transaction } from '../types';
import { InvoiceStatus, LoanSubtype, TransactionType } from '../types';
import {
  findSecurityDepositAppliedExpenseForBillPayment,
  isBillPaymentFromSecurityDepositIncome,
} from './rentalBillPayments';

/** All rental security settlement txs from OwnerPayoutModal share this batch id prefix. */
export const SECURITY_SETTLEMENT_BATCH_PREFIX = 'rental-security-';

/** INCOME recorded when allocating held security toward rent (pairs with liability release EXPENSE). */
export function isRentPaymentFromSecurityDepositIncome(tx: Transaction): boolean {
  if (tx.type !== TransactionType.INCOME) return false;
  return /rent payment\s*\(from security deposit\)/i.test(tx.description || '');
}

function securityDepositRefundCategoryId(categories: { id: string; name?: string }[]): string | undefined {
  const c = categories.find((x) => (x.name || '').trim() === 'Security Deposit Refund');
  return c?.id;
}

/** EXPENSE that reduces Tenant Security Deposit Liability for rent allocation. */
export function isSecurityDepositRentAppliedExpense(
  tx: Transaction,
  categories: { id: string; name?: string }[]
): boolean {
  if (tx.type !== TransactionType.EXPENSE) return false;
  const refId = securityDepositRefundCategoryId(categories);
  if (!refId || tx.categoryId !== refId) return false;
  return /security deposit applied.*rent/i.test(tx.description || '');
}

/** EXPENSE row for bill portion of settlement (paired with INCOME bill payment from security). */
export function isSecurityDepositBillAppliedExpense(
  tx: Transaction,
  categories: { id: string; name?: string }[]
): boolean {
  if (tx.type !== TransactionType.EXPENSE) return false;
  const refId = securityDepositRefundCategoryId(categories);
  if (!refId || tx.categoryId !== refId) return false;
  return /security deposit applied.*bill\b/i.test(tx.description || '');
}

function settlementWeakKey(tx: Pick<Transaction, 'contactId' | 'propertyId' | 'date'>): string {
  const day = (tx.date || '').slice(0, 10);
  return `${tx.contactId || ''}|${tx.propertyId || ''}|${day}`;
}

function txAmount(t: Transaction): number {
  return typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount)) || 0;
}

/** Same account/invoice/bill effects as AppContext `applyTransactionEffect` (for paired amount patches). */
export function applyTransactionEffectOnly(
  state: AppState,
  tx: Transaction,
  isAdd: boolean
): AppState {
  const factor = isAdd ? 1 : -1;
  const amount = txAmount(tx);
  let newState: AppState = { ...state };

  newState.accounts = newState.accounts.map((acc) => {
    let change = 0;
    if (tx.type === TransactionType.INCOME && acc.id === tx.accountId) change = amount;
    else if (tx.type === TransactionType.EXPENSE && acc.id === tx.accountId) change = -amount;
    else if (tx.type === TransactionType.TRANSFER) {
      if (acc.id === tx.fromAccountId) change = -amount;
      if (acc.id === tx.toAccountId) change = amount;
    } else if (tx.type === TransactionType.LOAN && acc.id === tx.accountId) {
      if (tx.subtype === LoanSubtype.RECEIVE || tx.subtype === LoanSubtype.COLLECT) change = amount;
      else change = -amount;
    }
    if (change !== 0)
      return {
        ...acc,
        balance:
          (typeof acc.balance === 'number' ? acc.balance : parseFloat(String(acc.balance)) || 0) +
          change * factor,
      };
    return acc;
  });

  if (tx.invoiceId) {
    newState.invoices = newState.invoices.map((inv) => {
      if (inv.id !== tx.invoiceId) return inv;
      const newPaid = Math.max(0, (inv.paidAmount || 0) + amount * factor);
      let newStatus = inv.status;
      if (newPaid >= inv.amount - 0.1) newStatus = InvoiceStatus.PAID;
      else if (newPaid > 0.1) newStatus = InvoiceStatus.PARTIALLY_PAID;
      else newStatus = InvoiceStatus.UNPAID;
      return { ...inv, paidAmount: newPaid, status: newStatus };
    });
  }

  if (tx.billId) {
    newState.bills = newState.bills.map((b) => {
      if (b.id !== tx.billId) return b;
      const newPaid = Math.max(0, (b.paidAmount || 0) + amount * factor);
      const threshold = 0.01;
      let newStatus = b.status;
      if (newPaid >= b.amount - threshold) newStatus = InvoiceStatus.PAID;
      else if (newPaid > threshold) newStatus = InvoiceStatus.PARTIALLY_PAID;
      else newStatus = InvoiceStatus.UNPAID;
      return { ...b, paidAmount: newPaid, status: newStatus };
    });
  }

  return newState;
}

type CascadeContext = Pick<AppState, 'transactions' | 'categories' | 'bills'>;

/** Paired tx ids to delete when deleting `tx`, so invoices/bills/security ledger stay aligned. */
export function findSecuritySettlementCascadeDeletePartners(ctx: CascadeContext, tx: Transaction): string[] {
  const { transactions: txs, categories: cats, bills } = ctx;

  /** Per-invoice rent */
  if (isRentPaymentFromSecurityDepositIncome(tx) && tx.invoiceId) {
    const pair = txs.find(
      (t) =>
        t.id !== tx.id &&
        isSecurityDepositRentAppliedExpense(t, cats) &&
        t.invoiceId === tx.invoiceId
    );
    return pair ? [pair.id] : [];
  }
  if (isSecurityDepositRentAppliedExpense(tx, cats) && tx.invoiceId) {
    const pair = txs.find(
      (t) =>
        t.id !== tx.id &&
        isRentPaymentFromSecurityDepositIncome(t) &&
        t.invoiceId === tx.invoiceId
    );
    return pair ? [pair.id] : [];
  }

  /** Legacy: one aggregate rent expense line (no invoiceId) + one or more rent-from-security incomes. */
  if (isRentPaymentFromSecurityDepositIncome(tx)) {
    const pair = txs.find(
      (t) =>
        t.id !== tx.id &&
        isSecurityDepositRentAppliedExpense(t, cats) &&
        (!t.invoiceId || String(t.invoiceId).trim() === '') &&
        (!tx.batchId || !t.batchId || t.batchId === tx.batchId) &&
        settlementWeakKey(t) === settlementWeakKey(tx) &&
        Math.abs(txAmount(t) - txAmount(tx)) < 0.02
    );
    return pair ? [pair.id] : [];
  }
  if (isSecurityDepositRentAppliedExpense(tx, cats) && (!tx.invoiceId || String(tx.invoiceId).trim() === '')) {
    const candidates = txs.filter(
      (t) =>
        t.id !== tx.id &&
        isRentPaymentFromSecurityDepositIncome(t) &&
        (!tx.batchId || !t.batchId || t.batchId === tx.batchId) &&
        settlementWeakKey(t) === settlementWeakKey(tx)
    );
    const sum = candidates.reduce((s, t) => s + txAmount(t), 0);
    if (candidates.length > 0 && Math.abs(sum - txAmount(tx)) < 0.02) {
      return candidates.map((c) => c.id);
    }
    return [];
  }

  /** Bill from security: INCOME + paired EXPENSE */
  if (isBillPaymentFromSecurityDepositIncome(tx) && tx.billId) {
    const bill = bills.find((b) => b.id === tx.billId);
    if (bill) {
      const byHelper = findSecurityDepositAppliedExpenseForBillPayment(tx, bill, txs);
      if (byHelper && byHelper.id !== tx.id) return [byHelper.id];
    }
    const byBillId = txs.find(
      (t) =>
        t.id !== tx.id &&
        t.type === TransactionType.EXPENSE &&
        isSecurityDepositBillAppliedExpense(t, cats) &&
        t.billId &&
        String(t.billId) === String(tx.billId) &&
        Math.abs(txAmount(t) - txAmount(tx)) < 0.02
    );
    return byBillId ? [byBillId.id] : [];
  }

  if (isSecurityDepositBillAppliedExpense(tx, cats)) {
    if (tx.billId) {
      const income = txs.find(
        (t) =>
          t.id !== tx.id &&
          isBillPaymentFromSecurityDepositIncome(t) &&
          t.billId &&
          String(t.billId) === String(tx.billId) &&
          Math.abs(txAmount(t) - txAmount(tx)) < 0.02
      );
      return income ? [income.id] : [];
    }
    for (const bill of bills) {
      const maybeInc = txs.find((t) => {
        if (t.id === tx.id || !isBillPaymentFromSecurityDepositIncome(t)) return false;
        const e = findSecurityDepositAppliedExpenseForBillPayment(t, bill, txs);
        return e?.id === tx.id;
      });
      if (maybeInc) return [maybeInc.id];
    }
  }

  return [];
}

/**
 * When removing a rent-from-security INCOME that belonged to a legacy aggregate expense
 * (no per-invoice expense row), shrink or remove that expense so net held security matches.
 */
export function adjustOrRemoveRentAggregateExpenseAfterIncomeRemoved(
  state: AppState,
  removedIncome: Transaction,
  categories: { id: string; name?: string }[]
): AppState | null {
  if (!isRentPaymentFromSecurityDepositIncome(removedIncome)) return null;
  if (
    removedIncome.invoiceId &&
    state.transactions.some(
      (t) => isSecurityDepositRentAppliedExpense(t, categories) && t.invoiceId === removedIncome.invoiceId
    )
  ) {
    return null;
  }

  const agg = state.transactions.find(
    (t) =>
      isSecurityDepositRentAppliedExpense(t, categories) &&
      (!t.invoiceId || String(t.invoiceId).trim() === '') &&
      (!removedIncome.batchId || !t.batchId || t.batchId === removedIncome.batchId) &&
      settlementWeakKey(t) === settlementWeakKey(removedIncome)
  );
  if (!agg) return null;

  const newAmt = txAmount(agg) - txAmount(removedIncome);
  if (newAmt <= 0.01) {
    let s = applyTransactionEffectOnly(state, agg, false);
    s = { ...s, transactions: s.transactions.filter((t) => t.id !== agg.id) };
    return s;
  }

  let s = applyTransactionEffectOnly(state, agg, false);
  const updatedAgg: Transaction = { ...agg, amount: newAmt };
  s = { ...s, transactions: s.transactions.map((t) => (t.id === agg.id ? updatedAgg : t)) };
  return applyTransactionEffectOnly(s, updatedAgg, true);
}

export function syncPairedExpenseToRentFromSecurityIncome(
  state: AppState,
  originalIncome: Transaction,
  updatedIncome: Transaction,
  categories: { id: string; name?: string }[]
): AppState | null {
  if (!isRentPaymentFromSecurityDepositIncome(updatedIncome)) return null;

  let paired: Transaction | undefined;
  if (updatedIncome.invoiceId) {
    paired = state.transactions.find(
      (t) =>
        isSecurityDepositRentAppliedExpense(t, categories) && t.invoiceId === updatedIncome.invoiceId
    );
  }

  /** Legacy aggregate */
  if (!paired) {
    const agg = state.transactions.find(
      (t) =>
        isSecurityDepositRentAppliedExpense(t, categories) &&
        (!t.invoiceId || String(t.invoiceId).trim() === '') &&
        (!updatedIncome.batchId || !t.batchId || t.batchId === updatedIncome.batchId) &&
        settlementWeakKey(t) === settlementWeakKey(updatedIncome)
    );
    if (!agg || txAmount(agg) < 0.01) return null;
    const delta = txAmount(updatedIncome) - txAmount(originalIncome);
    const newAmt = Math.max(0, txAmount(agg) + delta);
    if (Math.abs(txAmount(agg) - newAmt) < 0.01) return null;
    let s = applyTransactionEffectOnly(state, agg, false);
    const nu: Transaction = { ...agg, amount: newAmt };
    s = { ...s, transactions: s.transactions.map((t) => (t.id === agg.id ? nu : t)) };
    return applyTransactionEffectOnly(s, nu, true);
  }

  if (Math.abs(txAmount(paired) - txAmount(updatedIncome)) < 0.01) return null;
  let s = applyTransactionEffectOnly(state, paired, false);
  const nu: Transaction = { ...paired, amount: txAmount(updatedIncome) };
  s = { ...s, transactions: s.transactions.map((t) => (t.id === paired.id ? nu : t)) };
  return applyTransactionEffectOnly(s, nu, true);
}

/** After editing the liability-release EXPENSE, align INCOME invoice payment row. */
export function syncRentFromSecurityIncomeToPairedExpense(
  state: AppState,
  updatedExpense: Transaction,
  categories: { id: string; name?: string }[]
): AppState | null {
  if (!isSecurityDepositRentAppliedExpense(updatedExpense, categories)) return null;
  if (!updatedExpense.invoiceId) return null;

  const income = state.transactions.find(
    (t) => isRentPaymentFromSecurityDepositIncome(t) && t.invoiceId === updatedExpense.invoiceId
  );
  if (!income || Math.abs(txAmount(income) - txAmount(updatedExpense)) < 0.01) return null;

  let s = applyTransactionEffectOnly(state, income, false);
  const nu: Transaction = { ...income, amount: txAmount(updatedExpense) };
  s = { ...s, transactions: s.transactions.map((t) => (t.id === income.id ? nu : t)) };
  return applyTransactionEffectOnly(s, nu, true);
}

/** When expense "Security deposit applied — Bill …" changes, mirror the linked INCOME row. */
export function syncBillPaymentIncomeFromPairedExpense(
  state: AppState,
  updatedExpense: Transaction,
  categories: { id: string; name?: string }[]
): AppState | null {
  if (!isSecurityDepositBillAppliedExpense(updatedExpense, categories)) return null;

  let income = updatedExpense.billId
    ? state.transactions.find(
        (t) =>
          isBillPaymentFromSecurityDepositIncome(t) &&
          t.billId &&
          String(t.billId) === String(updatedExpense.billId)
      )
    : undefined;

  if (!income && !updatedExpense.billId) {
    const bill = state.bills.find((b) =>
      billNumberMatchesExpenseDescription(b.billNumber, updatedExpense.description || '')
    );
    if (bill) {
      const allForBill = state.transactions.filter(
        (t) => isBillPaymentFromSecurityDepositIncome(t) && t.billId === bill.id
      );
      if (allForBill.length === 1) income = allForBill[0];
    }
  }

  if (!income || Math.abs(txAmount(income) - txAmount(updatedExpense)) < 0.01) return null;

  let s = applyTransactionEffectOnly(state, income, false);
  const nu: Transaction = { ...income, amount: txAmount(updatedExpense) };
  s = { ...s, transactions: s.transactions.map((t) => (t.id === income.id ? nu : t)) };
  return applyTransactionEffectOnly(s, nu, true);
}

function billNumberMatchesExpenseDescription(billNumber: string | undefined, desc: string): boolean {
  if (!billNumber?.trim()) return false;
  const escaped = billNumber.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`Bill\\s*${escaped}\\b`, 'i').test(desc);
}

export function syncPairedBillExpenseFromSecurityIncome(
  state: AppState,
  updatedIncome: Transaction,
  categories: { id: string; name?: string }[]
): AppState | null {
  if (!isBillPaymentFromSecurityDepositIncome(updatedIncome) || !updatedIncome.billId) return null;
  const bill = state.bills.find((b) => b.id === updatedIncome.billId);
  if (!bill) return null;

  const paired =
    state.transactions.find(
      (t) =>
        t.id !== updatedIncome.id &&
        t.type === TransactionType.EXPENSE &&
        isSecurityDepositBillAppliedExpense(t, categories) &&
        t.billId &&
        String(t.billId) === String(updatedIncome.billId)
    ) || findSecurityDepositAppliedExpenseForBillPayment(updatedIncome, bill, state.transactions);

  if (!paired || paired.id === updatedIncome.id) return null;
  if (Math.abs(txAmount(paired) - txAmount(updatedIncome)) < 0.01) return null;

  let s = applyTransactionEffectOnly(state, paired, false);
  const nu: Transaction = { ...paired, amount: txAmount(updatedIncome) };
  s = { ...s, transactions: s.transactions.map((t) => (t.id === paired.id ? nu : t)) };
  return applyTransactionEffectOnly(s, nu, true);
}
