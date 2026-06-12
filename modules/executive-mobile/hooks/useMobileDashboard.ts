import { useQuery } from '@tanstack/react-query';
import { fetchMobileModuleSummary } from '../../../services/api/mobileDashboardApi';
import type { ExecutiveModuleId } from '../../../types/executiveMobile.types';

export function useMobileDashboard(moduleId: ExecutiveModuleId | 'dashboard' = 'dashboard') {
  return useQuery({
    queryKey: ['mobile-dashboard', moduleId],
    queryFn: () => fetchMobileModuleSummary(moduleId),
    staleTime: 60_000,
  });
}
