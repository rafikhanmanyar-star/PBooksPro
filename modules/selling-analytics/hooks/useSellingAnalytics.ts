import { useQuery } from '@tanstack/react-query';
import { sellingAnalyticsApi } from '../../../services/api/sellingAnalyticsApi';
import { useSellingAnalyticsFiltersStore } from '../store/sellingAnalyticsFiltersStore';

const STALE_MS = 60_000;

export const sellingAnalyticsQueryKeys = {
  root: ['sellingAnalytics'] as const,
  data: (filters: ReturnType<typeof useSellingAnalyticsFiltersStore.getState>['filters']) =>
    [...sellingAnalyticsQueryKeys.root, filters] as const,
};

export function useSellingAnalytics(enabled = true) {
  const filters = useSellingAnalyticsFiltersStore((s) => s.filters);

  return useQuery({
    queryKey: sellingAnalyticsQueryKeys.data(filters),
    queryFn: () => sellingAnalyticsApi.getAnalytics(filters),
    enabled,
    staleTime: STALE_MS,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });
}
