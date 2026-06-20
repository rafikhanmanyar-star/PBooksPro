import type pg from 'pg';
import type { ApprovalRequestRow } from '../repositories/ApprovalRequestRepository.js';
import type { WorkflowEntityType } from '../../../workflow/workflowTypes.js';
import { createUserNotifications } from '../../notifications/services/userNotificationService.js';

const ENTITY_LABELS: Record<WorkflowEntityType, string> = {
  purchase_order: 'Purchase Order',
  contract: 'Contract',
  bill: 'Vendor Bill',
  payment: 'Payment',
  retention_release: 'Retention Release',
  variation_order: 'Variation Order',
};

export async function notifyApproversForRequest(
  client: pg.PoolClient,
  tenantId: string,
  userIds: string[],
  request: ApprovalRequestRow,
  entityType: WorkflowEntityType | string
): Promise<void> {
  const label =
    (ENTITY_LABELS as Record<string, string>)[entityType] ??
    (entityType === 'manual_journal'
      ? 'Manual Journal'
      : entityType === 'journal_reversal'
        ? 'Journal Reversal'
        : entityType);
  const ref = request.entity_ref ?? request.entity_id;
  await createUserNotifications(client, tenantId, userIds, {
    category: 'workflow',
    title: `${label} approval required`,
    body: `${ref} is awaiting your approval (level ${request.current_level}/${request.max_level}).`,
    severity: 'info',
    actionType: 'approval_request',
    actionId: request.id,
    entityType,
    entityId: request.entity_id,
  });
}
