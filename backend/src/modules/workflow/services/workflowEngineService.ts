import type pg from 'pg';
import { randomUUID } from 'crypto';
import { resolveEnterpriseRole } from '../../../auth/permissions.js';
import { recordDomainMutation } from '../../../core/recordDomainMutation.js';
import { emitApprovalEvent } from '../../../core/realtime.js';
import { evaluateWorkflowRules } from '../../../workflow/ruleEngine.js';
import {
  AUTO_APPROVE_AUDIT_MESSAGE,
  type WorkflowEntityType,
} from '../../../workflow/workflowTypes.js';
import { ApprovalRequestActionRepository } from '../repositories/ApprovalRequestActionRepository.js';
import {
  ApprovalRequestRepository,
  type ApprovalRequestRow,
} from '../repositories/ApprovalRequestRepository.js';
import { getWorkflowEntityAdapter } from './workflowEntityAdapters.js';
import { getWorkflowSettings, isApprovalWorkflowEnabled } from './workflowSettingsService.js';
import { notifyApproversForRequest } from './workflowNotificationService.js';
import { isRbacV2ApprovalMatrixEnabled } from '../../../auth/rbacApprovalFeatureFlag.js';
import {
  evaluateApprovalRequirement,
  resolveApproverUserIds as resolveMatrixApproverUserIds,
  canApprove,
  isAutoApproveBlocked,
} from '../../../approval/approvalEngine.js';
import type { ApprovalEntityType } from '../../../auth/approvalTypes.js';

const WORKFLOW_TO_APPROVAL_ENTITY: Partial<Record<WorkflowEntityType, ApprovalEntityType>> = {
  purchase_order: 'purchase_order',
  bill: 'bill',
  payment: 'payment',
};

export type ApprovalRequestApi = ReturnType<typeof rowToApprovalRequestApi>;

export function rowToApprovalRequestApi(row: ApprovalRequestRow) {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityRef: row.entity_ref ?? undefined,
    requesterId: row.requester_id ?? undefined,
    status: row.status,
    currentLevel: row.current_level,
    maxLevel: row.max_level,
    amount: row.amount != null ? Number(row.amount) : undefined,
    departmentId: row.department_id ?? undefined,
    projectId: row.project_id ?? undefined,
    previousStatus: row.previous_status ?? undefined,
    targetStatus: row.target_status ?? undefined,
    assignedApproverId: row.assigned_approver_id ?? undefined,
    comments: row.comments ?? undefined,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    resolvedAt: row.resolved_at?.toISOString(),
    tenantId: row.tenant_id,
  };
}

async function resolveApproverUserIds(
  client: pg.PoolClient,
  tenantId: string,
  level: number,
  options?: {
    entityType?: ApprovalEntityType;
    requiredPermission?: string;
    requesterId?: string | null;
  }
): Promise<string[]> {
  if (
    isRbacV2ApprovalMatrixEnabled() &&
    options?.entityType &&
    options.requiredPermission
  ) {
    return resolveMatrixApproverUserIds(client, tenantId, {
      entityType: options.entityType,
      requiredPermission: options.requiredPermission,
      requesterId: options.requesterId ?? null,
      level,
    });
  }

  const roles =
    level >= 3
      ? ['super_admin', 'company_admin']
      : level >= 2
        ? ['super_admin', 'company_admin', 'accountant']
        : ['super_admin', 'company_admin', 'accountant', 'project_manager'];

  const r = await client.query<{ id: string; role: string }>(
    `SELECT id, role FROM users WHERE tenant_id = $1 AND is_active = TRUE`,
    [tenantId]
  );
  const roleSet = new Set(roles.map((x) => x.toLowerCase()));
  return r.rows
    .filter((u) => roleSet.has(resolveEnterpriseRole(u.role)))
    .map((u) => u.id);
}

async function recordAction(
  client: pg.PoolClient,
  tenantId: string,
  input: {
    approvalRequestId: string;
    action: import('../../../workflow/workflowTypes.js').ApprovalActionType;
    actorId?: string | null;
    approvalLevel?: number | null;
    previousStatus?: string | null;
    newStatus?: string | null;
    comments?: string | null;
    delegateToUserId?: string | null;
  }
) {
  const repo = new ApprovalRequestActionRepository(tenantId);
  return repo.insertAction(client, {
    id: randomUUID(),
    approval_request_id: input.approvalRequestId,
    action: input.action,
    actor_id: input.actorId ?? null,
    approval_level: input.approvalLevel ?? null,
    previous_status: input.previousStatus ?? null,
    new_status: input.newStatus ?? null,
    comments: input.comments ?? null,
    delegate_to_user_id: input.delegateToUserId ?? null,
  });
}

