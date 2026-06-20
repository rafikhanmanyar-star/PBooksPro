/**
 * A5.1.5 — RBAC approval matrix administration service.
 */
import { randomUUID } from 'crypto';
import { z } from 'zod';
import type pg from 'pg';
import { withTransaction } from '../../../db/pool.js';
import { invalidateAuthUserCache } from '../../../middleware/authMiddleware.js';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import {
  APPROVAL_ENTITY_TYPES,
  MANDATORY_APPROVAL_ENTITY_TYPES,
  type ApprovalEntityType,
} from '../../../auth/approvalTypes.js';
import { isRbacV2ApprovalMatrixEnabled } from '../../../auth/rbacApprovalFeatureFlag.js';
import { resolveApprovalCapabilities } from '../../../auth/approvalCapabilityResolver.js';
import { recordRbacApprovalHashChange } from '../../../auth/rbacV2Metrics.js';
import { resolveEffectivePermissions } from '../../../auth/rbacPermissionResolver.js';
import { ApprovalMatrixRepository } from '../repositories/ApprovalMatrixRepository.js';
import { RbacRepository } from '../repositories/RbacRepository.js';
import { appendRbacAuditLog } from './rbacAuditService.js';
import { buildRbacAuditMeta } from './rbacAuditMeta.js';
import { seedTenantApprovalMatrix } from './approvalMatrixSeed.js';
import {
  assertApprovalAssignmentAllowed,
  assertAssigneeEligibleForApproval,
  resolveApprovalAssignmentTarget,
} from './approvalAssignmentValidation.js';
import { isSuperAdminActor } from './rbacDelegationService.js';
import { resolveActorTier } from './rbacPrivilegeCeilingService.js';

export const upsertRuleSchema = z.object({
  id: z.string().optional(),
  entityType: z.enum(APPROVAL_ENTITY_TYPES),
  priority: z.number().int().min(0).default(100),
  approvalLevel: z.number().int().min(1).max(5).default(1),
  minApprovers: z.number().int().min(1).default(1),
  allowSelfApproval: z.boolean().default(false),
  requiredPermission: z.string().min(1),
  conditions: z
    .object({
      minAmount: z.number().nullable().optional(),
      maxAmount: z.number().nullable().optional(),
      projectIds: z.array(z.string()).optional(),
      departmentIds: z.array(z.string()).optional(),
    })
    .optional(),
  isActive: z.boolean().default(true),
});

export const createAssignmentSchema = z.object({
  ruleId: z.string().optional(),
  capabilityId: z.string().optional(),
  assigneeType: z.enum(['user', 'role']),
  assigneeId: z.string().min(1),
  approvalLevel: z.number().int().min(1).max(5).default(1),
  reason: z.string().max(500).optional(),
}).refine((v) => Boolean(v.ruleId || v.capabilityId), {
  message: 'ruleId or capabilityId is required',
});

function requireApprovalMatrixEnabled(): void {
  if (!isRbacV2ApprovalMatrixEnabled()) {
    throw Object.assign(new Error('RBAC v2 approval matrix is not enabled'), { code: 'FEATURE_DISABLED' });
  }
}

export async function getApprovalMatrixSummary(tenantId: string) {
  requireApprovalMatrixEnabled();
  const repo = new ApprovalMatrixRepository(tenantId);
  const [capabilities, rules, assignments] = await Promise.all([
    repo.listCapabilities(),
    repo.listRules(),
    repo.listAssignments(),
  ]);
  return { capabilities, rules, assignments };
}

export async function getUserApprovalCapabilities(tenantId: string, userId: string) {
  requireApprovalMatrixEnabled();
  const { permissions, assignments } = await resolveEffectivePermissions({
    tenantId,
    userId,
    legacyRole: 'company_admin',
  });
  const caps = await resolveApprovalCapabilities({
    tenantId,
    userId,
    permissions,
    assignments,
  });
  return { userId, approvalCapabilities: caps };
}

