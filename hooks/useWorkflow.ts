import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRealtimeSocket } from '../core/socket';
import { useAuth } from '../context/AuthContext';
import { dashboardMetricsQueryKeys } from './useDashboardMetrics';
import {
  fetchApprovalQueue,
  fetchWorkflowSettings,
  performApprovalAction,
  updateWorkflowSettings,
  type WorkflowSettings,
} from '../services/workflowApi';

const APPROVAL_EVENTS = [
  'approval_requested',
  'approval_approved',
  'approval_rejected',
  'approval_returned',
  'approval_escalated',
  'approval_delegated',
] as const;

function invalidateApprovalQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['workflow'] });
  void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
  void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  void queryClient.invalidateQueries({ queryKey: dashboardMetricsQueryKeys.root });
  void queryClient.invalidateQueries({ queryKey: ['contracts'] });
  void queryClient.invalidateQueries({ queryKey: ['bills'] });
  void queryClient.invalidateQueries({ queryKey: ['vendors'] });
}

export function useWorkflowSettings() {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();

  useEffect(() => {
    const socket = getRealtimeSocket();
    if (!socket || !tenantId) return;
    const onApproval = (payload: { tenantId?: string }) => {
      if (payload.tenantId && payload.tenantId !== tenantId) return;
      invalidateApprovalQueries(queryClient);
    };
    for (const ev of APPROVAL_EVENTS) socket.on(ev, onApproval);
    return () => {
      for (const ev of APPROVAL_EVENTS) socket.off(ev, onApproval);
    };
  }, [tenantId, queryClient]);

  const query = useQuery({
    queryKey: ['workflow', 'settings'],
    queryFn: fetchWorkflowSettings,
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: (body: Partial<WorkflowSettings>) => updateWorkflowSettings(body),
    onSuccess: (data) => {
      queryClient.setQueryData(['workflow', 'settings'], data);
      invalidateApprovalQueries(queryClient);
    },
  });

  return { ...query, save };
}

export function useApprovalQueue(filters?: { status?: string; entityType?: string; mine?: boolean }) {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();

  useEffect(() => {
    const socket = getRealtimeSocket();
    if (!socket || !tenantId) return;
    const onApproval = (payload: { tenantId?: string }) => {
      if (payload.tenantId && payload.tenantId !== tenantId) return;
      invalidateApprovalQueries(queryClient);
    };
    for (const ev of APPROVAL_EVENTS) socket.on(ev, onApproval);
    return () => {
      for (const ev of APPROVAL_EVENTS) socket.off(ev, onApproval);
    };
  }, [tenantId, queryClient]);

  const query = useQuery({
    queryKey: ['workflow', 'queue', filters],
    queryFn: () => fetchApprovalQueue(filters),
    staleTime: 15_000,
  });

  const act = useMutation({
    mutationFn: (input: {
      requestId: string;
      action: 'approve' | 'reject' | 'return' | 'delegate' | 'escalate';
      comments?: string;
      delegateToUserId?: string;
    }) => performApprovalAction(input.requestId, input),
    onSuccess: () => invalidateApprovalQueries(queryClient),
  });

  return { ...query, act };
}
