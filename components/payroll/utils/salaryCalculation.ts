/**
 * Salary calculation — delegates to shared/payroll-core (Sprint 3B).
 */
import type { PayrollEmployee } from '../types';
import {
  AdjustmentType,
  getMonthName,
  getDaysInMonth,
  daysWorkedInJoiningMonth,
  isPayrollPeriodBeforeJoiningDate,
  computeMonthlyPayslip,
  computeAttendanceAwarePayslip,
  projectPayrollImpactFromSummary,
} from '../../../shared/payroll-core/payrollCalculator';
import type { ComputedAttendancePayslip } from '../../../shared/payroll-core/payrollTypes';

export {
  AdjustmentType,
  getMonthName,
  getDaysInMonth,
  daysWorkedInJoiningMonth,
  isPayrollPeriodBeforeJoiningDate,
  computeMonthlyPayslip,
  computeAttendanceAwarePayslip,
  projectPayrollImpactFromSummary,
};

export type ComputedPayslipAmounts = ComputedAttendancePayslip;

/** Typed wrapper for legacy callers using PayrollEmployee. */
export function computeEmployeePayslip(employee: PayrollEmployee, year: number, month: number) {
  return computeMonthlyPayslip(employee, year, month);
}
