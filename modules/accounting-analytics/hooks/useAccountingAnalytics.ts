import { useQuery } from '@tanstack/react-query';
import { accountingAnalyticsApi } from '../../../services/api/accountingAnalyticsApi';
import { useAccountingAnalyticsFiltersStore } from '../store/accountingAnalyticsFiltersStore';

const STALE_MS = 60_000;

export const accountingAnalyticsQueryKeys = {
  root: ['accountingAnalytics'] as const,
  data: (filters: ReturnType<typeof useAccountingAnalyticsFiltersStore.getState>['filters']) =>
    [...accountingAnalyticsQueryKeys.root, filters] as const,
};

export function useAccountingAnalytics(enabled = true) {
  const filters = useAccountingAnalyticsFiltersStore((s) => s.filters);

  return useQuery({
    queryKey: accountingAnalyticsQueryKeys.data(filters),
    queryFn: () => accountingAnalyticsApi.getAnalytics(filters),
    enabled,
    staleTime: STALE_MS,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });
}
