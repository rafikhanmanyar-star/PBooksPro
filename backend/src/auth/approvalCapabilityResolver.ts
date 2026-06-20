/**
 * RBAC 2.0 Phase 5 — resolve approval capabilities and approval hash material.
 */
import { createHash } from 'node:crypto';
import type pg from 'pg';
import { getPool } from '../db/pool.js';
import type { ApprovalCapability, ApprovalEntityType } from './approvalTypes.js';
import type { ActiveRoleAssignment } from './rbacPermissionResolver.js';
import { isRbacV2ApprovalMatrixEnabled } from './rbacApprovalFeatureFlag.js';

export type StoredApprovalHashRow = {
  kind: 'matrix' | 'capability' | 'rule' | 'assignment';
  id: string;
  payload: string;
};

export type ApprovalMaterial = {
  approvalHash: string;
  approvalCapabilities: readonly ApprovalCapability[];
};

/**
 * Deterministic approvalHash material (M1):
 *   lines = rows.map(r => `${kind}:${id}:${payload}`).sort()
 *   approvalHash = SHA256(lines.join('\n'))
 *
 * Payload formats:
 *   matrix:     `${version}:${is_active}`
 *   capability: `${capability_key}:${entity_type}:${required_permission}:${max_level}:${is_active}`
 *   rule:       `${entity_type}:${priority}:${approval_level}:${min_approvers}:${allow_self_approval}:${required_permission}:${JSON.stringify(conditions)}:${is_mandatory}:${is_active}`
 *   assignment: `${rule_id}:${capability_id}:${assignee_type}:${assignee_id}:${approval_level}:${is_active}`
 */
