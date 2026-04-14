import { InvoiceType, type Invoice } from '../../types';

const RENTAL_TYPES = [InvoiceType.RENTAL, InvoiceType.SECURITY_DEPOSIT];

/** Rental slice used for React Query cache / prefetch (aligned with AR dashboard). */
export function selectRentalInvoicesForCache(invoices: Invoice[]): Invoice[] {
  return invoices.filter((inv) => RENTAL_TYPES.includes(inv.invoiceType));
}
