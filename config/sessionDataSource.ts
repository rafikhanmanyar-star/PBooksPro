/**
 * @deprecated Legacy offline SQLite session switching.
 * Used only when VITE_LOCAL_ONLY=true and user picks local company vs API server.
 * Remove when electron:offline:* builds are retired.
 */
import { IS_LEGACY_SQLITE_BUILD } from './runtimeMode';

export const PBOOKS_SESSION_DATA_SOURCE_KEY = 'pbooks_session_data_source';

export type SessionDataSource = 'sqlite' | 'postgres_api';

export function setSessionDataSource(source: SessionDataSource): void {
  if (!IS_LEGACY_SQLITE_BUILD || typeof window === 'undefined') return;
  try {
    localStorage.setItem(PBOOKS_SESSION_DATA_SOURCE_KEY, source);
  } catch {
    /* ignore */
  }
}

export function clearSessionDataSource(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(PBOOKS_SESSION_DATA_SOURCE_KEY);
  } catch {
    /* ignore */
  }
}

export function ensureLegacyOfflineApiSessionMarked(): void {
  if (!IS_LEGACY_SQLITE_BUILD || typeof window === 'undefined') return;
  try {
    if (localStorage.getItem(PBOOKS_SESSION_DATA_SOURCE_KEY)) return;
    const token = localStorage.getItem('auth_token');
    const tid = localStorage.getItem('tenant_id');
    if (token && tid && tid !== 'local') {
      localStorage.setItem(PBOOKS_SESSION_DATA_SOURCE_KEY, 'postgres_api');
    }
  } catch {
    /* ignore */
  }
}

export function isLegacySqliteSessionSelected(): boolean {
  if (!IS_LEGACY_SQLITE_BUILD || typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(PBOOKS_SESSION_DATA_SOURCE_KEY) === 'sqlite';
  } catch {
    return false;
  }
}
