import type { SellingAnalyticsFilters, SellingAnalyticsResponse } from '../../types/sellingAnalytics.types';
import { apiClient } from './client';

function buildQuery(filters: SellingAnalyticsFilters): string {
  const q = new URLSearchParams();
  q.set('from', filters.from);
  q.set('to', filters.to);
  if (filters.projectId) q.set('projectId', filters.projectId);
  return `?${q.toString()}`;
}

export const sellingAnalyticsApi = {
  getAnalytics(filters: SellingAnalyticsFilters): Promise<SellingAnalyticsResponse> {
    return apiClient.get<SellingAnalyticsResponse>(`/selling/analytics${buildQuery(filters)}`);
  },
};
