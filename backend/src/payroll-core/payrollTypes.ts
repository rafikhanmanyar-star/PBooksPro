/**
 * AUTO-GENERATED — do not edit. Source: shared/payroll-core/payrollTypes.ts
 * Regenerate: node scripts/ensure-shared-financial-cores.mjs
 */

/** Payroll V3 — shared types for attendance summary and LOP (Sprint 3A). */

/** JavaScript Date.getDay(): 0 = Sunday … 6 = Saturday */
export type WorkWeekConfig = {
  working_days: number[];
  weekend_days: number[];
};

export const DEFAULT_WORK_WEEK: WorkWeekConfig = {
  working_days: [1, 2, 3, 4, 5, 6],
  weekend_days: [0],
};

export type AttendanceStatusCounts = {
  present: number;
  absent: number;
  leaveTotal: number;
  paidLeave: number;
  unpaidLeave: number;
  halfDay: number;
  late: number;
};

export type ComputedAttendanceSummary = {
  workingDays: number;
  presentDays: number;
  leaveDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  absentDays: number;
  halfDays: number;
  lateDays: number;
  lopDays: number;
};

export type ProjectedSalaryImpact = {
  grossPay: number;
  workingDays: number;
  lopDays: number;
  dailyRate: number;
  projectedDeduction: number;
  projectedNetAfterLop: number;
};

/** Stored summary shape — payroll reads payroll_attendance_summaries only (Sprint 3B). */
export type PayrollAttendanceSummaryInput = {
  working_days: number;
  present_days: number;
  leave_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  absent_days: number;
  half_days: number;
  lop_days: number;
};

export type PayrollEmployeeSalaryInput = {
  joining_date?: string;
  salary?: {
    basic: number;
    allowances: Array<{ name: string; amount: number; is_percentage: boolean }>;
    deductions: Array<{ name: string; amount: number; is_percentage: boolean }>;
  };
  adjustments?: Array<{ name: string; amount: number; type: string }>;
};

export type ComputedAttendancePayslip = {
  basic_pay: number;
  adjusted_basic: number;
  total_allowances: number;
  total_deductions: number;
  total_adjustments: number;
  gross_pay: number;
  net_pay: number;
  lop_deduction: number;
  working_days: number;
  present_days: number;
  leave_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  absent_days: number;
  half_days: number;
  lop_days: number;
  allowance_details: Array<{ name: string; amount: number; is_percentage: boolean }>;
  deduction_details: Array<{ name: string; amount: number; is_percentage: boolean }>;
  attendance_summary_snapshot: PayrollAttendanceSummaryInput | null;
};
