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
