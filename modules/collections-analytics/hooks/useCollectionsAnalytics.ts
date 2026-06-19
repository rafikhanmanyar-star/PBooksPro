import { useQuery } from '@tanstack/react-query';
import { collectionsAnalyticsApi } from '../../../services/api/collectionsAnalyticsApi';
import { useCollectionsAnalyticsFiltersStore } from '../store/collectionsAnalyticsFiltersStore';
import { usePageQueryEnabled } from '../../../hooks/usePageQueryEnabled';

const STALE_MS = 60_000;

export const collectionsAnalyticsQueryKeys = {
  root: ['collectionsAnalytics'] as const,
  data: (filters: ReturnType<typeof useCollectionsAnalyticsFiltersStore.getState>['filters']) =>
    [...collectionsAnalyticsQueryKeys.root, filters] as const,
};

export function useCollectionsAnalytics(enabled = true) {
  const filters = useCollectionsAnalyticsFiltersStore((s) => s.filters);
  const pageEnabled = usePageQueryEnabled();
  const queryEnabled = enabled && pageEnabled;

  return useQuery({
    queryKey: collectionsAnalyticsQueryKeys.data(filters),
    queryFn: () => collectionsAnalyticsApi.getAnalytics(filters),
    enabled: queryEnabled,
    staleTime: STALE_MS,
    refetchInterval: queryEnabled ? 120_000 : false,
    refetchIntervalInBackground: false,
  });
}
