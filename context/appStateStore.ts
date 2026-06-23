import type React from 'react';
import type { AppState, AppAction } from '../types';

let _appState: AppState | null = null;
let _appDispatch: React.Dispatch<AppAction> | null = null;
let _initialDataLoading = false;
let _appDataLoading = false;
let _pageChunkLoadingCount = 0;
let _apiHydrationLoading = false;
export type BootstrapSoftFailureState = {
  active: boolean;
  message: string | null;
};
let _bootstrapSoftFailure: BootstrapSoftFailureState = { active: false, message: null };
const _stateListeners = new Set<() => void>();
export function _getAppState(): AppState { return _appState!; }
export function _getAppDispatch(): React.Dispatch<AppAction> { return _appDispatch!; }
export function _getInitialDataLoading(): boolean { return _initialDataLoading; }
export function _getAppDataLoading(): boolean {
    return _appDataLoading || _apiHydrationLoading || _pageChunkLoadingCount > 0;
}
export function _getPageChunkLoading(): boolean { return _pageChunkLoadingCount > 0; }
export function _getBootstrapSoftFailure(): BootstrapSoftFailureState {
  return _bootstrapSoftFailure;
}
export function _setBootstrapSoftFailure(active: boolean, message: string | null): void {
  if (_bootstrapSoftFailure.active === active && _bootstrapSoftFailure.message === message) return;
  _bootstrapSoftFailure = { active, message };
  _notifyStateListeners();
}
export function _subscribeAppState(listener: () => void): () => void {
    _stateListeners.add(listener);
    return () => { _stateListeners.delete(listener); };
}
let _notifyScheduled = false;
export function _notifyStateListeners() {
    if (_notifyScheduled) return;
    _notifyScheduled = true;
    queueMicrotask(() => {
        _notifyScheduled = false;
        _stateListeners.forEach(l => l());
    });
}

/**
 * Serialize PostgreSQL API writes for the same transaction id. Concurrent POST /transactions
 * with the same stale client `version` causes 409 CONFLICT even for a single user; the first
 * upsert succeeds and bumps `version`, the second fails and triggers a spurious "another user" modal.
 */
const transactionApiSaveQueues = new Map<string, Promise<void>>();

/** Avoid refetching large rollup payloads on every socket/tab refresh (still invalidate immediately on tx writes). */
export const RENTAL_ROLLUP_SYNC_INVALIDATE_MIN_MS = 90_000;
export let rentalRollupLastInvalidateAfterSyncAt = 0;

export function enqueueTransactionApiSave(txId: string, task: () => Promise<void>): Promise<void> {
    const previous = transactionApiSaveQueues.get(txId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(() => task());
    transactionApiSaveQueues.set(txId, next);
    return next;
}

/**
 * Serialize PostgreSQL POST /invoices so bulk "Generate Due" runs do not fire dozens of parallel
 * upserts (duplicate invoice_number races, server load). One global queue per session.
 */
let invoiceApiSaveQueue: Promise<void> = Promise.resolve();

export function enqueueInvoiceApiSave(task: () => Promise<void>): Promise<void> {
    const next = invoiceApiSaveQueue.catch(() => {}).then(() => task());
    invoiceApiSaveQueue = next.catch(() => {});
    return next;
}

/** Wait until all queued invoice API saves have finished (success or failure). */
export async function waitForInvoiceApiSaveIdle(): Promise<void> {
    await invoiceApiSaveQueue;
}

export function _setAppState(state: AppState): void { _appState = state; }
export function _setAppDispatch(dispatch: React.Dispatch<AppAction>): void { _appDispatch = dispatch; }
export function _setInitialDataLoading(loading: boolean): void { _initialDataLoading = loading; }
export function _setAppDataLoading(loading: boolean): void {
    if (_appDataLoading === loading) return;
    _appDataLoading = loading;
    _notifyStateListeners();
}
export function _setApiHydrationLoading(loading: boolean): void {
    if (_apiHydrationLoading === loading) return;
    _apiHydrationLoading = loading;
    _notifyStateListeners();
}
export function _incrementPageChunkLoading(): void {
    _pageChunkLoadingCount += 1;
    _notifyStateListeners();
}
export function _decrementPageChunkLoading(): void {
    _pageChunkLoadingCount = Math.max(0, _pageChunkLoadingCount - 1);
    _notifyStateListeners();
}

export function getRentalRollupLastInvalidateAfterSyncAt(): number {
  return rentalRollupLastInvalidateAfterSyncAt;
}

export function setRentalRollupLastInvalidateAfterSyncAt(now: number): void {
  rentalRollupLastInvalidateAfterSyncAt = now;
}
