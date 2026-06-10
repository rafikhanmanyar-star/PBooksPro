import type { RentalAnalyticsFilters, RentalAnalyticsResponse } from '../../types/rentalAnalytics.types';
import { apiClient } from './client';

function buildQuery(filters: RentalAnalyticsFilters): string {
  const q = new URLSearchParams();
  q.set('from', filters.from);
  q.set('to', filters.to);
  if (filters.propertyId) q.set('propertyId', filters.propertyId);
  if (filters.buildingId) q.set('buildingId', filters.buildingId);
  return `?${q.toString()}`;
}

export const rentalAnalyticsApi = {
  getAnalytics(filters: RentalAnalyticsFilters): Promise<RentalAnalyticsResponse> {
    return apiClient.get<RentalAnalyticsResponse>(`/rental/analytics${buildQuery(filters)}`);
  },
};
