import { useQuery } from '@tanstack/react-query';
import {
  fetchConstructionReportTab,
  fetchConstructionReportingSummary,
  fetchVendor360,
} from '../../../services/api/constructionReportingApi';
import type { ConstructionReportTab, ConstructionReportingFilters } from '../../../types/constructionReporting.types';

const STALE_MS = 60_000;

export const constructionReportingQueryKeys = {
  root: ['constructionReporting'] as const,
  summary: (f: ConstructionReportingFilters) => [...constructionReportingQueryKeys.root, 'summary', f] as const,
  tab: (tab: ConstructionReportTab, f: ConstructionReportingFilters, page: number, pageSize: number) =>
    [...constructionReportingQueryKeys.root, 'tab', tab, f, page, pageSize] as const,
  vendor360: (id: string) => [...constructionReportingQueryKeys.root, 'vendor360', id] as const,
};

export function useConstructionReportingSummary(filters: ConstructionReportingFilters, enabled: boolean) {
  return useQuery({
    queryKey: constructionReportingQueryKeys.summary(filters),
    queryFn: () => fetchConstructionReportingSummary(filters),
    enabled,
    staleTime: STALE_MS,
  });
}

export function useConstructionReportTab(
  tab: ConstructionReportTab,
  filters: ConstructionReportingFilters,
  page: number,
  pageSize: number,
  enabled: boolean
) {
  return useQuery({
    queryKey: constructionReportingQueryKeys.tab(tab, filters, page, pageSize),
    queryFn: () => fetchConstructionReportTab(tab, filters, page, pageSize),
    enabled,
    staleTime: STALE_MS,
    placeholderData: (prev) => prev,
  });
}

export function useVendor360(vendorId: string | null) {
  return useQuery({
    queryKey: constructionReportingQueryKeys.vendor360(vendorId ?? ''),
    queryFn: () => fetchVendor360(vendorId!),
    enabled: !!vendorId,
    staleTime: STALE_MS,
  });
}
