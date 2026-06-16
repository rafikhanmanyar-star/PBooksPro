import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  clearDashboardRefreshPending,
  useDashboardRefreshIndicatorStore,
} from '../stores/dashboardRefreshIndicatorStore';

/** Subscribe to whether the dashboard should prompt a manual refresh (new transactions). */
export function useDashboardRefreshPending(): boolean {
  const pending = useDashboardRefreshIndicatorStore((s) => s.pending);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      clearDashboardRefreshPending();
    }
  }, [isAuthenticated]);

  return pending;
}
