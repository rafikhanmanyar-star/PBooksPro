import { useQuery } from '@tanstack/react-query';
import { vendorAnalyticsApi } from '../../../services/api/vendorAnalyticsApi';
import { useVendorAnalyticsFiltersStore } from '../store/vendorAnalyticsFiltersStore';

const STALE_MS = 60_000;

export const vendorAnalyticsQueryKeys = {
  root: ['vendorAnalytics'] as const,
  data: (filters: ReturnType<typeof useVendorAnalyticsFiltersStore.getState>['filters']) =>
    [...vendorAnalyticsQueryKeys.root, filters] as const,
};

export function useVendorAnalytics(enabled = true) {
  const filters = useVendorAnalyticsFiltersStore((s) => s.filters);

  return useQuery({
    queryKey: vendorAnalyticsQueryKeys.data(filters),
    queryFn: () => vendorAnalyticsApi.getAnalytics(filters),
    enabled,
    staleTime: STALE_MS,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });
}
