/**
 * Mandatory manual journal / reversal approval (Architecture §6.4).
 */
import { randomUUID } from 'crypto';
import type pg from 'pg';
import type { AuthedRequest } from '../../../middleware/authMiddleware.js';
import { recordDomainMutation } from '../../../core/recordDomainMutation.js';
import { emitApprovalEvent } from '../../../core/realtime.js';
import { isRbacV2ApprovalMatrixEnabled } from '../../../auth/rbacApprovalFeatureFlag.js';
import {
  assertValidApprovalTransition,
  canApprove,
  evaluateApprovalRequirement,
  approvalLevel,
  assertNonEmptyApproverPool,
  resolveApproverUserIds,
} from '../../../approval/approvalEngine.js';
import { appendRbacAuditLog } from '../../rbac/services/rbacAuditService.js';
import { ensureTenantApprovalMatrixSeeded } from '../../rbac/services/rbacApprovalMatrixService.js';
import {
  postManualJournalWithAudit,
  reverseManualJournalWithAudit,
  type JournalEntryEmitPayload,
} from './manualJournalService.js';
import type { CreateJournalBody } from './journalService.js';
import { notifyApproversForRequest } from '../../workflow/services/workflowNotificationService.js';
import { ApprovalRequestRepository } from '../../workflow/repositories/ApprovalRequestRepository.js';
import { ApprovalRequestActionRepository } from '../../workflow/repositories/ApprovalRequestActionRepository.js';

export type JournalApprovalDraftRow = {
  id: string;
  tenant_id: string;
  requester_id: string | null;
  entity_type: 'manual_journal' | 'journal_reversal';
  payload: CreateJournalBody & { originalJournalEntryId?: string; reason?: string };
  status: string;
  journal_entry_id: string | null;
  original_journal_entry_id: string | null;
  approval_request_id: string | null;
};

export function isJournalApprovalRequired(): boolean {
  return isRbacV2ApprovalMatrixEnabled();
}

export async function submitManualJournalForApproval(
  client: pg.PoolClient,
  tenantId: string,
  body: CreateJournalBody,
  requesterId: string | null
): Promise<{ draftId: string; approvalRequestId: string; status: 'Pending Approval' }> {
  await ensureTenantApprovalMatrixSeeded(client, tenantId);

  const amount = body.lines.reduce((s, l) => s + (l.debitAmount ?? 0), 0);
  const evaluation = await evaluateApprovalRequirement(tenantId, {
    entityType: 'manual_journal',
    amount,
    projectId: body.projectId ?? null,
    requesterId,
  }, client);

  if (!evaluation.required) {
    throw Object.assign(new Error('Manual journal approval is mandatory when approval matrix is enabled'), {
      code: 'APPROVAL_REQUIRED',
    });
  }

  const step = approvalLevel(evaluation.matchedRules, 1);
  if (!step) {
    throw Object.assign(new Error('No approval rule configured for manual journal'), {
      code: 'CONFIGURATION_ERROR',
    });
  }

  const approverIds = await resolveApproverUserIds(client, tenantId, {
    entityType: 'manual_journal',
    requiredPermission: step.requiredPermission,
    requesterId,
    level: 1,
  });

  try {
    await assertNonEmptyApproverPool(approverIds, 'manual_journal');
  } catch (e) {
    await appendRbacAuditLog(client, {
      tenantId,
      actorUserId: requesterId,
      action: 'APPROVAL_POOL_EMPTY',
      targetType: 'user',
      targetId: null,
      reason: 'No eligible approvers for manual_journal',
      afterState: { entityType: 'manual_journal', requiredPermission: step.requiredPermission },
    });
    throw e;
  }

  const draftId = randomUUID();
  const approvalRequestId = randomUUID();

  await client.query(
    `INSERT INTO rbac_journal_approval_drafts (
       id, tenant_id, requester_id, entity_type, payload, status, approval_request_id
     ) VALUES ($1,$2,$3,'manual_journal',$4,'Pending Approval',$5)`,
    [draftId, tenantId, requesterId, JSON.stringify(body), approvalRequestId]
  );

  const reqRepo = new ApprovalRequestRepository(tenantId);
  const request = await reqRepo.insertRequest(client, {
    id: approvalRequestId,
    entity_type: 'manual_journal',
    entity_id: draftId,
    entity_ref: body.reference ?? draftId.slice(0, 8),
    requester_id: requesterId,
    status: 'pending',
    current_level: 1,
    max_level: evaluation.maxLevel,
    amount,
    department_id: null,
    project_id: body.projectId ?? null,
    previous_status: 'Draft',
    target_status: 'Approved',
    assigned_approver_id: null,
    comments: body.description ?? null,
  });

  await new ApprovalRequestActionRepository(tenantId).insertAction(client, {
    id: randomUUID(),
    approval_request_id: approvalRequestId,
    action: 'request',
    actor_id: requesterId,
    approval_level: 1,
    previous_status: 'Draft',
    new_status: 'Pending Approval',
    comments: body.description ?? null,
    delegate_to_user_id: null,
  });

  await recordDomainMutation(client, {
    tenantId,
    userId: requesterId,
    module: 'accounting',
    entityType: 'journal_approval_draft',
    entityId: draftId,
    action: 'create',
    auditAction: 'approval_requested',
    summary: `Manual journal submitted for approval (${body.reference ?? draftId.slice(0, 8)})`,
    newValue: { draftId, approvalRequestId, status: 'Pending Approval' },
  });

  await appendRbacAuditLog(client, {
    tenantId,
    actorUserId: requesterId,
    action: 'APPROVAL_SUBMITTED',
    targetType: 'user',
    targetId: draftId,
    reason: body.description ?? null,
    afterState: { entityType: 'manual_journal', approvalRequestId, ruleId: step.ruleId, level: 1 },
  });

  emitApprovalEvent(tenantId, 'approval_requested', {
    requestId: approvalRequestId,
    entityType: 'manual_journal',
    entityId: draftId,
    level: 1,
    sourceUserId: requesterId ?? undefined,
  });

  if (approverIds.length > 0) {
    await notifyApproversForRequest(client, tenantId, approverIds, request, 'manual_journal');
  }

  return { draftId, approvalRequestId, status: 'Pending Approval' };
}

