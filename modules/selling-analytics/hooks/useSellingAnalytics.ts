import { useQuery } from '@tanstack/react-query';
import { sellingAnalyticsApi } from '../../../services/api/sellingAnalyticsApi';
import { useSellingAnalyticsFiltersStore } from '../store/sellingAnalyticsFiltersStore';
import { usePageQueryEnabled } from '../../../hooks/usePageQueryEnabled';

const STALE_MS = 30_000;

export const sellingAnalyticsQueryKeys = {
  root: ['sellingAnalytics'] as const,
  data: (filters: ReturnType<typeof useSellingAnalyticsFiltersStore.getState>['filters']) =>
    [...sellingAnalyticsQueryKeys.root, filters] as const,
};

export function useSellingAnalytics(enabled = true) {
  const filters = useSellingAnalyticsFiltersStore((s) => s.filters);
  const pageEnabled = usePageQueryEnabled();
  const queryEnabled = enabled && pageEnabled;

  return useQuery({
    queryKey: sellingAnalyticsQueryKeys.data(filters),
    queryFn: () => sellingAnalyticsApi.getAnalytics(filters),
    enabled: queryEnabled,
    staleTime: STALE_MS,
    refetchInterval: queryEnabled ? 120_000 : false,
    refetchIntervalInBackground: false,
  });
}
