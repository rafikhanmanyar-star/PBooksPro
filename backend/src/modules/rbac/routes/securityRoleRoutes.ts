import { Router } from 'express';
import { z } from 'zod';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { invalidateAuthUserCache } from '../../../middleware/authMiddleware.js';
import { requireAnyPermission, requirePermission } from '../../../middleware/rbacMiddleware.js';
import { requirePermissionV2 } from '../../../auth/authorizeV2.js';
import { sendFailure, sendSuccess, handleRouteError, sendVersionConflict } from '../../../utils/apiResponse.js';
import { withTransaction } from '../../../db/pool.js';
import { emitEntityEvent } from '../../../core/realtime.js';
import { isRbacV2RoleManagementEnabled } from '../services/rbacV2FeatureFlag.js';
import {
  securityArchiveRole,
  securityAssignRole,
  securityCreateRole,
  securityGetRole,
  securityInstantiateTemplate,
  securityListAudit,
  securityListRoles,
  securityListTemplates,
  securityRestoreRole,
  securityUnassignRole,
  securityUpdateRole,
  SodViolationError,
  DelegationDeniedError,
  PrivilegeCeilingExceededError,
} from '../services/rbacSecurityRoleService.js';
import { appendRbacAuditLog } from '../services/rbacAuditService.js';
import { requireRbacAuditRead } from '../middleware/rbacV2Middleware.js';
import { buildRbacAuditMeta, buildSecurityMutationContext } from '../services/rbacAuditMeta.js';

export const securityRoleRouter = Router();

function requireV2RoleManagement(req: AuthedRequest, res: import('express').Response, next: import('express').NextFunction) {
  if (!isRbacV2RoleManagementEnabled()) {
    sendFailure(res, 503, 'FEATURE_DISABLED', 'RBAC v2 role management is not enabled');
    return;
  }
  next();
}

function handleSecurityValidationError(res: import('express').Response, e: unknown): boolean {
  if (e instanceof SodViolationError) {
    sendFailure(res, 409, 'SOD_VIOLATION', e.message, { details: e.details });
    return true;
  }
  if (e instanceof DelegationDeniedError) {
    sendFailure(res, 409, 'DELEGATION_DENIED', e.message, { details: e.details });
    return true;
  }
  if (e instanceof PrivilegeCeilingExceededError) {
    sendFailure(res, 409, 'PRIVILEGE_CEILING_EXCEEDED', e.message, { details: e.details });
    return true;
  }
  const err = e as { code?: string; message?: string };
  if (err.code === 'VALIDATION_ERROR') {
    sendFailure(res, 400, 'VALIDATION_ERROR', err.message ?? 'Validation error');
    return true;
  }
  if (err.code === 'FORBIDDEN') {
    sendFailure(res, 403, 'FORBIDDEN', err.message ?? 'Forbidden');
    return true;
  }
  if (err.code === 'DUPLICATE' || err.code === '23505') {
    sendFailure(res, 409, 'DUPLICATE', 'Role slug already exists');
    return true;
  }
  if (err.code === 'NOT_FOUND') {
    sendFailure(res, 404, 'NOT_FOUND', err.message ?? 'Not found');
    return true;
  }
  return false;
}

async function logBlockedAttempt(
  req: AuthedRequest,
  tenantId: string,
  actorId: string | undefined,
  action: 'SOD_VIOLATION_BLOCKED' | 'PRIVILEGE_CEILING_BLOCKED' | 'DELEGATION_DENIED',
  reason: string,
  details: unknown
) {
  const meta = buildRbacAuditMeta(req);
  try {
    await withTransaction(async (client) => {
      await appendRbacAuditLog(client, {
        tenantId,
        actorUserId: actorId ?? null,
        actorType: meta.actorType,
        sessionId: meta.sessionId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        action,
        targetType: 'role',
        reason,
        afterState: details,
      });
    });
  } catch {
    // audit failure must not mask original error
  }
}

securityRoleRouter.use(requireV2RoleManagement);

