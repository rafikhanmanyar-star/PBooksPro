import { useQuery } from '@tanstack/react-query';
import { expenseAnalyticsApi } from '../../../services/api/expenseAnalyticsApi';
import { useExpenseAnalyticsFiltersStore } from '../store/expenseAnalyticsFiltersStore';

const STALE_MS = 60_000;

export const expenseAnalyticsQueryKeys = {
  root: ['expenseAnalytics'] as const,
  data: (filters: ReturnType<typeof useExpenseAnalyticsFiltersStore.getState>['filters']) =>
    [...expenseAnalyticsQueryKeys.root, filters] as const,
};

export function useExpenseAnalytics(enabled = true) {
  const filters = useExpenseAnalyticsFiltersStore((s) => s.filters);

  return useQuery({
    queryKey: expenseAnalyticsQueryKeys.data(filters),
    queryFn: () => expenseAnalyticsApi.getAnalytics(filters),
    enabled,
    staleTime: STALE_MS,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });
}
