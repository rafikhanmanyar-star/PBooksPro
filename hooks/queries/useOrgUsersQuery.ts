import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../services/api/client';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { queryKeys } from './queryKeys';

/**
 * Organization users for reports (e.g. marketing activity); cached via React Query defaults.
 */
export function useOrgUsersQuery() {
  return useQuery({
    queryKey: queryKeys.reports.orgUsers(),
    queryFn: () => apiClient.get<{ id: string; name: string; username: string }[]>('/users'),
    enabled: !isLocalOnlyMode(),
  });
}
