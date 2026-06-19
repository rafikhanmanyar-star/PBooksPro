export type LedgerRowType = 'bill' | 'transaction' | 'batch_payment' | 'supplier_advance' | 'prepaid_apply';

export interface LedgerChild {
    id: string;
    originalId: string;
    type: 'transaction';
    date: string;
    particulars: string;
    debit: number;
    credit: number;
    projectLabel?: string;
}

export interface LedgerItem {
    id: string;
    originalId?: string;
    type: LedgerRowType;
    date: string;
    particulars: string;
    debit: number;
    credit: number;
    balance?: number;
    projectLabel?: string;
    children: LedgerChild[];
    sortAux?: number;
}

export type VendorLedgerSortKey = 'date' | 'particulars' | 'credit' | 'debit' | 'balance';

export type FlatVendorLedgerRow =
    | { kind: 'parent'; item: LedgerItem }
    | { kind: 'child'; child: LedgerChild };

export function flattenVendorLedgerRows(
    ledgerItems: LedgerItem[],
    expandedIds: Set<string>
): FlatVendorLedgerRow[] {
    const rows: FlatVendorLedgerRow[] = [];
    for (const item of ledgerItems) {
        rows.push({ kind: 'parent', item });
        if (expandedIds.has(item.id) && item.children.length > 0) {
            for (const child of item.children) {
                rows.push({ kind: 'child', child });
            }
        }
    }
    return rows;
}
