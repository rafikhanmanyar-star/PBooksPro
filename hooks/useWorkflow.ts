import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invalidateApprovalQueries } from '../services/realtime/approvalQueryInvalidation';
import {
  fetchApprovalQueue,
  fetchWorkflowSettings,
  performApprovalAction,
  updateWorkflowSettings,
  type WorkflowSettings,
} from '../services/workflowApi';

export function useWorkflowSettings() {
  const queryClient = useQueryClient();

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
