import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { getRealtimeSocket } from '../../../core/socket';
import { fetchMobileNotifications } from '../../../services/api/mobileNotificationsApi';
import { isLocalOnlyMode } from '../../../config/apiUrl';

export function useMobileNotifications() {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const apiMode = !isLocalOnlyMode();

  const query = useQuery({
    queryKey: ['mobile-notifications'],
    queryFn: fetchMobileNotifications,
    enabled: apiMode && isAuthenticated,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!apiMode || !isAuthenticated || !user?.id) return;
    const socket = getRealtimeSocket();
    if (!socket) return;

    const onNotification = (payload: { userId?: string }) => {
      if (payload?.userId && payload.userId !== user.id) return;
      void queryClient.invalidateQueries({ queryKey: ['mobile-notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['user-notifications'] });
    };

    socket.on('notification_created', onNotification);
    return () => {
      socket.off('notification_created', onNotification);
    };
  }, [apiMode, isAuthenticated, user?.id, queryClient]);

  return query;
}
