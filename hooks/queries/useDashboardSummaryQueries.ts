import { useQuery } from '@tanstack/react-query';
import { dashboardSummariesApi } from '../../services/api/dashboardSummariesApi';
import type { DashboardFilters } from '../../types/dashboardMetrics.types';

const STALE_MS = 60_000;

export function useFinancialSummary(enabled: boolean, filters: DashboardFilters) {
  return useQuery({
    queryKey: ['dashboard-summary', 'financial', filters],
    queryFn: () => dashboardSummariesApi.getFinancialSummary(filters),
    enabled,
    staleTime: STALE_MS,
  });
}

export function useRentalSummary(
  enabled: boolean,
  params?: {
    buildingId?: string;
    propertyId?: string;
    status?: string;
    search?: string;
    includeArBreakdown?: boolean;
  }
) {
  return useQuery({
    queryKey: ['dashboard-summary', 'rental', params],
    queryFn: () => dashboardSummariesApi.getRentalSummary(params),
    enabled,
    staleTime: STALE_MS,
  });
}

export function useInventorySummary(enabled: boolean) {
  return useQuery({
    queryKey: ['dashboard-summary', 'inventory'],
    queryFn: () => dashboardSummariesApi.getInventorySummary(),
    enabled,
    staleTime: STALE_MS,
  });
}

export function useProjectSummary(
  enabled: boolean,
  params?: {
    from?: string;
    to?: string;
    projectId?: string;
    clientId?: string;
    unitId?: string;
    search?: string;
  }
) {
  return useQuery({
    queryKey: ['dashboard-summary', 'project', params],
    queryFn: () => dashboardSummariesApi.getProjectSummary(params),
    enabled,
    staleTime: STALE_MS,
  });
}

export function useProcurementSummary(enabled: boolean) {
  return useQuery({
    queryKey: ['dashboard-summary', 'procurement'],
    queryFn: () => dashboardSummariesApi.getProcurementSummary(),
    enabled,
    staleTime: STALE_MS,
  });
}
