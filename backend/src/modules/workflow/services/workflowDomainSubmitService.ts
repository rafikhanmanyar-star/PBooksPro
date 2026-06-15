import type pg from 'pg';
import { ApprovalRequestRepository } from '../repositories/ApprovalRequestRepository.js';
import { performApprovalAction, submitEntityForApproval } from './workflowEngineService.js';
import { isApprovalWorkflowEnabled } from './workflowSettingsService.js';
import type { WorkflowEntityType } from '../../../workflow/workflowTypes.js';

/** Submit entity through workflow gateway (used by domain submit routes). */
export async function submitDomainEntityForApproval(
  client: pg.PoolClient,
  tenantId: string,
  entityType: WorkflowEntityType,
  entityId: string,
  userId: string | null,
  requesterRole?: string | null
) {
  return submitEntityForApproval(client, tenantId, {
    entityType,
    entityId,
    requesterId: userId,
    requesterRole: requesterRole ?? null,
  });
}

/**
 * When workflow is enabled, approve via pending approval_request.
 * When disabled, run directApprove callback (legacy one-click approve).
 */
export async function approveDomainEntityWithWorkflowGate(
  client: pg.PoolClient,
  tenantId: string,
  entityType: WorkflowEntityType,
  entityId: string,
  userId: string | null,
  directApprove: () => Promise<{ snapshot: Record<string, unknown> }>
) {
  const workflowEnabled = await isApprovalWorkflowEnabled(client, tenantId);
  if (workflowEnabled) {
    const reqRepo = new ApprovalRequestRepository(tenantId);
    const pending = await reqRepo.findActiveForEntity(client, entityType, entityId);
    if (!pending) {
      throw new Error('No pending approval request. Use the approval queue to approve this document.');
    }
    const approvalRequest = await performApprovalAction(client, tenantId, {
      requestId: pending.id,
      action: 'approve',
      actorId: userId,
    });
    return { workflowMode: 'approval_queue' as const, approvalRequest };
  }
  const result = await directApprove();
  return { workflowMode: 'direct' as const, snapshot: result.snapshot };
}
