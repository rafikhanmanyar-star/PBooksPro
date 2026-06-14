import { apiClient } from './api/client';
import type {
  QuotationItemRateLookup,
  VendorPriceHistoryEntry,
  VendorQuotationComparisonRow,
} from '../types';

export async function fetchQuotationItemRates(params: {
  vendorId: string;
  categoryId: string;
  itemName?: string;
}): Promise<QuotationItemRateLookup> {
  const qs = new URLSearchParams({
    vendorId: params.vendorId,
    categoryId: params.categoryId,
    ...(params.itemName ? { itemName: params.itemName } : {}),
  });
  return apiClient.get<QuotationItemRateLookup>(`/quotations/item-rates?${qs}`);
}

export async function fetchQuotationComparison(params: {
  projectId?: string;
  buildingId?: string;
  packageName?: string;
  categoryId?: string;
  itemName?: string;
}): Promise<VendorQuotationComparisonRow[]> {
  const qs = new URLSearchParams();
  if (params.projectId) qs.set('projectId', params.projectId);
  if (params.buildingId) qs.set('buildingId', params.buildingId);
  if (params.packageName) qs.set('packageName', params.packageName);
  if (params.categoryId) qs.set('categoryId', params.categoryId);
  if (params.itemName) qs.set('itemName', params.itemName);
  const suffix = qs.toString() ? `?${qs}` : '';
  return apiClient.get<VendorQuotationComparisonRow[]>(`/quotations/comparison${suffix}`);
}

export async function fetchVendorPriceHistory(params: {
  vendorId?: string;
  categoryId?: string;
  itemName?: string;
  projectId?: string;
  limit?: number;
}): Promise<VendorPriceHistoryEntry[]> {
  const qs = new URLSearchParams();
  if (params.vendorId) qs.set('vendorId', params.vendorId);
  if (params.categoryId) qs.set('categoryId', params.categoryId);
  if (params.itemName) qs.set('itemName', params.itemName);
  if (params.projectId) qs.set('projectId', params.projectId);
  if (params.limit) qs.set('limit', String(params.limit));
  const suffix = qs.toString() ? `?${qs}` : '';
  return apiClient.get<VendorPriceHistoryEntry[]>(`/quotations/price-history${suffix}`);
}

export async function fetchProcurementDashboardMetrics(): Promise<{
  activeQuotations: number;
  expiringQuotations: number;
  lowestVendorRates: Array<{ vendorId: string; vendorName: string; rate: number }>;
  priceIncreaseAlerts: number;
}> {
  return apiClient.get('/procurement/dashboard-metrics');
}
