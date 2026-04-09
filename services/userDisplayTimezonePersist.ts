import { apiClient } from './api/client';
import { isLocalOnlyMode } from '../config/apiUrl';

declare global {
  interface Window {
    companyBridge?: {
      updateUserDisplayTimezone?: (
        companyId: string,
        userId: string,
        displayTimezone: string | null
      ) => Promise<{ ok: boolean; error?: string }>;
    };
  }
}

/**
 * Persist display timezone for the signed-in user: PostgreSQL (API) or company SQLite (Electron).
 * `null` means "use device / auto" in Settings.
 */
export async function persistUserDisplayTimezone(
  displayTimezone: string | null,
  opts?: { companyId?: string; userId?: string }
): Promise<void> {
  if (!isLocalOnlyMode()) {
    await apiClient.patch('/users/me', { displayTimezone });
    return;
  }
  const companyId = opts?.companyId;
  const userId = opts?.userId;
  if (
    companyId &&
    userId &&
    typeof window !== 'undefined' &&
    window.companyBridge?.updateUserDisplayTimezone
  ) {
    const r = await window.companyBridge.updateUserDisplayTimezone(companyId, userId, displayTimezone);
    if (!r.ok) {
      throw new Error(r.error || 'Failed to save time zone');
    }
    try {
      const raw = localStorage.getItem('pbooks_local_auth');
      if (raw) {
        const o = JSON.parse(raw) as { companyId?: string; user?: { id?: string; displayTimezone?: string | null } };
        if (o.companyId === companyId && o.user?.id === userId) {
          o.user = { ...o.user, displayTimezone };
          localStorage.setItem('pbooks_local_auth', JSON.stringify(o));
        }
      }
    } catch {
      /* ignore */
    }
  }
}
