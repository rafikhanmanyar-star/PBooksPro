import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { fetchMobileNotifications } from '../../../services/api/mobileNotificationsApi';

export function useMobileNotifications() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ['mobile-notifications'],
    queryFn: fetchMobileNotifications,
    enabled: isAuthenticated,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
