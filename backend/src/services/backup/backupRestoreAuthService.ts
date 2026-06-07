/**
 * Restore authorization — only Super Admin / Company Admin; short-lived session tokens.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { resolveEnterpriseRole } from '../../auth/permissions.js';

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

  const id = randomUUID();
  const expiresAt = new Date(Date.now() + RESTORE_SESSION_TTL_MS);

  await client.query(
    `INSERT INTO backup_restore_sessions (id, tenant_id, user_id, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [id, input.tenantId, input.userId, expiresAt.toISOString()]
  );

  return { restoreToken: id, expiresAt: expiresAt.toISOString() };
}

export async function consumeRestoreSession(
  client: pg.PoolClient,
  token: string,
  userId: string,
  tenantId: string
): Promise<boolean> {
  const { rows } = await client.query(
    `UPDATE backup_restore_sessions SET used = true
     WHERE id = $1 AND tenant_id = $2 AND user_id = $3
       AND used = false AND expires_at > NOW()
     RETURNING id`,
    [token, tenantId, userId]
  );
  return rows.length > 0;
}

/** Remove expired restore sessions (best-effort housekeeping). */
export async function purgeExpiredRestoreSessions(client: pg.PoolClient): Promise<void> {
  await client.query(`DELETE FROM backup_restore_sessions WHERE expires_at < NOW()`);
}
