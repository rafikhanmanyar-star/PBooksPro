import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../services/api/client';
import { queryKeys } from './queryKeys';

/**
 * Organization users for reports (e.g. marketing activity); cached via React Query defaults.
 */
export function useOrgUsersQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.orgUsers(),
    queryFn: () => apiClient.get<{ id: string; name: string; username: string; role?: string }[]>('/users'),
    enabled: options?.enabled ?? true,
  });
}
