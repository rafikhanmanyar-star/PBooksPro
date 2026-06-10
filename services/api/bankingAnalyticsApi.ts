import type { BankingAnalyticsFilters, BankingAnalyticsResponse } from '../../types/bankingAnalytics.types';
import { apiClient } from './client';

function buildQuery(filters: BankingAnalyticsFilters): string {
  const q = new URLSearchParams();
  q.set('from', filters.from);
  q.set('to', filters.to);
  if (filters.accountId) q.set('accountId', filters.accountId);
  return `?${q.toString()}`;
}

export const bankingAnalyticsApi = {
  getAnalytics(filters: BankingAnalyticsFilters): Promise<BankingAnalyticsResponse> {
    return apiClient.get<BankingAnalyticsResponse>(`/banking/analytics${buildQuery(filters)}`);
  },
};
