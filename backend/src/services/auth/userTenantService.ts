import type { Pool, PoolClient } from 'pg';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { isInternalDemoTenantId } from '../../middleware/demoEnvironmentMiddleware.js';

export type TenantCompanySummary = {
  id: string;
  name: string;
};

export type MatchedUserAccount = {
  userId: string;
  tenantId: string;
  role: string;
  username: string;
  name: string;
  passwordHash: string;
  tenantName: string;
  displayTimezone: string | null;
  email: string | null;
  lastTenantId: string | null;
  organizationStatus: string;
  rejectionReason: string | null;
};

type Queryable = Pool | PoolClient;

function normalizeLoginIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Find active user accounts matching email or username (case-insensitive).
 * Excludes internal demo master tenants.
 */
export async function findAccountsByLoginIdentifier(
  db: Queryable,
  identifier: string
): Promise<MatchedUserAccount[]> {
  const normalized = normalizeLoginIdentifier(identifier);
  if (!normalized) return [];

  const r = await db.query<{
    user_id: string;
    tenant_id: string;
    role: string;
    username: string;
    name: string;
    password_hash: string;
    tenant_name: string;
    display_timezone: string | null;
    email: string | null;
    last_tenant_id: string | null;
    organization_status: string;
    rejection_reason: string | null;
  }>(
    `SELECT u.id AS user_id, ut.tenant_id, ut.role, u.username, u.name, u.password_hash,
            t.name AS tenant_name, u.display_timezone, u.email, u.last_tenant_id,
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
    [normalized]
  );

  return r.rows
    .filter((row) => !isInternalDemoTenantId(row.tenant_id))
    .map((row) => ({
      userId: row.user_id,
      tenantId: row.tenant_id,
      role: row.role,
      username: row.username,
      name: row.name,
      passwordHash: row.password_hash,
      tenantName: row.tenant_name,
      displayTimezone: row.display_timezone ?? null,
      email: row.email,
      lastTenantId: row.last_tenant_id,
      organizationStatus: row.organization_status ?? 'ACTIVE',
      rejectionReason: row.rejection_reason ?? null,
    }));
}

export async function filterAccountsByPassword(
  accounts: MatchedUserAccount[],
  password: string
): Promise<MatchedUserAccount[]> {
  const matched: MatchedUserAccount[] = [];
  for (const account of accounts) {
    const ok = await bcrypt.compare(password, account.passwordHash);
    if (ok) matched.push(account);
  }
  return matched;
}

export function toCompanySummaries(accounts: MatchedUserAccount[]): TenantCompanySummary[] {
  const seen = new Set<string>();
  const companies: TenantCompanySummary[] = [];
  for (const account of accounts) {
    if (seen.has(account.tenantId)) continue;
    seen.add(account.tenantId);
    companies.push({ id: account.tenantId, name: account.tenantName });
  }
  return companies;
}

export function resolvePreferredCompanyId(accounts: MatchedUserAccount[]): string | null {
  const withPreference = accounts.filter((a) => a.lastTenantId);
  if (withPreference.length === 0) return null;
  const preferred = withPreference.find((a) => a.lastTenantId === a.tenantId);
  if (preferred) return preferred.tenantId;
  return withPreference[0]!.lastTenantId;
}

export async function getUserTenantsForUser(
  db: Queryable,
  userId: string,
  currentTenantId: string
): Promise<TenantCompanySummary[]> {
  const normalizedEmail = await db.query<{ email: string | null; username: string }>(
    `SELECT email, username FROM users WHERE id = $1`,
    [userId]
  );
  const row = normalizedEmail.rows[0];
  if (!row) return [];

  const identifier = normalizeLoginIdentifier(row.email?.trim() || row.username);
  const accounts = await findAccountsByLoginIdentifier(db, identifier);
  return toCompanySummaries(accounts);
}

export async function findAccountForTenantByLoginIdentifier(
  db: Queryable,
  tenantId: string,
  loginIdentifier: string
): Promise<MatchedUserAccount | null> {
  const normalized = normalizeLoginIdentifier(loginIdentifier);
  if (!normalized) return null;

  const r = await db.query<{
    user_id: string;
    tenant_id: string;
    role: string;
    username: string;
    name: string;
    password_hash: string;
    tenant_name: string;
    display_timezone: string | null;
    email: string | null;
    last_tenant_id: string | null;
    organization_status: string;
    rejection_reason: string | null;
  }>(
    `SELECT u.id AS user_id, ut.tenant_id, ut.role, u.username, u.name, u.password_hash,
            t.name AS tenant_name, u.display_timezone, u.email, u.last_tenant_id,
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
    [tenantId, normalized]
  );

  const account = r.rows[0];
  if (!account || isInternalDemoTenantId(account.tenant_id)) return null;

  return {
    userId: account.user_id,
    tenantId: account.tenant_id,
    role: account.role,
    username: account.username,
    name: account.name,
    passwordHash: account.password_hash,
    tenantName: account.tenant_name,
    displayTimezone: account.display_timezone ?? null,
    email: account.email,
    lastTenantId: account.last_tenant_id,
    organizationStatus: account.organization_status ?? 'ACTIVE',
    rejectionReason: account.rejection_reason ?? null,
  };
}

export async function userHasTenantAccess(
  db: Queryable,
  userId: string,
  tenantId: string,
  loginIdentifier?: string
): Promise<MatchedUserAccount | null> {
  const r = await db.query<{
    user_id: string;
    tenant_id: string;
    role: string;
    username: string;
    name: string;
    password_hash: string;
    tenant_name: string;
    display_timezone: string | null;
    email: string | null;
    last_tenant_id: string | null;
    organization_status: string;
    rejection_reason: string | null;
  }>(
    `SELECT u.id AS user_id, ut.tenant_id, ut.role, u.username, u.name, u.password_hash,
            t.name AS tenant_name, u.display_timezone, u.email, u.last_tenant_id,
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
    [tenantId, userId, loginIdentifier ?? null]
  );

  const account = r.rows[0];
  if (!account || isInternalDemoTenantId(account.tenant_id)) return null;

  return {
    userId: account.user_id,
    tenantId: account.tenant_id,
    role: account.role,
    username: account.username,
    name: account.name,
    passwordHash: account.password_hash,
    tenantName: account.tenant_name,
    displayTimezone: account.display_timezone ?? null,
    email: account.email,
    lastTenantId: account.last_tenant_id,
    organizationStatus: account.organization_status ?? 'ACTIVE',
    rejectionReason: account.rejection_reason ?? null,
  };
}

export async function recordTenantSelection(
  db: Queryable,
  userId: string,
  tenantId: string
): Promise<void> {
  await db.query(
    `UPDATE user_tenants SET last_selected_at = NOW()
     WHERE user_id = $1 AND tenant_id = $2`,
    [userId, tenantId]
  );
  await db.query(
    `UPDATE users SET last_tenant_id = $2 WHERE id = $1`,
    [userId, tenantId]
  );
}

export async function ensureUserTenantMembership(
  client: PoolClient,
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
