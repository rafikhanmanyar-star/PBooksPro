import type { ChangeLogEntry } from './changeLogMerge';

export const ATTENDANCE_CHANGE_LOG_ENTITY_KEY: Record<string, string> = {
  attendance_record: 'attendance_records',
};

export type AttendanceRecordStored = {
  id: string;
  tenant_id: string;
  employee_id: string;
  attendance_date: string;
  status: string;
  check_in?: string | null;
  check_out?: string | null;
  late_minutes?: number;
  remarks?: string | null;
  deleted_at?: string | null;
  updated_at?: string;
};

const STORAGE_KEY = 'attendance_records';

function storageKey(tenantId: string): string {
  return `${STORAGE_KEY}_${tenantId}`;
}

export function getAttendanceRecordsFromStorage(tenantId: string): AttendanceRecordStored[] {
  if (!tenantId) return [];
  try {
    const raw = localStorage.getItem(storageKey(tenantId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function setAttendanceRecordsInStorage(tenantId: string, records: AttendanceRecordStored[]): void {
  if (!tenantId) return;
  localStorage.setItem(storageKey(tenantId), JSON.stringify(records));
}

export function applyAttendanceIncrementalEntities(
  tenantId: string,
  entities: Record<string, unknown[] | undefined>
): void {
  const incoming = entities.attendance_records;
  if (!incoming?.length) return;
  const existing = getAttendanceRecordsFromStorage(tenantId);
  const byId = new Map(existing.map((r) => [r.id, r]));
  for (const raw of incoming) {
    const row = raw as AttendanceRecordStored & { deletedAt?: string };
    const id = String(row.id ?? '');
    if (!id) continue;
    if (row.deleted_at || row.deletedAt) {
      byId.delete(id);
      continue;
    }
    byId.set(id, row);
  }
  setAttendanceRecordsInStorage(tenantId, Array.from(byId.values()));
}

export async function applyAttendanceChangeLogToStorage(
  tenantId: string,
  entries: ChangeLogEntry[] | undefined
): Promise<void> {
  if (!entries?.length || !tenantId) return;
  const entities: Record<string, unknown[]> = {};
  for (const entry of entries) {
    const bucket = ATTENDANCE_CHANGE_LOG_ENTITY_KEY[entry.entityType];
    if (!bucket) continue;
    if (!entities[bucket]) entities[bucket] = [];
    if (entry.action === 'delete') {
      entities[bucket].push({
        id: entry.entityId,
        deleted_at: entry.changedAt,
      });
      continue;
    }
    if (entry.payload != null && typeof entry.payload === 'object') {
      entities[bucket].push(entry.payload);
    }
  }
  if (Object.keys(entities).length === 0) return;
  applyAttendanceIncrementalEntities(tenantId, entities);
}
