import { apiClient } from './api/client';

/**
 * Persist display timezone for the signed-in user via PostgreSQL API.
 * `null` means "use device / auto" in Settings.
 */
export async function persistUserDisplayTimezone(
  displayTimezone: string | null,
  _opts?: { companyId?: string; userId?: string }
): Promise<void> {
  await apiClient.patch('/users/me', { displayTimezone });
}
