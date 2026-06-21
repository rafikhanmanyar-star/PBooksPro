export type PayrollAttendanceSummaryRow = {
  id: string;
  tenant_id: string;
  employee_id: string;
  payroll_month: number;
  payroll_year: number;
  working_days: string | number;
  present_days: string | number;
  leave_days: string | number;
  paid_leave_days: string | number;
  unpaid_leave_days: string | number;
  absent_days: string | number;
  half_days: string | number;
  late_days: string | number;
  lop_days: string | number;
  created_at: Date;
  updated_at: Date;
};

export type PayrollAttendanceSummaryWithEmployee = PayrollAttendanceSummaryRow & {
  employee_name?: string;
  employee_code?: string | null;
  department?: string;
  department_id?: string | null;
};

export type PayrollAttendanceSummaryApi = {
  id: string;
  tenant_id: string;
  employee_id: string;
  payroll_month: number;
  payroll_year: number;
  working_days: number;
  present_days: number;
  leave_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  absent_days: number;
  half_days: number;
  late_days: number;
  lop_days: number;
  employee_name?: string;
  employee_code?: string | null;
  department?: string;
  department_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type PayrollAttendanceSummaryListFilters = {
  payrollMonth: number;
  payrollYear: number;
  employeeId?: string;
  departmentId?: string;
  page?: number;
  limit?: number;
};

export type AggregatedAttendanceRow = {
  employee_id: string;
  present_cnt: string;
  absent_cnt: string;
  paid_leave_cnt: string;
  unpaid_leave_cnt: string;
  half_day_cnt: string;
  late_cnt: string;
};

export const PAYROLL_RUN_STATUSES = [
  'DRAFT',
  'PROCESSING',
  'GENERATED',
  'APPROVED',
  'PAID',
  'CANCELLED',
] as const;

export type PayrollRunLifecycleStatus = (typeof PAYROLL_RUN_STATUSES)[number];

export type WorkWeekConfigApi = {
  working_days: number[];
  weekend_days: number[];
};