/** Gateway: submit entity for approval or auto-approve when workflow disabled. */
export async function submitEntityForApproval(
  client: pg.PoolClient,
  tenantId: string,
  input: {
    entityType: WorkflowEntityType;
    entityId: string;
    requesterId: string | null;
    requesterRole?: string | null;
    comments?: string;
  }
): Promise<{ mode: 'auto_approved' | 'approval_requested'; request?: ApprovalRequestApi; entitySnapshot?: Record<string, unknown> }> {
  const adapter = getWorkflowEntityAdapter(input.entityType);
  const ctx = await adapter.load(client, tenantId, input.entityId);
  if (!ctx) throw new Error('Entity not found for approval workflow.');

  const enabled = await isApprovalWorkflowEnabled(client, tenantId);
  const approvalEntityType = WORKFLOW_TO_APPROVAL_ENTITY[input.entityType];
  const rbacMatrixOn = isRbacV2ApprovalMatrixEnabled();

  let matrixEvaluation: Awaited<ReturnType<typeof evaluateApprovalRequirement>> | null = null;
  if (rbacMatrixOn && approvalEntityType) {
    matrixEvaluation = await evaluateApprovalRequirement(
      tenantId,
      {
        entityType: approvalEntityType,
        amount: ctx.amount,
        departmentId: ctx.departmentId,
        projectId: ctx.projectId,
        requesterId: input.requesterId,
      },
      client
    );
  }

  if (!enabled && !(rbacMatrixOn && matrixEvaluation?.required)) {
    if (rbacMatrixOn && approvalEntityType && isAutoApproveBlocked(approvalEntityType)) {
      throw Object.assign(
        new Error('Auto-approve is blocked for mandatory approval entity types'),
        { code: 'APPROVAL_AUTO_APPROVE_BLOCKED' }
      );
    }
    const result = await adapter.applyApproved(client, tenantId, input.entityId, input.requesterId);
    await recordDomainMutation(client, {
      tenantId,
      userId: input.requesterId,
      module: adapter.auditModule,
      entityType: input.entityType,
      entityId: input.entityId,
      action: 'update',
      auditAction: 'auto_approved',
      summary: `${input.entityType} ${ctx.entityRef}: ${AUTO_APPROVE_AUDIT_MESSAGE}`,
      oldValue: ctx.snapshot,
      newValue: result.snapshot,
      version: typeof result.snapshot.version === 'number' ? result.snapshot.version : undefined,
    });
    adapter.emitEntityUpdate(tenantId, input.entityId, result.snapshot, input.requesterId);
    emitApprovalEvent(tenantId, 'approval_approved', {
      requestId: `auto_${input.entityId}`,
      entityType: input.entityType,
      entityId: input.entityId,
      autoApproved: true,
      sourceUserId: input.requesterId ?? undefined,
    });
    return { mode: 'auto_approved', entitySnapshot: result.snapshot };
  }

  const settings = await getWorkflowSettings(client, tenantId);
  const evaluation = rbacMatrixOn && matrixEvaluation?.required
    ? { maxLevel: matrixEvaluation.maxLevel, matchedLevel: 1 }
    : evaluateWorkflowRules(settings.workflowConfig, {
        entityType: input.entityType,
        amount: ctx.amount,
        departmentId: ctx.departmentId,
        projectId: ctx.projectId,
        requesterRole: input.requesterRole ?? null,
      });

  const pending = await adapter.applyPending(client, tenantId, input.entityId, input.requesterId);
  const matrixStep = matrixEvaluation?.chain[0];
  const approverIds = await resolveApproverUserIds(client, tenantId, 1, {
    entityType: approvalEntityType,
    requiredPermission: matrixStep?.requiredPermission,
    requesterId: input.requesterId,
  });
  const assignedApproverId = approverIds[0] ?? null;

  const reqRepo = new ApprovalRequestRepository(tenantId);
  const request = await reqRepo.insertRequest(client, {
    id: randomUUID(),
    entity_type: input.entityType,
    entity_id: input.entityId,
    entity_ref: ctx.entityRef,
    requester_id: input.requesterId,
    status: 'pending',
    current_level: 1,
    max_level: evaluation.maxLevel,
    amount: ctx.amount,
    department_id: ctx.departmentId ?? null,
    project_id: ctx.projectId ?? null,
    previous_status: pending.previousStatus,
    target_status: ctx.approvedStatus,
    assigned_approver_id: assignedApproverId,
    comments: input.comments ?? null,
  });

  await recordAction(client, tenantId, {
    approvalRequestId: request.id,
    action: 'request',
    actorId: input.requesterId,
    approvalLevel: 1,
    previousStatus: pending.previousStatus,
    newStatus: pending.newStatus,
    comments: input.comments ?? null,
  });

  await recordDomainMutation(client, {
    tenantId,
    userId: input.requesterId,
    module: 'workflow',
    entityType: 'approval_request',
    entityId: request.id,
    action: 'create',
    auditAction: 'approval_requested',
    summary: `Approval requested for ${input.entityType} ${ctx.entityRef} (level 1/${evaluation.maxLevel})`,
    newValue: rowToApprovalRequestApi(request),
  });

  await recordDomainMutation(client, {
    tenantId,
    userId: input.requesterId,
    module: adapter.auditModule,
    entityType: input.entityType,
    entityId: input.entityId,
    action: 'update',
    auditAction: 'submitted',
    summary: `${input.entityType} ${ctx.entityRef} submitted for approval`,
    oldValue: ctx.snapshot,
    newValue: pending.snapshot,
    version: typeof pending.snapshot.version === 'number' ? pending.snapshot.version : undefined,
  });

  adapter.emitEntityUpdate(tenantId, input.entityId, pending.snapshot, input.requesterId);
  emitApprovalEvent(tenantId, 'approval_requested', {
    requestId: request.id,
    entityType: input.entityType,
    entityId: input.entityId,
    level: 1,
    sourceUserId: input.requesterId ?? undefined,
  });

  if (approverIds.length > 0) {
    await notifyApproversForRequest(client, tenantId, approverIds, request, input.entityType);
  }

  return { mode: 'approval_requested', request: rowToApprovalRequestApi(request), entitySnapshot: pending.snapshot };
}

