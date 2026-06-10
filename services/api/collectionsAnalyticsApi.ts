import type { CollectionsAnalyticsFilters, CollectionsAnalyticsResponse } from '../../types/collectionsAnalytics.types';
import { apiClient } from './client';

function buildQuery(filters: CollectionsAnalyticsFilters): string {
  const q = new URLSearchParams();
  q.set('from', filters.from);
  q.set('to', filters.to);
  if (filters.projectId) q.set('projectId', filters.projectId);
  if (filters.propertyId) q.set('propertyId', filters.propertyId);
  return `?${q.toString()}`;
}

export const collectionsAnalyticsApi = {
  getAnalytics(filters: CollectionsAnalyticsFilters): Promise<CollectionsAnalyticsResponse> {
    return apiClient.get<CollectionsAnalyticsResponse>(`/collections/analytics${buildQuery(filters)}`);
  },
};
