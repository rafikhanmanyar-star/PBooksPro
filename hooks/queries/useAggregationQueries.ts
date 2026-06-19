import { useQuery } from '@tanstack/react-query';
import { aggregationsApi } from '../../services/api/aggregationsApi';
import type { DashboardFilters } from '../../types/dashboardMetrics.types';

const AGG_STALE_MS = 120_000;

export const aggregationQueryKeys = {
  root: ['aggregations'] as const,
  ownerBalances: (filters: Record<string, string | undefined>) =>
    [...aggregationQueryKeys.root, 'ownerBalances', filters] as const,
  vendorBalances: (filters: Record<string, string | undefined>) =>
    [...aggregationQueryKeys.root, 'vendorBalances', filters] as const,
  brokerBalances: (context: string) =>
    [...aggregationQueryKeys.root, 'brokerBalances', context] as const,
  dashboardKpis: (filters: DashboardFilters) =>
    [...aggregationQueryKeys.root, 'dashboardKpis', filters] as const,
};

export function useOwnerBalancesAggregation(
  enabled: boolean,
  filters?: { ownerId?: string; buildingId?: string; propertyId?: string }
) {
  const filterKey = {
    ownerId: filters?.ownerId,
    buildingId: filters?.buildingId,
    propertyId: filters?.propertyId,
  };
  return useQuery({
    queryKey: aggregationQueryKeys.ownerBalances(filterKey),
    queryFn: () => aggregationsApi.getOwnerBalances(filters),
    enabled,
    staleTime: AGG_STALE_MS,
  });
}

export function useVendorBalancesAggregation(
  enabled: boolean,
  filters?: { vendorId?: string; projectId?: string; buildingId?: string; propertyId?: string }
) {
  const filterKey = {
    vendorId: filters?.vendorId,
    projectId: filters?.projectId,
    buildingId: filters?.buildingId,
    propertyId: filters?.propertyId,
  };
  return useQuery({
    queryKey: aggregationQueryKeys.vendorBalances(filterKey),
    queryFn: () => aggregationsApi.getVendorBalances(filters),
    enabled,
    staleTime: AGG_STALE_MS,
  });
}

export function useBrokerBalancesAggregation(
  enabled: boolean,
  context: 'all' | 'Rental' | 'Project' = 'all'
) {
  return useQuery({
    queryKey: aggregationQueryKeys.brokerBalances(context),
    queryFn: () => aggregationsApi.getBrokerBalances(context),
    enabled,
    staleTime: AGG_STALE_MS,
  });
}

export function useDashboardKpiAggregation(enabled: boolean, filters: DashboardFilters) {
  return useQuery({
    queryKey: aggregationQueryKeys.dashboardKpis(filters),
    queryFn: () => aggregationsApi.getDashboardKpis(filters),
    enabled: enabled && Boolean(filters.from && filters.to),
    staleTime: 60_000,
  });
}
