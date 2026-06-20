/**
 * RBAC 2.0 Phase 5 — approval matrix evaluation engine (no UI logic).
 */
import type pg from 'pg';
import { getPool } from '../db/pool.js';
import {
  APPROVAL_SOD_CREATE_PERMISSION,
  MANDATORY_APPROVAL_ENTITY_TYPES,
  type ApprovalEntityType,
  type ApprovalEvaluationContext,
  type ApprovalMatrixRule,
  type ApprovalMatrixRuleConditions,
} from '../auth/approvalTypes.js';
import { findSodViolation } from '../modules/rbac/services/rbacSodService.js';
import { expandPermissionKeys } from '../modules/rbac/services/rbacPermissionExpansion.js';
import { isRbacV2ApprovalMatrixEnabled } from '../auth/rbacApprovalFeatureFlag.js';
import { recordRbacApprovalRequired, recordRbacApprovalGranted, recordRbacApprovalRejected, recordRbacApprovalEscalated } from '../auth/rbacV2Metrics.js';
import type { AuthedRequest } from '../middleware/authMiddleware.js';

export type ApprovalChainStep = {
  level: number;
  requiredPermission: string;
  minApprovers: number;
  ruleId: string;
};

export type ApprovalEngineRuleRow = {
  id: string;
  tenant_id: string;
  entity_type: ApprovalEntityType;
  priority: number;
  approval_level: number;
  min_approvers: number;
  allow_self_approval: boolean;
  required_permission: string;
  conditions: ApprovalMatrixRuleConditions;
  is_mandatory: boolean;
  is_active: boolean;
};

function rowToRule(row: ApprovalEngineRuleRow): ApprovalMatrixRule {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    entityType: row.entity_type,
    priority: row.priority,
    approvalLevel: row.approval_level,
    minApprovers: row.min_approvers,
    allowSelfApproval: row.allow_self_approval,
    requiredPermission: row.required_permission,
    conditions: row.conditions ?? {},
    isMandatory: row.is_mandatory,
    isActive: row.is_active,
  };
}

function ruleMatchesConditions(rule: ApprovalMatrixRule, ctx: ApprovalEvaluationContext): boolean {
  const c = rule.conditions;
  if (c.minAmount != null && ctx.amount != null && ctx.amount < c.minAmount) return false;
  if (c.maxAmount != null && ctx.amount != null && ctx.amount > c.maxAmount) return false;
  if (c.projectIds?.length && ctx.projectId && !c.projectIds.includes(ctx.projectId)) return false;
  if (c.departmentIds?.length && ctx.departmentId && !c.departmentIds.includes(ctx.departmentId)) {
    return false;
  }
  return true;
}

export async function loadActiveRules(
  tenantId: string,
  entityType: ApprovalEntityType,
  client?: pg.PoolClient
): Promise<ApprovalMatrixRule[]> {
  const pool = getPool();
  const executor = client ?? (await pool.connect());
  const owns = !client;
  try {
    const r = await executor.query<ApprovalEngineRuleRow>(
      `SELECT id, tenant_id, entity_type, priority, approval_level, min_approvers,
              allow_self_approval, required_permission, conditions, is_mandatory, is_active
       FROM rbac_approval_rules
       WHERE tenant_id = $1 AND entity_type = $2 AND is_active = TRUE
       ORDER BY priority ASC, approval_level ASC`,
      [tenantId, entityType]
    );
    return r.rows.map(rowToRule);
  } finally {
    if (owns) executor.release();
  }
}

export function matchRules(
  rules: readonly ApprovalMatrixRule[],
  ctx: ApprovalEvaluationContext
): ApprovalMatrixRule[] {
  return rules.filter((rule) => ruleMatchesConditions(rule, ctx));
}

/** Mandatory journal types always require approval when matrix flag is on. */
export function requiresApproval(
  entityType: ApprovalEntityType,
  ctx: ApprovalEvaluationContext,
  matchedRules: readonly ApprovalMatrixRule[]
): boolean {
  if (!isRbacV2ApprovalMatrixEnabled()) {
    return false;
  }
  if ((MANDATORY_APPROVAL_ENTITY_TYPES as readonly string[]).includes(entityType)) {
    return true;
  }
  return matchedRules.length > 0;
}

export function approvalChain(matchedRules: readonly ApprovalMatrixRule[]): ApprovalChainStep[] {
  const byLevel = new Map<number, ApprovalMatrixRule>();
  for (const rule of matchedRules) {
    const existing = byLevel.get(rule.approvalLevel);
    if (!existing || rule.priority < existing.priority) {
      byLevel.set(rule.approvalLevel, rule);
    }
  }
  return [...byLevel.entries()]
    .sort(([a], [b]) => a - b)
    .map(([level, rule]) => ({
      level,
      requiredPermission: rule.requiredPermission,
      minApprovers: rule.minApprovers,
      ruleId: rule.id,
    }));
}

export function approvalLevel(
  matchedRules: readonly ApprovalMatrixRule[],
  currentLevel = 1
): ApprovalChainStep | null {
  const chain = approvalChain(matchedRules);
  return chain.find((s) => s.level === currentLevel) ?? null;
}

