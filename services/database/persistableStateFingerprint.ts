/**
 * Fingerprint of all app state that is written to SQLite via saveState.
 * Excludes pure UI / navigation fields so SET_PAGE etc. do not trigger a DB write.
 *
 * Uses reference identity of each persisted field instead of JSON.stringify,
 * which was extremely expensive for medium-to-large datasets (serializing
 * thousands of transactions on every state change).
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
 * Track the last-seen reference for each persisted key.
 * When any reference changes, we know data was mutated
 * (the reducer always returns new arrays/objects on mutation).
 */
const _lastSeenRefs = new Map<string, unknown>();
let _fingerprintVersion = 0;

/**
 * Lightweight fingerprint: compares object references of each persisted field
 * against previously seen values. Returns a version string that changes only
 * when actual data references change, without serializing the entire state.
 */
export function getPersistableStateFingerprint(state: AppState): string {
  let changed = false;
  for (const key of Object.keys(state) as (keyof AppState)[]) {
    if (EXCLUDED_FROM_PERSIST_FINGERPRINT.has(key as string)) continue;
    const val = state[key];
    if (_lastSeenRefs.get(key as string) !== val) {
      _lastSeenRefs.set(key as string, val);
      changed = true;
    }
  }
  if (changed) {
    _fingerprintVersion++;
  }
  return `fp-${_fingerprintVersion}`;
}
