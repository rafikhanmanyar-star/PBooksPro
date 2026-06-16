import type pg from 'pg';
import { getPool } from '../../../db/pool.js';
import {
  ALL_PERMISSIONS,
  isKnownPermission,
  isSystemOwnerSlug,
  permissionsForRole,
  permissionSetHas,
  resolveEnterpriseRole,
  SECURITY_ADMINISTRATOR_SLUG,
  SYSTEM_OWNER_SLUG,
  type Permission,
} from '../../../auth/permissions.js';
import { RbacRepository } from '../repositories/RbacRepository.js';

export async function resolveUserPermissions(
  tenantId: string,
  userId: string,
  legacyRole: string,
  client?: pg.PoolClient
): Promise<Permission[]> {
  const pool = getPool();
  const executor = client ?? (await pool.connect());
  const ownsConnection = !client;
  try {
    const repo = new RbacRepository(tenantId, executor);
    const assignments = await repo.listUserRoleAssignments(userId);

    if (assignments.length === 0) {
      return permissionsForRole(legacyRole);
    }

    const merged = new Set<Permission>();
    for (const assignment of assignments) {
      if (isSystemOwnerSlug(assignment.slug) || assignment.slug === 'super_admin') {
        return [...ALL_PERMISSIONS];
      }

      const dbPerms = await repo.listRolePermissionKeys(assignment.role_id);
      if (dbPerms.length > 0) {
        for (const key of dbPerms) {
          if (isKnownPermission(key)) merged.add(key);
        }
        continue;
      }

      for (const p of permissionsForRole(assignment.slug)) {
        merged.add(p);
      }
    }

    if (merged.size === 0) {
      return permissionsForRole(legacyRole);
    }
    return [...merged];
  } finally {
    if (ownsConnection) executor.release();
  }
}

export function userPermissionSetHas(
  permissions: readonly Permission[],
  required: Permission
): boolean {
  return permissionSetHas(permissions, required);
}

export function slugFromLegacyRole(role: string): string {
  return resolveEnterpriseRole(role);
}

export function isProtectedSystemSlug(slug: string): boolean {
  const normalized = slug.trim().toLowerCase().replace(/\s+/g, '_');
  return (
    isSystemOwnerSlug(slug) ||
    normalized === SYSTEM_OWNER_SLUG.toLowerCase() ||
    [
      'super_admin',
      'company_admin',
      'accountant',
      'project_manager',
      'sales_user',
      'read_only',
      SECURITY_ADMINISTRATOR_SLUG,
    ].includes(normalized)
  );
}
