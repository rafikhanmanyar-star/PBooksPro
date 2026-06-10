import { useQuery } from '@tanstack/react-query';
import { rentalAnalyticsApi } from '../../../services/api/rentalAnalyticsApi';
import { useRentalAnalyticsFiltersStore } from '../store/rentalAnalyticsFiltersStore';

const STALE_MS = 60_000;

export const rentalAnalyticsQueryKeys = {
  root: ['rentalAnalytics'] as const,
  data: (filters: ReturnType<typeof useRentalAnalyticsFiltersStore.getState>['filters']) =>
    [...rentalAnalyticsQueryKeys.root, filters] as const,
};

export function useRentalAnalytics(enabled = true) {
  const filters = useRentalAnalyticsFiltersStore((s) => s.filters);

  return useQuery({
    queryKey: rentalAnalyticsQueryKeys.data(filters),
    queryFn: () => rentalAnalyticsApi.getAnalytics(filters),
    enabled,
    staleTime: STALE_MS,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });
}
