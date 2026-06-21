import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../../context/AuthContext';
import { payrollAttendanceApi } from '../../../../services/api/payrollAttendanceApi';
import { payrollApi } from '../../../../services/api/payrollApi';

export function usePayrollAttendancePreview(month: number, year: number, enabled = true) {
  const { tenant } = useAuth();
  const tenantId = tenant?.id ?? '';
  return useQuery({
    queryKey: ['payroll', 'attendance-summaries', 'preview', tenantId, month, year],
    queryFn: () => payrollAttendanceApi.previewSummaries(month, year),
    enabled: enabled && !!tenantId && month >= 1 && year > 0,
  });
}

export function usePayrollAttendanceSummaries(month: number, year: number, enabled = true) {
  const { tenant } = useAuth();
  const tenantId = tenant?.id ?? '';
  return useQuery({
    queryKey: ['payroll', 'attendance-summaries', 'stored', tenantId, month, year],
    queryFn: async () => {
      const res = await payrollAttendanceApi.listSummaries(month, year);
      return res.data ?? [];
    },
    enabled: enabled && !!tenantId && month >= 1 && year > 0,
  });
}

export function usePayrollImpactPreview(month: number, year: number, enabled = true) {
  const { tenant } = useAuth();
  const tenantId = tenant?.id ?? '';
  return useQuery({
    queryKey: ['payroll', 'attendance-summaries', 'impact', tenantId, month, year],
    queryFn: () => payrollAttendanceApi.previewImpact(month, year),
    enabled: enabled && !!tenantId && month >= 1 && year > 0,
  });
}

export function usePayrollAttendanceMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['payroll'] });
    void qc.invalidateQueries({ queryKey: ['payroll', 'attendance-summaries'] });
    void qc.invalidateQueries({ queryKey: ['payroll', 'wizard'] });
  };
  return {
    startWizard: useMutation({ mutationFn: payrollAttendanceApi.startWizardRun, onSuccess: invalidate }),
    generateSummaries: useMutation({ mutationFn: payrollAttendanceApi.generateSummaries, onSuccess: invalidate }),
    approveRun: useMutation({ mutationFn: payrollAttendanceApi.approveRun, onSuccess: invalidate }),
    unapproveRun: useMutation({ mutationFn: payrollAttendanceApi.unapproveRun, onSuccess: invalidate }),
    processRun: useMutation({
      mutationFn: async (runId: string) => payrollApi.processPayrollRun(runId),
      onSuccess: invalidate,
    }),
  };
}

export function useRunPayslipCount(runId: string | null, enabled = true) {
  const { tenant } = useAuth();
  const tenantId = tenant?.id ?? '';
  return useQuery({
    queryKey: ['payroll', 'run-payslips-count', tenantId, runId],
    queryFn: async () => {
      if (!runId) return 0;
      const rows = await payrollApi.getPayslipsByRun(runId);
      return rows?.length ?? 0;
    },
    enabled: enabled && !!tenantId && !!runId,
  });
}

export function useWorkWeekConfig() {
  const { tenant } = useAuth();
  const tenantId = tenant?.id ?? '';
  return useQuery({
    queryKey: ['payroll', 'work-week', tenantId],
    queryFn: () => payrollAttendanceApi.getWorkWeek(),
    enabled: !!tenantId,
  });
}
