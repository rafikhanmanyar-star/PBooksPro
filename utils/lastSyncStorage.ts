/**
 * Storage for last sync timestamp per tenant (for incremental sync).
 * Used to avoid full state fetch when user returns within 24h.
 */

const STORAGE_KEY_PREFIX = 'pbookspro_lastSync_';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export function getLastSyncTimestamp(tenantId: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(`${STORAGE_KEY_PREFIX}${tenantId}`);
  } catch {
    return null;
  }
}

export function setLastSyncTimestamp(tenantId: string, timestamp: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${tenantId}`, timestamp);
  } catch {
    // Ignore storage errors
  }
}

export function clearLastSyncTimestamp(tenantId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}${tenantId}`);
  } catch {
    // Ignore
  }
}

/**
 * Returns true if lastSyncTimestamp exists and is within the acceptable age (24h).
 */
export function isLastSyncRecent(tenantId: string): boolean {
  const ts = getLastSyncTimestamp(tenantId);
  if (!ts) return false;
  try {
    const date = new Date(ts);
    return !isNaN(date.getTime()) && Date.now() - date.getTime() < MAX_AGE_MS;
  } catch {
    return false;
  }
}
