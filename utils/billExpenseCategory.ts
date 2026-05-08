import type { Bill, Category } from '../types';
import { TransactionType } from '../types';

/**
 * Category to attach to bill payments and P&L resolution when the bill has no header {@link Bill.categoryId}
 * but does have {@link Bill.expenseCategoryItems} (multi-line construction bills).
 * Uses the line with the largest netValue among expense-type categories.
 */
export function resolveBillLinkedExpenseCategoryId(bill: Bill, categories: Category[]): string | undefined {
    const header = bill.categoryId?.trim();
    if (header) return header;

    const items = bill.expenseCategoryItems;
    if (!items?.length) return undefined;

    const byId = new Map(categories.map((c) => [c.id, c]));
    let bestId: string | undefined;
    let bestNet = -1;
    for (const item of items) {
        const cid = item.categoryId?.trim();
        if (!cid) continue;
        const cat = byId.get(cid);
        if (!cat || cat.type !== TransactionType.EXPENSE) continue;
        const nv = item.netValue ?? 0;
        if (nv > bestNet) {
            bestNet = nv;
            bestId = cid;
        }
    }
    return bestId;
}
