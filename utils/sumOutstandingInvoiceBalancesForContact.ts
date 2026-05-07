import type { Invoice } from '../types';

/**
 * Sum of remaining balances (amount − paid) for all invoices belonging to a contact.
 * Ignores soft-deleted (`deletedAt`) invoices.
 * Use `invoiceBalanceOverride` when the invoice row in `invoices` is stale (e.g. right after ADD_TRANSACTION before re-render).
 */
export function sumOutstandingInvoiceBalancesForContact(
  invoices: readonly Invoice[],
  contactId: string,
  options?: { invoiceId?: string; invoiceBalanceOverride?: number }
): number {
  let sum = 0;
  for (const inv of invoices) {
    if (inv.contactId !== contactId) continue;
    if (inv.deletedAt) continue;
    const bal =
      options?.invoiceId &&
      options.invoiceId === inv.id &&
      options.invoiceBalanceOverride !== undefined
        ? Math.max(0, options.invoiceBalanceOverride)
        : Math.max(0, inv.amount - (inv.paidAmount || 0));
    sum += bal;
  }
  return sum;
}
