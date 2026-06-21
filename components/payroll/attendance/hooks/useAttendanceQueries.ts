import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  attendanceApi,
  type AttendanceListParams,
  type AttendanceRecord,
  type AttendanceStatus,
} from '../../../../services/api/attendanceApi';
import { useAuth } from '../../../../context/AuthContext';

export const attendanceQueryKeys = {
  root: ['attendance'] as const,
  list: (tenantId: string, params: AttendanceListParams) =>
    ['attendance', 'list', tenantId, params] as const,
  monthlySheet: (tenantId: string, month: number, year: number, departmentId?: string) =>
    ['attendance', 'monthly-sheet', tenantId, month, year, departmentId ?? ''] as const,
  detail: (tenantId: string, id: string) => ['attendance', 'detail', tenantId, id] as const,
};

export function useAttendanceList(params: AttendanceListParams, enabled = true) {
  const { tenant } = useAuth();
  const tenantId = tenant?.id ?? '';
  return useQuery({
    queryKey: attendanceQueryKeys.list(tenantId, params),
    queryFn: () => attendanceApi.list(params),
    enabled: enabled && !!tenantId,
    staleTime: 30_000,
  });
}

export function useAttendanceMonthlySheet(month: number, year: number, departmentId?: string, enabled = true) {
  const { tenant } = useAuth();
  const tenantId = tenant?.id ?? '';
  return useQuery({
    queryKey: attendanceQueryKeys.monthlySheet(tenantId, month, year, departmentId),
    queryFn: () => attendanceApi.monthlySheet(month, year, departmentId),
    enabled: enabled && !!tenantId && month >= 1 && month <= 12,
    staleTime: 60_000,
  });
}

export function useAttendanceMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: attendanceQueryKeys.root });

  const createMutation = useMutation({
    mutationFn: (body: Parameters<typeof attendanceApi.create>[0]) => attendanceApi.create(body),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<AttendanceRecord> }) =>
      attendanceApi.update(id, body),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => attendanceApi.delete(id),
    onSuccess: invalidate,
  });

  const bulkMutation = useMutation({
    mutationFn: ({
      date,
      records,
    }: {
      date: string;
      records: Array<{ employee_id: string; status: AttendanceStatus; remarks?: string | null }>;
    }) => attendanceApi.bulk(date, records),
    onSuccess: invalidate,
  });

  return { createMutation, updateMutation, deleteMutation, bulkMutation };
}
