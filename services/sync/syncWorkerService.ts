/**
 * Sync Worker Service
 * 
 * Manages a Web Worker for offloading heavy merge and normalization
 * operations from the main/UI thread during sync.
 */

type PendingCallback = {
  resolve: (result: any) => void;
  reject: (error: any) => void;
  timer: ReturnType<typeof setTimeout>;
};

let worker: Worker | null = null;
const pendingCallbacks = new Map<string, PendingCallback>();
let idCounter = 0;

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(
      new URL('./syncWorker.ts', import.meta.url),
      { type: 'module' }
    );
    worker.onmessage = (e: MessageEvent) => {
      const { id, result } = e.data;
      const pending = pendingCallbacks.get(id);
      if (pending) {
        clearTimeout(pending.timer);
        pendingCallbacks.delete(id);
        pending.resolve(result);
      }
    };
    worker.onerror = (err) => {
      console.warn('[SyncWorker] Worker error, falling back to main thread:', err.message);
      worker?.terminate();
      worker = null;
    };
    return worker;
  } catch {
    return null;
  }
}

function postToWorker(message: any, timeoutMs = 30000): Promise<any> {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    if (!w) return reject(new Error('Worker unavailable'));

    const id = `msg_${++idCounter}`;
    message.id = id;

    const timer = setTimeout(() => {
      pendingCallbacks.delete(id);
      reject(new Error('Worker timeout'));
    }, timeoutMs);

    pendingCallbacks.set(id, { resolve, reject, timer });
    w.postMessage(message);
  });
}

/**
 * Merge local and remote state arrays off the main thread.
 * Falls back to main-thread merge if worker is unavailable.
 */
export async function mergeStatesOffThread(
  localState: Record<string, any[]>,
  remoteState: Record<string, any[]>
): Promise<Record<string, any[]>> {
  try {
    return await postToWorker({
      type: 'merge',
      localState,
      remoteState,
    });
  } catch {
    return mergeStatesMainThread(localState, remoteState);
  }
}

function mergeStatesMainThread(
  localState: Record<string, any[]>,
  remoteState: Record<string, any[]>
): Record<string, any[]> {
  const result: Record<string, any[]> = {};
  const allKeys = new Set([
    ...Object.keys(localState),
    ...Object.keys(remoteState),
  ]);

  for (const key of allKeys) {
    const local = localState[key] || [];
    const remote = remoteState[key] || [];
    if (!Array.isArray(local) || !Array.isArray(remote)) {
      result[key] = Array.isArray(remote) ? remote : Array.isArray(local) ? local : [];
      continue;
    }
    const merged = new Map<string, any>();
    for (const item of local) {
      if (item?.id) merged.set(item.id, item);
    }
    for (const item of remote) {
      if (!item?.id) continue;
      const existing = merged.get(item.id);
      if (!existing) { merged.set(item.id, item); continue; }
      const lt = existing.updatedAt || existing.updated_at || '';
      const rt = item.updatedAt || item.updated_at || '';
      if (rt >= lt) merged.set(item.id, item);
    }
    result[key] = Array.from(merged.values());
  }
  return result;
}

export function terminateSyncWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  for (const [, pending] of pendingCallbacks) {
    clearTimeout(pending.timer);
    pending.reject(new Error('Worker terminated'));
  }
  pendingCallbacks.clear();
}
