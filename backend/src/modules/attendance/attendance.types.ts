export const ATTENDANCE_STATUSES = [
  'PRESENT',
  'ABSENT',
  'LEAVE',
  'HALF_DAY',
  'LATE',
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export type AttendanceRecordRow = {
  id: string;
  tenant_id: string;
  employee_id: string;
  attendance_date: Date | string;
  status: AttendanceStatus;
  check_in: Date | null;
  check_out: Date | null;
  late_minutes: number;
  remarks: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type AttendanceRecordApi = {
  id: string;
  tenant_id: string;
  employee_id: string;
  attendance_date: string;
  status: AttendanceStatus;
  check_in: string | null;
  check_out: string | null;
  late_minutes: number;
  remarks: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  employee_name?: string;
  employee_code?: string;
  department?: string;
  department_id?: string;
};

export type AttendanceListFilters = {
  date?: string;
  month?: number;
  year?: number;
  employeeId?: string;
  departmentId?: string;
  status?: AttendanceStatus;
  page?: number;
  limit?: number;
};

export type AttendanceSummaryApi = {
  working_days: number;
  present_days: number;
  absent_days: number;
  leave_days: number;
  late_days: number;
  half_days: number;
};

export type MonthlySheetEmployeeRow = {
  employee_id: string;
  employee_name: string;
  employee_code?: string;
  department: string;
  department_id?: string;
  days: Record<string, AttendanceStatus | null>;
  summary: AttendanceSummaryApi;
};

export type BulkAttendanceRecordInput = {
  employee_id: string;
  status: AttendanceStatus;
  check_in?: string | null;
  check_out?: string | null;
  late_minutes?: number;
  remarks?: string | null;
};

export type AttendanceDashboardCounts = {
  present: number;
  absent: number;
  leave: number;
  late: number;
  half_day: number;
  total_marked: number;
};