export async function upsertApprovalRule(
  req: AuthedRequest,
  tenantId: string,
  actorUserId: string,
  body: z.infer<typeof upsertRuleSchema>
) {
  requireApprovalMatrixEnabled();
  const isMandatory = (MANDATORY_APPROVAL_ENTITY_TYPES as readonly string[]).includes(body.entityType);

  const actorRoles = req.effectiveAccess?.roles.map((r) => r.slug) ?? [req.role ?? ''];
  const actorPerms = req.effectiveAccess?.permissions ?? req.resolvedPermissions ?? [];
  const tier = resolveActorTier({
    isSystemOwner: req.sessionType === 'break_glass',
    roleSlugs: actorRoles,
    hasPermissionsDelegate: actorPerms.includes('permissions.manage'),
  });

  if (isMandatory && tier !== 'T0' && tier !== 'T1' && !isSuperAdminActor(actorRoles)) {
    throw Object.assign(new Error('Mandatory approval rules can only be modified by super_admin'), {
      code: 'FORBIDDEN',
    });
  }

  if (isMandatory && !body.isActive) {
    throw Object.assign(new Error('Mandatory entity approval rules cannot be deactivated'), {
      code: 'MANDATORY_RULE',
    });
  }

  // H4 / L3 — mandatory journal rules: allow_self_approval is immutable.
  const normalizedBody = isMandatory
    ? {
        ...body,
        allowSelfApproval: false,
        minApprovers: Math.max(body.minApprovers, 1),
        isActive: true,
        requiredPermission: 'accounting.journals.approve',
      }
    : body;

  const meta = buildRbacAuditMeta(req);
  let ruleId = normalizedBody.id ?? randomUUID();

  await withTransaction(async (client) => {
    const repo = new ApprovalMatrixRepository(tenantId, client);
    const rbacRepo = new RbacRepository(tenantId, client);
    const before = await repo.listRules(normalizedBody.entityType as ApprovalEntityType);

    const row = await repo.upsertRule(client, {
      id: ruleId,
      entity_type: normalizedBody.entityType as ApprovalEntityType,
      priority: normalizedBody.priority,
      approval_level: normalizedBody.approvalLevel,
      min_approvers: normalizedBody.minApprovers,
      allow_self_approval: normalizedBody.allowSelfApproval,
      required_permission: normalizedBody.requiredPermission,
      conditions: normalizedBody.conditions ?? {},
      is_mandatory: isMandatory,
      is_active: normalizedBody.isActive,
    });
    ruleId = row.id;

    await repo.bumpMatrixVersion(client);
    await rbacRepo.incrementTenantUsersAccessVersion();

    const after = await repo.listRules(normalizedBody.entityType as ApprovalEntityType);
    await appendRbacAuditLog(client, {
      tenantId,
      actorUserId,
      actorType: meta.actorType,
      sessionId: meta.sessionId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      action: normalizedBody.id ? 'APPROVAL_RULE_UPDATED' : 'APPROVAL_RULE_CREATED',
      targetType: 'template',
      targetId: ruleId,
      reason: null,
      beforeState: before,
      afterState: after,
    });
  });

  invalidateAuthUserCache(actorUserId, tenantId);
  recordRbacApprovalHashChange(req);
  return getApprovalMatrixSummary(tenantId);
}