securityRoleRouter.get(
  '/security/roles',
  requirePermissionV2('roles.view', 'permissions.manage', 'administration.roles.edit'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    try {
      sendSuccess(res, await securityListRoles(tenantId));
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);

securityRoleRouter.get(
  '/security/roles/:id',
  requirePermissionV2('roles.view', 'permissions.manage', 'administration.roles.edit'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    try {
      const role = await securityGetRole(tenantId, req.params.id);
      if (!role) {
        sendFailure(res, 404, 'NOT_FOUND', 'Role not found');
        return;
      }
      sendSuccess(res, role);
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);

const roleBodySchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(64).optional(),
  description: z.string().max(500).nullable().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  permissions: z.array(z.string()).default([]),
  version: z.number().int().positive().optional(),
});

securityRoleRouter.post(
  '/security/roles',
  requirePermission('roles.manage'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const actorId = req.userId;
    if (!tenantId || !actorId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const parsed = roleBodySchema.safeParse(req.body);
    if (!parsed.success) {
      sendFailure(res, 400, 'VALIDATION_ERROR', parsed.error.message);
      return;
    }
    try {
      const created = await withTransaction((client) =>
        securityCreateRole(tenantId, actorId, parsed.data, client, buildSecurityMutationContext(req))
      );
      emitEntityEvent(tenantId, 'created', 'rbac_role', { id: created?.id, sourceUserId: actorId });
      sendSuccess(res, created, 201);
    } catch (e) {
      if (e instanceof SodViolationError) {
        await logBlockedAttempt(req, tenantId, actorId, 'SOD_VIOLATION_BLOCKED', e.message, e.details);
      } else if (e instanceof PrivilegeCeilingExceededError) {
        await logBlockedAttempt(req, tenantId, actorId, 'PRIVILEGE_CEILING_BLOCKED', e.message, e.details);
      } else if (e instanceof DelegationDeniedError) {
        await logBlockedAttempt(req, tenantId, actorId, 'DELEGATION_DENIED', e.message, e.details);
      }
      if (handleSecurityValidationError(res, e)) return;
      handleRouteError(res, e);
    }
  }
);

securityRoleRouter.put(
  '/security/roles/:id',
  requirePermission('roles.manage'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const actorId = req.userId;
    if (!tenantId || !actorId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const parsed = roleBodySchema.safeParse(req.body);
    if (!parsed.success || parsed.data.version == null) {
      sendFailure(res, 400, 'VALIDATION_ERROR', 'Invalid body or missing version');
      return;
    }
    try {
      const updated = await withTransaction((client) =>
        securityUpdateRole(tenantId, actorId, req.params.id, {
          name: parsed.data.name,
          description: parsed.data.description,
          status: parsed.data.status ?? 'active',
          permissions: parsed.data.permissions,
          version: parsed.data.version!,
        }, client, buildSecurityMutationContext(req))
      );
      if (updated === undefined) {
        const current = await securityGetRole(tenantId, req.params.id);
        sendVersionConflict(res, current?.version ?? parsed.data.version!);
        return;
      }
      emitEntityEvent(tenantId, 'updated', 'rbac_role', { id: req.params.id, sourceUserId: actorId });
      sendSuccess(res, updated);
    } catch (e) {
      if (e instanceof SodViolationError) {
        await logBlockedAttempt(req, tenantId, actorId, 'SOD_VIOLATION_BLOCKED', e.message, e.details);
      } else if (e instanceof PrivilegeCeilingExceededError) {
        await logBlockedAttempt(req, tenantId, actorId, 'PRIVILEGE_CEILING_BLOCKED', e.message, e.details);
      } else if (e instanceof DelegationDeniedError) {
        await logBlockedAttempt(req, tenantId, actorId, 'DELEGATION_DENIED', e.message, e.details);
      }
      if (handleSecurityValidationError(res, e)) return;
      handleRouteError(res, e);
    }
  }
);

securityRoleRouter.post(
  '/security/roles/:id/archive',
  requirePermission('roles.manage'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const actorId = req.userId;
    if (!tenantId || !actorId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const parsed = z.object({ version: z.number().int().positive() }).safeParse(req.body);
    if (!parsed.success) {
      sendFailure(res, 400, 'VALIDATION_ERROR', 'version is required');
      return;
    }
    try {
      const result = await withTransaction((client) =>
        securityArchiveRole(tenantId, actorId, req.params.id, parsed.data.version, client, buildSecurityMutationContext(req))
      );
      if (result === null) {
        sendFailure(res, 404, 'NOT_FOUND', 'Role not found');
        return;
      }
      if (result === undefined) {
        const current = await securityGetRole(tenantId, req.params.id);
        sendVersionConflict(res, current?.version ?? parsed.data.version);
        return;
      }
      emitEntityEvent(tenantId, 'updated', 'rbac_role', { id: req.params.id, sourceUserId: actorId });
      sendSuccess(res, result);
    } catch (e) {
      if (handleSecurityValidationError(res, e)) return;
      handleRouteError(res, e);
    }
  }
);

securityRoleRouter.post(
  '/security/roles/:id/restore',
  requirePermission('roles.manage'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const actorId = req.userId;
    if (!tenantId || !actorId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const parsed = z.object({ version: z.number().int().positive() }).safeParse(req.body);
    if (!parsed.success) {
      sendFailure(res, 400, 'VALIDATION_ERROR', 'version is required');
      return;
    }
    try {
      const result = await withTransaction((client) =>
        securityRestoreRole(tenantId, actorId, req.params.id, parsed.data.version, client, buildSecurityMutationContext(req))
      );
      if (result === undefined) {
        const current = await securityGetRole(tenantId, req.params.id);
        sendVersionConflict(res, current?.version ?? parsed.data.version);
        return;
      }
      emitEntityEvent(tenantId, 'updated', 'rbac_role', { id: req.params.id, sourceUserId: actorId });
      sendSuccess(res, result);
    } catch (e) {
      if (handleSecurityValidationError(res, e)) return;
      handleRouteError(res, e);
    }
  }
);

const assignSchema = z.object({
  userId: z.string().min(1),
});

securityRoleRouter.post(
  '/security/roles/:id/assign',
  requireAnyPermission('users.role.assign', 'permissions.manage'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const actorId = req.userId;
    if (!tenantId || !actorId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const parsed = assignSchema.safeParse(req.body);
    if (!parsed.success) {
      sendFailure(res, 400, 'VALIDATION_ERROR', parsed.error.message);
      return;
    }
    try {
      const result = await withTransaction((client) =>
        securityAssignRole(tenantId, actorId, req.params.id, parsed.data.userId, client, buildSecurityMutationContext(req))
      );
      invalidateAuthUserCache(parsed.data.userId, tenantId);
      emitEntityEvent(tenantId, 'updated', 'user', { id: parsed.data.userId, sourceUserId: actorId });
      sendSuccess(res, result);
    } catch (e) {
      if (e instanceof SodViolationError) {
        await logBlockedAttempt(req, tenantId, actorId, 'SOD_VIOLATION_BLOCKED', e.message, e.details);
      } else if (e instanceof PrivilegeCeilingExceededError) {
        await logBlockedAttempt(req, tenantId, actorId, 'PRIVILEGE_CEILING_BLOCKED', e.message, e.details);
      } else if (e instanceof DelegationDeniedError) {
        await logBlockedAttempt(req, tenantId, actorId, 'DELEGATION_DENIED', e.message, e.details);
      }
      if (handleSecurityValidationError(res, e)) return;
      handleRouteError(res, e);
    }
  }
);

securityRoleRouter.post(
  '/security/roles/:id/unassign',
  requireAnyPermission('users.role.assign', 'permissions.manage'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const actorId = req.userId;
    if (!tenantId || !actorId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const parsed = assignSchema.safeParse(req.body);
    if (!parsed.success) {
      sendFailure(res, 400, 'VALIDATION_ERROR', parsed.error.message);
      return;
    }
    try {
      const ok = await withTransaction((client) =>
        securityUnassignRole(tenantId, actorId, req.params.id, parsed.data.userId, client, buildSecurityMutationContext(req))
      );
      if (!ok) {
        sendFailure(res, 404, 'NOT_FOUND', 'Assignment not found');
        return;
      }
      invalidateAuthUserCache(parsed.data.userId, tenantId);
      emitEntityEvent(tenantId, 'updated', 'user', { id: parsed.data.userId, sourceUserId: actorId });
      sendSuccess(res, { removed: true });
    } catch (e) {
      if (handleSecurityValidationError(res, e)) return;
      handleRouteError(res, e);
    }
  }
);

securityRoleRouter.get(
  '/security/templates',
  requireAnyPermission('roles.view', 'permissions.manage'),
  (_req, res) => {
    sendSuccess(res, securityListTemplates());
  }
);

securityRoleRouter.post(
  '/security/templates/:id/instantiate',
  requirePermission('roles.manage'),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    const actorId = req.userId;
    if (!tenantId || !actorId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    const parsed = z
      .object({ name: z.string().min(1).max(120), slug: z.string().min(1).max(64).optional() })
      .safeParse(req.body);
    if (!parsed.success) {
      sendFailure(res, 400, 'VALIDATION_ERROR', parsed.error.message);
      return;
    }
    try {
      const created = await withTransaction((client) =>
        securityInstantiateTemplate(tenantId, actorId, req.params.id, parsed.data, client, buildSecurityMutationContext(req))
      );
      emitEntityEvent(tenantId, 'created', 'rbac_role', { id: created?.id, sourceUserId: actorId });
      sendSuccess(res, created, 201);
    } catch (e) {
      if (e instanceof SodViolationError) {
        await logBlockedAttempt(req, tenantId, actorId, 'SOD_VIOLATION_BLOCKED', e.message, e.details);
      } else if (e instanceof PrivilegeCeilingExceededError) {
        await logBlockedAttempt(req, tenantId, actorId, 'PRIVILEGE_CEILING_BLOCKED', e.message, e.details);
      } else if (e instanceof DelegationDeniedError) {
        await logBlockedAttempt(req, tenantId, actorId, 'DELEGATION_DENIED', e.message, e.details);
      }
      if (handleSecurityValidationError(res, e)) return;
      handleRouteError(res, e);
    }
  }
);

securityRoleRouter.get(
  '/security/roles-audit',
  requireRbacAuditRead(),
  async (req: AuthedRequest, res) => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      sendFailure(res, 401, 'UNAUTHORIZED', 'Unauthorized');
      return;
    }
    try {
      sendSuccess(res, await securityListAudit(tenantId));
    } catch (e) {
      handleRouteError(res, e);
    }
  }
);
