import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dismissUserNotification, fetchUserNotifications } from '../services/api/notificationsApi';
import { useAuth } from '../context/AuthContext';

export const USER_NOTIFICATIONS_QUERY_KEY = ['user-notifications'] as const;

export function useUserNotifications(enabled = true) {
  const { isAuthenticated } = useAuth();
  const query = useQuery({
    queryKey: USER_NOTIFICATIONS_QUERY_KEY,
    queryFn: fetchUserNotifications,
    enabled: enabled && isAuthenticated,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });

  return query;
}

export function useDismissUserNotification() {
  const queryClient = useQueryClient();
  return useCallback(async (notificationId: string) => {
    if (!notificationId.startsWith('notif_')) return;
    await dismissUserNotification(notificationId);
    await queryClient.invalidateQueries({ queryKey: USER_NOTIFICATIONS_QUERY_KEY });
    await queryClient.invalidateQueries({ queryKey: ['mobile-notifications'] });
  }, [queryClient]);
}