async function loadUserPermissionSet(
  tenantId: string,
  userId: string,
  client: pg.PoolClient
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

/** Mandatory entity types cannot use AUTO_APPROVE (C2 / H4). */
export function isAutoApproveBlocked(entityType: ApprovalEntityType | string): boolean {
  return (MANDATORY_APPROVAL_ENTITY_TYPES as readonly string[]).includes(entityType);
}

export type CanApproveValidationResult =
  | { allowed: true }
  | { allowed: false; reason: 'self_approval' | 'missing_permission' | 'sod_conflict' };

/** Pure permission-set validation for canApprove (H3 / H4) — testable without DB. */
export function validateApproverPermissionSet(
  effectivePermissions: ReadonlySet<string>,
  input: {
    requiredPermission: string;
    entityType: ApprovalEntityType;
    approverId?: string;
    requesterId?: string | null;
    allowSelfApproval?: boolean;
  }
): CanApproveValidationResult {
  if (
    !input.allowSelfApproval &&
    input.requesterId &&
    input.approverId &&
    input.approverId === input.requesterId
  ) {
    return { allowed: false, reason: 'self_approval' };
  }
  if (!effectivePermissions.has(input.requiredPermission)) {
    return { allowed: false, reason: 'missing_permission' };
  }
  const createPerm = APPROVAL_SOD_CREATE_PERMISSION[input.entityType];
  if (createPerm && findSodViolation(effectivePermissions, 'approval_action')) {
    return { allowed: false, reason: 'sod_conflict' };
  }
  return { allowed: true };
}

export async function assertNonEmptyApproverPool(
  approverIds: readonly string[],
  entityType: ApprovalEntityType
): Promise<void> {
  if (approverIds.length > 0) return;
  if ((MANDATORY_APPROVAL_ENTITY_TYPES as readonly string[]).includes(entityType)) {
    throw Object.assign(
      new Error('No eligible approvers configured — manual journal cannot proceed'),
      { code: 'APPROVAL_POOL_EMPTY' }
    );
  }
}

export async function resolveApproverUserIds(
  client: pg.PoolClient,
  tenantId: string,
  input: {
    entityType: ApprovalEntityType;
    requiredPermission: string;
    requesterId: string | null;
    level: number;
  }
): Promise<string[]> {
  const createPerm = APPROVAL_SOD_CREATE_PERMISSION[input.entityType];
  const r = await client.query<{ id: string }>(
    `SELECT DISTINCT u.id
     FROM users u
     INNER JOIN rbac_user_roles ur ON ur.user_id = u.id AND ur.tenant_id = u.tenant_id
     INNER JOIN rbac_role_permissions rp ON rp.role_id = ur.role_id
     WHERE u.tenant_id = $1 AND u.is_active = TRUE
       AND ur.is_active = TRUE AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
       AND rp.permission_key = $2`,
    [tenantId, input.requiredPermission]
  );

  const candidates = r.rows.map((row) => row.id);
  const filtered: string[] = [];
  for (const userId of candidates) {
    if (input.requesterId && userId === input.requesterId) continue;
    const perms = await loadUserPermissionSet(tenantId, userId, client);
    if (createPerm && findSodViolation(perms, 'approval_pool')) continue;
    filtered.push(userId);
  }
  return filtered;
}

export async function canApprove(
  client: pg.PoolClient,
  tenantId: string,
  input: {
    approverId: string;
    entityType: ApprovalEntityType;
    requiredPermission: string;
    requesterId: string | null;
    allowSelfApproval?: boolean;
    req?: AuthedRequest;
  }
): Promise<boolean> {
  const perms = await loadUserPermissionSet(tenantId, input.approverId, client);
  const validation = validateApproverPermissionSet(perms, {
    requiredPermission: input.requiredPermission,
    entityType: input.entityType,
    approverId: input.approverId,
    requesterId: input.requesterId,
    allowSelfApproval: input.allowSelfApproval,
  });

  if (!validation.allowed) {
    if (input.req) {
      const reason =
        validation.reason === 'self_approval'
          ? 'self_approval'
          : validation.reason === 'sod_conflict'
            ? 'sod_conflict'
            : 'missing_permission';
      recordRbacApprovalRejected(input.req, reason);
    }
    return false;
  }

  if (input.req) recordRbacApprovalGranted(input.req);
  return true;
}

export async function evaluateApprovalRequirement(
  tenantId: string,
  ctx: ApprovalEvaluationContext,
  client?: pg.PoolClient,
  req?: AuthedRequest
): Promise<{
  required: boolean;
  matchedRules: ApprovalMatrixRule[];
  chain: ApprovalChainStep[];
  maxLevel: number;
}> {
  const rules = await loadActiveRules(tenantId, ctx.entityType, client);
  const matched = matchRules(rules, ctx);
  const required = requiresApproval(ctx.entityType, ctx, matched);
  const chain = approvalChain(matched);
  const maxLevel = chain.length > 0 ? Math.max(...chain.map((s) => s.level)) : 1;
  if (required && req) recordRbacApprovalRequired(req, ctx.entityType);
  return { required, matchedRules: matched, chain, maxLevel };
}

export const APPROVAL_WORKFLOW_TRANSITIONS: Record<string, readonly string[]> = {
  Draft: ['Pending Approval', 'Cancelled'],
  'Pending Approval': ['Approved', 'Rejected', 'Cancelled'],
  Approved: [],
  Rejected: ['Draft'],
  Cancelled: [],
};

export function assertValidApprovalTransition(from: string, to: string): void {
  const allowed = APPROVAL_WORKFLOW_TRANSITIONS[from];
  if (!allowed?.includes(to)) {
    throw Object.assign(new Error(`Invalid approval transition: ${from} → ${to}`), {
      code: 'INVALID_TRANSITION',
    });
  }
}

export { recordRbacApprovalEscalated };
