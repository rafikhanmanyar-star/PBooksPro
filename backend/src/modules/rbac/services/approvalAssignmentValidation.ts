/**
 * A5.1.5.1 — approval assignment validation (C1).
 */
import type pg from 'pg';
import type { ApprovalEntityType } from '../../../auth/approvalTypes.js';
import { APPROVAL_SOD_CREATE_PERMISSION } from '../../../auth/approvalTypes.js';
import { isRestrictedPermission } from '../../../auth/restrictedPermissions.js';
import { findSodViolation } from './rbacSodService.js';
import {
  assertWithinPrivilegeCeiling,
  resolveActorTier,
  PrivilegeCeilingExceededError,
} from './rbacPrivilegeCeilingService.js';
import { isSuperAdminActor } from './rbacDelegationService.js';
import { expandPermissionKeys } from './rbacPermissionExpansion.js';
import { ApprovalMatrixRepository } from '../repositories/ApprovalMatrixRepository.js';

export type ApprovalAssignmentActor = {
  userId: string;
  roleSlugs: readonly string[];
  permissions: readonly string[];
  isSystemOwner?: boolean;
};

export type ResolvedApprovalAssignmentTarget = {
  requiredPermission: string;
  entityType: ApprovalEntityType;
  ruleId: string | null;
  capabilityId: string | null;
};

async function loadUserPermissionSet(
  client: pg.PoolClient,
  tenantId: string,
  userId: string
): Promise<Set<string>> {
  const r = await client.query<{ permission_key: string; role: string }>(
    `SELECT DISTINCT rp.permission_key, r.slug AS role
     FROM rbac_user_roles ur
     INNER JOIN rbac_roles r ON r.id = ur.role_id AND r.tenant_id = ur.tenant_id
     INNER JOIN rbac_role_permissions rp ON rp.role_id = ur.role_id
     WHERE ur.tenant_id = $1 AND ur.user_id = $2 AND ur.is_active = TRUE
       AND (ur.expires_at IS NULL OR ur.expires_at > NOW()) AND r.is_archived = FALSE`,
    [tenantId, userId]
  );
  const merged = new Set<string>();
  for (const row of r.rows) {
    for (const k of expandPermissionKeys([row.permission_key], row.role)) merged.add(k);
  }
  return merged;
}

async function roleHasPermission(
  client: pg.PoolClient,
  tenantId: string,
  roleId: string,
  requiredPermission: string
): Promise<boolean> {
  const r = await client.query<{ permission_key: string; slug: string }>(
    `SELECT rp.permission_key, r.slug
     FROM rbac_role_permissions rp
     INNER JOIN rbac_roles r ON r.id = rp.role_id AND r.tenant_id = rp.tenant_id
     WHERE rp.tenant_id = $1 AND rp.role_id = $2`,
    [tenantId, roleId]
  );
  const merged = new Set<string>();
  for (const row of r.rows) {
    for (const k of expandPermissionKeys([row.permission_key], row.slug)) merged.add(k);
  }
  return merged.has(requiredPermission);
}

export async function resolveApprovalAssignmentTarget(
  tenantId: string,
  input: { ruleId?: string | null; capabilityId?: string | null },
  client: pg.PoolClient
): Promise<ResolvedApprovalAssignmentTarget> {
  const repo = new ApprovalMatrixRepository(tenantId, client);
  if (input.capabilityId) {
    const caps = await repo.listCapabilities();
    const cap = caps.find((c) => c.id === input.capabilityId);
    if (!cap) {
      throw Object.assign(new Error('Approval capability not found'), { code: 'NOT_FOUND' });
    }
    return {
      requiredPermission: cap.required_permission,
      entityType: cap.entity_type,
      ruleId: input.ruleId ?? null,
      capabilityId: input.capabilityId,
    };
  }
  if (input.ruleId) {
    const rules = await repo.listRules();
    const rule = rules.find((r) => r.id === input.ruleId);
    if (!rule) {
      throw Object.assign(new Error('Approval rule not found'), { code: 'NOT_FOUND' });
    }
    return {
      requiredPermission: rule.required_permission,
      entityType: rule.entity_type,
      ruleId: input.ruleId,
      capabilityId: null,
    };
  }
  throw Object.assign(new Error('ruleId or capabilityId is required'), { code: 'VALIDATION_ERROR' });
}

/** C1 — only T0/T1 may assign restricted approve permissions. */
export async function assertApprovalAssignmentAllowed(
  _client: pg.PoolClient,
  _tenantId: string,
  actor: ApprovalAssignmentActor,
  target: ResolvedApprovalAssignmentTarget
): Promise<void> {
  const tier = resolveActorTier({
    isSystemOwner: Boolean(actor.isSystemOwner),
    roleSlugs: actor.roleSlugs,
    hasPermissionsDelegate: actor.permissions.includes('permissions.manage'),
  });

  if (tier !== 'T0' && tier !== 'T1') {
    throw Object.assign(
      new Error('Approval matrix assignments require super_admin or SYSTEM_OWNER'),
      { code: 'PRIVILEGE_CEILING_EXCEEDED' }
    );
  }

  try {
    assertWithinPrivilegeCeiling(
      tier,
      actor.permissions,
      [target.requiredPermission],
      'approval_assignment',
      { actorRoleSlugs: actor.roleSlugs }
    );
  } catch (e) {
    if (e instanceof PrivilegeCeilingExceededError) {
      throw Object.assign(new Error(e.message), { code: 'PRIVILEGE_CEILING_EXCEEDED' });
    }
    throw e;
  }

  if (
    isRestrictedPermission(target.requiredPermission) &&
    !isSuperAdminActor(actor.roleSlugs) &&
    tier !== 'T0'
  ) {
    throw Object.assign(
      new Error(`Assigning restricted approval permission ${target.requiredPermission} requires super_admin`),
      { code: 'PRIVILEGE_CEILING_EXCEEDED' }
    );
  }

  if (target.requiredPermission === 'accounting.journals.approve') {
    if (tier !== 'T0' && !isSuperAdminActor(actor.roleSlugs)) {
      throw Object.assign(
        new Error('Manual journal approver assignments require super_admin'),
        { code: 'PRIVILEGE_CEILING_EXCEEDED' }
      );
    }
  }
}

export async function assertAssigneeEligibleForApproval(
  client: pg.PoolClient,
  tenantId: string,
  assigneeType: 'user' | 'role',
  assigneeId: string,
  target: ResolvedApprovalAssignmentTarget
): Promise<void> {
  const createPerm = APPROVAL_SOD_CREATE_PERMISSION[target.entityType];

  if (assigneeType === 'user') {
    const perms = await loadUserPermissionSet(client, tenantId, assigneeId);
    if (!perms.has(target.requiredPermission)) {
      throw Object.assign(
        new Error(`Assignee must hold ${target.requiredPermission} before approval assignment`),
        { code: 'ASSIGNEE_MISSING_PERMISSION' }
      );
    }
    if (createPerm && findSodViolation(perms, 'approval_assignment')) {
      throw Object.assign(
        new Error('Assignee has SoD conflict and cannot be an approver'),
        { code: 'SOD_VIOLATION' }
      );
    }
    return;
  }

  const hasPerm = await roleHasPermission(client, tenantId, assigneeId, target.requiredPermission);
  if (!hasPerm) {
    throw Object.assign(
      new Error(`Role must include ${target.requiredPermission} before approval assignment`),
      { code: 'ASSIGNEE_MISSING_PERMISSION' }
    );
  }
}
