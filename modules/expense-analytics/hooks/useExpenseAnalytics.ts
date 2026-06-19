import { useQuery } from '@tanstack/react-query';
import { expenseAnalyticsApi } from '../../../services/api/expenseAnalyticsApi';
import { useExpenseAnalyticsFiltersStore } from '../store/expenseAnalyticsFiltersStore';
import { usePageQueryEnabled } from '../../../hooks/usePageQueryEnabled';

const STALE_MS = 60_000;

export const expenseAnalyticsQueryKeys = {
  root: ['expenseAnalytics'] as const,
  data: (filters: ReturnType<typeof useExpenseAnalyticsFiltersStore.getState>['filters']) =>
    [...expenseAnalyticsQueryKeys.root, filters] as const,
};

export function useExpenseAnalytics(enabled = true) {
  const filters = useExpenseAnalyticsFiltersStore((s) => s.filters);
  const pageEnabled = usePageQueryEnabled();
  const queryEnabled = enabled && pageEnabled;

  return useQuery({
    queryKey: expenseAnalyticsQueryKeys.data(filters),
    queryFn: () => expenseAnalyticsApi.getAnalytics(filters),
    enabled: queryEnabled,
    staleTime: STALE_MS,
    refetchInterval: queryEnabled ? 120_000 : false,
    refetchIntervalInBackground: false,
  });
}
