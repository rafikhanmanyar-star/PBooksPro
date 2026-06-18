import { useEffect, useRef } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { dashboardMetricsApi } from '../services/api/dashboardMetricsApi';
import { dashboardSnapshotsApi } from '../services/api/dashboardSnapshotsApi';
import { useDashboardFiltersStore } from '../stores/dashboardFiltersStore';
import { clearDashboardRefreshPending } from '../stores/dashboardRefreshIndicatorStore';
import { rtTraceDuration } from '../services/realtime/realtimeTrace';
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
  const hasHydrated = useDashboardFiltersStore((s) => s.hasHydrated);

  return useQuery({
    queryKey: dashboardMetricsQueryKeys.metrics(filters),
    queryFn: () => dashboardMetricsApi.getMetrics(filters),
    enabled: enabled && hasHydrated,
    staleTime: STALE_MS,
    refetchInterval: REFETCH_MS,
    refetchIntervalInBackground: false,
  });
}

export function useDashboardCharts(year: number, enabled = true) {
  const filters = useDashboardFiltersStore((s) => s.filters);
  const hasHydrated = useDashboardFiltersStore((s) => s.hasHydrated);

  return useQuery({
    queryKey: dashboardMetricsQueryKeys.charts(filters, year),
    queryFn: () => dashboardMetricsApi.getCharts(filters, year),
    enabled: enabled && hasHydrated,
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

export function useDashboardSnapshots(date?: string, enabled = true) {
  return useQuery({
    queryKey: [...dashboardMetricsQueryKeys.root, 'snapshots', date ?? 'today'] as const,
    queryFn: () => dashboardSnapshotsApi.getSnapshots(date),
    enabled: enabled,
    staleTime: STALE_MS,
    refetchInterval: REFETCH_MS,
    refetchIntervalInBackground: false,
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

type DashboardQueryBundle = {
  metrics?: UseQueryResult<unknown, Error>;
  snapshots?: UseQueryResult<unknown, Error>;
  charts?: UseQueryResult<unknown, Error>;
  activity?: UseQueryResult<unknown, Error>;
};

/** Refetch executive dashboard queries (metrics, charts, activity, snapshots). */
export async function refetchDashboardQueries(queries: DashboardQueryBundle): Promise<void> {
  const start = Date.now();
  const tasks: Promise<unknown>[] = [];
  const targets: string[] = [];
  if (queries.activity) {
    tasks.push(queries.activity.refetch());
    targets.push('activity');
  }
  if (queries.metrics) {
    tasks.push(queries.metrics.refetch());
    targets.push('metrics');
  }
  if (queries.snapshots) {
    tasks.push(queries.snapshots.refetch());
    targets.push('snapshots');
  }
  if (queries.charts) {
    tasks.push(queries.charts.refetch());
    targets.push('charts');
  }
  await Promise.all(tasks);
  clearDashboardRefreshPending();
  rtTraceDuration('ui.refetched', start, { targets });
}

/**
 * Load dashboard data once per auth session when the dashboard page is active.
 * Covers the post-login gap where queries were disabled before auth/user/filters were ready.
 */
export function useDashboardSessionLoad(options: {
  isAuthenticated: boolean;
  isDashboardActive: boolean;
  isAdmin: boolean;
  userId?: string;
  queries: DashboardQueryBundle;
}): void {
  const { isAuthenticated, isDashboardActive, isAdmin, userId, queries } = options;
  const hasHydrated = useDashboardFiltersStore((s) => s.hasHydrated);
  const sessionLoadKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const onLogin = () => {
      sessionLoadKeyRef.current = null;
    };
    window.addEventListener('auth:login-success', onLogin);
    return () => window.removeEventListener('auth:login-success', onLogin);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      sessionLoadKeyRef.current = null;
      return;
    }
    if (!isDashboardActive || !hasHydrated) return;

    const sessionKey = `${userId ?? 'unknown'}:${isAdmin ? 'admin' : 'user'}`;
    if (sessionLoadKeyRef.current === sessionKey) return;
    sessionLoadKeyRef.current = sessionKey;

    void refetchDashboardQueries({
      activity: queries.activity,
      ...(isAdmin
        ? {
            metrics: queries.metrics,
            snapshots: queries.snapshots,
            charts: queries.charts,
          }
        : {}),
    });
  }, [
    isAuthenticated,
    isDashboardActive,
    isAdmin,
    hasHydrated,
    userId,
    queries.activity,
    queries.metrics,
    queries.snapshots,
    queries.charts,
  ]);
}
