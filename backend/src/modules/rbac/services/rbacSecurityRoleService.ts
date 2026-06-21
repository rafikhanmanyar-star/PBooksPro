/**
 * RBAC 2.0 security role management service (Phase 2 — behind feature flag).
 */
import type pg from 'pg';
import { listRoleTemplates, getRoleTemplateById } from '../../../auth/roleTemplates.js';
import type { Permission } from '../../../auth/permissions.js';
import { RbacRepository, type RbacRoleRow } from '../repositories/RbacRepository.js';
import {
  getRoleDetail,
  listRoles,
  normalizeRoleSlug,
  resolveRolePermissions,
  isImmutableAllPermissionsRole,
} from './rbacService.js';
import { isProtectedSystemSlug } from './rbacPermissionResolver.js';
import { isSystemOwnerSlug } from '../../../auth/permissions.js';
import { computeRoleVersionHash } from './rbacRoleVersionService.js';
import { appendRbacAuditLog, type RbacAuditInput } from './rbacAuditService.js';
import {
  runRolePermissionValidation,
  runUserRoleUnionValidation,
  runRolePermissionUpdateHolderCheck,
  validatePermissionKeysV2,
  type ActorContext,
  SodViolationError,
  DelegationDeniedError,
  PrivilegeCeilingExceededError,
} from './rbacV2ValidationPipeline.js';
import { assertNoSodViolationOnUnion } from './rbacSodService.js';
import { resolveUserPermissions } from './rbacPermissionResolver.js';
import { allCatalogPermissionKeys } from './rbacCatalogPermissions.js';
import {
  mergeRbacAuditInput,
  type RbacAuditMeta,
  type SecurityMutationContext,
} from './rbacAuditMeta.js';

export type SecurityRoleApi = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: 'active' | 'inactive' | 'archived';
  roleType: 'system' | 'custom' | 'template_instance';
  systemRole: boolean;
  isProtected: boolean;
  userCount: number;
  permissionCount: number;
  version: number;
  roleVersionHash: string | null;
  templateId: string | null;
  archivedAt: string | null;
};

function assertRoleMutable(role: RbacRoleRow, action: string): void {
  if (role.is_hidden || isImmutableAllPermissionsRole(role.slug)) {
    throw Object.assign(new Error('This role cannot be modified'), { code: 'FORBIDDEN' });
  }
  if (role.is_system) {
    throw Object.assign(new Error(`System role cannot be ${action}`), { code: 'FORBIDDEN' });
  }
  if (role.status === 'archived' && action !== 'restored') {
    throw Object.assign(new Error(`Archived role cannot be ${action}`), { code: 'FORBIDDEN' });
  }
}

function mapRole(row: RbacRoleRow & { user_count?: number; permission_count?: number }): SecurityRoleApi {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    status: row.status,
    roleType: row.role_type ?? (row.is_system ? 'system' : 'custom'),
    systemRole: row.is_system,
    isProtected: row.is_protected,
    userCount: row.user_count ?? 0,
    permissionCount: row.permission_count ?? 0,
    version: row.version,
    roleVersionHash: row.role_version_hash,
    templateId: row.template_id,
    archivedAt: row.archived_at ? row.archived_at.toISOString() : null,
  };
}

async function buildActorContext(
  tenantId: string,
  userId: string,
  client?: pg.PoolClient,
  options?: { breakGlass?: boolean }
): Promise<ActorContext> {
  if (options?.breakGlass) {
    return {
      userId,
      tenantId,
      resolvedPermissions: allCatalogPermissionKeys(),
      roleSlugs: ['SYSTEM_OWNER'],
      isSystemOwner: true,
    };
  }
  const repo = new RbacRepository(tenantId, client);
  const assignments = await repo.listActiveUserRoleAssignments(userId);
  const isSystemOwner = await repo.userHasSystemOwnerRole(userId);
  const resolved = await resolveUserPermissions(tenantId, userId, assignments[0]?.slug ?? 'read_only', client);
  return {
    userId,
    tenantId,
    resolvedPermissions: resolved,
    roleSlugs: assignments.map((a) => a.slug),
    isSystemOwner,
  };
}

