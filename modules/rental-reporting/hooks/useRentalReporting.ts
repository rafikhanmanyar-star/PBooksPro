import { useQuery } from '@tanstack/react-query';
import {
  fetchRentalReportTab,
  fetchRentalReportingSummary,
  fetchTenant360,
} from '../../../services/api/rentalReportingApi';
import type { RentalReportTab, RentalReportingFilters } from '../../../types/rentalReporting.types';

const STALE_MS = 60_000;

export const rentalReportingQueryKeys = {
  root: ['rentalReporting'] as const,
  summary: (f: RentalReportingFilters) => [...rentalReportingQueryKeys.root, 'summary', f] as const,
  tab: (tab: RentalReportTab, f: RentalReportingFilters, page: number, pageSize: number) =>
    [...rentalReportingQueryKeys.root, 'tab', tab, f, page, pageSize] as const,
  tenant360: (id: string) => [...rentalReportingQueryKeys.root, 'tenant360', id] as const,
};

export function useRentalReportingSummary(filters: RentalReportingFilters, enabled: boolean) {
  return useQuery({
    queryKey: rentalReportingQueryKeys.summary(filters),
    queryFn: () => fetchRentalReportingSummary(filters),
    enabled,
    staleTime: STALE_MS,
  });
}

export function useRentalReportTab(
  tab: RentalReportTab,
  filters: RentalReportingFilters,
  page: number,
  pageSize: number,
  enabled: boolean
) {
  return useQuery({
    queryKey: rentalReportingQueryKeys.tab(tab, filters, page, pageSize),
    queryFn: () => fetchRentalReportTab(tab, filters, page, pageSize),
    enabled,
    staleTime: STALE_MS,
    placeholderData: (prev) => prev,
  });
}

export function useTenant360(contactId: string | null) {
  return useQuery({
    queryKey: rentalReportingQueryKeys.tenant360(contactId ?? ''),
    queryFn: () => fetchTenant360(contactId!),
    enabled: !!contactId,
    staleTime: STALE_MS,
  });
}
