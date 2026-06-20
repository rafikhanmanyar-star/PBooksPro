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
];
export const MANDATORY_APPROVAL_ENTITY_TYPES = [
    'manual_journal',
    'journal_reversal',
];
export function isApprovalEntityType(value) {
    return APPROVAL_ENTITY_TYPES.includes(value);
}
/** Legacy workflow entity types that align with approval matrix entity types. */
export const WORKFLOW_ALIGNED_ENTITY_TYPES = ['bill', 'payment', 'purchase_order'];
export function toWorkflowEntityType(entityType) {
    if (entityType === 'bill' || entityType === 'payment' || entityType === 'purchase_order') {
        return entityType;
    }
    return null;
}
/** SoD create permission paired with approve permission per entity type. */
export const APPROVAL_SOD_CREATE_PERMISSION = {
    manual_journal: 'accounting.journals.create',
    journal_reversal: 'accounting.journals.reverse',
    bill: 'procurement.bills.create',
    payment: 'accounting.transactions.create',
    purchase_order: 'procurement.purchase_orders.create',
    payroll_run: 'payroll.runs.create',
    rental_agreement: 'rental.agreements.create',
};
