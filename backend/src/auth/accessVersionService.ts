/**
 * RBAC 2.0 Phase 3 — composite access version hash (Architecture V2 §2.5).
 */
import { createHash } from 'node:crypto';
import type pg from 'pg';
import { getPool } from '../db/pool.js';
import { RbacRepository } from '../modules/rbac/repositories/RbacRepository.js';
import { permissionsForRole } from './permissions.js';
import { resolveActiveRoleAssignments, type ActiveRoleAssignment } from './rbacPermissionResolver.js';
import {
  hashStoredDataScopeRows,
  resolveDataScopeMaterial,
  type StoredDataScopeRow,
} from './dataScopeResolver.js';
import type { ScopeDimension } from './dataScopeTypes.js';
import { hashStoredApprovalRows, resolveApprovalMaterial } from './approvalCapabilityResolver.js';

export type AccessVersionMaterial = {
  tenantId: string;
  userId: string;
  isActive: boolean;
  suspendedAt: string | null;
  accessVersion: number;
  tenantRbacGlobalVersion: number;
  activeAssignmentCount: number;
  maxRoleVersion: number;
  rolePermissionsHash: string;
  scopeHash: string;
  approvalHash: string;
  breakGlassSessionId: string | null;
};

export function hashRolePermissionSets(assignments: readonly ActiveRoleAssignment[]): string {
  const lines = assignments
    .map((a) => {
      const perms = [...a.permissionKeys].sort().join(',');
      return `${a.roleId}:${a.roleVersion}:${perms}`;
    })
    .sort();
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

export function computeCompositeAccessVersionHash(material: AccessVersionMaterial): string {
  const payload = [
    material.tenantId,
    material.userId,
    String(material.isActive),
    material.suspendedAt ?? '',
    String(material.accessVersion),
    String(material.tenantRbacGlobalVersion),
    String(material.activeAssignmentCount),
    String(material.maxRoleVersion),
    material.rolePermissionsHash,
    material.scopeHash,
    material.approvalHash,
    material.breakGlassSessionId ?? '',
  ].join('|');
  return createHash('sha256').update(payload).digest('hex');
}

export function buildAccessVersionMaterial(input: {
  tenantId: string;
  userId: string;
  isActive: boolean;
  suspendedAt?: string | null;
  accessVersion: number;
  tenantRbacGlobalVersion: number;
  assignments: readonly ActiveRoleAssignment[];
  scopeHash?: string;
  approvalHash?: string;
  breakGlassSessionId?: string | null;
}): AccessVersionMaterial {
  const maxRoleVersion =
    input.assignments.length > 0 ? Math.max(...input.assignments.map((a) => a.roleVersion)) : 0;
  return {
    tenantId: input.tenantId,
    userId: input.userId,
    isActive: input.isActive,
    suspendedAt: input.suspendedAt ?? null,
    accessVersion: input.accessVersion,
    tenantRbacGlobalVersion: input.tenantRbacGlobalVersion,
    activeAssignmentCount: input.assignments.length,
    maxRoleVersion,
    rolePermissionsHash: hashRolePermissionSets(input.assignments),
    scopeHash: input.scopeHash ?? hashScopeGrants([]),
    approvalHash: input.approvalHash ?? hashStoredApprovalRows([]),
    breakGlassSessionId: input.breakGlassSessionId ?? null,
  };
}

/** @deprecated Use hashStoredDataScopeRows from dataScopeResolver for av material. */
export function hashScopeGrants(
  scopes: readonly { dimension: string; mode?: string; entityIds?: readonly string[] }[]
): string {
  const rows: StoredDataScopeRow[] = [];
  for (const s of scopes) {
    const dimension = s.dimension as ScopeDimension;
    if (s.mode === 'all' || !s.entityIds?.length) {
      rows.push({ source: 'user', dimension, entityId: null });
      continue;
    }
    for (const id of s.entityIds) {
      rows.push({ source: 'user', dimension, entityId: id });
    }
  }
  return hashStoredDataScopeRows(rows);
}

export async function loadAccessVersionMaterial(
  tenantId: string,
  userId: string,
  client?: pg.PoolClient,
  options?: { breakGlassSessionId?: string | null }
): Promise<AccessVersionMaterial> {
  const pool = getPool();
  const executor = client ?? (await pool.connect());
  const owns = !client;
  try {
    const userRow = await executor.query<{
      is_active: boolean;
      access_version: number;
      rbac_global_version: number;
    }>(
      `SELECT u.is_active, u.access_version, t.rbac_global_version
       FROM users u
       INNER JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = $1 AND u.tenant_id = $2`,
      [userId, tenantId]
    );
    const row = userRow.rows[0];
    if (!row) {
      throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });
    }

    // User suspension: users.is_active is canonical (authMiddleware blocks inactive users).
    // users.suspended_at is not yet in schema — null placeholder until a future migration.
    const assignments = await resolveActiveRoleAssignments(tenantId, userId, executor);
    const scopeMaterial = await resolveDataScopeMaterial({
      tenantId,
      userId,
      assignments,
      isBreakGlass: Boolean(options?.breakGlassSessionId),
      client: executor,
    });
    const approvalMaterial = await resolveApprovalMaterial({
      tenantId,
      userId,
      permissions: assignments.flatMap((a) => a.permissionKeys),
      assignments,
      client: executor,
    });
    return buildAccessVersionMaterial({
      tenantId,
      userId,
      isActive: row.is_active,
      suspendedAt: null,
      accessVersion: row.access_version,
      tenantRbacGlobalVersion: row.rbac_global_version,
      assignments,
      scopeHash: scopeMaterial.scopeHash,
      approvalHash: approvalMaterial.approvalHash,
      breakGlassSessionId: options?.breakGlassSessionId ?? null,
    });
  } finally {
    if (owns) executor.release();
  }
}

export async function computeCurrentAccessVersionHash(
  tenantId: string,
  userId: string,
  client?: pg.PoolClient,
  options?: { breakGlassSessionId?: string | null }
): Promise<string> {
  const material = await loadAccessVersionMaterial(tenantId, userId, client, options);
  return computeCompositeAccessVersionHash(material);
}

/** Legacy fallback material when user has no RBAC assignments (matrix-only). */
export function legacyFallbackAssignment(roleSlug: string, roleId = 'legacy'): ActiveRoleAssignment {
  return {
    roleId,
    slug: roleSlug,
    roleVersion: 0,
    permissionKeys: [...permissionsForRole(roleSlug)],
    status: 'active',
  };
}