export async function approveJournalDraft(
  client: pg.PoolClient,
  tenantId: string,
  draftId: string,
  approverId: string | null,
  req?: AuthedRequest
): Promise<{ journalEntryId: string; emitPayload: JournalEntryEmitPayload }> {
  const draftRes = await client.query<JournalApprovalDraftRow>(
    `SELECT * FROM rbac_journal_approval_drafts
     WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
    [tenantId, draftId]
  );
  const draft = draftRes.rows[0];
  if (!draft) throw Object.assign(new Error('Journal approval draft not found'), { code: 'NOT_FOUND' });
  if (draft.status !== 'Pending Approval') {
    throw Object.assign(new Error(`Draft is not pending approval (status: ${draft.status})`), {
      code: 'INVALID_STATE',
    });
  }

  assertValidApprovalTransition('Pending Approval', 'Approved');

  const evaluation = await evaluateApprovalRequirement(tenantId, {
    entityType: draft.entity_type,
    requesterId: draft.requester_id,
  }, client);
  const step = approvalLevel(evaluation.matchedRules, 1);
  if (!step) throw Object.assign(new Error('Approval rule missing'), { code: 'CONFIGURATION_ERROR' });

  const allowed = await canApprove(client, tenantId, {
    approverId: approverId ?? '',
    entityType: draft.entity_type,
    requiredPermission: step.requiredPermission,
    requesterId: draft.requester_id,
    allowSelfApproval: false,
    req,
  });
  if (!allowed) {
    throw Object.assign(new Error('Approver cannot approve this journal'), { code: 'FORBIDDEN' });
  }

  let result: { journalEntryId: string; emitPayload: JournalEntryEmitPayload };
  if (draft.entity_type === 'journal_reversal') {
    const payload = draft.payload;
    const originalId = payload.originalJournalEntryId ?? draft.original_journal_entry_id;
    if (!originalId) throw Object.assign(new Error('Missing original journal id'), { code: 'VALIDATION_ERROR' });
    const rev = await reverseManualJournalWithAudit(
      client,
      tenantId,
      originalId,
      payload.reason ?? 'Approved reversal',
      approverId
    );
    result = { journalEntryId: rev.reversalJournalEntryId, emitPayload: rev.reversalEmitPayload };
  } else {
    result = await postManualJournalWithAudit(client, tenantId, draft.payload, approverId);
  }

  await client.query(
    `UPDATE rbac_journal_approval_drafts
     SET status = 'Approved', journal_entry_id = $3, updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, draftId, result.journalEntryId]
  );

  if (draft.approval_request_id) {
    const reqRepo = new ApprovalRequestRepository(tenantId);
    await reqRepo.updateRequest(client, draft.approval_request_id, {
      status: 'approved',
      resolved_at: new Date(),
    });
    await new ApprovalRequestActionRepository(tenantId).insertAction(client, {
      id: randomUUID(),
      approval_request_id: draft.approval_request_id,
      action: 'approve',
      actor_id: approverId,
      approval_level: 1,
      previous_status: 'Pending Approval',
      new_status: 'Approved',
      comments: null,
      delegate_to_user_id: null,
    });
  }

  await appendRbacAuditLog(client, {
    tenantId,
    actorUserId: approverId,
    action: 'APPROVAL_APPROVED',
    targetType: 'user',
    targetId: draftId,
    afterState: { journalEntryId: result.journalEntryId, ruleId: step.ruleId, level: 1 },
  });

  emitApprovalEvent(tenantId, 'approval_approved', {
    requestId: draft.approval_request_id ?? draftId,
    entityType: draft.entity_type,
    entityId: draftId,
    sourceUserId: approverId ?? undefined,
  });

  return result;
}

