import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leaveApi, type LeaveRequestListParams, type LeaveStatus } from '../../../../services/api/leaveApi';
import { useAuth } from '../../../../context/AuthContext';

export const leaveQueryKeys = {
  root: ['leave'] as const,
  types: (tenantId: string) => ['leave', 'types', tenantId] as const,
  requests: (tenantId: string, params: LeaveRequestListParams) =>
    ['leave', 'requests', tenantId, params] as const,
  balances: (tenantId: string, year: number, departmentId?: string) =>
    ['leave', 'balances', tenantId, year, departmentId ?? ''] as const,
};

export function useLeaveTypes() {
  const { tenant } = useAuth();
  const tenantId = tenant?.id ?? '';
  return useQuery({
    queryKey: leaveQueryKeys.types(tenantId),
    queryFn: () => leaveApi.listTypes(),
    enabled: !!tenantId,
    staleTime: 60_000,
  });
}

export function useLeaveRequests(params: LeaveRequestListParams, enabled = true) {
  const { tenant } = useAuth();
  const tenantId = tenant?.id ?? '';
  return useQuery({
    queryKey: leaveQueryKeys.requests(tenantId, params),
    queryFn: () => leaveApi.listRequests(params),
    enabled: enabled && !!tenantId,
    staleTime: 30_000,
  });
}

export function useLeaveBalances(year: number, departmentId?: string, enabled = true) {
  const { tenant } = useAuth();
  const tenantId = tenant?.id ?? '';
  return useQuery({
    queryKey: leaveQueryKeys.balances(tenantId, year, departmentId),
    queryFn: () => leaveApi.listBalances({ year, departmentId, limit: 500 }),
    enabled: enabled && !!tenantId,
    staleTime: 60_000,
  });
}

export function useLeaveMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: leaveQueryKeys.root });
    queryClient.invalidateQueries({ queryKey: ['attendance'] });
  };

  return {
    createType: useMutation({ mutationFn: leaveApi.createType, onSuccess: invalidate }),
    updateType: useMutation({ mutationFn: ({ id, body }: { id: string; body: Parameters<typeof leaveApi.updateType>[1] }) => leaveApi.updateType(id, body), onSuccess: invalidate }),
    deleteType: useMutation({ mutationFn: leaveApi.deleteType, onSuccess: invalidate }),
    createRequest: useMutation({ mutationFn: leaveApi.createRequest, onSuccess: invalidate }),
    updateRequest: useMutation({ mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => leaveApi.updateRequest(id, body), onSuccess: invalidate }),
    deleteRequest: useMutation({ mutationFn: leaveApi.deleteRequest, onSuccess: invalidate }),
    approveRequest: useMutation({ mutationFn: ({ id, remarks }: { id: string; remarks?: string }) => leaveApi.approveRequest(id, { remarks }), onSuccess: invalidate }),
    rejectRequest: useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => leaveApi.rejectRequest(id, { rejection_reason: reason }), onSuccess: invalidate }),
    cancelRequest: useMutation({ mutationFn: leaveApi.cancelRequest, onSuccess: invalidate }),
  };
}

export type { LeaveStatus };
