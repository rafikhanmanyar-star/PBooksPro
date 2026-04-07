import type { Transaction } from '../types';
import { TransactionType } from '../types';

/** Sum of expense transactions linked to a bill (what Bills & Payments lists as payment rows). */
export function sumExpenseLinkedToBill(transactions: Transaction[], billId: string): number {
    const bid = String(billId);
    return transactions
        .filter((tx) => {
            if (tx.type !== TransactionType.EXPENSE) return false;
            const id = tx.billId ?? (tx as { bill_id?: string }).bill_id;
            return id != null && String(id) === bid;
        })
        .reduce((sum, tx) => {
            const a = typeof tx.amount === 'number' ? tx.amount : parseFloat(String(tx.amount)) || 0;
            return sum + a;
        }, 0);
}
