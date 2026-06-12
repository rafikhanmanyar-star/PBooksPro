import { apiClient } from './client';
import type {
  PaginatedReportRows,
  RentalReportTab,
  RentalReportingFilters,
  RentalReportingSummary,
  Tenant360Detail,
} from '../../types/rentalReporting.types';

function toQuery(filters: RentalReportingFilters, extra?: Record<string, string | number>) {
  const q = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.buildingId) q.set('buildingId', filters.buildingId);
  if (filters.propertyId) q.set('propertyId', filters.propertyId);
  if (filters.tenantId) q.set('tenantId', filters.tenantId);
  if (filters.status) q.set('status', filters.status);
  if (filters.ownerId) q.set('ownerId', filters.ownerId);
  if (filters.brokerId) q.set('brokerId', filters.brokerId);
  if (extra) for (const [k, v] of Object.entries(extra)) q.set(k, String(v));
  return q.toString();
}

export async function fetchRentalReportingSummary(filters: RentalReportingFilters): Promise<RentalReportingSummary> {
  return apiClient.get(`/reports/rental-reporting/summary?${toQuery(filters)}`);
}

export async function fetchRentalReportTab<T>(
  tab: RentalReportTab,
  filters: RentalReportingFilters,
  page = 1,
  pageSize = 50
): Promise<PaginatedReportRows<T> | { rows: unknown[] }> {
  return apiClient.get(`/reports/rental-reporting/tab/${tab}?${toQuery(filters, { page, pageSize })}`);
}

export async function fetchTenant360(contactId: string): Promise<Tenant360Detail> {
  return apiClient.get(`/reports/rental-reporting/tenant/${encodeURIComponent(contactId)}`);
}
