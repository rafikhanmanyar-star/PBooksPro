import type pg from 'pg';
import { getPool } from '../../db/pool.js';
import {
  DEMO_DEFAULT_USERNAME,
  DEMO_PUBLIC_TENANT_ID,
} from '../../constants/demoEnvironment.js';

export type DemoLoginUser = {
  id: string;
  username: string;
  name: string;
  role: string;
  tenant_id: string;
  email: string | null;
  display_timezone: string | null;
  interface_mode: string | null;
};

const DEMO_USER_SELECT = `SELECT u.id, u.username, u.name, u.role, u.tenant_id, u.email, u.display_timezone, u.interface_mode
  FROM users u
  WHERE u.tenant_id = $1 AND u.is_active = TRUE`;

/**
 * Resolve an active user for passwordless public demo login.
 * Tries the submitted username, then the default demo user, then any admin in the tenant.
 */
export async function resolveDemoPublicLoginUser(
  db: pg.Pool | pg.PoolClient,
  username?: string
): Promise<DemoLoginUser | null> {
  const trimmed = username?.trim();
  if (trimmed) {
    const byUsername = await db.query<DemoLoginUser>(
      `${DEMO_USER_SELECT} AND LOWER(u.username) = LOWER($2) LIMIT 1`,
      [DEMO_PUBLIC_TENANT_ID, trimmed]
    );
    if (byUsername.rows[0]) return byUsername.rows[0];
  }

  const byDefault = await db.query<DemoLoginUser>(
    `${DEMO_USER_SELECT} AND LOWER(u.username) = LOWER($2) LIMIT 1`,
    [DEMO_PUBLIC_TENANT_ID, DEMO_DEFAULT_USERNAME]
  );
  if (byDefault.rows[0]) return byDefault.rows[0];

  const fallback = await db.query<DemoLoginUser>(
    `${DEMO_USER_SELECT}
     ORDER BY CASE WHEN LOWER(u.role) = 'admin' THEN 0 ELSE 1 END, u.created_at ASC
     LIMIT 1`,
    [DEMO_PUBLIC_TENANT_ID]
  );
  return fallback.rows[0] ?? null;
}

export async function getDemoPublicTenantInfo(): Promise<{
  id: string;
  name: string;
  companyName: string;
}> {
  const pool = getPool();
  const r = await pool.query<{ id: string; name: string; company_name: string | null }>(
    `SELECT id, name, company_name FROM tenants WHERE id = $1 LIMIT 1`,
    [DEMO_PUBLIC_TENANT_ID]
  );
  const row = r.rows[0];
  if (!row) {
    return { id: DEMO_PUBLIC_TENANT_ID, name: 'PBooksPro Live Demo', companyName: 'Al Noor Properties' };
  }
  return {
    id: row.id,
    name: row.name,
    companyName: row.company_name?.trim() || row.name,
  };
}
