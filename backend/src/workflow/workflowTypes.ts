/**
 * AUTO-GENERATED — do not edit. Source: shared/workflow/workflowTypes.ts
 * Regenerate: node scripts/ensure-shared-financial-cores.mjs
 */

/** Pluggable workflow entity types. */
export type WorkflowEntityType =
  | 'purchase_order'
  | 'contract'
  | 'bill'
  | 'payment'
  | 'retention_release'
  | 'variation_order';

export const WORKFLOW_ENTITY_TYPES: readonly WorkflowEntityType[] = [
  'purchase_order',
  'contract',
  'bill',
  'payment',
  'retention_release',
  'variation_order',
] as const;

export const WORKFLOW_ENTITY_LABELS: Record<WorkflowEntityType, string> = {
  purchase_order: 'Purchase Order',
  contract: 'Contract',
  bill: 'Vendor Bill',
  payment: 'Payment',
  retention_release: 'Retention Release',
  variation_order: 'Variation Order',
};

export const WORKFLOW_ENTITY_SHORT_LABELS: Record<WorkflowEntityType, string> = {
  purchase_order: 'PO',
  contract: 'Contract',
  bill: 'Bill',
  payment: 'Payment',
  retention_release: 'Retention',
  variation_order: 'Variation',
};

export function isWorkflowEntityType(type: string): type is WorkflowEntityType {
  return (WORKFLOW_ENTITY_TYPES as readonly string[]).includes(type);
}

export type ApprovalRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'returned'
  | 'escalated'
  | 'delegated'
  | 'cancelled';

export type ApprovalActionType =
  | 'request'
  | 'approve'
  | 'reject'
  | 'return'
  | 'delegate'
  | 'escalate'
  | 'auto_approve';

export type WorkflowRuleType = 'amount' | 'department' | 'project' | 'entity' | 'role';

export type WorkflowRule = {
  id: string;
  type: WorkflowRuleType;
  level: 1 | 2 | 3;
  enabled?: boolean;
  minAmount?: number;
  maxAmount?: number;
  departmentId?: string;
  projectId?: string;
  entityType?: WorkflowEntityType;
  role?: string;
};

export type WorkflowConfig = {
  levels: 1 | 2 | 3;
  rules: WorkflowRule[];
};

export type WorkflowEvaluationContext = {
  entityType: WorkflowEntityType;
  amount?: number;
  departmentId?: string | null;
  projectId?: string | null;
  requesterRole?: string | null;
};

export type WorkflowEvaluationResult = {
  maxLevel: 1 | 2 | 3;
  matchedRuleIds: string[];
};

export const DEFAULT_WORKFLOW_CONFIG: WorkflowConfig = {
  levels: 3,
  rules: [],
};

export const AUTO_APPROVE_AUDIT_MESSAGE =
  'Auto-approved because tenant approval workflow is disabled.';
