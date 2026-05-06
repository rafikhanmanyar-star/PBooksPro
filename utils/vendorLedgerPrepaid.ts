import type { Bill, Transaction } from '../types';
import { TransactionType } from '../types';

const MONEY_EPS = 0.015;

/** Expense/income rows linked to a bill (matches server recalculateBillPaymentAggregates). */
export function ledgerAmountPaidViaTransactionsForBill(transactions: Transaction[], billId: string): number {
    const raw = transactions
        .filter(
            (tx) =>
                tx.billId === billId &&
                (tx.type === TransactionType.EXPENSE || tx.type === TransactionType.INCOME)
        )
        .reduce((s, tx) => s + tx.amount, 0);
    return Math.round(raw * 100) / 100;
}

/** Prepaid slice of bill.payment total that is NOT mirrored as a transaction (vendor advance JE clearings). */
export function prepaidAppliedToBillNotInTransactions(bill: Bill, transactions: Transaction[]): number {
    const txPaid = ledgerAmountPaidViaTransactionsForBill(transactions, bill.id);
    return Math.max(0, Math.round((bill.paidAmount - txPaid) * 100) / 100);
}

export function hasPrepaidSettlementSliceOnBill(bill: Bill, transactions: Transaction[]): boolean {
    return prepaidAppliedToBillNotInTransactions(bill, transactions) > MONEY_EPS;
}

/** Best-effort JE/settlement ordering date when no prepaid row exists in client state — max linked payment date else bill issue. */
export function prepaidClearingDisplayDateForBill(bill: Bill, transactions: Transaction[]): string {
    const linked = transactions
        .filter(
            (tx) =>
                tx.billId === bill.id &&
                (tx.type === TransactionType.EXPENSE || tx.type === TransactionType.INCOME)
        )
        .map((tx) => tx.date)
        .filter(Boolean)
        .sort();
    return linked.length > 0 ? linked[linked.length - 1]! : bill.issueDate;
}

export { MONEY_EPS as VENDOR_LEDGER_MONEY_EPS };
