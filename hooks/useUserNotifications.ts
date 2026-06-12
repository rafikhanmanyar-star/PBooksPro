import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dismissUserNotification, fetchUserNotifications } from '../services/api/notificationsApi';
import { getRealtimeSocket } from '../core/socket';
import { useAuth } from '../context/AuthContext';
import { isLocalOnlyMode } from '../config/apiUrl';

export const USER_NOTIFICATIONS_QUERY_KEY = ['user-notifications'] as const;

export function useUserNotifications(enabled = true) {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const apiMode = !isLocalOnlyMode();

  const query = useQuery({
    queryKey: USER_NOTIFICATIONS_QUERY_KEY,
    queryFn: fetchUserNotifications,
    enabled: enabled && apiMode && isAuthenticated,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!apiMode || !isAuthenticated || !user?.id) return;

    const socket = getRealtimeSocket();
    if (!socket) return;

    const onNotification = (payload: { userId?: string }) => {
      if (payload?.userId && payload.userId !== user.id) return;
      void queryClient.invalidateQueries({ queryKey: USER_NOTIFICATIONS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['mobile-notifications'] });
    };

    socket.on('notification_created', onNotification);
    return () => {
      socket.off('notification_created', onNotification);
    };
  }, [apiMode, isAuthenticated, user?.id, queryClient]);

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
