import React, { useState } from 'react';
import { CURRENCY } from '../../../constants';
import {
  useApproveMobileItem,
  useMobileApprovals,
  useRejectMobileItem,
} from '../hooks/useMobileApprovals';

export default function ExecutiveApprovalsPage() {
  const { data, isLoading, refetch } = useMobileApprovals();
  const approve = useApproveMobileItem();
  const reject = useRejectMobileItem();
  const [error, setError] = useState<string | null>(null);

  const pending = (data ?? []).filter((item) => item.canApprove);

  const handleApprove = async (type: string, id: string) => {
    setError(null);
    try {
      await approve.mutateAsync({ type, id });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Approval failed');
    }
  };

  const handleReject = async (type: string, id: string) => {
    setError(null);
    const reason = window.prompt('Rejection reason (optional)') ?? undefined;
    try {
      await reject.mutateAsync({ type, id, reason });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Rejection failed');
    }
  };

  return (
    <div className="p-4 pb-24 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Approvals</h1>
        <button
          type="button"
          className="text-sm text-green-600 touch-manipulation"
          onClick={() => void refetch()}
        >
          Refresh
        </button>
      </div>
      <p className="text-xs text-app-muted">
        Approve or reject pending items. Contractor bills require full ERP for advance adjustments.
      </p>

      {error && <p className="text-sm text-ds-danger">{error}</p>}
      {isLoading && <p className="text-sm text-app-muted">Loading…</p>}

      {!isLoading && pending.length === 0 && (
        <p className="text-sm text-app-muted py-8 text-center">No pending approvals for you.</p>
      )}

      <ul className="space-y-3">
        {pending.map((item) => (
          <li
            key={`${item.type}:${item.id}`}
            className="p-4 rounded-xl border border-app-border bg-app-card space-y-3"
          >
            <div>
              <p className="font-semibold text-app-text">{item.title}</p>
              {item.subtitle && <p className="text-sm text-app-muted">{item.subtitle}</p>}
              {item.requestedByName && (
                <p className="text-xs text-app-muted mt-1">From {item.requestedByName}</p>
              )}
              {item.amount != null && (
                <p className="text-sm font-bold mt-2 tabular-nums">
                  {item.currency ?? CURRENCY} {item.amount.toLocaleString()}
                </p>
              )}
              {item.requiresFullErp && (
                <p className="text-xs text-ds-warning mt-2">Open full ERP to complete approval</p>
              )}
            </div>
            {item.canApprove && !item.requiresFullErp && (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={approve.isPending || reject.isPending}
                  className="flex-1 py-2.5 rounded-lg bg-green-600 text-white font-medium touch-manipulation disabled:opacity-50"
                  onClick={() => void handleApprove(item.type, item.id)}
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={approve.isPending || reject.isPending}
                  className="flex-1 py-2.5 rounded-lg border border-ds-danger text-ds-danger font-medium touch-manipulation disabled:opacity-50"
                  onClick={() => void handleReject(item.type, item.id)}
                >
                  Reject
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
