/**
 * AUTO-GENERATED — do not edit. Source: shared/rbac/approvalTypes.ts
 * Regenerate: node scripts/ensure-shared-financial-cores.mjs
 */

/**
 * RBAC 2.0 Phase 5 — approval matrix types (Architecture §6).
 */

export const APPROVAL_ENTITY_TYPES = [
  'manual_journal',
  'journal_reversal',
  'bill',
  'payment',
  'purchase_order',
  'payroll_run',
  'rental_agreement',
] as const;

export type ApprovalEntityType = (typeof APPROVAL_ENTITY_TYPES)[number];

export type ApprovalCapability = {
  capabilityKey: string;
  entityType: ApprovalEntityType;
  requiredPermission: string;
  maxLevel: number;
};

export type ApprovalMatrixRuleConditions = {
  minAmount?: number | null;
  maxAmount?: number | null;
  projectIds?: string[];
  departmentIds?: string[];
};

export type ApprovalMatrixRule = {
  id: string;
  tenantId: string;
  entityType: ApprovalEntityType;
  priority: number;
  approvalLevel: number;
  minApprovers: number;
  allowSelfApproval: boolean;
  requiredPermission: string;
  conditions: ApprovalMatrixRuleConditions;
  isMandatory: boolean;
  isActive: boolean;
};

export type ApprovalEvaluationContext = {
  entityType: ApprovalEntityType;
  amount?: number;
  projectId?: string | null;
  departmentId?: string | null;
  requesterId?: string | null;
};

export type ApprovalWorkflowStatus =
  | 'Draft'
  | 'Pending Approval'
  | 'Approved'
  | 'Rejected'
  | 'Cancelled';

export const MANDATORY_APPROVAL_ENTITY_TYPES: readonly ApprovalEntityType[] = [
  'manual_journal',
  'journal_reversal',
] as const;

export function isApprovalEntityType(value: string): value is ApprovalEntityType {
  return (APPROVAL_ENTITY_TYPES as readonly string[]).includes(value);
}

/** Legacy workflow entity types that align with approval matrix entity types. */
export const WORKFLOW_ALIGNED_ENTITY_TYPES = ['bill', 'payment', 'purchase_order'] as const;

export type WorkflowAlignedEntityType = (typeof WORKFLOW_ALIGNED_ENTITY_TYPES)[number];

export function toWorkflowEntityType(entityType: ApprovalEntityType): WorkflowAlignedEntityType | null {
  if (entityType === 'bill' || entityType === 'payment' || entityType === 'purchase_order') {
    return entityType;
  }
  return null;
}

/** SoD create permission paired with approve permission per entity type. */
export const APPROVAL_SOD_CREATE_PERMISSION: Record<ApprovalEntityType, string> = {
  manual_journal: 'accounting.journals.create',
  journal_reversal: 'accounting.journals.reverse',
  bill: 'procurement.bills.create',
  payment: 'accounting.transactions.create',
  purchase_order: 'procurement.purchase_orders.create',
  payroll_run: 'payroll.runs.create',
  rental_agreement: 'rental.agreements.create',
};
