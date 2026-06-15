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
