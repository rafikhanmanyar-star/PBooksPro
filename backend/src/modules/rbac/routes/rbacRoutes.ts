import { Router } from 'express';
import { z } from 'zod';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { invalidateAuthUserCache } from '../../../middleware/authMiddleware.js';
import { requireAnyPermission, requirePermission } from '../../../middleware/rbacMiddleware.js';
import { sendFailure, sendSuccess, handleRouteError, sendVersionConflict } from '../../../utils/apiResponse.js';
import { withTransaction } from '../../../db/pool.js';
import { appendAuditEvent } from '../../organization/services/enterpriseAuditService.js';
import { emitEntityEvent } from '../../../core/realtime.js';
import { RbacRepository } from '../repositories/RbacRepository.js';
import {
  buildPermissionCatalog,
  getRoleDetail,
  listRoles,
  normalizeRoleSlug,
  resolveRolePermissions,
  validatePermissionKeys,
  isImmutableAllPermissionsRole,
} from '../services/rbacService.js';
import { isProtectedSystemSlug } from '../services/rbacPermissionResolver.js';
import { isSystemOwnerSlug } from '../../../auth/permissions.js';

export const rbacRolesRouter = Router();

const roleBodySchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(64).optional(),
  description: z.string().max(500).nullable().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  permissions: z.array(z.string()).default([]),
  version: z.number().int().positive().optional(),
});

function roleAuditModule() {
  return 'rbac';
}

rbacRolesRouter.get('/rbac/roles', requireAnyPermission('roles.view', 'permissions.manage'), async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const roles = await listRoles(tenantId);
    sendSuccess(res, roles);
  } catch (e) {
    handleRouteError(res, e);
  }
});

rbacRolesRouter.get('/rbac/roles/:id', requireAnyPermission('roles.view', 'permissions.manage'), async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const detail = await getRoleDetail(tenantId, req.params.id);
    if (!detail) {
      sendFailure(res, 404, 'NOT_FOUND', 'Role not found');
      return;
    }
    sendSuccess(res, detail);
  } catch (e) {
    handleRouteError(res, e);
  }
});

rbacRolesRouter.post('/rbac/roles', requirePermission('roles.manage'), async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const parsed = roleBodySchema.safeParse(req.body);
  if (!parsed.success) {
    sendFailure(res, 400, 'VALIDATION_ERROR', parsed.error.message);
    return;
  }
  const slug = parsed.data.slug ?? normalizeRoleSlug(parsed.data.name);
  if (isSystemOwnerSlug(slug) || isProtectedSystemSlug(slug)) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'Reserved role slug');
    return;
  }
  try {
    const permissions = validatePermissionKeys(parsed.data.permissions);
    const created = await withTransaction(async (client) => {
      const repo = new RbacRepository(tenantId, client);
      const existing = await repo.getRoleBySlug(slug, true);
      if (existing) throw Object.assign(new Error('Role slug already exists'), { code: 'DUPLICATE' });
      const row = await repo.createRole({
        slug,
        name: parsed.data.name.trim(),
        description: parsed.data.description ?? null,
        status: parsed.data.status ?? 'active',
        permissions,
      });
      await appendAuditEvent(client, {
        tenantId,
        userId: req.userId ?? null,
        module: roleAuditModule(),
        action: 'create',
        entityType: 'rbac_role',
        entityId: row.id,
        summary: `Role created: ${row.name}`,
        newValue: { slug: row.slug, name: row.name, permissions },
      });
      return row;
    });
    emitEntityEvent(tenantId, 'created', 'rbac_role', { id: created.id, sourceUserId: req.userId });
    const detail = await getRoleDetail(tenantId, created.id);
    sendSuccess(res, detail, 201);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === 'DUPLICATE' || err.code === '23505') {
      sendFailure(res, 409, 'DUPLICATE', 'Role slug already exists');
      return;
    }
    if (e instanceof Error && e.message.startsWith('Unknown permissions')) {
      sendFailure(res, 400, 'VALIDATION_ERROR', e.message);
      return;
    }
    handleRouteError(res, e);
  }
});

