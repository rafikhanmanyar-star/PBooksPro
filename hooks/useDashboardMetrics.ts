import { useQuery } from '@tanstack/react-query';
import { dashboardMetricsApi } from '../services/api/dashboardMetricsApi';
import { useDashboardFiltersStore } from '../stores/dashboardFiltersStore';
import type { DashboardFilters } from '../types/dashboardMetrics.types';

export const dashboardMetricsQueryKeys = {
  root: ['dashboardMetrics'] as const,
  metrics: (filters: DashboardFilters) => [...dashboardMetricsQueryKeys.root, 'metrics', filters] as const,
  charts: (filters: DashboardFilters, year: number) =>
    [...dashboardMetricsQueryKeys.root, 'charts', filters, year] as const,
  activity: (limit: number) => [...dashboardMetricsQueryKeys.root, 'activity', limit] as const,
};

const STALE_MS = 60_000;
const REFETCH_MS = 120_000;

export function useDashboardMetrics(enabled = true) {
  const filters = useDashboardFiltersStore((s) => s.filters);

  return useQuery({
    queryKey: dashboardMetricsQueryKeys.metrics(filters),
    queryFn: () => dashboardMetricsApi.getMetrics(filters),
    enabled,
    staleTime: STALE_MS,
    refetchInterval: REFETCH_MS,
    refetchIntervalInBackground: false,
  });
}

export function useDashboardCharts(year: number, enabled = true) {
  const filters = useDashboardFiltersStore((s) => s.filters);

  return useQuery({
    queryKey: dashboardMetricsQueryKeys.charts(filters, year),
    queryFn: () => dashboardMetricsApi.getCharts(filters, year),
    enabled,
    staleTime: STALE_MS,
    refetchInterval: REFETCH_MS,
    refetchIntervalInBackground: false,
  });
}

export function useDashboardMetricsWithFilters(filters: DashboardFilters, enabled = true) {
  return useQuery({
    queryKey: dashboardMetricsQueryKeys.metrics(filters),
    queryFn: () => dashboardMetricsApi.getMetrics(filters),
    enabled,
    staleTime: STALE_MS,
  });
}

export function useDashboardActivity(limit = 5, enabled = true) {
  return useQuery({
    queryKey: dashboardMetricsQueryKeys.activity(limit),
    queryFn: () => dashboardMetricsApi.getActivity(limit),
    enabled,
    staleTime: STALE_MS,
    refetchInterval: REFETCH_MS,
    refetchIntervalInBackground: false,
  });
}