export async function rejectJournalDraft(
  client: pg.PoolClient,
  tenantId: string,
  draftId: string,
  approverId: string | null,
  reason: string,
  req?: AuthedRequest
): Promise<void> {
  const draftRes = await client.query<JournalApprovalDraftRow>(
    `SELECT * FROM rbac_journal_approval_drafts WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
    [tenantId, draftId]
  );
  const draft = draftRes.rows[0];
  if (!draft || draft.status !== 'Pending Approval') {
    throw Object.assign(new Error('Draft not found or not pending'), { code: 'NOT_FOUND' });
  }
  assertValidApprovalTransition('Pending Approval', 'Rejected');

  const evaluation = await evaluateApprovalRequirement(tenantId, {
    entityType: draft.entity_type,
    requesterId: draft.requester_id,
  }, client);
  const step = approvalLevel(evaluation.matchedRules, 1);
  if (!step) throw Object.assign(new Error('Approval rule missing'), { code: 'CONFIGURATION_ERROR' });

  const allowed = await canApprove(client, tenantId, {
    approverId: approverId ?? '',
    entityType: draft.entity_type,
    requiredPermission: step.requiredPermission,
    requesterId: draft.requester_id,
    allowSelfApproval: false,
    req,
  });
  if (!allowed) {
    throw Object.assign(new Error('Approver cannot reject this journal'), { code: 'FORBIDDEN' });
  }

  await client.query(
    `UPDATE rbac_journal_approval_drafts SET status = 'Rejected', updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, draftId]
  );

  if (draft.approval_request_id) {
    const reqRepo = new ApprovalRequestRepository(tenantId);
    await reqRepo.updateRequest(client, draft.approval_request_id, {
      status: 'rejected',
      comments: reason,
      resolved_at: new Date(),
    });
  }

  await appendRbacAuditLog(client, {
    tenantId,
    actorUserId: approverId,
    action: 'APPROVAL_REJECTED',
    targetType: 'user',
    targetId: draftId,
    reason,
  });

  emitApprovalEvent(tenantId, 'approval_rejected', {
    requestId: draft.approval_request_id ?? draftId,
    entityType: draft.entity_type,
    entityId: draftId,
    sourceUserId: approverId ?? undefined,
  });
}

export async function submitJournalReversalForApproval(
  client: pg.PoolClient,
  tenantId: string,
  originalJournalEntryId: string,
  reason: string,
  requesterId: string | null
): Promise<{ draftId: string; approvalRequestId: string; status: 'Pending Approval' }> {
  await ensureTenantApprovalMatrixSeeded(client, tenantId);

  const evaluation = await evaluateApprovalRequirement(tenantId, {
    entityType: 'journal_reversal',
    requesterId,
  }, client);

  const step = approvalLevel(evaluation.matchedRules, 1);
  if (!step) {
    throw Object.assign(new Error('No approval rule configured for journal reversal'), {
      code: 'CONFIGURATION_ERROR',
    });
  }

  const approverIds = await resolveApproverUserIds(client, tenantId, {
    entityType: 'journal_reversal',
    requiredPermission: step.requiredPermission,
    requesterId,
    level: 1,
  });
  await assertNonEmptyApproverPool(approverIds, 'journal_reversal');

  const draftId = randomUUID();
  const approvalRequestId = randomUUID();

  await client.query(
    `INSERT INTO rbac_journal_approval_drafts (
       id, tenant_id, requester_id, entity_type, payload, status,
       original_journal_entry_id, approval_request_id
     ) VALUES ($1,$2,$3,'journal_reversal',$4,'Pending Approval',$5,$6)`,
    [
      draftId,
      tenantId,
      requesterId,
      JSON.stringify({ originalJournalEntryId, reason }),
      originalJournalEntryId,
      approvalRequestId,
    ]
  );

  const reqRepo = new ApprovalRequestRepository(tenantId);
  await reqRepo.insertRequest(client, {
    id: approvalRequestId,
    entity_type: 'journal_reversal',
    entity_id: draftId,
    entity_ref: originalJournalEntryId.slice(0, 8),
    requester_id: requesterId,
    status: 'pending',
    current_level: 1,
    max_level: evaluation.maxLevel,
    amount: null,
    department_id: null,
    project_id: null,
    previous_status: 'Draft',
    target_status: 'Approved',
    assigned_approver_id: null,
    comments: reason,
  });

  await appendRbacAuditLog(client, {
    tenantId,
    actorUserId: requesterId,
    action: 'APPROVAL_REQUESTED',
    targetType: 'user',
    targetId: draftId,
    reason,
    afterState: { entityType: 'journal_reversal', originalJournalEntryId },
  });

  emitApprovalEvent(tenantId, 'approval_requested', {
    requestId: approvalRequestId,
    entityType: 'journal_reversal',
    entityId: draftId,
    level: 1,
    sourceUserId: requesterId ?? undefined,
  });

  return { draftId, approvalRequestId, status: 'Pending Approval' };
}
