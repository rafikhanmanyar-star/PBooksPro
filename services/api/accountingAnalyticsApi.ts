import type { AccountingAnalyticsFilters, AccountingAnalyticsResponse } from '../../types/accountingAnalytics.types';
import { apiClient } from './client';

function buildQuery(filters: AccountingAnalyticsFilters): string {
  const q = new URLSearchParams();
  q.set('from', filters.from);
  q.set('to', filters.to);
  if (filters.projectId) q.set('projectId', filters.projectId);
  return `?${q.toString()}`;
}

export const accountingAnalyticsApi = {
  getAnalytics(filters: AccountingAnalyticsFilters): Promise<AccountingAnalyticsResponse> {
    return apiClient.get<AccountingAnalyticsResponse>(`/accounting/analytics${buildQuery(filters)}`);
  },
};