export async function listApprovalQueue(
  client: pg.PoolClient,
  tenantId: string,
  filters?: { status?: string; entityType?: string; assignedToMe?: string }
) {
  const repo = new ApprovalRequestRepository(tenantId);
  if (filters?.assignedToMe) {
    const rows = await repo.listPending(client, {
      assignedApproverId: filters.assignedToMe,
      entityType: filters.entityType,
    });
    return rows.map(rowToApprovalRequestApi);
  }
  const rows = await repo.listAll(client, {
    status: filters?.status,
    entityType: filters?.entityType,
  });
  return rows.map(rowToApprovalRequestApi);
}

export async function getApprovalRequest(
  client: pg.PoolClient,
  tenantId: string,
  id: string
) {
  const repo = new ApprovalRequestRepository(tenantId);
  const row = await repo.getById(client, id);
  if (!row) return null;
  const actions = await new ApprovalRequestActionRepository(tenantId).listForRequest(client, id);
  return {
    ...rowToApprovalRequestApi(row),
    actions: actions.map((a) => ({
      id: a.id,
      action: a.action,
      actorId: a.actor_id ?? undefined,
      approvalLevel: a.approval_level ?? undefined,
      previousStatus: a.previous_status ?? undefined,
      newStatus: a.new_status ?? undefined,
      comments: a.comments ?? undefined,
      delegateToUserId: a.delegate_to_user_id ?? undefined,
      createdAt: a.created_at.toISOString(),
    })),
  };
}

type ActionInput = {
  requestId: string;
  action: 'approve' | 'reject' | 'return' | 'delegate' | 'escalate';
  actorId: string | null;
  comments?: string;
  delegateToUserId?: string;
};

