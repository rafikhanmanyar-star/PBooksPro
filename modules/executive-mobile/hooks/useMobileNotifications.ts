import { useQuery } from '@tanstack/react-query';
import { fetchMobileNotifications } from '../../../services/api/mobileNotificationsApi';

export function useMobileNotifications() {
  return useQuery({
    queryKey: ['mobile-notifications'],
    queryFn: fetchMobileNotifications,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