rbacRolesRouter.put('/rbac/roles/:id', requirePermission('roles.manage'), async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const parsed = roleBodySchema.safeParse(req.body);
  if (!parsed.success || parsed.data.version == null) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'Invalid body or missing version');
    return;
  }
  try {
    const permissions = validatePermissionKeys(parsed.data.permissions);
    const updated = await withTransaction(async (client) => {
      const repo = new RbacRepository(tenantId, client);
      const before = await repo.getRoleById(req.params.id);
      if (!before) return null;
      if (before.is_hidden || isImmutableAllPermissionsRole(before.slug)) {
        throw Object.assign(new Error('This role cannot be modified'), { code: 'FORBIDDEN' });
      }
      const beforePerms = await resolveRolePermissions(repo, before);
      const row = before.is_protected
        ? await repo.updateRolePermissionsOnly(req.params.id, permissions, parsed.data.version!)
        : await repo.updateRole(
            req.params.id,
            {
              name: parsed.data.name.trim(),
              description: parsed.data.description ?? null,
              status: parsed.data.status ?? 'active',
              permissions,
              expectedVersion: parsed.data.version!,
            }
          );
      if (!row) return undefined;
      await appendAuditEvent(client, {
        tenantId,
        userId: req.userId ?? null,
        module: roleAuditModule(),
        action: 'edit',
        entityType: 'rbac_role',
        entityId: row.id,
        summary: `Role updated: ${row.name}`,
        oldValue: { name: before.name, status: before.status, permissions: beforePerms },
        newValue: { name: row.name, status: row.status, permissions },
      });
      return row;
    });
    if (updated === null) {
      sendFailure(res, 404, 'NOT_FOUND', 'Role not found');
      return;
    }
    if (updated === undefined) {
      const current = await getRoleDetail(tenantId, req.params.id);
      sendVersionConflict(res, current?.version ?? parsed.data.version!);
      return;
    }
    emitEntityEvent(tenantId, 'updated', 'rbac_role', { id: updated.id, sourceUserId: req.userId });
    const detail = await getRoleDetail(tenantId, updated.id);
    sendSuccess(res, detail);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === 'FORBIDDEN') {
      sendFailure(res, 403, 'FORBIDDEN', err.message ?? 'Protected role');
      return;
    }
    if (e instanceof Error && e.message.startsWith('Unknown permissions')) {
      sendFailure(res, 400, 'VALIDATION_ERROR', e.message);
      return;
    }
    handleRouteError(res, e);
  }
});

rbacRolesRouter.post('/rbac/roles/:id/duplicate', requirePermission('roles.manage'), async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  const parsed = z.object({ name: z.string().min(1).max(120) }).safeParse(req.body);
  if (!parsed.success) {
    sendFailure(res, 400, 'VALIDATION_ERROR', 'Name is required');
    return;
  }
  const slug = normalizeRoleSlug(parsed.data.name);
  try {
    const created = await withTransaction(async (client) => {
      const repo = new RbacRepository(tenantId, client);
      const source = await repo.getRoleById(req.params.id);
      if (!source || source.is_hidden) return null;
      const sourcePerms = await resolveRolePermissions(repo, source);
      const row = await repo.createRole({
        slug,
        name: parsed.data.name.trim(),
        description: source.description,
        status: 'active',
        permissions: sourcePerms,
      });
      await appendAuditEvent(client, {
        tenantId,
        userId: req.userId ?? null,
        module: roleAuditModule(),
        action: 'create',
        entityType: 'rbac_role',
        entityId: row.id,
        summary: `Role duplicated from ${source.name}: ${row.name}`,
        newValue: { sourceId: source.id, slug: row.slug },
      });
      return row;
    });
    if (!created) {
      sendFailure(res, 404, 'NOT_FOUND', 'Role not found');
      return;
    }
    emitEntityEvent(tenantId, 'created', 'rbac_role', { id: created.id, sourceUserId: req.userId });
    const detail = await getRoleDetail(tenantId, created.id);
    sendSuccess(res, detail, 201);
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === '23505') {
      sendFailure(res, 409, 'DUPLICATE', 'Role slug already exists');
      return;
    }
    handleRouteError(res, e);
  }
});

rbacRolesRouter.delete('/rbac/roles/:id', requirePermission('roles.manage'), async (req: AuthedRequest, res) => {
  const tenantId = req.tenantId;
  if (!tenantId) {
    sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
    return;
  }
  try {
    const deleted = await withTransaction(async (client) => {
      const repo = new RbacRepository(tenantId, client);
      const before = await repo.getRoleById(req.params.id);
      if (!before) return null;
      if (before.is_protected || before.is_hidden) {
        throw Object.assign(new Error('System role cannot be deleted'), { code: 'FORBIDDEN' });
      }
      const ok = await repo.deleteRole(req.params.id);
      if (!ok) return false;
      await appendAuditEvent(client, {
        tenantId,
        userId: req.userId ?? null,
        module: roleAuditModule(),
        action: 'delete',
        entityType: 'rbac_role',
        entityId: before.id,
        summary: `Role deleted: ${before.name}`,
        oldValue: { slug: before.slug, name: before.name },
      });
      return true;
    });
    if (deleted === null) {
      sendFailure(res, 404, 'NOT_FOUND', 'Role not found');
      return;
    }
    if (!deleted) {
      sendFailure(res, 403, 'FORBIDDEN', 'Role cannot be deleted');
      return;
    }
    emitEntityEvent(tenantId, 'deleted', 'rbac_role', { id: req.params.id, sourceUserId: req.userId });
    sendSuccess(res, { deleted: true });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === 'FORBIDDEN') {
      sendFailure(res, 403, 'FORBIDDEN', err.message ?? 'Protected role');
      return;
    }
    handleRouteError(res, e);
  }
});

