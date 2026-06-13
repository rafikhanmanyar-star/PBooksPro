import type { Pool, PoolClient } from 'pg';

type Queryable = Pool | PoolClient;

export type UserIdentityField = 'email' | 'username' | 'organizationEmail';

export type UserIdentityConflict = {
  field: UserIdentityField;
  value: string;
  existingUserId?: string;
  existingTenantId: string;
  existingTenantName: string;
};

export class UserIdentityConflictError extends Error {
  readonly code = 'IDENTITY_CONFLICT';
  readonly conflicts: UserIdentityConflict[];

  constructor(conflicts: UserIdentityConflict[]) {
    const first = conflicts[0];
    const message =
      first?.field === 'organizationEmail'
        ? 'This company email is already registered. Sign in to that organization or use a different company email.'
        : first?.field === 'email'
          ? 'This email address is already registered with another organization. Sign in to that organization or use a different email.'
          : first?.field === 'username'
            ? 'This username is already in use in this organization. Choose a different username.'
            : 'Email or username is already in use.';
    super(message);
    this.name = 'UserIdentityConflictError';
    this.conflicts = conflicts;
  }
}

export function normalizeUserEmail(email: string | null | undefined): string | null {
  if (email == null) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeLoginUsername(username: string | null | undefined): string | null {
  if (username == null) return null;
  const trimmed = username.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
}

export async function findOrganizationEmailConflicts(
  db: Queryable,
  organizationEmail: string,
  excludeTenantId?: string
): Promise<UserIdentityConflict[]> {
  const email = normalizeUserEmail(organizationEmail);
  if (!email) return [];

  const r = await db.query<{
    tenant_id: string;
    tenant_name: string;
  }>(
    `SELECT id AS tenant_id, COALESCE(company_name, name) AS tenant_name
     FROM tenants
     WHERE LOWER(TRIM(COALESCE(email, ''))) = $1
       AND ($2::text IS NULL OR id <> $2)
     LIMIT 1`,
    [email, excludeTenantId?.trim() || null]
  );
  const row = r.rows[0];
  if (!row) return [];

  return [
    {
      field: 'organizationEmail',
      value: email,
      existingTenantId: row.tenant_id,
      existingTenantName: row.tenant_name,
    },
  ];
}

export async function assertOrganizationEmailAvailable(
  db: Queryable,
  organizationEmail: string,
  excludeTenantId?: string
): Promise<void> {
  const conflicts = await findOrganizationEmailConflicts(db, organizationEmail, excludeTenantId);
  if (conflicts.length > 0) {
    throw new UserIdentityConflictError(conflicts);
  }
}

export async function findUserIdentityConflicts(
  db: Queryable,
  input: {
    email?: string | null;
    username?: string | null;
    excludeUserId?: string;
    /** When set, username is checked only within this organization (tenant). */
    tenantId?: string;
  }
): Promise<UserIdentityConflict[]> {
  const conflicts: UserIdentityConflict[] = [];
  const excludeUserId = input.excludeUserId?.trim() || null;
  const email = normalizeUserEmail(input.email);
  const username = normalizeLoginUsername(input.username);
  const tenantId = input.tenantId?.trim() || null;

  if (email) {
    const r = await db.query<{
      user_id: string;
      tenant_id: string;
      tenant_name: string;
    }>(
      `SELECT u.id AS user_id, u.tenant_id, t.name AS tenant_name
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE LOWER(TRIM(COALESCE(u.email, ''))) = $1
         AND ($2::text IS NULL OR u.id <> $2)
       LIMIT 1`,
      [email, excludeUserId]
    );
    const row = r.rows[0];
    if (row) {
      conflicts.push({
        field: 'email',
        value: email,
        existingUserId: row.user_id,
        existingTenantId: row.tenant_id,
        existingTenantName: row.tenant_name,
      });
    }
  }

  if (username && tenantId) {
    const r = await db.query<{
      user_id: string;
      tenant_id: string;
      tenant_name: string;
    }>(
      `SELECT u.id AS user_id, u.tenant_id, t.name AS tenant_name
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE LOWER(TRIM(u.username)) = $1
         AND u.tenant_id = $2
         AND ($3::text IS NULL OR u.id <> $3)
       LIMIT 1`,
      [username, tenantId, excludeUserId]
    );
    const row = r.rows[0];
    if (row) {
      conflicts.push({
        field: 'username',
        value: username,
        existingUserId: row.user_id,
        existingTenantId: row.tenant_id,
        existingTenantName: row.tenant_name,
      });
    }
  }

  return conflicts;
}

export async function assertUserIdentityAvailable(
  db: Queryable,
  input: {
    email?: string | null;
    username?: string | null;
    excludeUserId?: string;
    tenantId?: string;
  }
): Promise<void> {
  const conflicts = await findUserIdentityConflicts(db, input);
  if (conflicts.length > 0) {
    throw new UserIdentityConflictError(conflicts);
  }
}

export function identityConflictApiDetails(conflicts: UserIdentityConflict[]): Record<string, unknown> {
  const first = conflicts[0];
  return {
    conflicts: conflicts.map((c) => ({
      field: c.field,
      existingOrganizationId: c.existingTenantId,
      existingOrganizationName: c.existingTenantName,
    })),
    field: first?.field,
    existingOrganizationId: first?.existingTenantId,
    existingOrganizationName: first?.existingTenantName,
  };
}
