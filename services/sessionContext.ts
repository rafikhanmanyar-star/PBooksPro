/**
 * Session tenant/user helpers for API and legacy offline modes.
 * Prefer this over services/legacy-sqlite/*Utils in new code.
 */
import { isLocalOnlyMode } from '../config/apiUrl';
import { apiClient } from './api/client';

/** Local-only offline tenant id (deprecated SQLite stack). */
export const LOCAL_OFFLINE_TENANT_ID = 'local';

/** Local-only offline user id (deprecated SQLite stack). */
export const LOCAL_OFFLINE_USER_ID = 'local-user';

export function getCurrentTenantId(): string {
  if (isLocalOnlyMode()) {
    return LOCAL_OFFLINE_TENANT_ID;
  }
  return apiClient.getTenantId() || LOCAL_OFFLINE_TENANT_ID;
}

export function getCurrentUserId(): string | null {
  if (isLocalOnlyMode()) {
    return LOCAL_OFFLINE_USER_ID;
  }
  try {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('user_id');
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function shouldFilterByTenant(): boolean {
  return isLocalOnlyMode();
}

export function shouldTrackUserId(): boolean {
  return getCurrentUserId() !== null;
}
