/**
 * PERF-P3.2 — Deferred bundle session state: canonical entity ordering,
 * loaded-slice tracking (empty ≠ unloaded), and session bundle cache.
 */
import type { AppState } from '../../types';

export const DEFERRED_BOOTSTRAP_ENTITY_KEYS = [
  'contacts',
  'invoices',
  'bills',
  'vendors',
  'personalTransactions',
] as const;

export type DeferredBootstrapEntityKey = (typeof DEFERRED_BOOTSTRAP_ENTITY_KEYS)[number];

const LOG_PREFIX = '[DEFERRED_BUNDLE]';

const SLICE_STATE_KEYS: Record<DeferredBootstrapEntityKey, keyof AppState> = {
  contacts: 'contacts',
  invoices: 'invoices',
  bills: 'bills',
  vendors: 'vendors',
  personalTransactions: 'personalTransactions',
};

export interface DeferredBundleMetrics {
  deferredBundleHits: number;
  deferredBundleMisses: number;
  emptySliceSuppressions: number;
  canonicalizedBundleRequests: number;
}

const metrics: DeferredBundleMetrics = {
  deferredBundleHits: 0,
  deferredBundleMisses: 0,
  emptySliceSuppressions: 0,
  canonicalizedBundleRequests: 0,
};

const loadedSlices = new Set<DeferredBootstrapEntityKey>();
const loadedBundles = new Set<string>();

let sessionTenantId: string | null = null;

function logDeferredBundle(event: string, detail?: Record<string, unknown>): void {
  if (detail) {
    console.info(LOG_PREFIX, event, detail);
  } else {
    console.info(LOG_PREFIX, event);
  }
}

/** Sort and dedupe entity names for stable dedupe / cache keys. */
export function normalizeEntityBundle(entities: string | undefined): string {
  if (!entities?.trim()) return '';
  const parts = entities
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
  return [...new Set(parts)].sort().join(',');
}

/** Build GET /state/bulk endpoint with canonical entity query (PERF-P3.2 dedupe alignment). */
export function buildCanonicalBulkEntitiesEndpoint(entities?: string): string {
  if (!entities?.trim()) return '/state/bulk';
  const rawOrdered = entities
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
    .join(',');
  const normalized = normalizeEntityBundle(entities);
  if (rawOrdered !== normalized) {
    metrics.canonicalizedBundleRequests += 1;
    logDeferredBundle('canonicalized', { from: rawOrdered, to: normalized });
  }
  return `/state/bulk?entities=${encodeURIComponent(normalized)}`;
}

export function getDeferredBundleMetrics(): DeferredBundleMetrics {
  return { ...metrics };
}

export function isDeferredSliceLoaded(slice: DeferredBootstrapEntityKey): boolean {
  return loadedSlices.has(slice);
}

export function markDeferredSliceLoaded(slice: DeferredBootstrapEntityKey): void {
  loadedSlices.add(slice);
}

export function markDeferredSlicesLoaded(slices: Iterable<DeferredBootstrapEntityKey>): void {
  for (const slice of slices) {
    loadedSlices.add(slice);
  }
}

export function markDeferredSlicesFromPartial(partial: Partial<AppState>): void {
  for (const key of DEFERRED_BOOTSTRAP_ENTITY_KEYS) {
    if (partial[SLICE_STATE_KEYS[key]] !== undefined) {
      markDeferredSliceLoaded(key);
    }
  }
}

export function isDeferredBundleSessionLoaded(normalizedBundle: string): boolean {
  if (!normalizedBundle) return false;
  return loadedBundles.has(normalizedBundle);
}

export function markDeferredBundleSessionLoaded(normalizedBundle: string): void {
  if (!normalizedBundle) return;
  loadedBundles.add(normalizedBundle);
}

export function recordDeferredBundleCacheHit(normalizedBundle: string): void {
  metrics.deferredBundleHits += 1;
  logDeferredBundle('bundle cache hit', { bundle: normalizedBundle });
}

export function recordDeferredBundleCacheMiss(normalizedBundle: string): void {
  metrics.deferredBundleMisses += 1;
  logDeferredBundle('bundle cache miss', { bundle: normalizedBundle });
}

export function recordEmptySliceSuppression(slice: DeferredBootstrapEntityKey): void {
  metrics.emptySliceSuppressions += 1;
  logDeferredBundle('suppressed empty slice reload', { slice });
}

export function markDeferredBundleLoadSuccess(
  slices: Iterable<DeferredBootstrapEntityKey>,
  normalizedBundle: string
): void {
  markDeferredSlicesLoaded(slices);
  markDeferredBundleSessionLoaded(normalizedBundle);
}

export function resolveDeferredMissingEntities(
  needed: readonly DeferredBootstrapEntityKey[],
  lengths: Record<DeferredBootstrapEntityKey, number>
): DeferredBootstrapEntityKey[] {
  const missing: DeferredBootstrapEntityKey[] = [];
  for (const key of needed) {
    if (lengths[key] > 0) {
      if (!isDeferredSliceLoaded(key)) {
        markDeferredSliceLoaded(key);
      }
      continue;
    }
    if (isDeferredSliceLoaded(key)) {
      recordEmptySliceSuppression(key);
      continue;
    }
    missing.push(key);
  }
  return missing;
}

export function resetDeferredBundleSession(tenantId?: string | null): void {
  loadedSlices.clear();
  loadedBundles.clear();
  sessionTenantId = tenantId ?? null;
  logDeferredBundle('session reset', { tenantId: sessionTenantId });
}

export function ensureDeferredBundleSessionTenant(tenantId: string | null | undefined): void {
  const next = tenantId ?? null;
  if (sessionTenantId !== null && sessionTenantId !== next) {
    resetDeferredBundleSession(next);
  } else if (sessionTenantId === null && next) {
    sessionTenantId = next;
  }
}

export function resetDeferredBundleStateForTests(): void {
  loadedSlices.clear();
  loadedBundles.clear();
  sessionTenantId = null;
  metrics.deferredBundleHits = 0;
  metrics.deferredBundleMisses = 0;
  metrics.emptySliceSuppressions = 0;
  metrics.canonicalizedBundleRequests = 0;
}
