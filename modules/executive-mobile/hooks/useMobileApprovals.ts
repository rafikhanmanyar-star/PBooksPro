import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveMobileItem,
  fetchMobileApprovals,
  fetchMobileInstallmentPlanDetail,
  rejectMobileItem,
} from '../../../services/api/mobileApprovalsApi';

export function useMobileApprovals() {
  return useQuery({
    queryKey: ['mobile-approvals'],
    queryFn: fetchMobileApprovals,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

export function useMobileInstallmentPlanDetail(planId: string | null) {
  return useQuery({
    queryKey: ['mobile-installment-plan-detail', planId],
    queryFn: () => fetchMobileInstallmentPlanDetail(planId!),
    enabled: Boolean(planId),
    staleTime: 30_000,
  });
}

export function useApproveMobileItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ type, id }: { type: string; id: string }) => approveMobileItem(type, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mobile-approvals'] });
      void qc.invalidateQueries({ queryKey: ['mobile-installment-plan-detail'] });
      void qc.invalidateQueries({ queryKey: ['mobile-notifications'] });
    },
  });
}

export function useRejectMobileItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ type, id, reason }: { type: string; id: string; reason?: string }) =>
      rejectMobileItem(type, id, reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mobile-approvals'] });
      void qc.invalidateQueries({ queryKey: ['mobile-installment-plan-detail'] });
      void qc.invalidateQueries({ queryKey: ['mobile-notifications'] });
    },
  });
}
