/**
 * Restore authorization — only Super Admin / Company Admin; short-lived session tokens.
 */

import type pg from 'pg';
import { resolveEnterpriseRole } from '../../auth/permissions.js';
import { BackupRestoreAuthRepository } from '../../modules/backup/repositories/TenantRestoreRepository.js';

const RESTORE_SESSION_TTL_MS = 5 * 60_000;
export const RESTORE_CONFIRM_PHRASE = 'RESTORE DATABASE';

export function canRestoreBackup(role: string | undefined | null): boolean {
  const enterprise = resolveEnterpriseRole(role ?? '');
  return enterprise === 'super_admin' || enterprise === 'company_admin';
}

export async function createRestoreSession(
  client: pg.PoolClient,
  input: { tenantId: string; userId: string; confirmPhrase: string }
): Promise<{ restoreToken: string; expiresAt: string }> {
  if (input.confirmPhrase.trim().toUpperCase() !== RESTORE_CONFIRM_PHRASE) {
    throw new Error(`Confirmation phrase must be exactly "${RESTORE_CONFIRM_PHRASE}".`);
  }

  const expiresAt = new Date(Date.now() + RESTORE_SESSION_TTL_MS);
  const restoreToken = await new BackupRestoreAuthRepository(input.tenantId).createSession(
    client,
    input.userId,
    expiresAt.toISOString()
  );

  return { restoreToken, expiresAt: expiresAt.toISOString() };
}

export async function consumeRestoreSession(
  client: pg.PoolClient,
  token: string,
  userId: string,
  tenantId: string
): Promise<boolean> {
  return new BackupRestoreAuthRepository(tenantId).consumeSession(client, token, userId);
}

/** Remove expired restore sessions (best-effort housekeeping). */
export async function purgeExpiredRestoreSessions(client: pg.PoolClient): Promise<void> {
  await BackupRestoreAuthRepository.purgeExpired(client);
}
