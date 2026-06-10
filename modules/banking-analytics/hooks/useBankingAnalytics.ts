import { useQuery } from '@tanstack/react-query';
import { bankingAnalyticsApi } from '../../../services/api/bankingAnalyticsApi';
import { useBankingAnalyticsFiltersStore } from '../store/bankingAnalyticsFiltersStore';

const STALE_MS = 60_000;

export const bankingAnalyticsQueryKeys = {
  root: ['bankingAnalytics'] as const,
  data: (filters: ReturnType<typeof useBankingAnalyticsFiltersStore.getState>['filters']) =>
    [...bankingAnalyticsQueryKeys.root, filters] as const,
};

export function useBankingAnalytics(enabled = true) {
  const filters = useBankingAnalyticsFiltersStore((s) => s.filters);

  return useQuery({
    queryKey: bankingAnalyticsQueryKeys.data(filters),
    queryFn: () => bankingAnalyticsApi.getAnalytics(filters),
    enabled,
    staleTime: STALE_MS,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });
}
