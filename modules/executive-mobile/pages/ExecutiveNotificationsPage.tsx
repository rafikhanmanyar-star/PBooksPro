import React from 'react';
import { useExecutiveMode } from '../../../context/ExecutiveModeContext';
import { useDismissUserNotification } from '../../../hooks/useUserNotifications';
import { useMobileNotifications } from '../hooks/useMobileNotifications';

const SEVERITY_STYLES = {
  info: 'border-app-border',
  warning: 'border-amber-400/60 bg-amber-50/50 dark:bg-amber-950/20',
  urgent: 'border-ds-danger/50 bg-red-50/50 dark:bg-red-950/20',
};

export default function ExecutiveNotificationsPage() {
  const { setView } = useExecutiveMode();
  const { data, isLoading, refetch } = useMobileNotifications();
  const dismissNotification = useDismissUserNotification();

  const handleOpen = (n: { id: string; actionType?: string }) => {
    if (n.id.startsWith('notif_')) {
      void dismissNotification(n.id);
    }
    if (n.actionType === 'approval') {
      setView('approvals');
      return;
    }
    if (n.actionType === 'unposted') {
      setView('myTransactions');
    }
  };

  return (
    <div className="p-4 pb-24 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Notifications</h1>
        <button
          type="button"
          className="text-sm text-green-600 touch-manipulation"
          onClick={() => void refetch()}
        >
          Refresh
        </button>
      </div>

      {isLoading && <p className="text-sm text-app-muted">Loading…</p>}

      {!isLoading && (data?.length ?? 0) === 0 && (
        <p className="text-sm text-app-muted py-8 text-center">You are all caught up.</p>
      )}

      <ul className="space-y-2">
        {(data ?? []).map((n) => (
          <li key={n.id}>
            <button
              type="button"
              className={`w-full text-left p-4 rounded-xl border touch-manipulation ${SEVERITY_STYLES[n.severity]}`}
              onClick={() => handleOpen(n)}
            >
              <p className="font-medium text-app-text">{n.title}</p>
              <p className="text-sm text-app-muted mt-1">{n.body}</p>
              {n.actionType === 'approval' && (
                <span className="mt-2 inline-block text-sm text-green-600">Review approvals →</span>
              )}
              {n.actionType === 'unposted' && (
                <span className="mt-2 inline-block text-sm text-green-600">View my transactions →</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