async function persistRolePermissions(
  tenantId: string,
  repo: RbacRepository,
  role: RbacRoleRow,
  permissionKeys: string[]
): Promise<string> {
  await repo.replaceRolePermissions(role.id, permissionKeys);
  const hash = computeRoleVersionHash({
    tenantId,
    roleId: role.id,
    version: role.version,
    permissionKeys,
  });
  await repo.setRoleVersionHash(role.id, hash);
  return hash;
}

function withAuditMeta(input: RbacAuditInput, meta?: RbacAuditMeta): RbacAuditInput {
  return mergeRbacAuditInput(input, meta);
}

export async function securityListRoles(tenantId: string): Promise<SecurityRoleApi[]> {
  const roles = await listRoles(tenantId);
  const repo = new RbacRepository(tenantId);
  const rows = await repo.listVisibleRoles();
  return rows.map((row) => {
    const api = roles.find((r) => r.id === row.id);
    return mapRole({
      ...row,
      user_count: row.user_count,
      permission_count: api?.permissionCount ?? row.permission_count,
    });
  });
}

export async function securityGetRole(tenantId: string, roleId: string) {
  const detail = await getRoleDetail(tenantId, roleId);
  if (!detail) return null;
  const repo = new RbacRepository(tenantId);
  const row = await repo.getRoleById(roleId);
  if (!row) return null;
  return {
    ...mapRole({ ...row, user_count: detail.userCount, permission_count: detail.permissionCount }),
    permissions: detail.permissions,
  };
}

export async function securityCreateRole(
  tenantId: string,
  actorId: string,
  input: {
    name: string;
    slug?: string;
    description?: string | null;
    status?: 'active' | 'inactive';
    permissions: string[];
  },
  client: pg.PoolClient,
  ctx?: SecurityMutationContext
) {
  const slug = input.slug ?? normalizeRoleSlug(input.name);
  if (isSystemOwnerSlug(slug) || isProtectedSystemSlug(slug)) {
    throw Object.assign(new Error('Reserved role slug'), { code: 'VALIDATION_ERROR' });
  }
  const permissions = validatePermissionKeysV2(input.permissions);
  const actor = await buildActorContext(tenantId, actorId, client, { breakGlass: ctx?.breakGlass });
  runRolePermissionValidation(actor, permissions, 'role_create', slug);

  const repo = new RbacRepository(tenantId, client);
  const existing = await repo.getRoleBySlug(slug, true);
  if (existing) throw Object.assign(new Error('Role slug already exists'), { code: 'DUPLICATE' });

  const row = await repo.createRole({
    slug,
    name: input.name.trim(),
    description: input.description ?? null,
    status: input.status ?? 'active',
    permissions,
    roleType: 'custom',
  });
  const hash = await persistRolePermissions(tenantId, repo, row, permissions);
  await appendRbacAuditLog(client, withAuditMeta({
    tenantId,
    actorUserId: actorId,
    action: 'ROLE_CREATED',
    targetType: 'role',
    targetId: row.id,
    targetRoleId: row.id,
    afterState: { slug, name: row.name, permissions, roleVersionHash: hash },
  }, ctx?.auditMeta));
  return securityGetRole(tenantId, row.id);
}

