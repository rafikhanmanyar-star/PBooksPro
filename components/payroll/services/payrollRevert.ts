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
  return (
    window.localStorage.getItem('tenant_id') ||
    window.localStorage.getItem('last_tenant_id') ||
    'local'
  );
}

/** Minimal transaction shape for collecting affected payslip ids. */
export type TransactionPayslipSyncInput = {
  id?: string;
  payslipId?: string;
  amount: number;
  date?: string;
};

/**
 * After transaction mutations, recompute each affected payslip's paid_amount / is_paid from the
 * current transaction list and persist via storage (local + SQLite). Call from the app reducer
 * layer so local-only and API client state stay aligned with the ledger.
 */
export function syncPayslipsAfterTransactionAction(
  tenantId: string,
  actionType: string,
  payload: unknown,
  prevTxs: TransactionPayslipSyncInput[],
  nextTxs: TransactionPayslipSyncInput[]
): void {
  if (!tenantId) return;

  const ids = new Set<string>();
  const add = (pid?: string) => {
    if (pid && String(pid).trim()) ids.add(String(pid).trim());
  };

  switch (actionType) {
    case 'DELETE_TRANSACTION': {
      const id = payload as string;
      const tx = prevTxs.find((t) => t.id === id);
      add(tx?.payslipId);
      break;
    }
    case 'BATCH_DELETE_TRANSACTIONS': {
      const { transactionIds } = (payload as { transactionIds?: string[] }) || {};
      for (const tid of transactionIds || []) {
        const tx = prevTxs.find((t) => t.id === tid);
        add(tx?.payslipId);
      }
      break;
    }
    case 'UPDATE_TRANSACTION': {
      const updated = payload as TransactionPayslipSyncInput & { id: string };
      const orig = prevTxs.find((t) => t.id === updated.id);
      add(orig?.payslipId);
      add(updated.payslipId);
      break;
    }
    case 'ADD_TRANSACTION':
    case 'RESTORE_TRANSACTION': {
      const tx = payload as TransactionPayslipSyncInput;
      add(tx.payslipId);
      break;
    }
    case 'BATCH_ADD_TRANSACTIONS': {
      for (const tx of (payload as TransactionPayslipSyncInput[]) || []) add(tx.payslipId);
      break;
    }
    default:
      return;
  }

  if (ids.size === 0) return;

  const like = (t: TransactionPayslipSyncInput): TransactionLike => ({
    payslipId: t.payslipId,
    amount: t.amount,
    date: t.date,
    id: t.id,
  });
  const nextLike = nextTxs.map(like);
  for (const pid of ids) {
    syncPayslipPaidFromTransactions(tenantId, pid, nextLike);
  }
}

/**
 * Recalculate and persist a payslip's paid_amount and status from the given list of
 * transactions (e.g. after a delete or edit). If no transactions reference this payslip,
 * paid_amount becomes 0 and the payslip is unpaid.
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
