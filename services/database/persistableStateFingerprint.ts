/**
 * Fingerprint of all app state that is written to SQLite via saveState.
 * Excludes pure UI / navigation fields so SET_PAGE etc. do not trigger a DB write.
 */

import type { AppState } from '../../types';

/** Keys that must not affect the persist fingerprint (navigation & form chrome only). */
const EXCLUDED_FROM_PERSIST_FINGERPRINT = new Set<string>([
  'currentPage',
  'editingEntity',
  'initialTransactionType',
  'initialTransactionFilter',
  'initialTabs',
  'initialImportType',
]);

/**
 * Stable string for comparing "did any persisted data change?" including in-place edits
 * (same array length but updated row).
 */
export function getPersistableStateFingerprint(state: AppState): string {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(state) as (keyof AppState)[]) {
    if (EXCLUDED_FROM_PERSIST_FINGERPRINT.has(key as string)) continue;
    out[key as string] = state[key];
  }
  try {
    return JSON.stringify(out);
  } catch {
    return `fallback-${Date.now()}`;
  }
}
