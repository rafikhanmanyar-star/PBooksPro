import type { VendorAnalyticsFilters, VendorAnalyticsResponse } from '../../types/vendorAnalytics.types';
import { apiClient } from './client';

function buildQuery(filters: VendorAnalyticsFilters): string {
  const q = new URLSearchParams();
  q.set('from', filters.from);
  q.set('to', filters.to);
  if (filters.vendorId) q.set('vendorId', filters.vendorId);
  return `?${q.toString()}`;
}

export const vendorAnalyticsApi = {
  getAnalytics(filters: VendorAnalyticsFilters): Promise<VendorAnalyticsResponse> {
    return apiClient.get<VendorAnalyticsResponse>(`/vendor/analytics${buildQuery(filters)}`);
  },
};
