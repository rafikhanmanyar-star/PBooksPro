import { apiClient } from './client';
import type {
  FinancialSummary,
  InventorySummary,
  ProcurementSummary,
  ProjectSummary,
  RentalSummary,
} from '../../types/dashboardSummaries.types';
import type { DashboardFilters } from '../../types/dashboardMetrics.types';

function appendDashboardFilters(q: URLSearchParams, filters: Partial<DashboardFilters>): void {
  if (filters.from) q.set('from', filters.from);
  if (filters.to) q.set('to', filters.to);
  if (filters.comparisonPeriod) q.set('comparisonPeriod', filters.comparisonPeriod);
  if (filters.projectId) q.set('projectId', filters.projectId);
  if (filters.buildingId) q.set('buildingId', filters.buildingId);
  if (filters.propertyId) q.set('propertyId', filters.propertyId);
  if (filters.vendorId) q.set('vendorId', filters.vendorId);
  if (filters.customerId) q.set('customerId', filters.customerId);
}

export const dashboardSummariesApi = {
  getFinancialSummary(filters: DashboardFilters): Promise<FinancialSummary> {
    const q = new URLSearchParams();
    appendDashboardFilters(q, filters);
    return apiClient.get<FinancialSummary>(`/dashboard/summaries/financial?${q.toString()}`);
  },

  getRentalSummary(params?: {
    buildingId?: string;
    propertyId?: string;
    status?: string;
    search?: string;
    includeArBreakdown?: boolean;
  }): Promise<RentalSummary> {
    const q = new URLSearchParams();
    if (params?.buildingId) q.set('buildingId', params.buildingId);
    if (params?.propertyId) q.set('propertyId', params.propertyId);
    if (params?.status) q.set('status', params.status);
    if (params?.search?.trim()) q.set('search', params.search.trim());
    if (params?.includeArBreakdown) q.set('includeArBreakdown', 'true');
    const qs = q.toString();
    return apiClient.get<RentalSummary>(`/dashboard/summaries/rental${qs ? `?${qs}` : ''}`);
  },

  getInventorySummary(): Promise<InventorySummary> {
    return apiClient.get<InventorySummary>('/dashboard/summaries/inventory');
  },

  getProjectSummary(params?: {
    from?: string;
    to?: string;
    projectId?: string;
    clientId?: string;
    unitId?: string;
    search?: string;
  }): Promise<ProjectSummary> {
    const q = new URLSearchParams();
    if (params?.from) q.set('from', params.from);
    if (params?.to) q.set('to', params.to);
    if (params?.projectId) q.set('projectId', params.projectId);
    if (params?.clientId) q.set('clientId', params.clientId);
    if (params?.unitId) q.set('unitId', params.unitId);
    if (params?.search?.trim()) q.set('search', params.search.trim());
    const qs = q.toString();
    return apiClient.get<ProjectSummary>(`/dashboard/summaries/project${qs ? `?${qs}` : ''}`);
  },

  getProcurementSummary(): Promise<ProcurementSummary> {
    return apiClient.get<ProcurementSummary>('/dashboard/summaries/procurement');
  },
};
