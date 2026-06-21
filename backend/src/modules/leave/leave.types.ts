export const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export type LeaveTypeRow = {
  id: string;
  tenant_id: string;
  name: string;
  annual_quota: number;
  paid_leave: boolean;
  carry_forward: boolean;
  active: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type LeaveTypeApi = {
  id: string;
  tenant_id: string;
  name: string;
  annual_quota: number;
  paid_leave: boolean;
  carry_forward: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type LeaveRequestRow = {
  id: string;
  tenant_id: string;
  employee_id: string;
  leave_type_id: string;
  from_date: Date | string;
  to_date: Date | string;
  days: string | number;
  reason: string | null;
  attachment_url: string | null;
  status: LeaveStatus;
  approved_by: string | null;
  approved_at: Date | null;
  rejection_reason: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type LeaveRequestApi = {
  id: string;
  tenant_id: string;
  employee_id: string;
  leave_type_id: string;
  from_date: string;
  to_date: string;
  days: number;
  reason: string | null;
  attachment_url: string | null;
  status: LeaveStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  employee_name?: string;
  employee_code?: string | null;
  department?: string;
  department_id?: string | null;
  leave_type_name?: string;
};

export type LeaveBalanceRow = {
  id: string;
  tenant_id: string;
  employee_id: string;
  leave_type_id: string;
  year: number;
  allocated_days: string | number;
  used_days: string | number;
  balance_days: string | number;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

export type LeaveBalanceApi = {
  id: string;
  tenant_id: string;
  employee_id: string;
  leave_type_id: string;
  year: number;
  allocated_days: number;
  used_days: number;
  balance_days: number;
  employee_name?: string;
  department?: string;
  leave_type_name?: string;
};

export type LeaveRequestListFilters = {
  employeeId?: string;
  departmentId?: string;
  leaveTypeId?: string;
  status?: LeaveStatus;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
};

export type LeaveBalanceListFilters = {
  employeeId?: string;
  departmentId?: string;
  year?: number;
  page?: number;
  limit?: number;
};

export type LeaveDashboardCounts = {
  pending: number;
  approved: number;
  rejected: number;
  on_leave_today: number;
};
