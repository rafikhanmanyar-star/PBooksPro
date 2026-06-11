import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { getPool } from '../../db/pool.js';

export async function upsertUserSession(
  client: PoolClient,
  userId: string,
  tenantId: string,
  loginEventId?: string | null
): Promise<void> {
  const id = `us_${randomUUID().replace(/-/g, '')}`;
  await client.query(
    `INSERT INTO user_sessions (id, user_id, tenant_id, login_event_id, last_activity_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id, tenant_id)
     DO UPDATE SET
       last_activity_at = NOW(),
       login_event_id = COALESCE(EXCLUDED.login_event_id, user_sessions.login_event_id)`,
    [id, userId, tenantId, loginEventId ?? null]
  );
}

export async function touchUserSession(userId: string, tenantId: string): Promise<void> {
  const pool = getPool();
  const r = await pool.query(
    `UPDATE user_sessions SET last_activity_at = NOW()
     WHERE user_id = $1 AND tenant_id = $2`,
    [userId, tenantId]
  );
  if (r.rowCount === 0) {
    const id = `us_${randomUUID().replace(/-/g, '')}`;
    await pool.query(
      `INSERT INTO user_sessions (id, user_id, tenant_id, last_activity_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, tenant_id) DO UPDATE SET last_activity_at = NOW()`,
      [id, userId, tenantId]
    );
  }
}

export async function deleteUserSession(
  client: PoolClient,
  userId: string,
  tenantId: string
): Promise<void> {
  await client.query(`DELETE FROM user_sessions WHERE user_id = $1 AND tenant_id = $2`, [
    userId,
    tenantId,
  ]);
}

export async function markUserLoggedIn(
  client: PoolClient,
  userId: string,
  tenantId: string
): Promise<void> {
  await client.query(
    `UPDATE users SET login_status = TRUE, last_login = NOW(), updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [userId, tenantId]
  );
}

export async function markUserLoggedOut(
  client: PoolClient,
  userId: string,
  tenantId: string
): Promise<void> {
  await client.query(
    `UPDATE users SET login_status = FALSE, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [userId, tenantId]
  );
}
