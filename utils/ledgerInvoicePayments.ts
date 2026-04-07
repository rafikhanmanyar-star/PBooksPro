import { Transaction, TransactionType } from '../types';

/**
 * INCOME sums per invoice from the transaction ledger (matches InvoicesPage / server
 * recalculateInvoicePaymentAggregates). Use when invoice.paidAmount may lag behind
 * linked INCOME rows (e.g. some payments not applied to the invoice aggregate).
 */
export function buildLedgerPaidByInvoiceMap(transactions: Transaction[]): Map<string, number> {
    const batchGroupMap = new Map<string, Transaction[]>();
    for (const tx of transactions) {
        if (tx.batchId) {
            let group = batchGroupMap.get(tx.batchId);
            if (!group) {
                group = [];
                batchGroupMap.set(tx.batchId, group);
            }
            group.push(tx);
        }
    }
    const map = new Map<string, number>();
    const processedBatchIds = new Set<string>();
    for (const tx of transactions) {
        if (tx.type !== TransactionType.INCOME) continue;
        if (!tx.invoiceId) continue;
        if (tx.batchId) {
            if (processedBatchIds.has(tx.batchId)) continue;
            processedBatchIds.add(tx.batchId);
            const batchTxs = batchGroupMap.get(tx.batchId) || [tx];
            for (const t of batchTxs) {
                if (t.type !== TransactionType.INCOME || !t.invoiceId) continue;
                const amt = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount)) || 0;
                map.set(t.invoiceId, (map.get(t.invoiceId) || 0) + amt);
            }
        } else {
            const amt = typeof tx.amount === 'number' ? tx.amount : parseFloat(String(tx.amount)) || 0;
            map.set(tx.invoiceId, (map.get(tx.invoiceId) || 0) + amt);
        }
    }
    return map;
}

/** Effective paid: ledger sum when present, else invoice aggregate. */
export function getEffectivePaidForInvoice(
    invoiceId: string,
    invoicePaidAmount: number | undefined,
    ledgerMap: Map<string, number>
): number {
    return ledgerMap.has(invoiceId) ? ledgerMap.get(invoiceId) || 0 : invoicePaidAmount || 0;
}
