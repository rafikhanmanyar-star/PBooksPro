import { useQuery } from '@tanstack/react-query';
import { bankingAnalyticsApi } from '../../../services/api/bankingAnalyticsApi';
import { useBankingAnalyticsFiltersStore } from '../store/bankingAnalyticsFiltersStore';
import { usePageQueryEnabled } from '../../../hooks/usePageQueryEnabled';

const STALE_MS = 60_000;

export const bankingAnalyticsQueryKeys = {
  root: ['bankingAnalytics'] as const,
  data: (filters: ReturnType<typeof useBankingAnalyticsFiltersStore.getState>['filters']) =>
    [...bankingAnalyticsQueryKeys.root, filters] as const,
};

export function useBankingAnalytics(enabled = true) {
  const filters = useBankingAnalyticsFiltersStore((s) => s.filters);
  const pageEnabled = usePageQueryEnabled();
  const queryEnabled = enabled && pageEnabled;

  return useQuery({
    queryKey: bankingAnalyticsQueryKeys.data(filters),
    queryFn: () => bankingAnalyticsApi.getAnalytics(filters),
    enabled: queryEnabled,
    staleTime: STALE_MS,
    refetchInterval: queryEnabled ? 120_000 : false,
    refetchIntervalInBackground: false,
  });
}
