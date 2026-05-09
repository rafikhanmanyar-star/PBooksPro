import type { AppState, Bill, Transaction } from '../types';
import { TransactionType } from '../types';
import { resolveBillLinkedExpenseCategoryId } from './billExpenseCategory';
import { resolveProjectIdForTransaction } from '../components/reports/reportUtils';

const MONEY_EPS = 0.02;

/** Matches settlement notes from vendorBillAdvanceSettleService (English UI). */
const PREPAID_IN_BILL_DESCRIPTION_RE =
    /supplier prepaid advance\s*\(([^)]+)\)/gi;

function billPartyIds(bill: Bill): Set<string> {
    const s = new Set<string>();
    if (bill.vendorId?.trim()) s.add(bill.vendorId.trim());
    if (bill.contactId?.trim()) s.add(bill.contactId.trim());
    return s;
}

function txPartyIds(tx: Transaction): Set<string> {
    const s = new Set<string>();
    if (tx.vendorId?.trim()) s.add(tx.vendorId.trim());
    if (tx.contactId?.trim()) s.add(tx.contactId.trim());
    return s;
}

function partiesOverlap(tx: Transaction, bill: Bill): boolean {
    const a = txPartyIds(tx);
    const b = billPartyIds(bill);
    for (const id of a) {
        if (b.has(id)) return true;
    }
    return false;
}

function transactionLooksLikePrepaidAdvance(tx: Transaction): boolean {
    const hay = `${tx.description ?? ''}\n${tx.reference ?? ''}`.toLowerCase();
    if (!hay.trim()) return false;
    return /\b(prepaid|advance)\b/i.test(hay);
}

export function parsePrepaidAdvanceAmountsFromBillDescription(description: string | undefined): number[] {
    if (!description?.trim()) return [];
    const out: number[] = [];
    const re = new RegExp(PREPAID_IN_BILL_DESCRIPTION_RE.source, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(description)) !== null) {
        const raw = m[1].replace(/,/g, '').replace(/\s/g, '').trim();
        const n = parseFloat(raw);
        if (Number.isFinite(n)) out.push(n);
    }
    return out;
}

/**
 * True when this expense is an off–bill supplier prepaid payment that was later cleared in a vendor bill
 * settlement, so the bill accrual already reflects the economic expense. Including the cash/out payment
 * again would double-count P&amp;L.
 *
 * Detects amounts embedded in bill.description by settleVendorBillsBatchWithAdvances payment notes.
 */
export function transactionIsDuplicatePrepaidAdvanceVersusAccruedBill(
    tx: Transaction,
    state: AppState,
    processedBillIds: Set<string>,
    selectedProjectId: string
): boolean {
    if (tx.type !== TransactionType.EXPENSE) return false;
    if (!transactionLooksLikePrepaidAdvance(tx)) return false;

    const projectId = resolveProjectIdForTransaction(tx, state);
    if (!projectId) return false;
    if (selectedProjectId !== 'all' && projectId !== selectedProjectId) return false;

    for (const billId of processedBillIds) {
        const bill = state.bills.find((b) => b.id === billId);
        if (!bill || bill.projectId !== projectId) continue;
        if (!partiesOverlap(tx, bill)) continue;

        const prepaidAmounts = parsePrepaidAdvanceAmountsFromBillDescription(bill.description);
        const amountMatch = prepaidAmounts.some((amt) => Math.abs(tx.amount - amt) <= MONEY_EPS);
        if (!amountMatch) continue;

        const billHasParty = !!(bill.vendorId?.trim() || bill.contactId?.trim());
        if (billHasParty && !partiesOverlap(tx, bill)) continue;

        return true;
    }
    return false;
}

/**
 * When an expense has no category, infer it from a vendor bill number cited in description/reference
 * (e.g. advance note "for BILL-06822").
 */
export function resolveBillLinkedExpenseCategoryIdFromTransactionMemo(
    tx: Transaction,
    state: AppState
): string | undefined {
    if (tx.type !== TransactionType.EXPENSE) return undefined;
    const pid = resolveProjectIdForTransaction(tx, state);
    const hay = `${tx.description ?? ''}\n${tx.reference ?? ''}`.toUpperCase();
    if (!hay.trim()) return undefined;

    let best: { bill: Bill; len: number } | undefined;
    for (const bill of state.bills) {
        const num = bill.billNumber?.trim();
        if (!num || num.length < 4) continue;
        if (pid && bill.projectId && bill.projectId !== pid) continue;
        const nup = num.toUpperCase();
        if (!hay.includes(nup)) continue;
        if (!best || nup.length > best.len) best = { bill, len: nup.length };
    }
    if (!best) return undefined;
    return resolveBillLinkedExpenseCategoryId(best.bill, state.categories);
}