export function hashStoredApprovalRows(rows: readonly StoredApprovalHashRow[]): string {
  const lines = rows.map((r) => `${r.kind}:${r.id}:${r.payload}`).sort();
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

export async function loadApprovalHashRows(
  tenantId: string,
  client?: pg.PoolClient
): Promise<StoredApprovalHashRow[]> {
  const pool = getPool();
  const executor = client ?? (await pool.connect());
  const owns = !client;
  try {
    const rows: StoredApprovalHashRow[] = [];

    const matrix = await executor.query<{ version: number; is_active: boolean }>(
      `SELECT version, is_active FROM rbac_approval_matrix WHERE tenant_id = $1`,
      [tenantId]
    );
    if (matrix.rows[0]) {
      rows.push({
        kind: 'matrix',
        id: tenantId,
        payload: `${matrix.rows[0].version}:${matrix.rows[0].is_active}`,
      });
    }

    const caps = await executor.query<{
      id: string;
      capability_key: string;
      entity_type: string;
      required_permission: string;
      max_level: number;
      is_active: boolean;
    }>(
      `SELECT id, capability_key, entity_type, required_permission, max_level, is_active
       FROM rbac_approval_capabilities WHERE tenant_id = $1`,
      [tenantId]
    );
    for (const c of caps.rows) {
      rows.push({
        kind: 'capability',
        id: c.id,
        payload: `${c.capability_key}:${c.entity_type}:${c.required_permission}:${c.max_level}:${c.is_active}`,
      });
    }

    const rules = await executor.query<{
      id: string;
      entity_type: string;
      priority: number;
      approval_level: number;
      min_approvers: number;
      allow_self_approval: boolean;
      required_permission: string;
      conditions: unknown;
      is_mandatory: boolean;
      is_active: boolean;
    }>(
      `SELECT id, entity_type, priority, approval_level, min_approvers, allow_self_approval,
              required_permission, conditions, is_mandatory, is_active
       FROM rbac_approval_rules WHERE tenant_id = $1`,
      [tenantId]
    );
    for (const r of rules.rows) {
      rows.push({
        kind: 'rule',
        id: r.id,
        payload: `${r.entity_type}:${r.priority}:${r.approval_level}:${r.min_approvers}:${r.allow_self_approval}:${r.required_permission}:${JSON.stringify(r.conditions)}:${r.is_mandatory}:${r.is_active}`,
      });
    }

    const assignments = await executor.query<{
      id: string;
      rule_id: string | null;
      capability_id: string | null;
      assignee_type: string;
      assignee_id: string;
      approval_level: number;
      is_active: boolean;
    }>(
      `SELECT id, rule_id, capability_id, assignee_type, assignee_id, approval_level, is_active
       FROM rbac_approval_assignments WHERE tenant_id = $1`,
      [tenantId]
    );
    for (const a of assignments.rows) {
      rows.push({
        kind: 'assignment',
        id: a.id,
        payload: `${a.rule_id ?? ''}:${a.capability_id ?? ''}:${a.assignee_type}:${a.assignee_id}:${a.approval_level}:${a.is_active}`,
      });
    }

    return rows;
  } finally {
    if (owns) executor.release();
  }
}

function userMatchesAssignment(
  assigneeType: string,
  assigneeId: string,
  userId: string,
  roleIds: readonly string[]
): boolean {
  if (assigneeType === 'user') return assigneeId === userId;
  if (assigneeType === 'role') return roleIds.includes(assigneeId);
  return false;
}

export async function resolveApprovalMaterial(input: {
  tenantId: string;
  userId: string;
  permissions: readonly string[];
  assignments: readonly ActiveRoleAssignment[];
  client?: pg.PoolClient;
}): Promise<ApprovalMaterial> {
  const hashRows = await loadApprovalHashRows(input.tenantId, input.client);
  const approvalHash = hashStoredApprovalRows(hashRows);

  if (!isRbacV2ApprovalMatrixEnabled()) {
    return { approvalHash, approvalCapabilities: [] };
  }

  const pool = getPool();
  const executor = input.client ?? (await pool.connect());
  const owns = !input.client;
  try {
    const permSet = new Set(input.permissions);
    const roleIds = input.assignments.map((a) => a.roleId);

    const caps = await executor.query<{
      capability_key: string;
      entity_type: ApprovalEntityType;
      required_permission: string;
      max_level: number;
      id: string;
    }>(
      `SELECT id, capability_key, entity_type, required_permission, max_level
       FROM rbac_approval_capabilities
       WHERE tenant_id = $1 AND is_active = TRUE`,
      [input.tenantId]
    );

    const assignments = await executor.query<{
      capability_id: string | null;
      assignee_type: string;
      assignee_id: string;
      approval_level: number;
    }>(
      `SELECT capability_id, assignee_type, assignee_id, approval_level
       FROM rbac_approval_assignments
       WHERE tenant_id = $1 AND is_active = TRUE AND capability_id IS NOT NULL`,
      [input.tenantId]
    );

    const capabilities: ApprovalCapability[] = [];
    for (const cap of caps.rows) {
      if (!permSet.has(cap.required_permission)) continue;

      const capAssignments = assignments.rows.filter((a) => a.capability_id === cap.id);
      if (capAssignments.length > 0) {
        const matched = capAssignments.some((a) =>
          userMatchesAssignment(a.assignee_type, a.assignee_id, input.userId, roleIds)
        );
        if (!matched) continue;
        const maxLevel = Math.max(
          cap.max_level,
          ...capAssignments
            .filter((a) => userMatchesAssignment(a.assignee_type, a.assignee_id, input.userId, roleIds))
            .map((a) => a.approval_level)
        );
        capabilities.push({
          capabilityKey: cap.capability_key,
          entityType: cap.entity_type,
          requiredPermission: cap.required_permission,
          maxLevel,
        });
      } else {
        capabilities.push({
          capabilityKey: cap.capability_key,
          entityType: cap.entity_type,
          requiredPermission: cap.required_permission,
          maxLevel: cap.max_level,
        });
      }
    }

    return { approvalHash, approvalCapabilities: capabilities };
  } finally {
    if (owns) executor.release();
  }
}

export async function resolveApprovalCapabilities(input: {
  tenantId: string;
  userId: string;
  permissions: readonly string[];
  assignments: readonly ActiveRoleAssignment[];
  client?: pg.PoolClient;
}): Promise<readonly ApprovalCapability[]> {
  const material = await resolveApprovalMaterial(input);
  return material.approvalCapabilities;
}
