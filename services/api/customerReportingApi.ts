import { apiClient } from './client';
import type {
  CollectionPerformanceRow,
  Customer360Detail,
  CustomerLedgerRow,
  CustomerReportTab,
  CustomerReportingFilters,
  CustomerReportingSummary,
  DefaulterReportRow,
  InstallmentScheduleRow,
  PaginatedReportRows,
  ReceivableReportRow,
} from '../../types/customerReporting.types';

function toQuery(filters: CustomerReportingFilters, extra?: Record<string, string | number>) {
  const q = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.projectId) q.set('projectId', filters.projectId);
  if (filters.customerId) q.set('customerId', filters.customerId);
  if (filters.unitId) q.set('unitId', filters.unitId);
  if (filters.status) q.set('status', filters.status);
  if (filters.salesAgentId) q.set('salesAgentId', filters.salesAgentId);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) q.set(k, String(v));
  }
  return q.toString();
}

export async function fetchCustomerReportingSummary(
  filters: CustomerReportingFilters
): Promise<CustomerReportingSummary> {
  return apiClient.get<CustomerReportingSummary>(
    `/reports/customer-reporting/summary?${toQuery(filters)}`
  );
}

export async function fetchCustomerReportTab<T>(
  tab: CustomerReportTab,
  filters: CustomerReportingFilters,
  page = 1,
  pageSize = 50
): Promise<PaginatedReportRows<T> | { rows: CollectionPerformanceRow[] }> {
  return apiClient.get(
    `/reports/customer-reporting/tab/${tab}?${toQuery(filters, { page, pageSize })}`
  );
}

export async function fetchCustomer360(contactId: string): Promise<Customer360Detail> {
  return apiClient.get<Customer360Detail>(
    `/reports/customer-reporting/customer/${encodeURIComponent(contactId)}`
  );
}

export type {
  CustomerLedgerRow,
  ReceivableReportRow,
  DefaulterReportRow,
  InstallmentScheduleRow,
  CollectionPerformanceRow,
};
