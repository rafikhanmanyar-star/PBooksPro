/**
 * Server-side payslip math — delegates to shared/payroll-core (Sprint 3B).
 */
export {
  AdjustmentType,
  getMonthName,
  getDaysInMonth,
  daysWorkedInJoiningMonth,
  isPayrollPeriodBeforeJoiningDate,
  computeMonthlyPayslip,
  computeAttendanceAwarePayslip,
  projectPayrollImpactFromSummary,
  calculateDailyRate,
  calculateLopDeduction,
} from '../payroll-core/payrollCalculator.js';

export type {
  PayrollEmployeeSalaryInput as PayrollEmployeeLike,
  ComputedAttendancePayslip as ComputedPayslipAmounts,
} from '../payroll-core/payrollTypes.js';
