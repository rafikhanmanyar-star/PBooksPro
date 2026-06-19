import { AsyncLocalStorage } from 'node:async_hooks';
import { emitEntityEvent, type RealtimeEntityType, type RealtimeAction } from './realtime.js';

export type QueuedEntityEvent = {
  tenantId: string;
  action: RealtimeAction;
  type: RealtimeEntityType;
  opts: { data?: unknown; id?: string; sourceUserId?: string; version?: number };
};

const entityEventQueueStorage = new AsyncLocalStorage<QueuedEntityEvent[]>();

/**
 * Queue an entity event during an open DB transaction.
 * Flushed by `withTransaction` after COMMIT; discarded on ROLLBACK.
 * When no transaction queue is active, emits immediately (caller is post-commit).
 */
export function queueEntityEvent(
  tenantId: string,
  action: RealtimeAction,
  type: RealtimeEntityType,
  opts: { data?: unknown; id?: string; sourceUserId?: string; version?: number }
): void {
  const queue = entityEventQueueStorage.getStore();
  if (queue) {
    queue.push({ tenantId, action, type, opts });
    return;
  }
  emitEntityEvent(tenantId, action, type, opts);
}

/** Emit all queued entity events (call only after successful COMMIT). */
export function flushEntityEventQueue(): void {
  const queue = entityEventQueueStorage.getStore();
  if (!queue?.length) return;
  for (const item of queue) {
    emitEntityEvent(item.tenantId, item.action, item.type, item.opts);
  }
  queue.length = 0;
}

/** Discard pending emissions after ROLLBACK. */
export function clearEntityEventQueue(): void {
  const queue = entityEventQueueStorage.getStore();
  if (queue) queue.length = 0;
}

/** Run `fn` with an entity event queue bound to the current async context. */
export function runWithEntityEventQueue<T>(queue: QueuedEntityEvent[], fn: () => Promise<T>): Promise<T> {
  return entityEventQueueStorage.run(queue, fn);
}

/** Returns current queue length, or null if no queue is active. Used by withSavepoint. */
export function snapshotEntityEventQueue(): number | null {
  const queue = entityEventQueueStorage.getStore();
  return queue !== undefined ? queue.length : null;
}

/** Truncates queue to the snapshot length. Used by withSavepoint on rollback. */
export function restoreEntityEventQueue(snapshot: number | null): void {
  if (snapshot === null) return;
  const queue = entityEventQueueStorage.getStore();
  if (queue !== undefined && queue.length > snapshot) {
    queue.length = snapshot;
  }
}
