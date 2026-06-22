/**
 * Canonical payroll audit action keys (audit_events.action / audit_action).
 * Keep in sync with components/payroll/utils/payrollAuditCatalog.ts
 */
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

export type PayrollAuditAction = (typeof PAYROLL_AUDIT_ACTIONS)[keyof typeof PAYROLL_AUDIT_ACTIONS];
