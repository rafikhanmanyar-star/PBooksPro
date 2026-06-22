import type { PayrollRun } from '../types';
import { isPayrollRunCreator, PAYROLL_SOD_CREATOR_BLOCKED_MESSAGE } from './payrollApprovalSod';

export type WorkflowGuard = { allowed: boolean; reason?: string };

export function canProcessPayrollRun(run: PayrollRun | null | undefined): WorkflowGuard {
  if (!run) return { allowed: false, reason: 'Start the payroll wizard and generate summaries first.' };
  if (run.status !== 'GENERATED') {
    return { allowed: false, reason: 'Payslips can only be processed when run status is GENERATED.' };
  }
  return { allowed: true };
}

export function canApprovePayrollRunWorkflow(
  run: PayrollRun | null | undefined,
  payslipCount: number,
  options?: { currentUserId?: string | null }
): WorkflowGuard {
  if (!run) return { allowed: false, reason: 'No payroll run linked.' };
  if (run.status !== 'GENERATED') {
    return { allowed: false, reason: 'Only runs ready for approval can be approved.' };
  }
  if (payslipCount <= 0) {
    return { allowed: false, reason: 'Process payslips before approving the run.' };
  }
  if (options?.currentUserId && isPayrollRunCreator(run, options.currentUserId)) {
    return { allowed: false, reason: PAYROLL_SOD_CREATOR_BLOCKED_MESSAGE };
  }
  return { allowed: true };
}

export function canPayPayrollRun(run: PayrollRun | null | undefined): WorkflowGuard {
  if (!run) return { allowed: false, reason: 'Payroll run not found for this payslip.' };
  if (run.status !== 'APPROVED' && run.status !== 'PAID') {
    return { allowed: false, reason: 'Payroll run must be APPROVED before salary payment.' };
  }
  return { allowed: true };
}

export function payslipHasAttendanceSnapshot(payslip: {
  attendance_summary_snapshot?: unknown;
}): boolean {
  const snap = payslip.attendance_summary_snapshot;
  if (snap == null) return false;
  if (typeof snap === 'object' && !Array.isArray(snap)) {
    return Object.keys(snap as object).length > 0;
  }
  return true;
}