export async function securityUpdateRole(
  tenantId: string,
  actorId: string,
  roleId: string,
  input: {
    name: string;
    description?: string | null;
    status: 'active' | 'inactive';
    permissions: string[];
    version: number;
  },
  client: pg.PoolClient,
  ctx?: SecurityMutationContext
) {
  const permissions = validatePermissionKeysV2(input.permissions);
  const repo = new RbacRepository(tenantId, client);
  const before = await repo.getRoleById(roleId);
  if (!before) {
    throw Object.assign(new Error('Role not found'), { code: 'NOT_FOUND' });
  }
  assertRoleMutable(before, 'modified');

  const actor = await buildActorContext(tenantId, actorId, client, { breakGlass: ctx?.breakGlass });
  const beforePerms = await resolveRolePermissions(repo, before);

  runRolePermissionValidation(actor, permissions, 'role_update', before.slug);

  const holderIds = await repo.listRoleHolderUserIds(roleId);
  for (const userId of holderIds) {
    const userRoles = await repo.listActiveUserRolesExpanded(userId);
    runRolePermissionUpdateHolderCheck({
      permissionsBefore: beforePerms,
      permissionsAfter: permissions,
      holderRolePermissionSets: userRoles.map((r) => r.permissions),
      holderRoleSlugs: userRoles.map((r) => r.slug),
      holderRoleIds: userRoles.map((r) => r.role_id),
      roleIdBeingUpdated: roleId,
    });
  }

  const row = await repo.updateRole(roleId, {
    name: input.name.trim(),
    description: input.description ?? null,
    status: input.status,
    permissions,
    expectedVersion: input.version,
  });
  if (!row) return undefined;

  await persistRolePermissions(tenantId, repo, row, permissions);

  // Bump access_version for every user who holds this role so STALE_AV is detected
  // immediately on their next request. The role.version increment already changes the
  // rolePermissionsHash, but an explicit bump ensures the AV check fires even in edge
  // cases where the hash comparison is bypassed or the user had no prior V2 token.
  for (const userId of holderIds) {
    await repo.incrementUserAccessVersion(userId);
  }

  await appendRbacAuditLog(client, withAuditMeta({
    tenantId,
    actorUserId: actorId,
    action: 'ROLE_UPDATED',
    targetType: 'role',
    targetId: roleId,
    targetRoleId: roleId,
    beforeState: { name: before.name, permissions: beforePerms },
    afterState: { name: row.name, permissions },
  }, ctx?.auditMeta));
  return securityGetRole(tenantId, roleId);
}

export async function securityArchiveRole(
  tenantId: string,
  actorId: string,
  roleId: string,
  version: number,
  client: pg.PoolClient,
  ctx?: SecurityMutationContext
) {
  const repo = new RbacRepository(tenantId, client);
  const before = await repo.getRoleById(roleId);
  if (!before) return null;
  assertRoleMutable(before, 'archived');

  const row = await repo.archiveRole(roleId, version);
  if (!row) return undefined;

  const holderIds = await repo.deactivateAllAssignmentsForRole(roleId);
  for (const userId of holderIds) {
    await repo.incrementUserAccessVersion(userId);
  }

  await appendRbacAuditLog(client, withAuditMeta({
    tenantId,
    actorUserId: actorId,
    action: 'ROLE_ARCHIVED',
    targetType: 'role',
    targetId: roleId,
    targetRoleId: roleId,
    beforeState: { status: before.status, activeHolderCount: holderIds.length },
    afterState: { status: row.status, assignmentsDeactivated: holderIds.length },
  }, ctx?.auditMeta));
  return securityGetRole(tenantId, roleId);
}

export async function securityRestoreRole(
  tenantId: string,
  actorId: string,
  roleId: string,
  version: number,
  client: pg.PoolClient,
  ctx?: SecurityMutationContext
) {
  const repo = new RbacRepository(tenantId, client);
  const before = await repo.getRoleById(roleId);
  if (!before || before.status !== 'archived') {
    throw Object.assign(new Error('Role is not archived'), { code: 'FORBIDDEN' });
  }
  if (before.is_system || before.is_hidden) {
    throw Object.assign(new Error('System role cannot be restored'), { code: 'FORBIDDEN' });
  }

  const inactiveUserIds = await repo.listInactiveAssignmentUserIds(roleId);
  const rolePerms = await resolveRolePermissions(repo, before);
  for (const userId of inactiveUserIds) {
    const activeRoles = await repo.listActiveUserRolesExpanded(userId);
    const sets = [...activeRoles.map((r) => r.permissions), rolePerms];
    const slugs = [...activeRoles.map((r) => r.slug), before.slug];
    assertNoSodViolationOnUnion(sets, slugs, 'role_restore');
  }

  const row = await repo.restoreRole(roleId, version);
  if (!row) return undefined;

  await repo.reactivateAllAssignmentsForRole(roleId);
  for (const userId of inactiveUserIds) {
    await repo.incrementUserAccessVersion(userId);
  }

  await appendRbacAuditLog(client, withAuditMeta({
    tenantId,
    actorUserId: actorId,
    action: 'ROLE_RESTORED',
    targetType: 'role',
    targetId: roleId,
    targetRoleId: roleId,
    afterState: { status: row.status, assignmentsReactivated: inactiveUserIds.length },
  }, ctx?.auditMeta));
  return securityGetRole(tenantId, roleId);
}

