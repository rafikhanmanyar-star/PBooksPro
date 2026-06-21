/**
 * AUTO-GENERATED — do not edit. Source: shared/payroll-core/payrollCalculator.ts
 * Regenerate: node scripts/ensure-shared-financial-cores.mjs
 */

import { calculateLopDays } from './lopCalculator.js';
import type {
  PayrollAttendanceSummaryInput,
  PayrollEmployeeSalaryInput,
  ComputedAttendancePayslip,
} from './payrollTypes.js';

export const AdjustmentType = { EARNING: 'EARNING', DEDUCTION: 'DEDUCTION' } as const;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function getMonthName(monthIndex1Based: number): string {
  return MONTH_NAMES[monthIndex1Based - 1] ?? '';
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function parseJoiningDate(joiningDate: string): { year: number; month: number; day: number } | null {
  if (!joiningDate) return null;
  const parts = joiningDate.split('-').map(Number);
  if (parts.length < 3) return null;
  const [y, m, d] = parts;
  if (!m || m < 1 || m > 12) return null;
  return { year: y, month: m, day: Math.min(d || 1, getDaysInMonth(y, m)) };
}

export function daysWorkedInJoiningMonth(joiningDate: string, year: number, month: number): number | null {
  const join = parseJoiningDate(joiningDate);
  if (!join || join.year !== year || join.month !== month) return null;
  const daysInMonth = getDaysInMonth(year, month);
  return daysInMonth - join.day + 1;
}

export function isPayrollPeriodBeforeJoiningDate(
  joiningDate: string | undefined,
  year: number,
  month: number
): boolean {
  if (!joiningDate || String(joiningDate).trim() === '') return false;
  const join = parseJoiningDate(joiningDate);
  if (!join) return false;
  return year < join.year || (year === join.year && month < join.month);
}

function componentAmount(basic: number, comp: { amount: number; is_percentage: boolean }): number {
  if (comp.is_percentage) return Math.round((basic * comp.amount) / 100);
  return comp.amount;
}

/** Daily rate = Basic Salary / Working Days (from attendance summary). */
export function calculateDailyRate(basicSalary: number, workingDays: number): number {
  const safeWorking = workingDays > 0 ? workingDays : 1;
  return basicSalary / safeWorking;
}

/** LOP deduction = Daily Rate × LOP Days. */
export function calculateLopDeduction(basicSalary: number, workingDays: number, lopDays: number): number {
  if (lopDays <= 0) return 0;
  return Math.round(calculateDailyRate(basicSalary, workingDays) * lopDays);
}

/**
 * Attendance-aware payslip calculation (Sprint 3B).
 * Percentage allowances use adjusted basic; fixed allowances and deduction/adjustment logic unchanged.
 */
export function computeAttendanceAwarePayslip(
  employee: PayrollEmployeeSalaryInput,
  year: number,
  month: number,
  summary: PayrollAttendanceSummaryInput
): ComputedAttendancePayslip {
  const contractBasic = employee.salary?.basic ?? 0;
  const allowances = employee.salary?.allowances ?? [];
  const deductions = employee.salary?.deductions ?? [];
  const adjustments = employee.adjustments ?? [];

  const daysWorked = daysWorkedInJoiningMonth(employee.joining_date ?? '', year, month);
  const daysInMonth = getDaysInMonth(year, month);
  const isJoiningMonth = daysWorked != null && daysWorked < daysInMonth;

  let basicSalary = contractBasic;
  if (isJoiningMonth) {
    basicSalary = Math.round(contractBasic * (daysWorked! / daysInMonth));
  }

  const lopDays =
    summary.lop_days ??
    calculateLopDays({
      absentDays: summary.absent_days,
      unpaidLeaveDays: summary.unpaid_leave_days,
      halfDays: summary.half_days,
    });

  const lopDeduction = calculateLopDeduction(basicSalary, summary.working_days, lopDays);
  const adjustedBasic = Math.max(0, basicSalary - lopDeduction);

  const allowanceDetails = allowances.map((a) => ({
    ...a,
    amount: a.is_percentage ? componentAmount(adjustedBasic, a) : a.amount,
  }));
  const deductionDetails = deductions.map((d) => ({
    ...d,
    amount: componentAmount(basicSalary, d),
  }));

  let totalAllowances = allowanceDetails.reduce((s, a) => s + a.amount, 0);
  let totalDeductions = deductionDetails.reduce((s, d) => s + d.amount, 0);
  const adjustmentEarnings = adjustments
    .filter((a) => a.type === AdjustmentType.EARNING)
    .reduce((s, a) => s + a.amount, 0);
  const adjustmentDeductions = adjustments
    .filter((a) => a.type === AdjustmentType.DEDUCTION)
    .reduce((s, a) => s + a.amount, 0);
  let totalAdjustments = adjustmentEarnings - adjustmentDeductions;

  if (isJoiningMonth) {
    totalAdjustments = Math.round(totalAdjustments * (daysWorked! / daysInMonth));
  }

  const grossPay = adjustedBasic + totalAllowances;
  let netPay = grossPay - totalDeductions + totalAdjustments;
  netPay = Math.ceil(netPay / 100) * 100;

  const snapshot: PayrollAttendanceSummaryInput = { ...summary, lop_days: lopDays };

  return {
    basic_pay: adjustedBasic,
    adjusted_basic: adjustedBasic,
    total_allowances: totalAllowances,
    total_deductions: totalDeductions,
    total_adjustments: totalAdjustments,
    gross_pay: grossPay,
    net_pay: netPay,
    lop_deduction: lopDeduction,
    working_days: summary.working_days,
    present_days: summary.present_days,
    leave_days: summary.leave_days,
    paid_leave_days: summary.paid_leave_days,
    unpaid_leave_days: summary.unpaid_leave_days,
    absent_days: summary.absent_days,
    half_days: summary.half_days,
    lop_days: lopDays,
    allowance_details: allowanceDetails,
    deduction_details: deductionDetails,
    attendance_summary_snapshot: snapshot,
  };
}

/** Legacy full-month payslip without LOP — mirrors pre-3B behavior. */
export function computeMonthlyPayslip(
  employee: PayrollEmployeeSalaryInput,
  year: number,
  month: number
): Omit<ComputedAttendancePayslip, 'attendance_summary_snapshot'> & { attendance_summary_snapshot: null } {
  const basic = employee.salary?.basic ?? 0;
  const allowances = employee.salary?.allowances ?? [];
  const deductions = employee.salary?.deductions ?? [];
  const adjustments = employee.adjustments ?? [];

  const allowanceDetails = allowances.map((a) => ({
    ...a,
    amount: componentAmount(basic, a),
  }));
  const deductionDetails = deductions.map((d) => ({
    ...d,
    amount: componentAmount(basic, d),
  }));

  let totalAllowances = allowanceDetails.reduce((s, a) => s + a.amount, 0);
  let totalDeductions = deductionDetails.reduce((s, d) => s + d.amount, 0);
  const adjustmentEarnings = adjustments
    .filter((a) => a.type === AdjustmentType.EARNING)
    .reduce((s, a) => s + a.amount, 0);
  const adjustmentDeductions = adjustments
    .filter((a) => a.type === AdjustmentType.DEDUCTION)
    .reduce((s, a) => s + a.amount, 0);
  let totalAdjustments = adjustmentEarnings - adjustmentDeductions;

  let basicPay = basic;
  let grossPay = basic + totalAllowances;
  let netPay = grossPay - totalDeductions + totalAdjustments;

  const daysWorked = daysWorkedInJoiningMonth(employee.joining_date ?? '', year, month);
  const daysInMonth = getDaysInMonth(year, month);

  if (daysWorked != null && daysWorked < daysInMonth) {
    const factor = daysWorked / daysInMonth;
    basicPay = Math.round(basic * factor);
    totalAllowances = Math.round(totalAllowances * factor);
    totalDeductions = Math.round(totalDeductions * factor);
    totalAdjustments = Math.round(totalAdjustments * factor);
    grossPay = basicPay + totalAllowances;
    netPay = grossPay - totalDeductions + totalAdjustments;
  }
  netPay = Math.ceil(netPay / 100) * 100;

  return {
    basic_pay: basicPay,
    adjusted_basic: basicPay,
    total_allowances: totalAllowances,
    total_deductions: totalDeductions,
    total_adjustments: totalAdjustments,
    gross_pay: grossPay,
    net_pay: netPay,
    lop_deduction: 0,
    working_days: 0,
    present_days: 0,
    leave_days: 0,
    paid_leave_days: 0,
    unpaid_leave_days: 0,
    absent_days: 0,
    half_days: 0,
    lop_days: 0,
    allowance_details: allowanceDetails,
    deduction_details: deductionDetails,
    attendance_summary_snapshot: null,
  };
}

/** Wizard preview — projected impact from stored attendance summary. */
export function projectPayrollImpactFromSummary(
  employee: PayrollEmployeeSalaryInput,
  year: number,
  month: number,
  summary: PayrollAttendanceSummaryInput
): {
  gross_pay: number;
  lop_days: number;
  working_days: number;
  lop_deduction: number;
  projected_net: number;
} {
  const computed = computeAttendanceAwarePayslip(employee, year, month, summary);
  return {
    gross_pay: computed.gross_pay,
    lop_days: computed.lop_days,
    working_days: computed.working_days,
    lop_deduction: computed.lop_deduction,
    projected_net: computed.net_pay,
  };
}
