import { AsyncLocalStorage } from 'node:async_hooks';
import { emitFinancialPosted, type FinancialPostedPayload } from './realtime.js';

type QueuedFinancialPosted = { tenantId: string; payload: FinancialPostedPayload };

const financialPostedQueueStorage = new AsyncLocalStorage<QueuedFinancialPosted[]>();

/**
 * Queue a financial.posted emission during an open DB transaction.
 * Flushed by `withTransaction` after COMMIT via `flushFinancialPostedQueue`.
 * When no transaction queue is active, emits immediately (caller must be post-commit).
 */
export function queueFinancialPosted(tenantId: string, payload: FinancialPostedPayload): void {
  const queue = financialPostedQueueStorage.getStore();
  if (queue) {
    queue.push({ tenantId, payload });
    return;
  }
  emitFinancialPosted(tenantId, payload);
}

/** Emit all queued financial.posted events (call only after successful COMMIT). */
export function flushFinancialPostedQueue(): void {
  const queue = financialPostedQueueStorage.getStore();
  if (!queue?.length) return;
  for (const item of queue) {
    emitFinancialPosted(item.tenantId, item.payload);
  }
  queue.length = 0;
}

/** Discard pending emissions after ROLLBACK. */
export function clearFinancialPostedQueue(): void {
  const queue = financialPostedQueueStorage.getStore();
  if (queue) queue.length = 0;
}

/** Run `fn` with a financial.posted queue bound to the current async context. */
export function runWithFinancialPostedQueue<T>(queue: QueuedFinancialPosted[], fn: () => Promise<T>): Promise<T> {
  return financialPostedQueueStorage.run(queue, fn);
}
