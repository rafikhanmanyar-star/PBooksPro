/**
 * Purchase order billing validation — shared between API and client hints.
 */

import { computeLineTotal, validateBillAgainstReceived } from './goodsReceiptCore.js';
export type PurchaseOrderLifecycleStatus =
  | 'Draft'
  | 'Submitted'
  | 'Approved'
  | 'Partially Billed'
  | 'Fully Billed'
  | 'Cancelled';

export const PO_BILLABLE_STATUSES: readonly PurchaseOrderLifecycleStatus[] = [
  'Approved',
  'Partially Billed',
];

export function computePoBillingStatus(
  totalAmount: number,
  billedAmount: number
): 'Approved' | 'Partially Billed' | 'Fully Billed' {
  if (billedAmount <= 0) return 'Approved';
  if (billedAmount >= totalAmount) return 'Fully Billed';
  return 'Partially Billed';
}

export function validateBillAgainstPurchaseOrder(input: {
  poStatus: string;
  poTotalAmount: number;
  poBilledAmount: number;
  billAmount: number;
  poVendorId: string;
  billVendorId: string;
  excludeBillAmount?: number;
}): { ok: true } | { ok: false; message: string } {
  const status = input.poStatus as PurchaseOrderLifecycleStatus;

  if (status === 'Cancelled') {
    return { ok: false, message: 'Cannot bill against a cancelled purchase order.' };
  }
  if (status === 'Draft' || status === 'Submitted') {
    return { ok: false, message: 'Purchase order must be approved before billing.' };
  }
  if (status === 'Fully Billed') {
    return { ok: false, message: 'Purchase order is fully billed.' };
  }
  if (!PO_BILLABLE_STATUSES.includes(status as PurchaseOrderLifecycleStatus)) {
    return { ok: false, message: `Purchase order status "${status}" does not allow billing.` };
  }

  if (input.poVendorId && input.billVendorId && input.poVendorId !== input.billVendorId) {
    return { ok: false, message: 'Bill vendor must match the purchase order vendor.' };
  }

  const alreadyBilled = Math.max(0, input.poBilledAmount - (input.excludeBillAmount ?? 0));
  const remaining = input.poTotalAmount - alreadyBilled;
  if (input.billAmount > remaining + 0.01) {
    return {
      ok: false,
      message: `Bill amount exceeds remaining PO balance (${remaining.toFixed(2)}).`,
    };
  }

  return { ok: true };
}

export function validateBillAgainstPurchaseOrderWithReceipt(input: {
  poStatus: string;
  poTotalAmount: number;
  poBilledAmount: number;
  poReceivedAmount: number;
  billAmount: number;
  poVendorId: string;
  billVendorId: string;
  excludeBillAmount?: number;
  requireReceipt?: boolean;
}): { ok: true } | { ok: false; message: string } {
  const base = validateBillAgainstPurchaseOrder({
    poStatus: input.poStatus,
    poTotalAmount: input.poTotalAmount,
    poBilledAmount: input.poBilledAmount,
    billAmount: input.billAmount,
    poVendorId: input.poVendorId,
    billVendorId: input.billVendorId,
    excludeBillAmount: input.excludeBillAmount,
  });
  if (!base.ok) return base;

  return validateBillAgainstReceived({
    poReceivedAmount: input.poReceivedAmount,
    poBilledAmount: input.poBilledAmount,
    billAmount: input.billAmount,
    excludeBillAmount: input.excludeBillAmount,
    requireReceipt: input.requireReceipt,
  });
}

export function computeBillableLineQty(
  receivedQty: number,
  alreadyBilledQty: number,
  orderedQty?: number
): number {
  const cap =
    orderedQty != null ? Math.min(Math.max(0, receivedQty), Math.max(0, orderedQty)) : Math.max(0, receivedQty);
  return Math.max(0, cap - Math.max(0, alreadyBilledQty));
}

export function validateBillLineQty(input: {
  orderedQty: number;
  receivedQty: number;
  alreadyBilledQty: number;
  billQty: number;
  itemLabel?: string;
}): { ok: true } | { ok: false; message: string } {
  const billQty = Math.max(0, input.billQty);
  if (billQty <= 0) {
    return { ok: false, message: 'Billed quantity must be greater than zero.' };
  }
  const billable = computeBillableLineQty(input.receivedQty, input.alreadyBilledQty, input.orderedQty);
  if (billQty > billable + 0.0005) {
    const label = input.itemLabel ? ` for ${input.itemLabel}` : '';
    return {
      ok: false,
      message: `Billed quantity${label} (${billQty}) exceeds billable quantity (${billable}).`,
    };
  }
  return { ok: true };
}

export function sumBillPoLineTotals(
  lines: Array<{ lineTotal?: number; billedQty?: number; unitRate?: number }>
): number {
  return lines.reduce((sum, line) => {
    const explicit = line.lineTotal;
    if (typeof explicit === 'number' && Number.isFinite(explicit)) {
      return sum + explicit;
    }
    const qty = Number(line.billedQty ?? 0);
    const rate = Number(line.unitRate ?? 0);
    return sum + computeLineTotal(qty, rate);
  }, 0);
}
