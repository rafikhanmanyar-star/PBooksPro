import type { Invoice } from '../types';
import { InvoiceType } from '../types';

/**
 * Matches rental AR grid / summary: treat as security when type is Security Deposit,
 * or the invoice carries a security deposit charge, or description indicates security.
 * (Agreement-generated security invoices historically used invoiceType RENTAL + securityDepositCharge.)
 */
export function isSecurityInvoice(inv: Invoice): boolean {
  return (
    inv.invoiceType === InvoiceType.SECURITY_DEPOSIT ||
    (inv.securityDepositCharge || 0) > 0 ||
    (inv.description || '').toLowerCase().includes('security')
  );
}

/**
 * Invoice whose balance is entirely security (no rent component).
 * Used when posting payments so the transaction uses Security Deposit, not Rental Income.
 * Covers explicit SECURITY_DEPOSIT type and legacy RENTAL rows where amount === security deposit charge.
 */
export function isPureSecurityDepositInvoice(inv: Invoice): boolean {
  if (inv.invoiceType === InvoiceType.SECURITY_DEPOSIT) return true;
  const sec = inv.securityDepositCharge || 0;
  const rentPortion = Math.max(0, inv.amount - sec);
  return inv.invoiceType === InvoiceType.RENTAL && sec > 0.01 && rentPortion < 0.01;
}
