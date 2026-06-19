import { useQuery } from '@tanstack/react-query';
import { accountingAnalyticsApi } from '../../../services/api/accountingAnalyticsApi';
import { useAccountingAnalyticsFiltersStore } from '../store/accountingAnalyticsFiltersStore';
import { usePageQueryEnabled } from '../../../hooks/usePageQueryEnabled';

const STALE_MS = 60_000;

export const accountingAnalyticsQueryKeys = {
  root: ['accountingAnalytics'] as const,
  data: (filters: ReturnType<typeof useAccountingAnalyticsFiltersStore.getState>['filters']) =>
    [...accountingAnalyticsQueryKeys.root, filters] as const,
};

export function useAccountingAnalytics(enabled = true) {
  const filters = useAccountingAnalyticsFiltersStore((s) => s.filters);
  const pageEnabled = usePageQueryEnabled();
  const queryEnabled = enabled && pageEnabled;

  return useQuery({
    queryKey: accountingAnalyticsQueryKeys.data(filters),
    queryFn: () => accountingAnalyticsApi.getAnalytics(filters),
    enabled: queryEnabled,
    staleTime: STALE_MS,
    refetchInterval: queryEnabled ? 120_000 : false,
    refetchIntervalInBackground: false,
  });
}
