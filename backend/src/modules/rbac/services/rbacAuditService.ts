/**
 * RBAC 2.0 — dedicated audit log writer (rbac_audit_log).
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';

export type RbacAuditAction =
  | 'ROLE_CREATED'
  | 'ROLE_UPDATED'
  | 'ROLE_ARCHIVED'
  | 'ROLE_RESTORED'
  | 'ROLE_ASSIGNED'
  | 'ROLE_REMOVED'
  | 'ROLE_ACTIVATED'
  | 'ROLE_DEACTIVATED'
  | 'TEMPLATE_INSTANTIATED'
  | 'SOD_VIOLATION_BLOCKED'
  | 'PRIVILEGE_CEILING_BLOCKED'
  | 'DELEGATION_DENIED'
  | 'BREAK_GLASS_ACTIVATED'
  | 'BREAK_GLASS_EXPIRED'
  | 'SCOPE_ASSIGNED'
  | 'SCOPE_REMOVED'
  | 'SCOPE_UPDATED'
  | 'APPROVAL_RULE_CREATED'
  | 'APPROVAL_RULE_UPDATED'
  | 'APPROVAL_ASSIGNMENT_CREATED'
  | 'APPROVAL_ASSIGNMENT_REMOVED'
  | 'APPROVAL_REQUESTED'
  | 'APPROVAL_GRANTED'
  | 'APPROVAL_REJECTED'
  | 'APPROVAL_CANCELLED'
  | 'APPROVAL_ESCALATED'
  | 'APPROVAL_SUBMITTED'
  | 'APPROVAL_APPROVED'
  | 'APPROVAL_SOD_BLOCKED'
  | 'APPROVAL_SELF_APPROVAL_BLOCKED'
  | 'APPROVAL_POOL_EMPTY'
  | 'APPROVAL_AUTO_APPROVE_BLOCKED';

export type RbacAuditInput = {
  tenantId: string;
  actorUserId: string | null;
  actorType?: 'user' | 'system' | 'system_owner';
  action: RbacAuditAction;
  targetType: 'role' | 'user' | 'template';
  targetId?: string | null;
  targetUserId?: string | null;
  targetRoleId?: string | null;
  reason?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
  sessionId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function appendRbacAuditLog(
  client: pg.PoolClient,
  input: RbacAuditInput
): Promise<void> {
  const id = `rbac_audit_${randomUUID().replace(/-/g, '')}`;
  await client.query(
    `INSERT INTO rbac_audit_log (
       id, tenant_id, actor_user_id, actor_type, action, target_type,
       target_id, target_user_id, target_role_id, reason, before_state, after_state,
       session_id, ip_address, user_agent
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      id,
      input.tenantId,
      input.actorUserId,
      input.actorType ?? 'user',
      input.action,
      input.targetType,
      input.targetId ?? null,
      input.targetUserId ?? null,
      input.targetRoleId ?? null,
      input.reason ?? null,
      input.beforeState != null ? JSON.stringify(input.beforeState) : null,
      input.afterState != null ? JSON.stringify(input.afterState) : null,
      input.sessionId ?? null,
      input.ipAddress ?? null,
      input.userAgent ?? null,
    ]
  );
}
