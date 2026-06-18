import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { getRealtimeSocket } from '../../../core/socket';
import { fetchMobileNotifications } from '../../../services/api/mobileNotificationsApi';

export function useMobileNotifications() {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['mobile-notifications'],
    queryFn: fetchMobileNotifications,
    enabled: isAuthenticated,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    const socket = getRealtimeSocket();
    if (!socket) return;

    const onApprovalEvent = (payload: { userId?: string; tenantId?: string }) => {
      if (payload?.userId && payload.userId !== user.id) return;
      void queryClient.invalidateQueries({ queryKey: ['mobile-notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['workflow'] });
      void queryClient.invalidateQueries({ queryKey: ['user-notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['mobile-approvals'] });
    };

    const approvalEvents = [
      'approval_requested',
      'approval_approved',
      'approval_rejected',
      'approval_returned',
      'approval_escalated',
      'approval_delegated',
    ] as const;

    for (const ev of approvalEvents) socket.on(ev, onApprovalEvent);
    return () => {
      for (const ev of approvalEvents) socket.off(ev, onApprovalEvent);
    };
  }, [isAuthenticated, user?.id, queryClient]);

  return query;
}
