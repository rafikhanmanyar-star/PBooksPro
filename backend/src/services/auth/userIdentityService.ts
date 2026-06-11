import type { Pool, PoolClient } from 'pg';

type Queryable = Pool | PoolClient;

export type UserIdentityField = 'email' | 'username';

export type UserIdentityConflict = {
  field: UserIdentityField;
  value: string;
  existingUserId: string;
  existingTenantId: string;
  existingTenantName: string;
};

export class UserIdentityConflictError extends Error {
  readonly code = 'IDENTITY_CONFLICT';
  readonly conflicts: UserIdentityConflict[];

  constructor(conflicts: UserIdentityConflict[]) {
    const first = conflicts[0];
    const message =
      first?.field === 'email'
        ? 'This email address is already registered with another organization. Sign in to that organization or use a different email.'
        : first?.field === 'username'
          ? 'This username is already in use. Choose a different username.'
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

export async function findUserIdentityConflicts(
  db: Queryable,
  input: {
    email?: string | null;
    username?: string | null;
    excludeUserId?: string;
  }
): Promise<UserIdentityConflict[]> {
  const conflicts: UserIdentityConflict[] = [];
  const excludeUserId = input.excludeUserId?.trim() || null;
  const email = normalizeUserEmail(input.email);
  const username = normalizeLoginUsername(input.username);

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

  if (username) {
    const r = await db.query<{
      user_id: string;
      tenant_id: string;
      tenant_name: string;
    }>(
      `SELECT u.id AS user_id, u.tenant_id, t.name AS tenant_name
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE LOWER(TRIM(u.username)) = $1
         AND ($2::text IS NULL OR u.id <> $2)
       LIMIT 1`,
      [username, excludeUserId]
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
