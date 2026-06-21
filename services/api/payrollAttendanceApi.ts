import { apiClient } from './client';

export type PayrollAttendanceSummary = {
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
  created_at: string;
  updated_at: string;
};

export type PayrollImpactPreview = {
  employee_id: string;
  employee_name?: string;
  gross_pay: number;
  lop_days: number;
  working_days: number;
  projected_deduction: number;
  projected_net_after_lop: number;
};

export type WorkWeekConfig = {
  working_days: number[];
  weekend_days: number[];
};

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const payrollAttendanceApi = {
  previewSummaries: (month: number, year: number) =>
    apiClient.get<{ items: PayrollAttendanceSummary[]; month: number; year: number }>(
      `/payroll/attendance-summaries/preview${qs({ month, year })}`
    ),

  listSummaries: (month: number, year: number, page = 1, limit = 500) =>
    apiClient.get<{ data: PayrollAttendanceSummary[]; totalCount: number; page: number; pageSize: number }>(
      `/payroll/attendance-summaries${qs({ month, year, page, limit })}`
    ),

  generateSummaries: (body: { month: number; year: number; runId?: string; forceOverride?: boolean }) =>
    apiClient.post<{ summaries: PayrollAttendanceSummary[]; count: number; runId?: string }>(
      '/payroll/attendance-summaries/generate',
      body
    ),

  previewImpact: (month: number, year: number) =>
    apiClient.get<{ items: PayrollImpactPreview[]; month: number; year: number }>(
      `/payroll/attendance-summaries/impact-preview${qs({ month, year })}`
    ),

  getAttendanceImpactReport: (month: number, year: number) =>
    apiClient.get<{ report: string; month: number; year: number; rows: PayrollAttendanceSummary[] }>(
      `/payroll/reports/attendance-impact${qs({ month, year })}`
    ),

  getLopReport: (month: number, year: number) =>
    apiClient.get<{
      report: string;
      month: number;
      year: number;
      rows: {
        employee_id: string;
        employee_name?: string;
        department?: string;
        absent_days: number;
        unpaid_leave_days: number;
        half_days: number;
        lop_days: number;
      }[];
      total_lop_days: number;
    }>(`/payroll/reports/lop${qs({ month, year })}`),

  getWorkWeek: () => apiClient.get<WorkWeekConfig>('/payroll/settings/work-week'),

  updateWorkWeek: (body: WorkWeekConfig) => apiClient.put<WorkWeekConfig>('/payroll/settings/work-week', body),

  startWizardRun: (body: { month: number; year: number }) =>
    apiClient.post<import('../components/payroll/types').PayrollRun>('/payroll/runs/wizard/start', body),

  approveRun: (runId: string) => apiClient.post<import('../components/payroll/types').PayrollRun>(`/payroll/runs/${runId}/approve`, {}),

  unapproveRun: (runId: string) =>
    apiClient.post<import('../components/payroll/types').PayrollRun>(`/payroll/runs/${runId}/unapprove`, {}),
};
