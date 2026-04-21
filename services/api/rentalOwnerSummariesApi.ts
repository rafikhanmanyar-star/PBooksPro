import { apiClient } from './client';

export type OwnerBalanceApiRow = {
  ownerId: string;
  propertyId: string;
  balance: number;
  lastUpdated: string;
};

export type MonthlyOwnerSummaryApiRow = {
  ownerId: string;
  propertyId: string;
  month: string;
  totalRent: number;
  totalExpense: number;
  netAmount: number;
};

function buildQuery(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '') continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const rentalOwnerSummariesApi = {
  getOwnerBalances(filters?: { ownerId?: string; propertyId?: string; limit?: number }) {
    const qs = buildQuery({
      ownerId: filters?.ownerId,
      propertyId: filters?.propertyId,
      limit: filters?.limit,
    });
    return apiClient.get<OwnerBalanceApiRow[]>(`/rental/owner-balances${qs}`);
  },

  getMonthlySummary(filters?: {
    ownerId?: string;
    propertyId?: string;
    startMonth?: string;
    endMonth?: string;
    limit?: number;
  }) {
    const qs = buildQuery({
      ownerId: filters?.ownerId,
      propertyId: filters?.propertyId,
      startMonth: filters?.startMonth,
      endMonth: filters?.endMonth,
      limit: filters?.limit,
    });
    return apiClient.get<MonthlyOwnerSummaryApiRow[]>(`/rental/monthly-owner-summary${qs}`);
  },
};
