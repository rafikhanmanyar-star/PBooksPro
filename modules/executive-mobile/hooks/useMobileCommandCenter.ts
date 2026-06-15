import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMobileCommandCenter } from '../../../services/api/mobileCommandCenterApi';
import { getRealtimeSocket } from '../../../core/socket';
import { useAuth } from '../../../context/AuthContext';

export const MOBILE_COMMAND_CENTER_KEY = ['mobile-command-center'] as const;

export function useMobileCommandCenter() {
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: MOBILE_COMMAND_CENTER_KEY,
    queryFn: fetchMobileCommandCenter,
    staleTime: 45_000,
    refetchInterval: 90_000,
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!isAuthenticated || !user?.tenantId) return;
    const socket = getRealtimeSocket();
    if (!socket) return;

    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: MOBILE_COMMAND_CENTER_KEY });
      void queryClient.invalidateQueries({ queryKey: ['mobile-dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['mobile-approvals'] });
      void queryClient.invalidateQueries({ queryKey: ['mobile-notifications'] });
    };

    const events = [
      'entity_event',
      'financial_posted',
      'notification_created',
      'project_expense_voucher_updated',
      'installment_plan_updated',
    ] as const;

    for (const evt of events) {
      socket.on(evt, invalidate);
    }
    return () => {
      for (const evt of events) {
        socket.off(evt, invalidate);
      }
    };
  }, [isAuthenticated, user?.tenantId, queryClient]);

  return query;
}
