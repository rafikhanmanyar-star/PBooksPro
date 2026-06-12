import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { Pool } from 'pg';
import type { UserMfaRow } from '../../../services/auth/mfaService.js';

function parseBackupHashes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string');
}

function mapMfaRow(row: pg.QueryResultRow): UserMfaRow {
  return {
    user_id: row.user_id,
    tenant_id: row.tenant_id,
    enabled: Boolean(row.enabled),
    secret: row.secret != null ? String(row.secret) : null,
    backup_codes: parseBackupHashes(row.backup_codes),
  };
}

export class MfaRepository {
  async getByUserId(client: pg.PoolClient, userId: string): Promise<UserMfaRow | null> {
    const r = await client.query(`SELECT * FROM user_mfa_settings WHERE user_id = $1`, [userId]);
    return r.rows[0] ? mapMfaRow(r.rows[0]) : null;
  }

  async upsertSetup(
    client: pg.PoolClient,
    input: { userId: string; tenantId: string; encryptedSecret: string }
  ): Promise<void> {
    await client.query(
      `INSERT INTO user_mfa_settings (user_id, tenant_id, enabled, secret, backup_codes, updated_at)
       VALUES ($1, $2, FALSE, $3, '[]'::jsonb, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         secret = EXCLUDED.secret,
         enabled = FALSE,
         backup_codes = '[]'::jsonb,
         updated_at = NOW()`,
      [input.userId, input.tenantId, input.encryptedSecret]
    );
  }

  async enableWithBackupCodes(
    client: pg.PoolClient,
    userId: string,
    hashedCodesJson: string
  ): Promise<void> {
    await client.query(
      `UPDATE user_mfa_settings
       SET enabled = TRUE, backup_codes = $2::jsonb, updated_at = NOW()
       WHERE user_id = $1`,
      [userId, hashedCodesJson]
    );
  }

  async disable(client: pg.PoolClient, userId: string): Promise<void> {
    await client.query(
      `UPDATE user_mfa_settings
       SET enabled = FALSE, secret = NULL, backup_codes = '[]'::jsonb, updated_at = NOW()
       WHERE user_id = $1`,
      [userId]
    );
  }

  async updateBackupCodes(
    client: pg.PoolClient,
    userId: string,
    hashedCodesJson: string
  ): Promise<void> {
    await client.query(
      `UPDATE user_mfa_settings SET backup_codes = $2::jsonb, updated_at = NOW() WHERE user_id = $1`,
      [userId, hashedCodesJson]
    );
  }
}

