import { apiClient } from './client';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LEAVE' | 'HALF_DAY' | 'LATE';

export type AttendanceRecord = {
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

export type AttendanceDashboardCounts = {
  present: number;
  absent: number;
  leave: number;
  late: number;
  half_day: number;
  total_marked: number;
};

export type AttendanceSummary = {
  working_days: number;
  present_days: number;
  absent_days: number;
  leave_days: number;
  late_days: number;
  half_days: number;
};

export type MonthlySheetEmployee = {
  employee_id: string;
  employee_name: string;
  employee_code?: string;
  department: string;
  department_id?: string;
  days: Record<string, AttendanceStatus | null>;
  summary: AttendanceSummary;
};

export type AttendanceListParams = {
  date?: string;
  month?: number;
  year?: number;
  employeeId?: string;
  departmentId?: string;
  status?: AttendanceStatus;
  page?: number;
  limit?: number;
};

export type AttendanceListResponse = {
  data: AttendanceRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  dashboard?: AttendanceDashboardCounts;
};

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const attendanceApi = {
  list(params: AttendanceListParams = {}): Promise<AttendanceListResponse> {
    return apiClient.get<AttendanceListResponse>(
      `/attendance${qs({
        date: params.date,
        month: params.month,
        year: params.year,
        employeeId: params.employeeId,
        departmentId: params.departmentId,
        status: params.status,
        page: params.page,
        limit: params.limit,
      })}`
    );
  },

  get(id: string): Promise<AttendanceRecord> {
    return apiClient.get<AttendanceRecord>(`/attendance/${id}`);
  },

  create(body: Partial<AttendanceRecord> & { employee_id: string; attendance_date: string; status: AttendanceStatus }): Promise<AttendanceRecord> {
    return apiClient.post<AttendanceRecord>('/attendance', body);
  },

  update(id: string, body: Partial<AttendanceRecord>): Promise<AttendanceRecord> {
    return apiClient.put<AttendanceRecord>(`/attendance/${id}`, body);
  },

  delete(id: string): Promise<{ deleted: boolean }> {
    return apiClient.delete<{ deleted: boolean }>(`/attendance/${id}`);
  },

  bulk(date: string, records: Array<{ employee_id: string; status: AttendanceStatus; check_in?: string | null; check_out?: string | null; late_minutes?: number; remarks?: string | null }>): Promise<{ records: AttendanceRecord[]; count: number }> {
    return apiClient.post<{ records: AttendanceRecord[]; count: number }>('/attendance/bulk', { date, records });
  },

  monthlySheet(month: number, year: number, departmentId?: string): Promise<{ month: number; year: number; days_in_month: number; employees: MonthlySheetEmployee[] }> {
    return apiClient.get(`/attendance/monthly-sheet${qs({ month, year, departmentId })}`);
  },
};