export const rbacCatalogRouter = Router();

rbacCatalogRouter.get(
  '/rbac/permission-catalog',
  requireAnyPermission('permissions.view', 'permissions.read', 'permissions.manage'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    try {
      const catalog = await buildPermissionCatalog(tenantId);
      sendSuccess(res, catalog);
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);

export const rbacUserRolesRouter = Router();

const assignRolesSchema = z.object({
  roleIds: z.array(z.string().min(1)),
});

rbacUserRolesRouter.get(
  '/rbac/users/:userId/roles',
  requireAnyPermission('users.role.assign', 'users.manage', 'roles.view'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    try {
      const repo = new RbacRepository(tenantId);
      const assignments = await repo.listUserRoleAssignments(req.params.userId);
      sendSuccess(res, assignments);
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);

rbacUserRolesRouter.put(
  '/rbac/users/:userId/roles',
  requireAnyPermission('users.role.assign', 'users.manage', 'permissions.manage'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const actorId = req.userId;
    if (!tenantId || !actorId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const parsed = assignRolesSchema.safeParse(req.body);
    if (!parsed.success) {
      sendFailure(res, 400, 'VALIDATION_ERROR', parsed.error.message);
      return;
    }
    const targetUserId = req.params.userId;
    try {
      const result = await withTransaction(async (client) => {
        const repo = new RbacRepository(tenantId, client);
        const actorIsOwner = await repo.userHasSystemOwnerRole(actorId);
        const roles = await Promise.all(
          parsed.data.roleIds.map((id) => repo.getRoleById(id, true))
        );
        if (roles.some((r) => !r)) {
          throw Object.assign(new Error('Invalid role'), { code: 'VALIDATION' });
        }
        for (const role of roles) {
          if (!role) continue;
          if (isSystemOwnerSlug(role.slug) && !actorIsOwner) {
            throw Object.assign(new Error('Only SYSTEM_OWNER may assign SYSTEM_OWNER'), {
              code: 'FORBIDDEN',
            });
          }
        }

        const before = await repo.listUserRoleAssignments(targetUserId);
        await client.query(`DELETE FROM rbac_user_roles WHERE tenant_id = $1 AND user_id = $2`, [
          tenantId,
          targetUserId,
        ]);
        for (const roleId of parsed.data.roleIds) {
          await repo.assignUserRole(targetUserId, roleId, actorId);
        }

        const primary = roles.find((r) => r && !r.is_hidden);
        if (primary) {
          await repo.syncPrimaryUserRole(targetUserId, primary.slug);
        }

        if (targetUserId === actorId) {
          const stillAdmin = await repo.countUsersWithRbacAdminRole();
          if (stillAdmin === 0) {
            throw Object.assign(new Error('Cannot remove your last RBAC administration role'), {
              code: 'FORBIDDEN',
            });
          }
        }

        const after = await repo.listUserRoleAssignments(targetUserId);
        await appendAuditEvent(client, {
          tenantId,
          userId: actorId,
          module: roleAuditModule(),
          action: 'role_change',
          entityType: 'user',
          entityId: targetUserId,
          summary: 'User roles updated',
          oldValue: before.map((b) => ({ roleId: b.role_id, slug: b.slug })),
          newValue: after.map((a) => ({ roleId: a.role_id, slug: a.slug })),
        });
        return after;
      });
      invalidateAuthUserCache(targetUserId, tenantId);
      emitEntityEvent(tenantId, 'updated', 'user', { id: targetUserId, sourceUserId: actorId });
      sendSuccess(res, result);
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code === 'FORBIDDEN') {
        sendFailure(res, 403, 'FORBIDDEN', err.message ?? 'Forbidden');
        return;
      }
      if (err.code === 'VALIDATION') {
        sendFailure(res, 400, 'VALIDATION_ERROR', 'Invalid role selection');
        return;
      }
      handleRouteError(res, e);
    }
  }
);