export class UserSessionRepository {
  async upsert(
    client: pg.PoolClient,
    input: {
      id: string;
      userId: string;
      tenantId: string;
      loginEventId: string | null;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO user_sessions (id, user_id, tenant_id, login_event_id, last_activity_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id, tenant_id)
       DO UPDATE SET
         last_activity_at = NOW(),
         login_event_id = COALESCE(EXCLUDED.login_event_id, user_sessions.login_event_id)`,
      [input.id, input.userId, input.tenantId, input.loginEventId]
    );
  }

  async touch(pool: Pool, userId: string, tenantId: string, newSessionId: string): Promise<void> {
    const r = await pool.query(
      `UPDATE user_sessions SET last_activity_at = NOW()
       WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
    if (r.rowCount === 0) {
      await pool.query(
        `INSERT INTO user_sessions (id, user_id, tenant_id, last_activity_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id, tenant_id) DO UPDATE SET last_activity_at = NOW()`,
        [newSessionId, userId, tenantId]
      );
    }
  }

  async delete(client: pg.PoolClient, userId: string, tenantId: string): Promise<void> {
    await client.query(`DELETE FROM user_sessions WHERE user_id = $1 AND tenant_id = $2`, [
      userId,
      tenantId,
    ]);
  }

  async markLoggedIn(client: pg.PoolClient, userId: string, tenantId: string): Promise<void> {
    await client.query(
      `UPDATE users SET login_status = TRUE, last_login = NOW(), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
  }

  async markLoggedOut(client: pg.PoolClient, userId: string, tenantId: string): Promise<void> {
    await client.query(
      `UPDATE users SET login_status = FALSE, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
  }
}

export class UserTenantMembershipRepository {
  async ensureMembership(
    client: pg.PoolClient,
    userId: string,
    tenantId: string,
    role: string
  ): Promise<void> {
    const id = `ut_${randomUUID().replace(/-/g, '')}`;
    await client.query(
      `INSERT INTO user_tenants (id, user_id, tenant_id, role, is_default)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role`,
      [id, userId, tenantId, role]
    );
  }
}

type UserTenantAccountRow = {
  user_id: string;
  tenant_id: string;
  role: string;
  username: string;
  name: string;
  password_hash: string;
  tenant_name: string;
  display_timezone: string | null;
  interface_mode: string;
  email: string | null;
  last_tenant_id: string | null;
  organization_status: string;
  rejection_reason: string | null;
};

export class UserTenantRepository {
  async findAccountsByLoginIdentifier(
    db: pg.Pool | pg.PoolClient,
    normalizedIdentifier: string
  ): Promise<UserTenantAccountRow[]> {
    const r = await db.query<UserTenantAccountRow>(
      `SELECT u.id AS user_id, ut.tenant_id, ut.role, u.username, u.name, u.password_hash,
              t.name AS tenant_name, u.display_timezone, u.interface_mode, u.email, u.last_tenant_id,
              COALESCE(t.status, 'ACTIVE') AS organization_status, t.rejection_reason
       FROM user_tenants ut
       JOIN users u ON u.id = ut.user_id
       JOIN tenants t ON t.id = ut.tenant_id
       WHERE u.is_active = TRUE
         AND ut.tenant_id !~ '^__'
         AND (
           LOWER(COALESCE(u.email, '')) = $1
           OR LOWER(u.username) = $1
         )
       ORDER BY LOWER(t.name) ASC, ut.tenant_id ASC`,
      [normalizedIdentifier]
    );
    return r.rows;
  }

  async getUserEmailAndUsername(
    db: pg.Pool | pg.PoolClient,
    userId: string
  ): Promise<{ email: string | null; username: string } | null> {
    const r = await db.query<{ email: string | null; username: string }>(
      `SELECT email, username FROM users WHERE id = $1`,
      [userId]
    );
    return r.rows[0] ?? null;
  }

  async findAccountForTenantByLoginIdentifier(
    db: pg.Pool | pg.PoolClient,
    tenantId: string,
    normalizedIdentifier: string
  ): Promise<UserTenantAccountRow | null> {
    const r = await db.query<UserTenantAccountRow>(
      `SELECT u.id AS user_id, ut.tenant_id, ut.role, u.username, u.name, u.password_hash,
              t.name AS tenant_name, u.display_timezone, u.interface_mode, u.email, u.last_tenant_id,
              COALESCE(t.status, 'ACTIVE') AS organization_status, t.rejection_reason
       FROM user_tenants ut
       JOIN users u ON u.id = ut.user_id
       JOIN tenants t ON t.id = ut.tenant_id
       WHERE ut.tenant_id = $1 AND u.is_active = TRUE
         AND (
           LOWER(COALESCE(u.email, '')) = $2
           OR LOWER(u.username) = $2
         )
       LIMIT 1`,
      [tenantId, normalizedIdentifier]
    );
    return r.rows[0] ?? null;
  }

  async userHasTenantAccess(
    db: pg.Pool | pg.PoolClient,
    tenantId: string,
    userId: string,
    loginIdentifier: string | null
  ): Promise<UserTenantAccountRow | null> {
    const r = await db.query<UserTenantAccountRow>(
      `SELECT u.id AS user_id, ut.tenant_id, ut.role, u.username, u.name, u.password_hash,
              t.name AS tenant_name, u.display_timezone, u.interface_mode, u.email, u.last_tenant_id,
              COALESCE(t.status, 'ACTIVE') AS organization_status, t.rejection_reason
       FROM user_tenants ut
       JOIN users u ON u.id = ut.user_id
       JOIN tenants t ON t.id = ut.tenant_id
       WHERE ut.tenant_id = $1 AND u.is_active = TRUE
         AND (
           u.id = $2
           OR ($3::text IS NOT NULL AND (
             LOWER(COALESCE(u.email, '')) = LOWER($3)
             OR LOWER(u.username) = LOWER($3)
           ))
         )
       LIMIT 1`,
      [tenantId, userId, loginIdentifier]
    );
    return r.rows[0] ?? null;
  }

  async recordTenantSelection(
    db: pg.Pool | pg.PoolClient,
    userId: string,
    tenantId: string
  ): Promise<void> {
    await db.query(
      `UPDATE user_tenants SET last_selected_at = NOW()
       WHERE user_id = $1 AND tenant_id = $2`,
      [userId, tenantId]
    );
    await db.query(`UPDATE users SET last_tenant_id = $2 WHERE id = $1`, [userId, tenantId]);
  }
}

export { randomUUID as newSessionId };
export type { UserTenantAccountRow };

export class UserProfileRepository {
  async getEmailById(client: pg.PoolClient, userId: string): Promise<string | null> {
    const r = await client.query<{ email: string | null }>(`SELECT email FROM users WHERE id = $1`, [
      userId,
    ]);
    return r.rows[0]?.email ?? null;
  }
}
