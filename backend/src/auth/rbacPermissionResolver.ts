/**
 * RBAC 2.0 Phase 3 — runtime permission resolver (Authorization Engine).
 * Bundle expansion uses permissionBundles.ts only (NR1).
 */
import type pg from 'pg';
import { getPool } from '../db/pool.js';
import { expandBundleAlias } from './permissionBundles.js';
import {
  ALL_PERMISSIONS,
  isKnownPermission,
  isSystemOwnerSlug,
  permissionsForRole,
  resolveEnterpriseRole,
  type Permission,
} from './permissions.js';
import { RbacRepository } from '../modules/rbac/repositories/RbacRepository.js';
import { allCatalogPermissionKeys } from '../modules/rbac/services/rbacCatalogPermissions.js';

export type ActiveRoleAssignment = {
  roleId: string;
  slug: string;
  roleVersion: number;
  permissionKeys: readonly string[];
  status: 'active' | 'inactive' | 'archived';
};

/** Expand permission keys via permissionBundles.ts (single expansion source). */
export function expandPermissionBundles(
  keys: readonly string[],
  enterpriseRole?: string | null
): Set<string> {
  const expanded = new Set<string>();
  for (const key of keys) {
    for (const child of expandBundleAlias(key, enterpriseRole)) {
      expanded.add(child);
    }
  }
  return expanded;
}

export function unionExpandedPermissions(
  assignments: readonly ActiveRoleAssignment[]
): Set<string> {
  const merged = new Set<string>();
  for (const assignment of assignments) {
    const role = resolveEnterpriseRole(assignment.slug);
    for (const key of expandPermissionBundles(assignment.permissionKeys, role)) {
      merged.add(key);
    }
  }
  return merged;
}

export async function resolveActiveRoleAssignments(
  tenantId: string,
  userId: string,
  client?: pg.PoolClient
): Promise<ActiveRoleAssignment[]> {
  const pool = getPool();
  const executor = client ?? (await pool.connect());
  const owns = !client;
  try {
    const repo = new RbacRepository(tenantId, executor);
    const rows = await repo.listActiveUserRoleAssignments(userId);
    const result: ActiveRoleAssignment[] = [];

    for (const row of rows) {
      const role = await repo.getRoleById(row.role_id, true);
      if (!role || role.status === 'archived') continue;

      let permissionKeys: string[];
      const dbPerms = await repo.listRolePermissionKeys(row.role_id);
      if (dbPerms.length > 0) {
        permissionKeys = dbPerms;
      } else if (role.is_system) {
        permissionKeys = [...permissionsForRole(row.slug)];
      } else {
        permissionKeys = [];
      }

      result.push({
        roleId: row.role_id,
        slug: row.slug,
        roleVersion: role.version,
        permissionKeys,
        status: role.status,
      });
    }
    return result;
  } finally {
    if (owns) executor.release();
  }
}

export async function resolveEffectivePermissions(input: {
  tenantId: string;
  userId: string;
  legacyRole: string;
  client?: pg.PoolClient;
  breakGlassSessionId?: string | null;
}): Promise<{ permissions: string[]; assignments: ActiveRoleAssignment[] }> {
  if (input.breakGlassSessionId) {
    return {
      permissions: allCatalogPermissionKeys(),
      assignments: [],
    };
  }

  const assignments = await resolveActiveRoleAssignments(
    input.tenantId,
    input.userId,
    input.client
  );

  if (assignments.length === 0) {
    const legacyKeys = permissionsForRole(input.legacyRole);
    return {
      permissions: [...expandPermissionBundles(legacyKeys, resolveEnterpriseRole(input.legacyRole))],
      assignments: [],
    };
  }

  for (const assignment of assignments) {
    if (isSystemOwnerSlug(assignment.slug) || assignment.slug === 'super_admin') {
      // allCatalogPermissionKeys() includes both v1 keys (ALL_PERMISSIONS) and v2 bundle keys
      // (FINANCIAL_WRITE_BUNDLE etc.), so both requirePermission('users.manage') and
      // requirePermission('financial.write') pass — financial.write expands to v2 bundle
      // keys at check-time, which must be present in the effective set.
      return { permissions: allCatalogPermissionKeys(), assignments };
    }
  }

  const expanded = unionExpandedPermissions(assignments);
  if (expanded.size === 0) {
    const legacyKeys = permissionsForRole(input.legacyRole);
    return {
      permissions: [...expandPermissionBundles(legacyKeys, resolveEnterpriseRole(input.legacyRole))],
      assignments,
    };
  }

  return { permissions: [...expanded], assignments };
}

/** Map v2 permission keys to v1 Permission[] for legacy middleware compatibility. */
export function toLegacyPermissionArray(keys: readonly string[]): Permission[] {
  const out = new Set<Permission>();
  for (const key of keys) {
    if (isKnownPermission(key)) out.add(key as Permission);
  }
  return [...out];
}
