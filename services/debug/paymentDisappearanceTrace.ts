/**
 * TEMPORARY instrumentation for payment-disappearance investigation.
 * Enable: localStorage.setItem('pbooks_payment_disappear_trace', '1') then reload.
 * Disable: localStorage.removeItem('pbooks_payment_disappear_trace')
 */
import type { Transaction } from '../../types';

const TRACE_KEY = 'pbooks_payment_disappear_trace';

export function isPaymentDisappearTraceEnabled(): boolean {
  try {
    const env = (import.meta as { env?: { VITE_PAYMENT_DISAPPEARANCE_TRACE?: string } }).env;
    if (env?.VITE_PAYMENT_DISAPPEARANCE_TRACE === 'true') return true;
  } catch {
    /* non-Vite / node test */
  }
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(TRACE_KEY) === '1';
  } catch {
    return false;
  }
}

export type PaymentTraceTxRow = { id: string; version: number | undefined };

export function snapshotTransactions(transactions: Transaction[] | undefined | null): PaymentTraceTxRow[] {
  return (transactions ?? []).map((t) => ({
    id: t.id,
    version: typeof t.version === 'number' ? t.version : undefined,
  }));
}

function removedIds(before: PaymentTraceTxRow[], after: PaymentTraceTxRow[]): string[] {
  const afterSet = new Set(after.map((t) => t.id));
  return before.filter((t) => !afterSet.has(t.id)).map((t) => t.id);
}

function addedIds(before: PaymentTraceTxRow[], after: PaymentTraceTxRow[]): string[] {
  const beforeSet = new Set(before.map((t) => t.id));
  return after.filter((t) => !beforeSet.has(t.id)).map((t) => t.id);
}

/** Console log with required fields: ids, versions, count, timestamp. */
export function logPaymentTrace(
  site: string,
  detail: string,
  transactions: Transaction[] | undefined | null,
  extra?: Record<string, unknown>
): void {
  if (!isPaymentDisappearTraceEnabled()) return;
  const rows = snapshotTransactions(transactions);
  const ts = new Date().toISOString();
  console.log(`[payment-disappear-trace] ${ts} ${site} ${detail}`, {
    timestamp: ts,
    transactionCount: rows.length,
    transactions: rows,
    ...extra,
  });
}

/** Log before → after and highlight removed transaction ids (likely payment disappearance). */
export function logPaymentTraceTransition(
  site: string,
  detail: string,
  before: Transaction[] | undefined | null,
  after: Transaction[] | undefined | null,
  extra?: Record<string, unknown>
): void {
  if (!isPaymentDisappearTraceEnabled()) return;
  const beforeRows = snapshotTransactions(before);
  const afterRows = snapshotTransactions(after);
  const ts = new Date().toISOString();
  const removed = removedIds(beforeRows, afterRows);
  const added = addedIds(beforeRows, afterRows);
  const payload = {
    timestamp: ts,
    beforeCount: beforeRows.length,
    afterCount: afterRows.length,
    beforeTransactions: beforeRows,
    afterTransactions: afterRows,
    removedTransactionIds: removed,
    addedTransactionIds: added,
    ...extra,
  };
  if (removed.length > 0) {
    console.warn(`[payment-disappear-trace] ${ts} ${site} ${detail} REMOVED_IDS`, payload);
  } else {
    console.log(`[payment-disappear-trace] ${ts} ${site} ${detail}`, payload);
  }
}
