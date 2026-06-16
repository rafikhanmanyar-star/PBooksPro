import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import type pg from 'pg';
import { withTransaction } from '../../../db/pool.js';
import { invalidateAuthUserCache } from '../../../middleware/authMiddleware.js';
import { validatePassword } from '../../../utils/passwordPolicy.js';
import { ensureUserTenantMembership } from '../../../services/auth/userTenantService.js';
import {
  assertUserIdentityAvailable,
  normalizeUserEmail,
  UserIdentityConflictError,
} from '../../../services/auth/userIdentityService.js';
import { RbacRepository } from '../../rbac/repositories/RbacRepository.js';
import { storedRoleLabelForEnterpriseSlug } from '../../../auth/permissions.js';

const TENANT_SUPER_ROLE = storedRoleLabelForEnterpriseSlug('super_admin');

function resolveUsername(input: { username?: string; email: string }): string {
  const explicit = input.username?.trim();
  if (explicit) return explicit;
  const local = input.email.split('@')[0]?.trim();
  return local && local.length > 0 ? local : 'user';
}

async function assignTenantSuperAdminRbac(
  client: pg.PoolClient,
  tenantId: string,
  userId: string
): Promise<void> {
  const repo = new RbacRepository(tenantId, client);
  const superRole = await repo.getRoleBySlug('super_admin', true);
  if (!superRole) {
    throw Object.assign(new Error('RBAC super_admin role is not seeded for this tenant'), {
      code: 'RBAC_NOT_MIGRATED',
    });
  }
  await client.query(`DELETE FROM rbac_user_roles WHERE tenant_id = $1 AND user_id = $2`, [
    tenantId,
    userId,
  ]);
  await repo.assignUserRole(userId, superRole.id, null);
  await repo.syncPrimaryUserRole(userId, superRole.slug);
}

export async function promoteTenantUserToSuperAdmin(
  tenantId: string,
  userId: string
): Promise<{ id: string; username: string; name: string; role: string; email: string | null }> {
  return withTransaction(async (client) => {
    const user = await client.query<{
      id: string;
      username: string;
      name: string;
      role: string;
      email: string | null;
    }>(`SELECT id, username, name, role, email FROM users WHERE id = $1 AND tenant_id = $2`, [
      userId,
      tenantId,
    ]);
    if (user.rows.length === 0) {
      throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });
    }
    const row = user.rows[0];
    await client.query(
      `UPDATE users SET role = $3, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [userId, tenantId, TENANT_SUPER_ROLE]
    );
    await ensureUserTenantMembership(client, userId, tenantId, TENANT_SUPER_ROLE);
    await assignTenantSuperAdminRbac(client, tenantId, userId);
    invalidateAuthUserCache(userId, tenantId);
    return { ...row, role: TENANT_SUPER_ROLE };
  });
}

export async function createTenantSuperAdminUser(
  tenantId: string,
  input: { name: string; email: string; password: string; username?: string }
): Promise<{ id: string; username: string; name: string; role: string; email: string }> {
  const passwordError = validatePassword(input.password);
  if (passwordError) {
    throw Object.assign(new Error(passwordError), { code: 'VALIDATION' });
  }
  const emailVal = normalizeUserEmail(input.email);
  if (!emailVal) {
    throw Object.assign(new Error('Email is required'), { code: 'VALIDATION' });
  }
  const username = resolveUsername({ username: input.username, email: emailVal });
  const id = `user_${randomUUID().replace(/-/g, '')}`;
  const passwordHash = await bcrypt.hash(input.password, 10);

  const created = await withTransaction(async (client) => {
    const tenant = await client.query<{ max_users: number }>(
      `SELECT max_users FROM tenants WHERE id = $1`,
      [tenantId]
    );
    if (tenant.rows.length === 0) {
      throw Object.assign(new Error('Tenant not found'), { code: 'NOT_FOUND' });
    }
    const maxUsers = tenant.rows[0]?.max_users ?? 20;
    const count = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM users WHERE tenant_id = $1`,
      [tenantId]
    );
    if (Number(count.rows[0]?.count ?? 0) >= maxUsers) {
      throw Object.assign(new Error(`Tenant user limit reached (${maxUsers})`), {
        code: 'QUOTA',
      });
    }

    await assertUserIdentityAvailable(client, {
      email: emailVal,
      username,
      tenantId,
    });

    const r = await client.query<{
      id: string;
      username: string;
      name: string;
      role: string;
      email: string | null;
    }>(
      `INSERT INTO users (id, tenant_id, username, name, role, password_hash, email, is_active, email_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, FALSE)
       RETURNING id, username, name, role, email`,
      [id, tenantId, username, input.name.trim(), TENANT_SUPER_ROLE, passwordHash, emailVal]
    );
    await ensureUserTenantMembership(client, id, tenantId, TENANT_SUPER_ROLE);
    await assignTenantSuperAdminRbac(client, tenantId, id);
    const row = r.rows[0];
    return {
      id: row.id,
      username: row.username,
      name: row.name,
      role: row.role,
      email: row.email ?? emailVal,
    };
  });

  invalidateAuthUserCache(created.id, tenantId);
  return created;
}

export { UserIdentityConflictError };
