import { useQuery } from '@tanstack/react-query';
import { rentalAnalyticsApi } from '../../../services/api/rentalAnalyticsApi';
import { useRentalAnalyticsFiltersStore } from '../store/rentalAnalyticsFiltersStore';
import { usePageQueryEnabled } from '../../../hooks/usePageQueryEnabled';

const STALE_MS = 60_000;

export const rentalAnalyticsQueryKeys = {
  root: ['rentalAnalytics'] as const,
  data: (filters: ReturnType<typeof useRentalAnalyticsFiltersStore.getState>['filters']) =>
    [...rentalAnalyticsQueryKeys.root, filters] as const,
};

export function useRentalAnalytics(enabled = true) {
  const filters = useRentalAnalyticsFiltersStore((s) => s.filters);
  const pageEnabled = usePageQueryEnabled();
  const queryEnabled = enabled && pageEnabled;

  return useQuery({
    queryKey: rentalAnalyticsQueryKeys.data(filters),
    queryFn: () => rentalAnalyticsApi.getAnalytics(filters),
    enabled: queryEnabled,
    staleTime: STALE_MS,
    refetchInterval: queryEnabled ? 120_000 : false,
    refetchIntervalInBackground: false,
  });
}
