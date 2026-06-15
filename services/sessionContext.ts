/**
 * Session tenant/user helpers for PostgreSQL API mode.
 */
import { apiClient } from './api/client';

export function getCurrentTenantId(): string {
  return apiClient.getTenantId() || 'local';
}

export function getCurrentUserId(): string | null {
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
  return false;
}

export function shouldTrackUserId(): boolean {
  return getCurrentUserId() !== null;
}
