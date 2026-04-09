/**
 * Shared utilities for financial reports (Balance Sheet, P&L, Cash Flow).
 * Used to avoid duplicated project-resolution and voided-invoice logic.
 */

import type { Transaction, Invoice, Bill, ProjectAgreement } from '../../types';

/** Minimal state slice required for report helpers. */
export interface ReportStateSlice {
  invoices: Invoice[];
  bills: Bill[];
  projectAgreements?: ProjectAgreement[];
}

/**
 * Resolve projectId for a transaction from linked invoice or bill when missing on the transaction.
 * Used consistently across Balance Sheet, P&L, and Cash Flow reports.
 */
export function resolveProjectIdForTransaction(
  tx: Transaction,
  state: ReportStateSlice
): string | undefined {
  let projectId = tx.projectId;
  if (!projectId && tx.billId) {
    const bill = state.bills.find((b) => b.id === tx.billId);
    if (bill) projectId = bill.projectId;
  }
  if (!projectId && tx.invoiceId) {
    const inv = state.invoices.find((i) => i.id === tx.invoiceId);
    if (inv) projectId = inv.projectId;
  }
  return projectId;
}

/**
 * Returns true if the transaction is linked to an invoice that is voided or from a cancelled agreement.
 * Such transactions should be excluded from P&L and Cash Flow (operating) to avoid including voided revenue.
 */
export function isTransactionFromVoidedOrCancelledInvoice(
  tx: Transaction,
  state: ReportStateSlice
): boolean {
  if (!tx.invoiceId) return false;
  const inv = state.invoices.find((i) => i.id === tx.invoiceId);
  if (!inv) return false;
  if (inv.description?.includes('VOIDED')) return true;
  if (inv.agreementId && state.projectAgreements?.length) {
    const agreement = state.projectAgreements.find((pa) => pa.id === inv.agreementId);
    if (agreement && agreement.status === 'Cancelled') return true;
  }
  return false;
}

/**
 * Transactions for project-scoped Trial Balance (same project resolution and void rules as P&amp;L).
 */
export function filterTransactionsForTrialBalanceProjectScope(
  transactions: Transaction[],
  projectId: string,
  state: ReportStateSlice
): Transaction[] {
  if (projectId === 'all') {
    return transactions.filter((t) => !(t as { deletedAt?: string }).deletedAt);
  }
  return transactions.filter((t) => {
    if ((t as { deletedAt?: string }).deletedAt) return false;
    if (isTransactionFromVoidedOrCancelledInvoice(t, state)) return false;
    const pid = resolveProjectIdForTransaction(t, state);
    return pid === projectId;
  });
}
