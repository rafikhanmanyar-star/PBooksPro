import { useQuery } from '@tanstack/react-query';
import { vendorAnalyticsApi } from '../../../services/api/vendorAnalyticsApi';
import { useVendorAnalyticsFiltersStore } from '../store/vendorAnalyticsFiltersStore';
import { usePageQueryEnabled } from '../../../hooks/usePageQueryEnabled';

const STALE_MS = 60_000;

export const vendorAnalyticsQueryKeys = {
  root: ['vendorAnalytics'] as const,
  data: (filters: ReturnType<typeof useVendorAnalyticsFiltersStore.getState>['filters']) =>
    [...vendorAnalyticsQueryKeys.root, filters] as const,
};

export function useVendorAnalytics(enabled = true) {
  const filters = useVendorAnalyticsFiltersStore((s) => s.filters);
  const pageEnabled = usePageQueryEnabled();
  const queryEnabled = enabled && pageEnabled;

  return useQuery({
    queryKey: vendorAnalyticsQueryKeys.data(filters),
    queryFn: () => vendorAnalyticsApi.getAnalytics(filters),
    enabled: queryEnabled,
    staleTime: STALE_MS,
    refetchInterval: queryEnabled ? 120_000 : false,
    refetchIntervalInBackground: false,
  });
}
