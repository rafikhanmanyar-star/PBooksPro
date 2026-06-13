import type {
  DashboardActivityResponse,
  DashboardChartsResponse,
  DashboardFilters,
  DashboardMetricsResponse,
} from '../../types/dashboardMetrics.types';
import { apiClient } from './client';

function buildQuery(filters: Partial<DashboardFilters>, extra?: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  const entries: [string, string | undefined][] = [
    ['from', filters.from],
    ['to', filters.to],
    ['comparisonPeriod', filters.comparisonPeriod],
    ['projectId', filters.projectId],
    ['buildingId', filters.buildingId],
    ['propertyId', filters.propertyId],
    ['vendorId', filters.vendorId],
    ['customerId', filters.customerId],
    ['branchId', filters.branchId],
    ['companyId', filters.companyId],
    ['salesAgentId', filters.salesAgentId],
  ];
  for (const [k, v] of entries) {
    if (v !== undefined && v !== '' && v !== 'all') q.set(k, v);
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined && v !== '') q.set(k, String(v));
    }
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const dashboardMetricsApi = {
  getMetrics(filters: DashboardFilters): Promise<DashboardMetricsResponse> {
    return apiClient.get<DashboardMetricsResponse>(`/dashboard/metrics${buildQuery(filters)}`);
  },

  getCharts(filters: DashboardFilters, year?: number): Promise<DashboardChartsResponse> {
    return apiClient.get<DashboardChartsResponse>(
      `/dashboard/charts${buildQuery(filters, year != null ? { year } : undefined)}`
    );
  },

  getActivity(limit = 5): Promise<DashboardActivityResponse> {
    const q = limit !== 5 ? `?limit=${limit}` : '';
    return apiClient.get<DashboardActivityResponse>(`/dashboard/activity${q}`);
  },
};
