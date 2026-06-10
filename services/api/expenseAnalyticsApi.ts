import type { ExpenseAnalyticsFilters, ExpenseAnalyticsResponse } from '../../types/expenseAnalytics.types';
import { apiClient } from './client';

function buildQuery(filters: ExpenseAnalyticsFilters): string {
  const q = new URLSearchParams();
  q.set('from', filters.from);
  q.set('to', filters.to);
  if (filters.scope && filters.scope !== 'all') q.set('scope', filters.scope);
  if (filters.projectId) q.set('projectId', filters.projectId);
  if (filters.propertyId) q.set('propertyId', filters.propertyId);
  return `?${q.toString()}`;
}

export const expenseAnalyticsApi = {
  getAnalytics(filters: ExpenseAnalyticsFilters): Promise<ExpenseAnalyticsResponse> {
    return apiClient.get<ExpenseAnalyticsResponse>(`/expense/analytics${buildQuery(filters)}`);
  },
};
