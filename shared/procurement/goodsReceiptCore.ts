/**
 * Goods receipt validation — shared between API and client hints.
 */

export type GoodsReceiptStatus = 'Draft' | 'Posted' | 'Closed';

export const GRN_POSTABLE_PO_STATUSES = ['Approved', 'Partially Billed', 'Fully Billed'] as const;

export function computeRemainingQty(orderedQty: number, receivedQty: number): number {
  return Math.max(0, orderedQty - receivedQty);
}

export function validateReceiptLineQty(input: {
  orderedQty: number;
  alreadyReceivedQty: number;
  receiptQty: number;
  itemLabel?: string;
}): { ok: true } | { ok: false; message: string } {
  const ordered = Math.max(0, input.orderedQty);
  const already = Math.max(0, input.alreadyReceivedQty);
  const receipt = Math.max(0, input.receiptQty);

  if (receipt <= 0) {
    return { ok: false, message: 'Received quantity must be greater than zero.' };
  }

  const remaining = computeRemainingQty(ordered, already);
  if (receipt > remaining + 0.0005) {
    const label = input.itemLabel ? ` for ${input.itemLabel}` : '';
    return {
      ok: false,
      message: `Received quantity${label} (${receipt}) exceeds remaining ordered quantity (${remaining}).`,
    };
  }

  return { ok: true };
}

export function validateBillAgainstReceived(input: {
  poReceivedAmount: number;
  poBilledAmount: number;
  billAmount: number;
  excludeBillAmount?: number;
  requireReceipt?: boolean;
}): { ok: true } | { ok: false; message: string } {
  const received = Math.max(0, input.poReceivedAmount);
  const alreadyBilled = Math.max(0, input.poBilledAmount - (input.excludeBillAmount ?? 0));

  if (input.requireReceipt !== false && received <= 0) {
    return {
      ok: false,
      message: 'Goods must be received before billing this purchase order.',
    };
  }

  const billableRemaining = received - alreadyBilled;
  if (input.billAmount > billableRemaining + 0.01) {
    return {
      ok: false,
      message: `Bill amount exceeds received value not yet billed (${Math.max(0, billableRemaining).toFixed(2)}).`,
    };
  }

  return { ok: true };
}

export function computeLineTotal(receivedQty: number, unitRate: number): number {
  return Math.round(receivedQty * unitRate * 100) / 100;
}
