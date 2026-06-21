import { apiClient } from './client';

export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export type LeaveType = {
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

export type LeaveRequest = {
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
  employee_code?: string;
  department?: string;
  department_id?: string;
  leave_type_name?: string;
};

export type LeaveBalance = {
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

export type LeaveDashboardCounts = {
  pending: number;
  approved: number;
  rejected: number;
  on_leave_today: number;
};

export type LeaveRequestListParams = {
  employeeId?: string;
  departmentId?: string;
  leaveTypeId?: string;
  status?: LeaveStatus;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
};

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, String(v));
  }
  const q = sp.toString();
  return q ? `?${q}` : '';
}

export const leaveApi = {
  listTypes: () => apiClient.get<LeaveType[]>('/leaves/types'),
  createType: (body: Partial<LeaveType>) => apiClient.post<LeaveType>('/leaves/types', body),
  updateType: (id: string, body: Partial<LeaveType>) => apiClient.put<LeaveType>(`/leaves/types/${id}`, body),
  deleteType: (id: string) => apiClient.delete<{ deleted: boolean }>(`/leaves/types/${id}`),

  listRequests: (params: LeaveRequestListParams = {}) =>
    apiClient.get<{ data: LeaveRequest[]; totalCount: number; page: number; pageSize: number; dashboard?: LeaveDashboardCounts }>(
      `/leaves/requests${qs(params as Record<string, string | number | undefined>)}`
    ),
  getRequest: (id: string) => apiClient.get<LeaveRequest>(`/leaves/requests/${id}`),
  createRequest: (body: Record<string, unknown>) => apiClient.post<LeaveRequest>('/leaves/requests', body),
  updateRequest: (id: string, body: Record<string, unknown>) => apiClient.put<LeaveRequest>(`/leaves/requests/${id}`, body),
  deleteRequest: (id: string) => apiClient.delete<{ deleted: boolean }>(`/leaves/requests/${id}`),
  approveRequest: (id: string, body?: { remarks?: string; forceOverride?: boolean; force_override?: boolean }) =>
    apiClient.post<LeaveRequest>(`/leaves/requests/${id}/approve`, body ?? {}),
  rejectRequest: (id: string, body: { rejection_reason?: string; rejectionReason?: string }) =>
    apiClient.post<LeaveRequest>(`/leaves/requests/${id}/reject`, body),
  cancelRequest: (id: string) => apiClient.post<LeaveRequest>(`/leaves/requests/${id}/cancel`, {}),

  listBalances: (params: { employeeId?: string; departmentId?: string; year?: number; page?: number; limit?: number } = {}) =>
    apiClient.get<{ data: LeaveBalance[]; totalCount: number; page: number; pageSize: number }>(
      `/leaves/balances${qs(params as Record<string, string | number | undefined>)}`
    ),
  getEmployeeBalances: (employeeId: string, year?: number) =>
    apiClient.get<{ employee_id: string; year: number; balances: LeaveBalance[] }>(
      `/leaves/balances/${employeeId}${year ? `?year=${year}` : ''}`
    ),
};