export async function securityAssignRole(
  tenantId: string,
  actorId: string,
  roleId: string,
  targetUserId: string,
  client: pg.PoolClient,
  ctx?: SecurityMutationContext
) {
  const repo = new RbacRepository(tenantId, client);
  const role = await repo.getRoleById(roleId, true);
  if (!role || role.status === 'archived') {
    throw Object.assign(new Error('Role not found or archived'), { code: 'NOT_FOUND' });
  }
  if (isSystemOwnerSlug(role.slug) && !(await repo.userHasSystemOwnerRole(actorId)) && !ctx?.breakGlass) {
    throw Object.assign(new Error('Only SYSTEM_OWNER may assign SYSTEM_OWNER'), { code: 'FORBIDDEN' });
  }

  const actor = await buildActorContext(tenantId, actorId, client, { breakGlass: ctx?.breakGlass });
  const rolePerms = await resolveRolePermissions(repo, role);
  const existing = await repo.listActiveUserRolesExpanded(targetUserId);
  const sets = [...existing.map((r) => r.permissions), rolePerms];
  const slugs = [...existing.map((r) => r.slug), role.slug];
  runUserRoleUnionValidation(actor, sets, slugs, 'user_role_assignment');

  await repo.assignUserRoleActive(targetUserId, roleId, actorId, { isActive: true });
  await appendRbacAuditLog(client, withAuditMeta({
    tenantId,
    actorUserId: actorId,
    action: 'ROLE_ASSIGNED',
    targetType: 'user',
    targetUserId,
    targetRoleId: roleId,
    afterState: { roleId, slug: role.slug },
  }, ctx?.auditMeta));
  return repo.listActiveUserRoleAssignments(targetUserId);
}

export async function securityUnassignRole(
  tenantId: string,
  actorId: string,
  roleId: string,
  targetUserId: string,
  client: pg.PoolClient,
  ctx?: SecurityMutationContext
) {
  const repo = new RbacRepository(tenantId, client);
  const deactivated = await repo.setUserRoleActive(targetUserId, roleId, false);
  if (!deactivated) return false;
  await appendRbacAuditLog(client, withAuditMeta({
    tenantId,
    actorUserId: actorId,
    action: 'ROLE_REMOVED',
    targetType: 'user',
    targetUserId,
    targetRoleId: roleId,
  }, ctx?.auditMeta));
  return true;
}

export function securityListTemplates() {
  return listRoleTemplates().map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    description: t.description,
    category: t.category,
    permissionCount: t.permissionKeys.length,
  }));
}

export async function securityInstantiateTemplate(
  tenantId: string,
  actorId: string,
  templateId: string,
  input: { name: string; slug?: string },
  client: pg.PoolClient,
  ctx?: SecurityMutationContext
) {
  const template = getRoleTemplateById(templateId);
  if (!template) throw Object.assign(new Error('Template not found'), { code: 'NOT_FOUND' });

  const permissions = validatePermissionKeysV2([...template.permissionKeys]);
  const actor = await buildActorContext(tenantId, actorId, client, { breakGlass: ctx?.breakGlass });
  const slug = input.slug ?? normalizeRoleSlug(input.name);
  runRolePermissionValidation(actor, permissions, 'template_instantiate', slug);

  const repo = new RbacRepository(tenantId, client);
  const row = await repo.createRole({
    slug,
    name: input.name.trim(),
    description: `From template: ${template.name}`,
    permissions,
    roleType: 'template_instance',
    templateId: template.id,
  });
  await persistRolePermissions(tenantId, repo, row, permissions);
  await appendRbacAuditLog(client, withAuditMeta({
    tenantId,
    actorUserId: actorId,
    action: 'TEMPLATE_INSTANTIATED',
    targetType: 'template',
    targetId: template.id,
    targetRoleId: row.id,
    afterState: { templateId: template.id, roleId: row.id, permissions },
  }, ctx?.auditMeta));
  return securityGetRole(tenantId, row.id);
}

export async function securityListAudit(tenantId: string, limit = 100) {
  const repo = new RbacRepository(tenantId);
  return repo.listRbacAuditLog(limit);
}

export {
  SodViolationError,
  DelegationDeniedError,
  PrivilegeCeilingExceededError,
};
