import { apiClient } from './client';
import type {
  ConstructionReportTab,
  ConstructionReportingFilters,
  ConstructionReportingSummary,
  PaginatedReportRows,
  Vendor360Detail,
} from '../../types/constructionReporting.types';

function toQuery(filters: ConstructionReportingFilters, extra?: Record<string, string | number>) {
  const q = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.projectId) q.set('projectId', filters.projectId);
  if (filters.vendorId) q.set('vendorId', filters.vendorId);
  if (filters.contractId) q.set('contractId', filters.contractId);
  if (filters.status) q.set('status', filters.status);
  if (extra) for (const [k, v] of Object.entries(extra)) q.set(k, String(v));
  return q.toString();
}

export async function fetchConstructionReportingSummary(
  filters: ConstructionReportingFilters
): Promise<ConstructionReportingSummary> {
  return apiClient.get(`/reports/construction-reporting/summary?${toQuery(filters)}`);
}

export async function fetchConstructionReportTab<T>(
  tab: ConstructionReportTab,
  filters: ConstructionReportingFilters,
  page = 1,
  pageSize = 50
): Promise<PaginatedReportRows<T> | { rows: unknown[] }> {
  return apiClient.get(`/reports/construction-reporting/tab/${tab}?${toQuery(filters, { page, pageSize })}`);
}

export async function fetchVendor360(vendorId: string): Promise<Vendor360Detail> {
  return apiClient.get(`/reports/construction-reporting/vendor/${encodeURIComponent(vendorId)}`);
}
