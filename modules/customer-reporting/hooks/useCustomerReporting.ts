import { useQuery } from '@tanstack/react-query';
import {
  fetchCustomer360,
  fetchCustomerReportTab,
  fetchCustomerReportingSummary,
} from '../../../services/api/customerReportingApi';
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
} from '../../../types/customerReporting.types';

const STALE_MS = 60_000;

export const customerReportingQueryKeys = {
  root: ['customerReporting'] as const,
  summary: (filters: CustomerReportingFilters) =>
    [...customerReportingQueryKeys.root, 'summary', filters] as const,
  tab: (tab: CustomerReportTab, filters: CustomerReportingFilters, page: number, pageSize: number) =>
    [...customerReportingQueryKeys.root, 'tab', tab, filters, page, pageSize] as const,
  customer360: (contactId: string) =>
    [...customerReportingQueryKeys.root, 'customer360', contactId] as const,
};

export function useCustomerReportingSummary(filters: CustomerReportingFilters, enabled: boolean) {
  return useQuery({
    queryKey: customerReportingQueryKeys.summary(filters),
    queryFn: () => fetchCustomerReportingSummary(filters),
    enabled,
    staleTime: STALE_MS,
  });
}

export function useCustomerReportTab<T>(
  tab: CustomerReportTab,
  filters: CustomerReportingFilters,
  page: number,
  pageSize: number,
  enabled: boolean
) {
  return useQuery({
    queryKey: customerReportingQueryKeys.tab(tab, filters, page, pageSize),
    queryFn: () => fetchCustomerReportTab<T>(tab, filters, page, pageSize),
    enabled,
    staleTime: STALE_MS,
    placeholderData: (prev) => prev,
  });
}

export function useCustomer360(contactId: string | null) {
  return useQuery({
    queryKey: customerReportingQueryKeys.customer360(contactId ?? ''),
    queryFn: () => fetchCustomer360(contactId!),
    enabled: !!contactId,
    staleTime: STALE_MS,
  });
}

export type TabRowMap = {
  ledger: CustomerLedgerRow;
  receivable: ReceivableReportRow;
  defaulters: DefaulterReportRow;
  installments: InstallmentScheduleRow;
  'collection-performance': CollectionPerformanceRow;
};

export type { CustomerReportingSummary, Customer360Detail, PaginatedReportRows };
