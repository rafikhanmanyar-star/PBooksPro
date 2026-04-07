/**
 * Sync payslip paid status from transactions when a salary payment is deleted or edited
 * from the transaction page or any report. Recalculates paid_amount from remaining/updated
 * transactions and sets unpaid/updated status accordingly.
 * Updates the run to DRAFT when it no longer has all payslips paid.
 */

import { PayrollStatus } from '../types';
import { storageService } from './storageService';

/** Transaction-like shape used to recalc payslip paid amount from app state transactions. */
export interface TransactionLike {
  payslipId?: string;
  amount: number;
  date?: string;
  id?: string;
}

export function getTenantIdForPayroll(): string {
  if (typeof window === 'undefined') return 'local';
  return window.localStorage.getItem('tenant_id') || 'local';
}

/**
 * Recalculate and persist a payslip's paid_amount and status from the given list of
 * transactions (e.g. after a delete or edit). If no transactions reference this payslip,
 * or total is 0, the payslip is set to unpaid.
 */
export function syncPayslipPaidFromTransactions(
  tenantId: string,
  payslipId: string,
  transactions: TransactionLike[]
): void {
  if (!tenantId || !payslipId) return;
  const payslips = storageService.getPayslips(tenantId);
  const ps = payslips.find(p => p.id === payslipId);
  if (!ps) return;

  const forThisPayslip = transactions.filter(
    (t) => t.payslipId === payslipId && typeof t.amount === 'number'
  );
  const totalPaid = forThisPayslip.reduce(
    (sum, t) => sum + (typeof t.amount === 'number' ? t.amount : Number(t.amount) || 0),
    0
  );
  const netPay = typeof ps.net_pay === 'number' ? ps.net_pay : Number(ps.net_pay) || 0;
  const isFullyPaid = totalPaid >= netPay - 0.01;
  const withDate = forThisPayslip.filter((t) => t.date);
  const lastTx =
    withDate.length > 0
      ? withDate.reduce((a, b) => (a.date && b.date && a.date < b.date ? b : a))
      : null;
  const firstTxId = forThisPayslip.length === 1 ? forThisPayslip[0].id : undefined;

  const updated = {
    ...ps,
    is_paid: isFullyPaid,
    paid_amount: totalPaid,
    paid_at: isFullyPaid && lastTx?.date ? lastTx.date : totalPaid > 0 && lastTx?.date ? lastTx.date : undefined,
    transaction_id: firstTxId,
    updated_at: new Date().toISOString()
  };
  storageService.updatePayslip(tenantId, updated);

  const runId = ps.payroll_run_id;
  const runs = storageService.getPayrollRuns(tenantId);
  const run = runs.find(r => r.id === runId);
  if (run && run.status === PayrollStatus.PAID) {
    const runPayslips = storageService.getPayslips(tenantId).filter(p => p.payroll_run_id === runId);
    const allPaid = runPayslips.every(p => p.is_paid);
    if (!allPaid) {
      storageService.updatePayrollRun(tenantId, {
        ...run,
        status: PayrollStatus.DRAFT,
        paid_at: undefined,
        updated_at: new Date().toISOString()
      }, 'system');
    }
  }
}

/**
 * Revert payslip to unpaid (paid_amount = 0). Use when you only need to clear payment,
 * e.g. legacy callers. Prefer syncPayslipPaidFromTransactions when you have the
 * effective transaction list after delete/edit.
 */
export function revertPayslipToUnpaid(tenantId: string, payslipId: string): void {
  syncPayslipPaidFromTransactions(tenantId, payslipId, []);
}
