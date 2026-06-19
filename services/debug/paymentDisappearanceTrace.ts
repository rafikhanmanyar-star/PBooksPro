/**
 * TEMPORARY instrumentation for payment-disappearance investigation.
 * Enable via staging on-screen "Payment trace" panel (no DevTools required).
 */
import type { AppState } from '../../types';
import type { Transaction } from '../../types';

const TRACE_KEY = 'pbooks_payment_disappear_trace';
const WATCH_TX_KEY = 'pbooks_payment_trace_watch_tx';
const WATCH_INVOICE_KEY = 'pbooks_payment_trace_watch_invoice';
const MAX_BUFFER = 250;

let memoryTraceEnabled = false;

export type PaymentTraceTxRow = {
  id: string;
  version: number | undefined;
  amount?: number;
  invoiceId?: string;
  billId?: string;
};

export type PaymentTraceWatchTarget = {
  transactionId?: string;
  invoiceId?: string;
};

export type PaymentTraceEntry = {
  ts: string;
  level: 'log' | 'warn';
  site: string;
  detail: string;
  transactionCount?: number;
  beforeCount?: number;
  afterCount?: number;
  transactionId?: string;
  invoiceId?: string;
  amount?: number;
  existsBefore?: boolean;
  existsAfter?: boolean;
  payloadTransactionId?: string;
  payloadTransactionVersion?: number;
  removedTransactionIds?: string[];
  addedTransactionIds?: string[];
  extra?: Record<string, unknown>;
};

export type PaymentListUiTraceInput = {
  component: string;
  sourceTransactionCount: number;
  recordsPropCount: number;
  filteredRecordCount: number;
  displayedRecordCount: number;
  transactions: Transaction[];
  displayedRecords: { id: string; type: string; raw: unknown }[];
  typeFilter?: string;
  dateFilter?: string;
  recordTypeFilter?: string;
};

const buffer: PaymentTraceEntry[] = [];
const listeners = new Set<() => void>();

