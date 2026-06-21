import type { ChangeLogEntry } from './changeLogMerge';

export const LEAVE_CHANGE_LOG_ENTITY_KEY: Record<string, string> = {
  leave_request: 'leave_requests',
  leave_type: 'leave_types',
  leave_balance: 'leave_balances',
};

export type LeaveRequestStored = {
  id: string;
  tenant_id: string;
  employee_id: string;
  leave_type_id: string;
  from_date: string;
  to_date: string;
  days: number;
  status: string;
  deleted_at?: string | null;
  updated_at?: string;
};

const STORAGE_KEYS = {
  leave_requests: 'leave_requests',
  leave_types: 'leave_types',
  leave_balances: 'leave_balances',
} as const;

function storageKey(tenantId: string, bucket: string): string {
  return `${bucket}_${tenantId}`;
}

function getFromStorage<T>(tenantId: string, bucket: string): T[] {
  if (!tenantId) return [];
  try {
    const raw = localStorage.getItem(storageKey(tenantId, bucket));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setInStorage(tenantId: string, bucket: string, rows: unknown[]): void {
  if (!tenantId) return;
  localStorage.setItem(storageKey(tenantId, bucket), JSON.stringify(rows));
}

export function applyLeaveIncrementalEntities(
  tenantId: string,
  entities: Record<string, unknown[] | undefined>
): void {
  for (const bucket of Object.values(STORAGE_KEYS)) {
    const incoming = entities[bucket];
    if (!incoming?.length) continue;
    const existing = getFromStorage<Record<string, unknown>>(tenantId, bucket);
    const byId = new Map(existing.map((r) => [String(r.id), r]));
    for (const raw of incoming) {
      const row = raw as Record<string, unknown> & { deletedAt?: string };
      const id = String(row.id ?? '');
      if (!id) continue;
      if (row.deleted_at || row.deletedAt) {
        byId.delete(id);
        continue;
      }
      byId.set(id, row);
    }
    setInStorage(tenantId, bucket, Array.from(byId.values()));
  }
}

export async function applyLeaveChangeLogToStorage(
  tenantId: string,
  entries: ChangeLogEntry[] | undefined
): Promise<void> {
  if (!entries?.length || !tenantId) return;
  const entities: Record<string, unknown[]> = {};
  for (const entry of entries) {
    const bucket = LEAVE_CHANGE_LOG_ENTITY_KEY[entry.entityType];
    if (!bucket) continue;
    if (!entities[bucket]) entities[bucket] = [];
    if (entry.action === 'delete') {
      entities[bucket].push({ id: entry.entityId, deleted_at: entry.changedAt });
      continue;
    }
    if (entry.payload != null && typeof entry.payload === 'object') {
      entities[bucket].push(entry.payload);
    }
  }
  if (Object.keys(entities).length === 0) return;
  applyLeaveIncrementalEntities(tenantId, entities);
}
