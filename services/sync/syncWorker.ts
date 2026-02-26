/**
 * Sync Worker
 * 
 * Web Worker that handles heavy merge/normalization operations off the main thread.
 * Receives raw state data from the main thread, performs merge logic, and returns
 * the merged result.
 */

type MergeMessage = {
  type: 'merge';
  id: string;
  localState: Record<string, any[]>;
  remoteState: Record<string, any[]>;
};

type NormalizeMessage = {
  type: 'normalize';
  id: string;
  raw: Record<string, any>;
  keyMap: Record<string, string>;
};

type WorkerMessage = MergeMessage | NormalizeMessage;

function mergeArraysById(local: any[], remote: any[]): any[] {
  const merged = new Map<string, any>();
  for (const item of local) {
    if (item?.id) merged.set(item.id, item);
  }
  for (const item of remote) {
    if (!item?.id) continue;
    const existing = merged.get(item.id);
    if (!existing) {
      merged.set(item.id, item);
      continue;
    }

    const localTime = existing.updatedAt || existing.updated_at || '';
    const remoteTime = item.updatedAt || item.updated_at || '';
    if (remoteTime >= localTime) {
      merged.set(item.id, item);
    }
  }
  return Array.from(merged.values());
}

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function transformRow(row: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key in row) {
    result[snakeToCamel(key)] = row[key];
  }
  return result;
}

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;

  if (msg.type === 'merge') {
    const result: Record<string, any[]> = {};
    const allKeys = new Set([
      ...Object.keys(msg.localState),
      ...Object.keys(msg.remoteState),
    ]);

    for (const key of allKeys) {
      const local = msg.localState[key] || [];
      const remote = msg.remoteState[key] || [];
      if (!Array.isArray(local) || !Array.isArray(remote)) {
        result[key] = Array.isArray(remote) ? remote : Array.isArray(local) ? local : [];
        continue;
      }
      result[key] = mergeArraysById(local, remote);
    }

    self.postMessage({ type: 'merge-result', id: msg.id, result });
  }

  if (msg.type === 'normalize') {
    const result: Record<string, any[]> = {};
    for (const [rawKey, stateKey] of Object.entries(msg.keyMap)) {
      const rows = msg.raw[rawKey];
      if (Array.isArray(rows)) {
        result[stateKey] = rows.map(transformRow);
      }
    }
    self.postMessage({ type: 'normalize-result', id: msg.id, result });
  }
};
