export type QuickCaptureFieldKey = 'partyName' | 'description' | 'projectId' | 'costCenterCode';

export type QuickCaptureSnapshot = {
  partyName?: string;
  description?: string;
  projectId?: string;
  costCenterCode?: string;
};

type QuickCaptureHistoryStore = {
  partyNameByType: Record<string, string[]>;
  descriptionByType: Record<string, string[]>;
  projectId: string[];
  costCenterCode: string[];
  lastSnapshot?: QuickCaptureSnapshot;
};

const STORAGE_PREFIX = 'executive_quick_capture_history';
const MAX_RECENT = 5;

function storageKey(tenantId?: string): string {
  return tenantId ? `${STORAGE_PREFIX}_${tenantId}` : STORAGE_PREFIX;
}

function emptyStore(): QuickCaptureHistoryStore {
  return {
    partyNameByType: {},
    descriptionByType: {},
    projectId: [],
    costCenterCode: [],
  };
}

function readStore(tenantId?: string): QuickCaptureHistoryStore {
  try {
    const raw = localStorage.getItem(storageKey(tenantId));
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as QuickCaptureHistoryStore;
    return {
      partyNameByType: parsed.partyNameByType ?? {},
      descriptionByType: parsed.descriptionByType ?? {},
      projectId: Array.isArray(parsed.projectId) ? parsed.projectId : [],
      costCenterCode: Array.isArray(parsed.costCenterCode) ? parsed.costCenterCode : [],
      lastSnapshot: parsed.lastSnapshot,
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(store: QuickCaptureHistoryStore, tenantId?: string): void {
  try {
    localStorage.setItem(storageKey(tenantId), JSON.stringify(store));
  } catch {
    /* ignore quota */
  }
}

function pushUnique(list: string[], value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return list;
  const next = [trimmed, ...list.filter((item) => item !== trimmed)];
  return next.slice(0, MAX_RECENT);
}

function pushTyped(
  map: Record<string, string[]>,
  typeKey: string,
  value: string
): Record<string, string[]> {
  return { ...map, [typeKey]: pushUnique(map[typeKey] ?? [], value) };
}

export function saveQuickCaptureFields(
  transactionType: string,
  fields: QuickCaptureSnapshot,
  tenantId?: string
): void {
  const store = readStore(tenantId);
  const snapshot: QuickCaptureSnapshot = {};

  if (fields.partyName?.trim()) {
    store.partyNameByType = pushTyped(store.partyNameByType, transactionType, fields.partyName);
    snapshot.partyName = fields.partyName.trim();
  }
  if (fields.description?.trim()) {
    store.descriptionByType = pushTyped(store.descriptionByType, transactionType, fields.description);
    snapshot.description = fields.description.trim();
  }
  if (fields.projectId?.trim()) {
    store.projectId = pushUnique(store.projectId, fields.projectId);
    snapshot.projectId = fields.projectId.trim();
  }
  if (fields.costCenterCode?.trim()) {
    store.costCenterCode = pushUnique(store.costCenterCode, fields.costCenterCode);
    snapshot.costCenterCode = fields.costCenterCode.trim();
  }

  if (Object.keys(snapshot).length > 0) {
    store.lastSnapshot = snapshot;
  }

  writeStore(store, tenantId);
}

export function getQuickCaptureSuggestions(
  transactionType: string,
  tenantId?: string
): Record<QuickCaptureFieldKey, string[]> {
  const store = readStore(tenantId);
  return {
    partyName: store.partyNameByType[transactionType] ?? [],
    description: store.descriptionByType[transactionType] ?? [],
    projectId: store.projectId,
    costCenterCode: store.costCenterCode,
  };
}

export function getLastQuickCaptureSnapshot(tenantId?: string): QuickCaptureSnapshot | null {
  const store = readStore(tenantId);
  return store.lastSnapshot ?? null;
}
