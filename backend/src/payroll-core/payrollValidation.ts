/**
 * AUTO-GENERATED — do not edit. Source: shared/payroll-core/payrollValidation.ts
 * Regenerate: node scripts/ensure-shared-financial-cores.mjs
 */

import type { PayrollAttendanceSummaryInput } from './payrollTypes.js';

export class PayrollValidationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'PayrollValidationError';
  }
}

/** Pre-generation checks — Sprint 3B. */
export function validateAttendanceSummaryForPayroll(
  summary: PayrollAttendanceSummaryInput | null | undefined,
  employeeId: string,
  employeeActive: boolean
): void {
  if (!employeeActive) {
    throw new PayrollValidationError('EMPLOYEE_INACTIVE', `Employee ${employeeId} is not active.`);
  }
  if (!summary) {
    throw new PayrollValidationError(
      'ATTENDANCE_SUMMARY_MISSING',
      `Attendance summary missing for employee ${employeeId}. Generate summaries in Payroll Wizard first.`
    );
  }
  if (!(summary.working_days > 0)) {
    throw new PayrollValidationError(
      'INVALID_WORKING_DAYS',
      `Working days must be greater than zero for employee ${employeeId}.`
    );
  }
}

export function assertPayrollRunStatusForPayslipGeneration(status: string): void {
  if (status !== 'GENERATED') {
    throw new PayrollValidationError(
      'INVALID_RUN_STATUS',
      'Payslips can only be generated when payroll run status is GENERATED.'
    );
  }
}

export function assertPayrollRunStatusForPayment(status: string): void {
  if (status !== 'APPROVED' && status !== 'PAID') {
    throw new PayrollValidationError(
      'RUN_NOT_APPROVED',
      'Payroll run must be APPROVED before salary payment.'
    );
  }
}

export function assertPayrollRunEditable(status: string): void {
  if (status === 'APPROVED' || status === 'PAID') {
    throw new PayrollValidationError('RUN_LOCKED', 'Payroll run is locked in the current status.');
  }
}
