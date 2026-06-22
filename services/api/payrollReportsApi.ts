import { apiClient } from './client';

export type PayrollReportQuery = {
  month?: number;
  year?: number;
  departmentId?: string;
  employeeId?: string;
  status?: string;
  runId?: string;
  fromDate?: string;
  toDate?: string;
};

function qs(params: PayrollReportQuery): string {
  const q = new URLSearchParams();
  if (params.month) q.set('month', String(params.month));
  if (params.year) q.set('year', String(params.year));
  if (params.departmentId) q.set('departmentId', params.departmentId);
  if (params.employeeId) q.set('employeeId', params.employeeId);
  if (params.status) q.set('status', params.status);
  if (params.runId) q.set('runId', params.runId);
  if (params.fromDate) q.set('fromDate', params.fromDate);
  if (params.toDate) q.set('toDate', params.toDate);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const payrollReportsApi = {
  getRegister: (query: PayrollReportQuery = {}) =>
    apiClient.get<{ rows: Record<string, unknown>[] }>(`/payroll/reports/register${qs(query)}`),

  getPaymentHistory: (query: PayrollReportQuery = {}) =>
    apiClient.get<{ rows: Record<string, unknown>[] }>(`/payroll/reports/payment-history${qs(query)}`),

  getLiability: (query: PayrollReportQuery = {}) =>
    apiClient.get<{ rows: Record<string, unknown>[]; totals: Record<string, number> }>(
      `/payroll/reports/liability${qs(query)}`
    ),

  getJournal: (query: PayrollReportQuery = {}) =>
    apiClient.get<{ rows: Record<string, unknown>[] }>(`/payroll/reports/journal${qs(query)}`),

  getLeaveImpact: (query: PayrollReportQuery = {}) =>
    apiClient.get<{ rows: Record<string, unknown>[] }>(`/payroll/reports/leave-impact${qs(query)}`),

  getSummary: (query: PayrollReportQuery = {}) =>
    apiClient.get<{ summary: Record<string, unknown> }>(`/payroll/reports/summary${qs(query)}`),

  getAttendanceImpactV2: (month: number, year: number) =>
    apiClient.get<{ rows: Record<string, unknown>[] }>(
      `/payroll/reports/attendance-impact-v2?month=${month}&year=${year}`
    ),
};

export default payrollReportsApi;
