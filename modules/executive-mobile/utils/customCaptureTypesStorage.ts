import type { CaptureType, MoneyFlow } from '../constants/quickCaptureTypes';

const STORAGE_PREFIX = 'executive_quick_capture_custom_types';
const MAX_CUSTOM = 12;

function storageKey(tenantId?: string): string {
  return tenantId ? `${STORAGE_PREFIX}_${tenantId}` : STORAGE_PREFIX;
}

function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}

export function loadCustomCaptureTypes(tenantId?: string): CaptureType[] {
  try {
    const raw = localStorage.getItem(storageKey(tenantId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<{ id: string; label: string; flow?: MoneyFlow }>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t) => t?.id && t?.label?.trim())
      .map((t) => ({
        id: t.id,
        label: t.label.trim(),
        kind: 'custom' as const,
        flow: t.flow === 'in' ? 'in' : 'out',
      }));
  } catch {
    return [];
  }
}

export function saveCustomCaptureType(
  label: string,
  moneyFlow: MoneyFlow,
  tenantId?: string
): CaptureType | null {
  const trimmed = label.trim();
  if (!trimmed) return null;

  const existing = loadCustomCaptureTypes(tenantId);
  const duplicate = existing.find(
    (t) => t.label.toLowerCase() === trimmed.toLowerCase() && (t.flow ?? 'out') === moneyFlow
  );
  if (duplicate) return duplicate;

  const baseId = slugify(trimmed) || 'custom';
  let id = `custom_${moneyFlow}_${baseId}`;
  let n = 1;
  while (existing.some((t) => t.id === id)) {
    id = `custom_${moneyFlow}_${baseId}_${n++}`;
  }

  const created: CaptureType = { id, label: trimmed, kind: 'custom', flow: moneyFlow };
  const next = [created, ...existing].slice(0, MAX_CUSTOM);
  try {
    localStorage.setItem(
      storageKey(tenantId),
      JSON.stringify(next.map(({ id: tid, label: tl, flow }) => ({ id: tid, label: tl, flow })))
    );
  } catch {
    /* ignore quota */
  }
  return created;
}
