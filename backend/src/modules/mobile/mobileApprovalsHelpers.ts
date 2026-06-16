import {
  isWorkflowEntityType,
  WORKFLOW_ENTITY_TYPES,
  type WorkflowEntityType,
} from '../../workflow/workflowTypes.js';

export type MobileLegacyApprovalType = 'pev' | 'installment_plan' | 'contractor_bill';

export type MobileApprovalType = WorkflowEntityType | MobileLegacyApprovalType;

export type MobileApprovalItem = {
  id: string;
  type: MobileApprovalType;
  title: string;
  subtitle?: string;
  amount?: number;
  currency?: string;
  status: string;
  requestedAt?: string;
  requestedById?: string;
  requestedByName?: string;
  canApprove: boolean;
  requiresFullErp?: boolean;
  reviewedAt?: string;
  reviewedByName?: string;
  workflowRequestId?: string;
  entityId?: string;
  currentLevel?: number;
  maxLevel?: number;
  entityRef?: string;
};

export { isWorkflowEntityType, WORKFLOW_ENTITY_TYPES };

export function normalizeStatus(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isPendingInstallmentPlan(
  status: string,
  approvalRequestedTo: string | null | undefined,
  userId: string
): boolean {
  if (normalizeStatus(status) !== 'pending approval') return false;
  if (!approvalRequestedTo) return false;
  return approvalRequestedTo === userId;
}

export function isMarketingPlanApprovalHistory(status: string): boolean {
  const norm = normalizeStatus(status);
  return norm === 'approved' || norm === 'rejected';
}

export function marketingPlanVisibleToMobileUser(
  row: {
    status: string;
    approval_requested_to: string | null;
    approval_reviewed_by: string | null;
    approval_requested_at: Date | null;
    user_id?: string | null;
  },
  userId: string,
  canReviewPlans: boolean
): boolean {
  if (row.user_id === userId) return true;
  if (canReviewPlans && normalizeStatus(row.status) === 'pending approval') return true;
  if (isPendingInstallmentPlan(row.status, row.approval_requested_to, userId)) {
    return canReviewPlans || row.approval_requested_to === userId;
  }
  if (!row.approval_requested_at) return false;
  if (!isMarketingPlanApprovalHistory(row.status)) return false;
  return (
    canReviewPlans ||
    row.approval_requested_to === userId ||
    row.approval_reviewed_by === userId
  );
}

export function filterApprovalsForUser(
  items: MobileApprovalItem[],
  userId: string
): MobileApprovalItem[] {
  return items.filter((item) => item.canApprove || item.requestedById === userId);
}

export function sortApprovalsByDate(items: MobileApprovalItem[]): MobileApprovalItem[] {
  return [...items].sort((a, b) => {
    const ta = a.requestedAt ? Date.parse(a.requestedAt) : 0;
    const tb = b.requestedAt ? Date.parse(b.requestedAt) : 0;
    return tb - ta;
  });
}
