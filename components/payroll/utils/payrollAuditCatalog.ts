/** Frontend mirror of backend payroll audit catalog. */
export const PAYROLL_AUDIT_ACTIONS = {
  RUN_CREATED: 'payroll.run.created',
  RUN_GENERATED: 'payroll.run.generated',
  RUN_PROCESSED: 'payroll.run.processed',
  RUN_APPROVED: 'payroll.run.approved',
  RUN_UNAPPROVED: 'payroll.run.unapproved',
  RUN_ACCRUAL_POSTED: 'payroll.run.accrual_posted',
  RUN_REVERSED: 'payroll.run.reversed',
  RUN_VOIDED: 'payroll.run.voided',
  SUMMARY_GENERATED: 'payroll.summary.generated',
  WORK_WEEK_UPDATED: 'payroll.work_week.updated',
  PAYSLIP_CREATED: 'payroll.payslip.created',
  PAYSLIP_GENERATED: 'payroll.payslip.generated',
  PAYSLIP_UPDATED: 'payroll.payslip.updated',
  PAYSLIP_PAID: 'payroll.payslip.paid',
  PAYSLIP_VOIDED: 'payroll.payslip.voided',
  PAYSLIP_DELETED: 'payroll.payslip.deleted',
  PAYSLIP_BULK_PAID: 'payroll.payslip.bulk_paid',
  LOP_APPLIED: 'payroll.lop.applied',
  PAYMENT_CREATED: 'payroll.payment.created',
  PAYMENT_REVERSED: 'payroll.payment.reversed',
  PAYMENT_VOIDED: 'payroll.payment.voided',
} as const;

export const PAYROLL_AUDIT_LABELS: Record<string, string> = {
  [PAYROLL_AUDIT_ACTIONS.RUN_CREATED]: 'Run Created',
  [PAYROLL_AUDIT_ACTIONS.RUN_GENERATED]: 'Run Generated',
  [PAYROLL_AUDIT_ACTIONS.RUN_PROCESSED]: 'Run Processed',
  [PAYROLL_AUDIT_ACTIONS.RUN_APPROVED]: 'Run Approved',
  [PAYROLL_AUDIT_ACTIONS.RUN_UNAPPROVED]: 'Run Unapproved',
  [PAYROLL_AUDIT_ACTIONS.RUN_ACCRUAL_POSTED]: 'Accrual Posted',
  [PAYROLL_AUDIT_ACTIONS.RUN_REVERSED]: 'Accrual Reversed',
  [PAYROLL_AUDIT_ACTIONS.RUN_VOIDED]: 'Run Voided',
  [PAYROLL_AUDIT_ACTIONS.SUMMARY_GENERATED]: 'Summaries Generated',
  [PAYROLL_AUDIT_ACTIONS.WORK_WEEK_UPDATED]: 'Work Week Updated',
  [PAYROLL_AUDIT_ACTIONS.PAYSLIP_CREATED]: 'Payslip Created',
  [PAYROLL_AUDIT_ACTIONS.PAYSLIP_GENERATED]: 'Payslip Generated',
  [PAYROLL_AUDIT_ACTIONS.PAYSLIP_UPDATED]: 'Payslip Updated',
  [PAYROLL_AUDIT_ACTIONS.PAYSLIP_PAID]: 'Payslip Paid',
  [PAYROLL_AUDIT_ACTIONS.PAYSLIP_VOIDED]: 'Payslip Voided',
  [PAYROLL_AUDIT_ACTIONS.PAYSLIP_DELETED]: 'Payslip Deleted',
  [PAYROLL_AUDIT_ACTIONS.PAYSLIP_BULK_PAID]: 'Bulk Payment',
  [PAYROLL_AUDIT_ACTIONS.LOP_APPLIED]: 'LOP Applied',
  [PAYROLL_AUDIT_ACTIONS.PAYMENT_CREATED]: 'Payment Created',
  [PAYROLL_AUDIT_ACTIONS.PAYMENT_REVERSED]: 'Payment Reversed',
  [PAYROLL_AUDIT_ACTIONS.PAYMENT_VOIDED]: 'Payment Voided',
};

export function extractAuditReason(newValue: unknown): string | null {
  if (newValue == null || typeof newValue !== 'object') return null;
  const r = (newValue as { reason?: unknown }).reason;
  return typeof r === 'string' && r.trim() ? r.trim() : null;
}
