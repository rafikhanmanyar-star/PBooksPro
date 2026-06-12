import { apiClient } from './client';
import type { MobileDashboardResponse } from '../../types/executiveMobile.types';

export async function fetchMobileDashboard(): Promise<MobileDashboardResponse> {
  return apiClient.get<MobileDashboardResponse>('/mobile/dashboard');
}

export async function fetchMobileModuleSummary(
  module: string
): Promise<MobileDashboardResponse> {
  const pathMap: Record<string, string> = {
    finance: '/mobile/finance-summary',
    sales: '/mobile/sales-summary',
    crm: '/mobile/crm-summary',
    projects: '/mobile/project-summary',
    construction: '/mobile/construction-summary',
    propertySelling: '/mobile/sales-summary',
    rentals: '/mobile/rental-summary',
    hr: '/mobile/hr-summary',
    dashboard: '/mobile/dashboard',
  };
  const path = pathMap[module] ?? '/mobile/dashboard';
  return apiClient.get<MobileDashboardResponse>(path);
}
