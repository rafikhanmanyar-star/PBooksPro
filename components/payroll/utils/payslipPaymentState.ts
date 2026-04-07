/**
 * Single place for payslip paid / remaining logic.
 * Fixes inconsistent rows where is_paid is true but paid_amount was never backfilled (or paid_amount >= net but flag missing).
 */

import { roundToTwo } from './formatters';

const EPS = 0.01;

export function coercePayslipAmounts(
  netPayIn: number | string | null | undefined,
  paidAmountIn: number | string | null | undefined,
  isPaidIn: boolean | null | undefined
): { net_pay: number; paid_amount: number; is_paid: boolean } {
  const net = roundToTwo(typeof netPayIn === 'string' ? parseFloat(netPayIn) : Number(netPayIn ?? 0));
  let paid = roundToTwo(typeof paidAmountIn === 'string' ? parseFloat(String(paidAmountIn)) : Number(paidAmountIn ?? 0));
  let isPaid = !!isPaidIn;
  if (!isPaid && net >= 0 && paid >= net - EPS) {
    isPaid = true;
    paid = Math.max(paid, net);
  }
  if (isPaid && net > EPS && paid < net - EPS) {
    paid = net;
  }
  return { net_pay: net, paid_amount: paid, is_paid: isPaid };
}

export function payslipIsFullyPaid(ps: { is_paid?: boolean; paid_amount?: number; net_pay?: number }): boolean {
  return coercePayslipAmounts(ps.net_pay, ps.paid_amount, ps.is_paid).is_paid;
}

/** Amount paid toward this payslip (for display / totals). */
export function payslipDisplayPaidAmount(ps: { is_paid?: boolean; paid_amount?: number; net_pay?: number }): number {
  return coercePayslipAmounts(ps.net_pay, ps.paid_amount, ps.is_paid).paid_amount;
}

/** Salary still owed (0 when fully paid). */
export function payslipRemainingAmount(ps: { is_paid?: boolean; paid_amount?: number; net_pay?: number }): number {
  const c = coercePayslipAmounts(ps.net_pay, ps.paid_amount, ps.is_paid);
  if (c.is_paid) return 0;
  return Math.max(0, roundToTwo(c.net_pay - c.paid_amount));
}
