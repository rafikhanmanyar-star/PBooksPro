import React from 'react';
import { useExecutiveMode } from '../../../context/ExecutiveModeContext';
import { useMobileNotifications } from '../hooks/useMobileNotifications';

const SEVERITY_STYLES = {
  info: 'border-app-border',
  warning: 'border-amber-400/60 bg-amber-50/50 dark:bg-amber-950/20',
  urgent: 'border-ds-danger/50 bg-red-50/50 dark:bg-red-950/20',
};

export default function ExecutiveNotificationsPage() {
  const { setView } = useExecutiveMode();
  const { data, isLoading, refetch } = useMobileNotifications();

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
          <li
            key={n.id}
            className={`p-4 rounded-xl border ${SEVERITY_STYLES[n.severity]}`}
          >
            <p className="font-medium text-app-text">{n.title}</p>
            <p className="text-sm text-app-muted mt-1">{n.body}</p>
            {n.actionType === 'approval' && (
              <button
                type="button"
                className="mt-2 text-sm text-green-600 touch-manipulation"
                onClick={() => setView('approvals')}
              >
                Review approvals →
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