export async function performApprovalAction(
  client: pg.PoolClient,
  tenantId: string,
  input: ActionInput
): Promise<ApprovalRequestApi> {
  const enabled = await isApprovalWorkflowEnabled(client, tenantId);
  if (!enabled) throw new Error('Approval workflow is disabled for this tenant.');

  const reqRepo = new ApprovalRequestRepository(tenantId);
  const request = await reqRepo.getByIdForUpdate(client, input.requestId);
  if (!request) throw new Error('Approval request not found.');
  if (request.status !== 'pending') throw new Error('Approval request is no longer pending.');

  const adapter = getWorkflowEntityAdapter(request.entity_type as WorkflowEntityType);
  const entityType = request.entity_type as WorkflowEntityType;

  if (
    (input.action === 'approve' || input.action === 'reject') &&
    isRbacV2ApprovalMatrixEnabled()
  ) {
    const approvalEntity = WORKFLOW_TO_APPROVAL_ENTITY[entityType];
    if (approvalEntity) {
      const evaluation = await evaluateApprovalRequirement(
        tenantId,
        {
          entityType: approvalEntity,
          amount: request.amount != null ? Number(request.amount) : undefined,
          departmentId: request.department_id,
          projectId: request.project_id,
          requesterId: request.requester_id,
        },
        client
      );
      const step = evaluation.chain.find((s) => s.level === request.current_level) ?? evaluation.chain[0];
      if (step) {
        const ok = await canApprove(client, tenantId, {
          approverId: input.actorId ?? '',
          entityType: approvalEntity,
          requiredPermission: step.requiredPermission,
          requesterId: request.requester_id,
          allowSelfApproval: false,
        });
        if (!ok) {
          throw Object.assign(new Error('Approver cannot act on this request (SoD or self-approval).'), {
            code: 'FORBIDDEN',
          });
        }
      }
    }
  }

  if (input.action === 'reject') {
    const updated = await reqRepo.updateRequest(client, request.id, {
      status: 'rejected',
      comments: input.comments ?? request.comments,
      resolved_at: new Date(),
    });
    if (!updated) throw new Error('Failed to reject approval request.');
    await recordAction(client, tenantId, {
      approvalRequestId: request.id,
      action: 'reject',
      actorId: input.actorId,
      approvalLevel: request.current_level,
      previousStatus: request.previous_status,
      newStatus: 'rejected',
      comments: input.comments ?? null,
    });
    await recordDomainMutation(client, {
      tenantId,
      userId: input.actorId,
      module: 'workflow',
      entityType: 'approval_request',
      entityId: request.id,
      action: 'update',
      auditAction: 'approval_rejected',
      summary: `Approval rejected for ${entityType} ${request.entity_ref ?? request.entity_id}`,
      oldValue: rowToApprovalRequestApi(request),
      newValue: rowToApprovalRequestApi(updated),
    });
    emitApprovalEvent(tenantId, 'approval_rejected', {
      requestId: request.id,
      entityType,
      entityId: request.entity_id,
      level: request.current_level,
      sourceUserId: input.actorId ?? undefined,
    });
    return rowToApprovalRequestApi(updated);
  }

  if (input.action === 'return') {
    const returned = await adapter.applyReturned(client, tenantId, request.entity_id, input.actorId);
    const updated = await reqRepo.updateRequest(client, request.id, {
      status: 'returned',
      comments: input.comments ?? request.comments,
      resolved_at: new Date(),
    });
    if (!updated) throw new Error('Failed to return approval request.');
    await recordAction(client, tenantId, {
      approvalRequestId: request.id,
      action: 'return',
      actorId: input.actorId,
      approvalLevel: request.current_level,
      previousStatus: returned.previousStatus,
      newStatus: returned.newStatus,
      comments: input.comments ?? null,
    });
    adapter.emitEntityUpdate(tenantId, request.entity_id, returned.snapshot, input.actorId);
    emitApprovalEvent(tenantId, 'approval_returned', {
      requestId: request.id,
      entityType,
      entityId: request.entity_id,
      level: request.current_level,
      sourceUserId: input.actorId ?? undefined,
    });
    return rowToApprovalRequestApi(updated);
  }

  if (input.action === 'delegate') {
    if (!input.delegateToUserId) throw new Error('delegateToUserId is required for delegate action.');
    await reqRepo.updateRequest(client, request.id, {
      status: 'delegated',
      assigned_approver_id: input.delegateToUserId,
      comments: input.comments ?? request.comments,
    });
    await recordAction(client, tenantId, {
      approvalRequestId: request.id,
      action: 'delegate',
      actorId: input.actorId,
      approvalLevel: request.current_level,
      comments: input.comments ?? null,
      delegateToUserId: input.delegateToUserId,
    });
    const reopened = await reqRepo.updateRequest(client, request.id, { status: 'pending' });
    if (!reopened) throw new Error('Failed to reopen delegated approval request.');
    await notifyApproversForRequest(client, tenantId, [input.delegateToUserId], reopened, entityType);
    emitApprovalEvent(tenantId, 'approval_delegated', {
      requestId: request.id,
      entityType,
      entityId: request.entity_id,
      level: request.current_level,
      sourceUserId: input.actorId ?? undefined,
    });
    return rowToApprovalRequestApi(reopened);
  }

  if (input.action === 'escalate') {
    const nextLevel = Math.min(request.current_level + 1, request.max_level);
    const approvalEntity = WORKFLOW_TO_APPROVAL_ENTITY[entityType];
    const matrixEval =
      isRbacV2ApprovalMatrixEnabled() && approvalEntity
        ? await evaluateApprovalRequirement(
            tenantId,
            {
              entityType: approvalEntity,
              amount: request.amount != null ? Number(request.amount) : undefined,
              departmentId: request.department_id,
              projectId: request.project_id,
              requesterId: request.requester_id,
            },
            client
          )
        : null;
    const matrixStep = matrixEval?.chain.find((s) => s.level === nextLevel);
    const approverIds = await resolveApproverUserIds(client, tenantId, nextLevel, {
      entityType: approvalEntity,
      requiredPermission: matrixStep?.requiredPermission,
      requesterId: request.requester_id,
    });
    await reqRepo.updateRequest(client, request.id, {
      status: 'escalated',
      current_level: nextLevel,
      assigned_approver_id: approverIds[0] ?? null,
      comments: input.comments ?? request.comments,
    });
    await recordAction(client, tenantId, {
      approvalRequestId: request.id,
      action: 'escalate',
      actorId: input.actorId,
      approvalLevel: nextLevel,
      comments: input.comments ?? null,
    });
    const reopened = await reqRepo.updateRequest(client, request.id, { status: 'pending' });
    if (!reopened) throw new Error('Failed to reopen escalated approval request.');
    if (approverIds.length > 0) {
      await notifyApproversForRequest(client, tenantId, approverIds, reopened, entityType);
    }
    emitApprovalEvent(tenantId, 'approval_escalated', {
      requestId: request.id,
      entityType,
      entityId: request.entity_id,
      level: nextLevel,
      sourceUserId: input.actorId ?? undefined,
    });
    return rowToApprovalRequestApi(reopened);
  }

  const nextLevel = request.current_level + 1;
  const isFinal = nextLevel > request.max_level;

  if (!isFinal) {
    const approvalEntity = WORKFLOW_TO_APPROVAL_ENTITY[entityType];
    const matrixEval =
      isRbacV2ApprovalMatrixEnabled() && approvalEntity
        ? await evaluateApprovalRequirement(
            tenantId,
            {
              entityType: approvalEntity,
              amount: request.amount != null ? Number(request.amount) : undefined,
              departmentId: request.department_id,
              projectId: request.project_id,
              requesterId: request.requester_id,
            },
            client
          )
        : null;
    const matrixStep = matrixEval?.chain.find((s) => s.level === nextLevel);
    const approverIds = await resolveApproverUserIds(client, tenantId, nextLevel, {
      entityType: approvalEntity,
      requiredPermission: matrixStep?.requiredPermission,
      requesterId: request.requester_id,
    });
    const updated = await reqRepo.updateRequest(client, request.id, {
      current_level: nextLevel,
      assigned_approver_id: approverIds[0] ?? null,
      comments: input.comments ?? request.comments,
    });
    if (!updated) throw new Error('Failed to advance approval level.');
    await recordAction(client, tenantId, {
      approvalRequestId: request.id,
      action: 'approve',
      actorId: input.actorId,
      approvalLevel: request.current_level,
      comments: input.comments ?? null,
    });
    if (approverIds.length > 0) {
      await notifyApproversForRequest(client, tenantId, approverIds, updated, entityType);
    }
    emitApprovalEvent(tenantId, 'approval_approved', {
      requestId: request.id,
      entityType,
      entityId: request.entity_id,
      level: request.current_level,
      sourceUserId: input.actorId ?? undefined,
    });
    return rowToApprovalRequestApi(updated);
  }

  const approved = await adapter.applyApproved(client, tenantId, request.entity_id, input.actorId);
  const updated = await reqRepo.updateRequest(client, request.id, {
    status: 'approved',
    comments: input.comments ?? request.comments,
    resolved_at: new Date(),
  });
  if (!updated) throw new Error('Failed to complete approval request.');

  await recordAction(client, tenantId, {
    approvalRequestId: request.id,
    action: 'approve',
    actorId: input.actorId,
    approvalLevel: request.current_level,
    previousStatus: approved.previousStatus,
    newStatus: approved.newStatus,
    comments: input.comments ?? null,
  });

  await recordDomainMutation(client, {
    tenantId,
    userId: input.actorId,
    module: adapter.auditModule,
    entityType,
    entityId: request.entity_id,
    action: 'update',
    auditAction: 'approved',
    summary: `${entityType} ${request.entity_ref ?? request.entity_id} approved via workflow`,
    newValue: approved.snapshot,
  });

  adapter.emitEntityUpdate(tenantId, request.entity_id, approved.snapshot, input.actorId);
  emitApprovalEvent(tenantId, 'approval_approved', {
    requestId: request.id,
    entityType,
    entityId: request.entity_id,
    level: request.current_level,
    sourceUserId: input.actorId ?? undefined,
  });

  return rowToApprovalRequestApi(updated);
}