function notifyListeners(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

export function subscribePaymentTrace(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPaymentTraceBuffer(): readonly PaymentTraceEntry[] {
  return buffer;
}

export function clearPaymentTraceBuffer(): void {
  buffer.length = 0;
  notifyListeners();
}

export function isPaymentDisappearTraceEnabled(): boolean {
  if (memoryTraceEnabled) return true;
  try {
    const env = (import.meta as { env?: { VITE_PAYMENT_DISAPPEARANCE_TRACE?: string } }).env;
    if (env?.VITE_PAYMENT_DISAPPEARANCE_TRACE === 'true') return true;
  } catch {
    /* non-Vite / node test */
  }
  if (typeof window === 'undefined') return false;
  try {
    if (sessionStorage.getItem(TRACE_KEY) === '1') return true;
    return localStorage.getItem(TRACE_KEY) === '1';
  } catch {
    return memoryTraceEnabled;
  }
}

/** Enable/disable from in-app dialog (memory always works; storage best-effort). */
export function getPaymentTraceWatchTarget(): PaymentTraceWatchTarget {
  if (typeof window === 'undefined') return {};
  try {
    const transactionId = localStorage.getItem(WATCH_TX_KEY) || undefined;
    const invoiceId = localStorage.getItem(WATCH_INVOICE_KEY) || undefined;
    return {
      transactionId: transactionId || undefined,
      invoiceId: invoiceId || undefined,
    };
  } catch {
    return {};
  }
}

export function setPaymentTraceWatchTarget(target: PaymentTraceWatchTarget): void {
  if (typeof window === 'undefined') return;
  try {
    if (target.transactionId) localStorage.setItem(WATCH_TX_KEY, target.transactionId);
    else localStorage.removeItem(WATCH_TX_KEY);
    if (target.invoiceId) localStorage.setItem(WATCH_INVOICE_KEY, target.invoiceId);
    else localStorage.removeItem(WATCH_INVOICE_KEY);
  } catch {
    /* ignore */
  }
  pushTraceEntry({
    ts: new Date().toISOString(),
    level: 'log',
    site: 'trace-watch',
    detail: 'watch target updated',
    transactionId: target.transactionId,
    invoiceId: target.invoiceId,
    extra: target,
  });
  notifyListeners();
}

export function clearPaymentTraceWatchTarget(): void {
  setPaymentTraceWatchTarget({});
}

/** DevTools helpers when Vite dev OR payment trace panel / localStorage trace flag is on. */
export function shouldExposePaymentDebugGlobals(): boolean {
  if (import.meta.env.DEV) return true;
  return isPaymentDisappearTraceEnabled();
}

export type PaymentDebugWindow = Window & {
  __appState?: AppState;
  __setPaymentTraceWatch?: (target: PaymentTraceWatchTarget) => void;
  __getPaymentTraceWatch?: () => PaymentTraceWatchTarget;
  __clearPaymentTraceWatch?: () => void;
  __logPaymentTraceBaseline?: () => void;
  __getPaymentTraceSummaries?: () => string[];
};

export function hasPaymentTraceWatchTarget(): boolean {
  const w = getPaymentTraceWatchTarget();
  return Boolean(w.transactionId || w.invoiceId);
}

/** Compact one-line summary per transaction for global ledger export. */
export function summarizeTransactionsForTrace(
  transactions: Transaction[] | undefined | null
): string[] {
  return (transactions ?? []).map((t) => {
    const parts = [
      t.id,
      typeof t.version === 'number' ? `v${t.version}` : 'v-',
      `amt=${t.amount}`,
      t.invoiceId ? `inv=${t.invoiceId}` : '',
      t.billId ? `bill=${t.billId}` : '',
    ].filter(Boolean);
    return parts.join(' ');
  });
}

export function logPaymentTraceSessionBaseline(
  transactions: Transaction[] | undefined | null
): void {
  const rows = snapshotTransactions(transactions);
  const summaries = summarizeTransactionsForTrace(transactions);
  logPaymentTrace('trace-session', 'baseline ledger (global mode)', transactions, {
    globalMode: true,
    transactionSummaries: summaries,
    allTransactionIds: rows.map((r) => r.id),
  });
}

/** Expose `window.__setPaymentTraceWatch` etc. for DevTools isolation checks (staging trace ON). */
export function installPaymentDebugDevGlobals(): void {
  if (typeof window === 'undefined' || !shouldExposePaymentDebugGlobals()) return;
  const w = window as PaymentDebugWindow;
  w.__setPaymentTraceWatch = setPaymentTraceWatchTarget;
  w.__getPaymentTraceWatch = getPaymentTraceWatchTarget;
  w.__clearPaymentTraceWatch = clearPaymentTraceWatchTarget;
  w.__logPaymentTraceBaseline = () => {
    logPaymentTraceSessionBaseline(w.__appState?.transactions);
  };
  w.__getPaymentTraceSummaries = () => summarizeTransactionsForTrace(w.__appState?.transactions);
}

export function syncDevAppStateExposure(state: AppState): void {
  if (typeof window === 'undefined' || !shouldExposePaymentDebugGlobals()) return;
  (window as PaymentDebugWindow).__appState = state;
}

export function setPaymentDisappearTraceEnabled(enabled: boolean): void {
  memoryTraceEnabled = enabled;
  if (typeof window === 'undefined') return;
  try {
    if (enabled) {
      sessionStorage.setItem(TRACE_KEY, '1');
      localStorage.setItem(TRACE_KEY, '1');
    } else {
      sessionStorage.removeItem(TRACE_KEY);
      localStorage.removeItem(TRACE_KEY);
    }
  } catch {
    /* memory flag still applies this session */
  }
  if (enabled) {
    installPaymentDebugDevGlobals();
    queueMicrotask(() => {
      (window as PaymentDebugWindow).__logPaymentTraceBaseline?.();
    });
  }
  pushTraceEntry({
    ts: new Date().toISOString(),
    level: 'log',
    site: 'trace-panel',
    detail: enabled
      ? hasPaymentTraceWatchTarget()
        ? 'tracing enabled (watch filter active)'
        : 'tracing enabled (global — all transactions)'
      : 'tracing disabled',
  });
  notifyListeners();
}

export function snapshotTransactions(transactions: Transaction[] | undefined | null): PaymentTraceTxRow[] {
  return (transactions ?? []).map((t) => ({
    id: t.id,
    version: typeof t.version === 'number' ? t.version : undefined,
    amount: typeof t.amount === 'number' ? t.amount : undefined,
    invoiceId: t.invoiceId,
    billId: t.billId,
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

function pushTraceEntry(entry: PaymentTraceEntry): void {
  if (!isPaymentDisappearTraceEnabled()) return;
  buffer.push(entry);
  while (buffer.length > MAX_BUFFER) buffer.shift();
  notifyListeners();
}

function extraPayloadId(extra?: Record<string, unknown>): string | undefined {
  const id = extra?.payloadTransactionId;
  return typeof id === 'string' ? id : undefined;
}

function extraPayloadVersion(extra?: Record<string, unknown>): number | undefined {
  const v = extra?.payloadTransactionVersion ?? extra?.version;
  return typeof v === 'number' ? v : undefined;
}

export function resolveWatchTarget(tx?: Transaction | null): PaymentTraceWatchTarget {
  const watch = getPaymentTraceWatchTarget();
  return {
    transactionId: tx?.id ?? watch.transactionId,
    invoiceId: tx?.invoiceId ?? watch.invoiceId,
  };
}

export function paymentExistsInList(
  transactions: Transaction[] | undefined | null,
  target: PaymentTraceWatchTarget
): boolean {
  if (!target.transactionId && !target.invoiceId) return false;
  const list = transactions ?? [];
  if (target.transactionId) return list.some((t) => t.id === target.transactionId);
  if (target.invoiceId) {
    return list.some(
      (t) => t.invoiceId === target.invoiceId || t.billId === target.invoiceId
    );
  }
  return false;
}

function findWatchedTransaction(
  transactions: Transaction[] | undefined | null,
  target: PaymentTraceWatchTarget
): Transaction | undefined {
  const list = transactions ?? [];
  if (target.transactionId) return list.find((t) => t.id === target.transactionId);
  if (target.invoiceId) {
    return list.find(
      (t) => t.invoiceId === target.invoiceId || t.billId === target.invoiceId
    );
  }
  return undefined;
}

function paymentTxIdsInState(transactions: Transaction[]): Set<string> {
  const ids = new Set<string>();
  for (const t of transactions) {
    if (t.invoiceId || t.billId) ids.add(t.id);
  }
  return ids;
}

function paymentTxIdsInDisplayedRecords(
  records: PaymentListUiTraceInput['displayedRecords']
): Set<string> {
  const ids = new Set<string>();
  for (const row of records) {
    if (row.type === 'Payment' && row.raw && typeof row.raw === 'object' && 'id' in row.raw) {
      ids.add((row.raw as Transaction).id);
    }
    if (row.type === 'Payment (Bulk)' && row.raw && typeof row.raw === 'object') {
      const bulk = row.raw as Transaction & { children?: Transaction[] };
      for (const c of bulk.children ?? []) ids.add(c.id);
    }
    if (row.type === 'payment' && row.raw && typeof row.raw === 'object' && 'id' in row.raw) {
      ids.add((row.raw as Transaction).id);
    }
  }
  return ids;
}

/** existsBefore only (enter / single-snapshot logs). */
export function buildExistsBeforeExtra(
  before: Transaction[] | undefined | null,
  tx?: Transaction | null
): Record<string, unknown> {
  const target = resolveWatchTarget(tx);
  if (!target.transactionId && !target.invoiceId) return buildPaymentTraceTxExtra(tx);
  const snapshot = findWatchedTransaction(before, target) ?? tx ?? null;
  return {
    ...buildPaymentTraceTxExtra(snapshot),
    existsBefore: paymentExistsInList(before, target),
    watchTransactionId: target.transactionId,
    watchInvoiceId: target.invoiceId,
  };
}

/** existsBefore + existsAfter for transition logs. */
export function buildExistsAfterExtra(
  before: Transaction[] | undefined | null,
  after: Transaction[] | undefined | null,
  tx?: Transaction | null
): Record<string, unknown> {
  const target = resolveWatchTarget(tx);
  if (!target.transactionId && !target.invoiceId) return buildPaymentTraceTxExtra(tx);
  const snapshot = findWatchedTransaction(after, target) ?? findWatchedTransaction(before, target) ?? tx ?? null;
  return {
    ...buildPaymentTraceTxExtra(snapshot),
    existsBefore: paymentExistsInList(before, target),
    existsAfter: paymentExistsInList(after, target),
    watchTransactionId: target.transactionId,
    watchInvoiceId: target.invoiceId,
  };
}

function paymentVisibleInDisplayedRecords(
  records: PaymentListUiTraceInput['displayedRecords'],
  target: PaymentTraceWatchTarget
): boolean {
  if (!target.transactionId && !target.invoiceId) return false;
  for (const row of records) {
    if (row.type === 'Payment' && row.raw && typeof row.raw === 'object' && 'id' in row.raw) {
      const tx = row.raw as Transaction;
      if (target.transactionId && tx.id === target.transactionId) return true;
      if (target.invoiceId && (tx.invoiceId === target.invoiceId || tx.billId === target.invoiceId)) {
        return true;
      }
    }
    if (row.type === 'Payment (Bulk)' && row.raw && typeof row.raw === 'object') {
      const bulk = row.raw as Transaction & { children?: Transaction[] };
      const children = bulk.children ?? [];
      if (target.transactionId && children.some((c) => c.id === target.transactionId)) return true;
      if (
        target.invoiceId &&
        children.some((c) => c.invoiceId === target.invoiceId || c.billId === target.invoiceId)
      ) {
        return true;
      }
    }
    if (row.type === 'payment' && row.raw && typeof row.raw === 'object' && 'id' in row.raw) {
      const tx = row.raw as Transaction;
      if (target.transactionId && tx.id === target.transactionId) return true;
      if (target.invoiceId && (tx.invoiceId === target.invoiceId || tx.billId === target.invoiceId)) {
        return true;
      }
    }
  }
  return false;
}

/** UI layer: state vs displayed list (global or watch-filtered). */
export function logPaymentListUiTrace(input: PaymentListUiTraceInput): void {
  if (!isPaymentDisappearTraceEnabled()) return;
  const target = resolveWatchTarget();
  const useWatch = Boolean(target.transactionId || target.invoiceId);
  const ts = new Date().toISOString();
  const statePaymentIds = paymentTxIdsInState(input.transactions);
  const displayedPaymentIds = paymentTxIdsInDisplayedRecords(input.displayedRecords);
  const hiddenInUi = [...statePaymentIds].filter((id) => !displayedPaymentIds.has(id));
  const extraInUi = [...displayedPaymentIds].filter((id) => !statePaymentIds.has(id));

  const paymentInSource = useWatch
    ? paymentExistsInList(input.transactions, target)
    : statePaymentIds.size > 0;
  const paymentInDisplayed = useWatch
    ? paymentVisibleInDisplayedRecords(input.displayedRecords, target)
    : displayedPaymentIds.size > 0;

  const payload = {
    timestamp: ts,
    component: input.component,
    globalMode: !useWatch,
    sourceTransactionCount: input.sourceTransactionCount,
    statePaymentCount: statePaymentIds.size,
    displayedPaymentCount: displayedPaymentIds.size,
    recordsPropCount: input.recordsPropCount,
    filteredRecordCount: input.filteredRecordCount,
    displayedRecordCount: input.displayedRecordCount,
    typeFilter: input.typeFilter,
    dateFilter: input.dateFilter,
    recordTypeFilter: input.recordTypeFilter,
    paymentInSourceList: paymentInSource,
    paymentInDisplayedList: paymentInDisplayed,
    hiddenPaymentIds: hiddenInUi,
    extraDisplayedPaymentIds: extraInUi,
    statePaymentSummaries: summarizeTransactionsForTrace(
      input.transactions.filter((t) => statePaymentIds.has(t.id))
    ),
    ...buildExistsAfterExtra(input.transactions, input.transactions),
  };
  const stateHidden = hiddenInUi.length > 0;
  const level = stateHidden ? 'warn' : 'log';
  const prefix = `[payment-disappear-trace] ${ts} payment-list-ui ${input.component}`;
  if (stateHidden) console.warn(prefix, 'PAYMENTS_IN_STATE_NOT_IN_UI', payload);
  else console.log(prefix, payload);
  pushTraceEntry({
    ts,
    level,
    site: 'payment-list-ui',
    detail: `${input.component}${stateHidden ? ' PAYMENTS_IN_STATE_NOT_IN_UI' : ''}`,
    transactionCount: input.sourceTransactionCount,
    beforeCount: input.recordsPropCount,
    afterCount: input.displayedRecordCount,
    existsBefore: paymentInSource,
    existsAfter: paymentInDisplayed,
    removedTransactionIds: stateHidden ? hiddenInUi : undefined,
    ...traceMetaFromExtra(payload),
    extra: payload,
  });
}

/** BATCH_UPSERT_ENTITIES reducer / sync chunk path. */
export function logPaymentTraceBatchUpsert(
  detail: string,
  before: Transaction[] | undefined | null,
  after: Transaction[] | undefined | null,
  entities: Record<string, unknown>,
  extra?: Record<string, unknown>
): void {
  const upserted = Array.isArray(entities.transactions) ? (entities.transactions as Transaction[]) : [];
  const watchTx = upserted.find((t) => {
    const target = resolveWatchTarget(t);
    return Boolean(target.transactionId || target.invoiceId);
  });
  logPaymentTraceTransition('BATCH_UPSERT_ENTITIES', detail, before, after, {
    upsertedTransactionIds: upserted.map((t) => t.id),
    upsertedTransactionCount: upserted.length,
    entityKeys: Object.keys(entities),
    ...buildExistsAfterExtra(before, after, watchTx ?? upserted[0] ?? null),
    ...extra,
  });
}

/** Standard ADD_TRANSACTION / payload fields for lifecycle tracing. */
export function buildPaymentTraceTxExtra(
  tx: Transaction | undefined | null,
  more?: Record<string, unknown>
): Record<string, unknown> {
  if (!tx) return { ...more };
  return {
    transactionId: tx.id,
    invoiceId: tx.invoiceId,
    billId: tx.billId,
    amount: tx.amount,
    version: typeof tx.version === 'number' ? tx.version : undefined,
    payloadTransactionId: tx.id,
    payloadTransactionVersion: typeof tx.version === 'number' ? tx.version : undefined,
    ...more,
  };
}

function traceMetaFromExtra(extra?: Record<string, unknown>): Pick<
  PaymentTraceEntry,
  | 'transactionId'
  | 'invoiceId'
  | 'amount'
  | 'existsBefore'
  | 'existsAfter'
  | 'payloadTransactionId'
  | 'payloadTransactionVersion'
> {
  const transactionId =
    (typeof extra?.transactionId === 'string' ? extra.transactionId : undefined) ??
    extraPayloadId(extra);
  const invoiceId = typeof extra?.invoiceId === 'string' ? extra.invoiceId : undefined;
  const amount = typeof extra?.amount === 'number' ? extra.amount : undefined;
  const existsBefore = typeof extra?.existsBefore === 'boolean' ? extra.existsBefore : undefined;
  const existsAfter = typeof extra?.existsAfter === 'boolean' ? extra.existsAfter : undefined;
  return {
    transactionId,
    invoiceId,
    amount,
    existsBefore,
    existsAfter,
    payloadTransactionId: transactionId,
    payloadTransactionVersion: extraPayloadVersion(extra),
  };
}

/** ADD_TRANSACTION lifecycle: before/after counts + tx id, invoice, amount, version. */
export function logPaymentTraceAddTransaction(
  detail: string,
  before: Transaction[] | undefined | null,
  after: Transaction[] | undefined | null,
  tx: Transaction | undefined | null,
  extra?: Record<string, unknown>
): void {
  const beforeCount = (before ?? []).length;
  const afterCount = (after ?? []).length;
  logPaymentTraceTransition('ADD_TRANSACTION', detail, before, after, {
    ...buildExistsAfterExtra(before, after, tx),
    transactionCountBefore: beforeCount,
    transactionCountAfter: afterCount,
    ...extra,
  });
}

/** ADD_TRANSACTION enter (no after state yet). */
export function logPaymentTraceAddTransactionEnter(
  detail: string,
  before: Transaction[] | undefined | null,
  tx: Transaction,
  extra?: Record<string, unknown>
): void {
  const beforeCount = (before ?? []).length;
  logPaymentTrace('ADD_TRANSACTION', detail, before, {
    ...buildExistsBeforeExtra(before, tx),
    transactionCountBefore: beforeCount,
    ...extra,
  });
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
  const payload = {
    timestamp: ts,
    transactionCount: rows.length,
    transactions: rows,
    ...extra,
  };
  console.log(`[payment-disappear-trace] ${ts} ${site} ${detail}`, payload);
  pushTraceEntry({
    ts,
    level: 'log',
    site,
    detail,
    transactionCount: rows.length,
    beforeCount: typeof extra?.transactionCountBefore === 'number' ? extra.transactionCountBefore : undefined,
    ...traceMetaFromExtra(extra),
    extra: { transactions: rows, ...extra },
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
  const existsMerged =
    extra?.existsBefore === undefined && extra?.existsAfter === undefined
      ? buildExistsAfterExtra(before, after)
      : {};
  const payload = {
    timestamp: ts,
    beforeCount: beforeRows.length,
    afterCount: afterRows.length,
    beforeTransactions: beforeRows,
    afterTransactions: afterRows,
    removedTransactionIds: removed,
    addedTransactionIds: added,
    addedSummaries: added.map((id) => {
      const row = afterRows.find((r) => r.id === id);
      const tx = (after ?? []).find((t) => t.id === id);
      return row && tx
        ? `${id} v${row.version ?? '-'} amt=${row.amount ?? tx.amount} inv=${row.invoiceId ?? tx.invoiceId ?? '-'} bill=${row.billId ?? tx.billId ?? '-'}`
        : id;
    }),
    removedSummaries: removed.map((id) => {
      const row = beforeRows.find((r) => r.id === id);
      const tx = (before ?? []).find((t) => t.id === id);
      return row && tx
        ? `${id} v${row.version ?? '-'} amt=${row.amount ?? tx.amount} inv=${row.invoiceId ?? tx.invoiceId ?? '-'} bill=${row.billId ?? tx.billId ?? '-'}`
        : id;
    }),
    ...existsMerged,
    ...extra,
  };
  if (removed.length > 0) {
    console.warn(`[payment-disappear-trace] ${ts} ${site} ${detail} REMOVED_IDS`, payload);
  } else if (added.length > 0) {
    console.log(`[payment-disappear-trace] ${ts} ${site} ${detail} ADDED_IDS`, payload);
  } else {
    console.log(`[payment-disappear-trace] ${ts} ${site} ${detail}`, payload);
  }
  pushTraceEntry({
    ts,
    level: removed.length > 0 ? 'warn' : 'log',
    site,
    detail:
      removed.length > 0
        ? `${detail} REMOVED_IDS`
        : added.length > 0
          ? `${detail} ADDED_IDS`
          : detail,
    beforeCount:
      typeof extra?.transactionCountBefore === 'number' ? extra.transactionCountBefore : beforeRows.length,
    afterCount:
      typeof extra?.transactionCountAfter === 'number' ? extra.transactionCountAfter : afterRows.length,
    removedTransactionIds: removed.length > 0 ? removed : undefined,
    addedTransactionIds: added.length > 0 ? added : undefined,
    ...traceMetaFromExtra(extra),
    extra: payload,
  });
}

export function formatPaymentTraceForExport(entries: readonly PaymentTraceEntry[]): string {
  return entries
    .map((e) => {
      const added = e.addedTransactionIds ?? (e.extra?.addedTransactionIds as string[] | undefined);
      const parts = [
        e.ts,
        e.level.toUpperCase(),
        e.site,
        e.detail,
        e.transactionCount != null ? `count=${e.transactionCount}` : '',
        e.beforeCount != null ? `before=${e.beforeCount}` : '',
        e.afterCount != null ? `after=${e.afterCount}` : '',
        e.transactionId ? `tx=${e.transactionId}` : '',
        e.invoiceId ? `inv=${e.invoiceId}` : '',
        e.amount != null ? `amt=${e.amount}` : '',
        e.existsBefore != null ? `existsBefore=${e.existsBefore}` : '',
        e.existsAfter != null ? `existsAfter=${e.existsAfter}` : '',
        e.payloadTransactionVersion != null ? `v=${e.payloadTransactionVersion}` : '',
        added?.length ? `ADDED=[${added.join(',')}]` : '',
        e.removedTransactionIds?.length ? `REMOVED=[${e.removedTransactionIds.join(',')}]` : '',
      ].filter(Boolean);
      const addedSummaries = e.extra?.addedSummaries as string[] | undefined;
      const removedSummaries = e.extra?.removedSummaries as string[] | undefined;
      const summaries = e.extra?.transactionSummaries as string[] | undefined;
      const hidden = e.extra?.hiddenPaymentIds as string[] | undefined;
      let line = parts.join(' | ');
      if (addedSummaries?.length) line += `\n  + ${addedSummaries.join('\n  + ')}`;
      if (removedSummaries?.length) line += `\n  - ${removedSummaries.join('\n  - ')}`;
      if (hidden?.length) line += `\n  UI_HIDDEN=[${hidden.join(', ')}]`;
      if (summaries?.length && e.site === 'trace-session') {
        line += `\n  LEDGER:\n  ${summaries.join('\n  ')}`;
      }
      return line;
    })
    .join('\n');
}
