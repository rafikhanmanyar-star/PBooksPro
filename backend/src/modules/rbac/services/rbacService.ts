import type pg from 'pg';
import {
  ALL_PERMISSIONS,
  ENTERPRISE_ROLE_LABELS,
  isKnownPermission,
  isSystemOwnerSlug,
  PERMISSION_LABELS,
  permissionsForRole,
  type EnterpriseRole,
  type Permission,
} from '../../../auth/permissions.js';
import { buildPermissionGroups } from '../../../auth/permissionGroups.js';
import { RbacRepository, type RbacRoleRow } from '../repositories/RbacRepository.js';
import { isProtectedSystemSlug } from './rbacPermissionResolver.js';

export type RoleApi = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: 'active' | 'inactive';
  isSystem: boolean;
  isProtected: boolean;
  userCount: number;
  permissionCount: number;
  version: number;
};

export type RoleDetailApi = RoleApi & {
  permissions: Permission[];
};

function rowToRoleApi(row: RbacRoleRow & { user_count?: number; permission_count?: number }): RoleApi {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    status: row.status,
    isSystem: row.is_system,
    isProtected: row.is_protected,
    userCount: row.user_count ?? 0,
    permissionCount: row.permission_count ?? 0,
    version: row.version,
  };
}

export async function resolveRolePermissions(
  repo: RbacRepository,
  role: RbacRoleRow
): Promise<Permission[]> {
  if (isSystemOwnerSlug(role.slug) || role.slug === 'super_admin') {
    return [...ALL_PERMISSIONS];
  }
  const dbPerms = await repo.listRolePermissionKeys(role.id);
  if (dbPerms.length > 0) {
    return dbPerms.filter(isKnownPermission);
  }
  if (role.is_system) {
    return permissionsForRole(role.slug);
  }
  return [];
}

export function isImmutableAllPermissionsRole(slug: string): boolean {
  return isSystemOwnerSlug(slug) || slug === 'super_admin';
}

/** System roles may have permissions edited except Super Admin / SYSTEM_OWNER. */
export function canEditRolePermissions(role: { slug: string }): boolean {
  return !isImmutableAllPermissionsRole(role.slug);
}

export async function listRoles(tenantId: string, client?: pg.PoolClient): Promise<RoleApi[]> {
  const repo = new RbacRepository(tenantId, client);
  const rows = await repo.listVisibleRoles();
  const result = await Promise.all(
    rows.map(async (row) => {
      const permissions = await resolveRolePermissions(repo, row);
      return rowToRoleApi({
        ...row,
        user_count: row.user_count,
        permission_count: permissions.length,
      });
    })
  );
  return result;
}

export async function getRoleDetail(
  tenantId: string,
  roleId: string,
  client?: pg.PoolClient
): Promise<RoleDetailApi | null> {
  const repo = new RbacRepository(tenantId, client);
  const row = await repo.getRoleById(roleId);
  if (!row) return null;
  const permissions = await resolveRolePermissions(repo, row);
  const counts = await repo.listVisibleRoles();
  const countRow = counts.find((r) => r.id === roleId);
  return {
    ...rowToRoleApi({ ...row, user_count: countRow?.user_count, permission_count: permissions.length }),
    permissions,
  };
}

export function validatePermissionKeys(keys: string[]): Permission[] {
  const invalid = keys.filter((k) => !isKnownPermission(k));
  if (invalid.length > 0) {
    throw new Error(`Unknown permissions: ${invalid.join(', ')}`);
  }
  return keys as Permission[];
}

export function normalizeRoleSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 64);
}

export async function buildPermissionCatalog(tenantId: string, client?: pg.PoolClient) {
  const repo = new RbacRepository(tenantId, client);
  const groups = buildPermissionGroups();
  const roles = await repo.listVisibleRoles();
  const assignments = await repo.listAllRolePermissionAssignments();

  const dbPermsByRole = new Map<string, Set<string>>();
  for (const row of assignments) {
    const set = dbPermsByRole.get(row.role_id) ?? new Set<string>();
    set.add(row.permission_key);
    dbPermsByRole.set(row.role_id, set);
  }

  const roleHasPermissionKey = (role: RbacRoleRow, key: Permission): boolean => {
    if (isImmutableAllPermissionsRole(role.slug)) return true;
    const dbSet = dbPermsByRole.get(role.id);
    if (dbSet && dbSet.size > 0) return dbSet.has(key);
    return permissionsForRole(role.slug).includes(key);
  };

  const matrix = ALL_PERMISSIONS.map((key) => ({
    key,
    label: PERMISSION_LABELS[key],
    roles: roles
      .filter((r) => roleHasPermissionKey(r, key))
      .map((r) => ({ id: r.id, slug: r.slug, name: r.name })),
  }));

  return { groups, permissions: matrix };
}

export async function buildStaticMatrixWithDbRoles(tenantId: string, client?: pg.PoolClient) {
  const roles = await listRoles(tenantId, client);
  const repo = new RbacRepository(tenantId, client);
  const result = await Promise.all(
    roles.map(async (role) => {
      const row = await repo.getRoleById(role.id);
      if (!row) return null;
      const permissions = await resolveRolePermissions(repo, row);
      return {
        role: role.slug,
        label: role.name,
        permissions,
      };
    })
  );
  return result.filter((r): r is NonNullable<typeof r> => r != null);
}

export function enterpriseLabelForSlug(slug: string): string {
  if (slug in ENTERPRISE_ROLE_LABELS) {
    return ENTERPRISE_ROLE_LABELS[slug as EnterpriseRole];
  }
  return slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export { isProtectedSystemSlug };
