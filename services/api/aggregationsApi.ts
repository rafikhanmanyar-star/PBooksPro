import { apiClient } from './client';
import type { DashboardFilters } from '../../types/dashboardMetrics.types';
import type {
  BrokerBalancesAggregationResponse,
  DashboardKpiAggregationResponse,
  OwnerBalancesAggregationResponse,
  VendorBalancesAggregationResponse,
} from '../../types/aggregations.types';

function buildQuery(entries: [string, string | undefined][]): string {
  const q = new URLSearchParams();
  for (const [k, v] of entries) {
    if (v !== undefined && v !== '' && v !== 'all') q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const aggregationsApi = {
  getOwnerBalances(params?: {
    ownerId?: string;
    buildingId?: string;
    propertyId?: string;
  }): Promise<OwnerBalancesAggregationResponse> {
    return apiClient.get(
      `/aggregations/owner-balances${buildQuery([
        ['ownerId', params?.ownerId],
        ['buildingId', params?.buildingId],
        ['propertyId', params?.propertyId],
      ])}`
    );
  },

  getVendorBalances(params?: {
    vendorId?: string;
    projectId?: string;
    buildingId?: string;
    propertyId?: string;
  }): Promise<VendorBalancesAggregationResponse> {
    return apiClient.get(
      `/aggregations/vendor-balances${buildQuery([
        ['vendorId', params?.vendorId],
        ['projectId', params?.projectId],
        ['buildingId', params?.buildingId],
        ['propertyId', params?.propertyId],
      ])}`
    );
  },

  getBrokerBalances(context?: 'all' | 'Rental' | 'Project'): Promise<BrokerBalancesAggregationResponse> {
    const q = context && context !== 'all' ? `?context=${encodeURIComponent(context)}` : '';
    return apiClient.get(`/aggregations/broker-balances${q}`);
  },

  getDashboardKpis(filters: DashboardFilters): Promise<DashboardKpiAggregationResponse> {
    return apiClient.get(
      `/aggregations/dashboard-kpis${buildQuery([
        ['from', filters.from],
        ['to', filters.to],
        ['projectId', filters.projectId],
        ['buildingId', filters.buildingId],
        ['propertyId', filters.propertyId],
        ['vendorId', filters.vendorId],
        ['customerId', filters.customerId],
      ])}`
    );
  },
};