export async function createApprovalAssignment(
  req: AuthedRequest,
  tenantId: string,
  actorUserId: string,
  body: z.infer<typeof createAssignmentSchema>
) {
  requireApprovalMatrixEnabled();
  const meta = buildRbacAuditMeta(req);
  const actorRoles = req.effectiveAccess?.roles.map((r) => r.slug) ?? [req.role ?? ''];
  const actorPerms = req.effectiveAccess?.permissions ?? req.resolvedPermissions ?? [];

  await withTransaction(async (client) => {
    const target = await resolveApprovalAssignmentTarget(
      tenantId,
      { ruleId: body.ruleId, capabilityId: body.capabilityId },
      client
    );

    await assertApprovalAssignmentAllowed(
      client,
      tenantId,
      {
        userId: actorUserId,
        roleSlugs: actorRoles,
        permissions: actorPerms,
        isSystemOwner: req.sessionType === 'break_glass',
      },
      target
    );

    await assertAssigneeEligibleForApproval(
      client,
      tenantId,
      body.assigneeType,
      body.assigneeId,
      target
    );

    const repo = new ApprovalMatrixRepository(tenantId, client);
    const rbacRepo = new RbacRepository(tenantId, client);
    const before = await repo.listAssignments();

    await repo.insertAssignment(client, {
      ruleId: body.ruleId ?? null,
      capabilityId: body.capabilityId ?? null,
      assigneeType: body.assigneeType,
      assigneeId: body.assigneeId,
      approvalLevel: body.approvalLevel,
      grantedBy: actorUserId,
    });

    await repo.bumpMatrixVersion(client);
    if (body.assigneeType === 'user') {
      await rbacRepo.incrementUserAccessVersion(body.assigneeId);
    } else {
      const userIds = await rbacRepo.listRoleHolderUserIds(body.assigneeId);
      for (const uid of userIds) {
        await rbacRepo.incrementUserAccessVersion(uid);
      }
    }

    const after = await repo.listAssignments();
    await appendRbacAuditLog(client, {
      tenantId,
      actorUserId,
      actorType: meta.actorType,
      sessionId: meta.sessionId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      action: 'APPROVAL_ASSIGNMENT_CREATED',
      targetType: body.assigneeType === 'user' ? 'user' : 'role',
      targetUserId: body.assigneeType === 'user' ? body.assigneeId : undefined,
      targetRoleId: body.assigneeType === 'role' ? body.assigneeId : undefined,
      reason: body.reason ?? null,
      beforeState: before,
      afterState: after,
    });
  });

  invalidateAuthUserCache(
    body.assigneeType === 'user' ? body.assigneeId : actorUserId,
    tenantId
  );
  recordRbacApprovalHashChange(req);
  return getApprovalMatrixSummary(tenantId);
}

export async function removeApprovalAssignment(
  req: AuthedRequest,
  tenantId: string,
  actorUserId: string,
  assignmentId: string,
  reason?: string
) {
  requireApprovalMatrixEnabled();
  const meta = buildRbacAuditMeta(req);

  await withTransaction(async (client) => {
    const repo = new ApprovalMatrixRepository(tenantId, client);
    const rbacRepo = new RbacRepository(tenantId, client);
    const before = await repo.listAssignments();
    const target = before.find((a) => a.id === assignmentId);
    if (!target) {
      throw Object.assign(new Error('Assignment not found'), { code: 'NOT_FOUND' });
    }

    await repo.deactivateAssignment(client, assignmentId);
    await repo.bumpMatrixVersion(client);
    if (target.assignee_type === 'user') {
      await rbacRepo.incrementUserAccessVersion(target.assignee_id);
    } else {
      const userIds = await rbacRepo.listRoleHolderUserIds(target.assignee_id);
      for (const uid of userIds) {
        await rbacRepo.incrementUserAccessVersion(uid);
      }
    }

    const after = await repo.listAssignments();
    await appendRbacAuditLog(client, {
      tenantId,
      actorUserId,
      actorType: meta.actorType,
      sessionId: meta.sessionId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      action: 'APPROVAL_ASSIGNMENT_REMOVED',
      targetType: target.assignee_type === 'user' ? 'user' : 'role',
      targetUserId: target.assignee_type === 'user' ? target.assignee_id : undefined,
      targetRoleId: target.assignee_type === 'role' ? target.assignee_id : undefined,
      reason: reason ?? null,
      beforeState: before,
      afterState: after,
    });
  });

  invalidateAuthUserCache(actorUserId, tenantId);
  recordRbacApprovalHashChange(req);
  return getApprovalMatrixSummary(tenantId);
}

export async function ensureTenantApprovalMatrixSeeded(
  client: pg.PoolClient,
  tenantId: string
): Promise<void> {
  await seedTenantApprovalMatrix(client, tenantId);
}
