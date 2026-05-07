import type { Invoice } from '../types';
import { InvoiceStatus, InvoiceType } from '../types';
import { isActiveInvoice } from './invoiceActive';

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

/** Invoices billed for collecting the security deposit (not rent+charges combined). */
export function isSecurityDepositBillingInvoice(inv: Invoice): boolean {
  return isPureSecurityDepositInvoice(inv);
}

const OUTSTANDING_EPS = 0.02;

/** Security deposit invoices that still owe collection (paid amount below invoice total). */
export function isOutstandingSecurityDepositBillingInvoice(inv: Invoice): boolean {
  if (!isActiveInvoice(inv) || inv.status === InvoiceStatus.DRAFT) return false;
  if (!isSecurityDepositBillingInvoice(inv)) return false;
  const amt = typeof inv.amount === 'number' ? inv.amount : parseFloat(String(inv.amount)) || 0;
  const paid = typeof inv.paidAmount === 'number' ? inv.paidAmount : parseFloat(String(inv.paidAmount)) || 0;
  return amt - paid > OUTSTANDING_EPS;
}

/** Blocking list for releasing held security until these are paid or corrected. */
export function getOutstandingSecurityDepositInvoicesForProperty(
  invoices: Invoice[],
  propertyId: string | undefined
): Invoice[] {
  if (!propertyId) return [];
  const pid = String(propertyId);
  return invoices.filter(
    (inv) => String(inv.propertyId || '') === pid && isOutstandingSecurityDepositBillingInvoice(inv)
  );
}
