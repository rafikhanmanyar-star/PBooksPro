import React from 'react';
import { useUnpostedTransactions } from '../hooks/useUnpostedTransactions';
import { getCaptureDisplayLabel, stripCaptureDescriptionPrefix } from '../utils/captureSubmitMapping';
import { CURRENCY } from '../../../constants';
import { useProjects } from '../../../hooks/useSelectiveState';

export default function MyTransactionsPage() {
  const { data, isLoading } = useUnpostedTransactions({ mine: true });
  const projects = useProjects();

  return (
    <div className="p-4 pb-24 space-y-3">
      <h1 className="text-lg font-bold">My submissions</h1>
      {isLoading && <p className="text-sm text-app-muted">Loading…</p>}
      {!isLoading && (data?.length ?? 0) === 0 && (
        <p className="text-sm text-app-muted">No transactions submitted yet.</p>
      )}
      <ul className="space-y-2">
        {(data ?? []).map((tx) => (
          <li
            key={tx.id}
            className="p-4 rounded-xl border border-app-border bg-app-card"
          >
            <div className="flex justify-between items-start gap-2">
              <div>
                <p className="font-medium text-app-text">{getCaptureDisplayLabel(tx)}</p>
                <p className="text-xs text-app-muted">{tx.transactionDate}</p>
                {tx.partyName && (
                  <p className="text-xs text-app-muted mt-1">{tx.partyName}</p>
                )}
                {tx.projectId && (
                  <p className="text-xs text-app-muted mt-0.5">
                    Project: {projects?.find((p) => p.id === tx.projectId)?.name ?? tx.projectId}
                  </p>
                )}
                {tx.description && (
                  <p className="text-xs text-app-muted mt-0.5 line-clamp-2">
                    {stripCaptureDescriptionPrefix(tx.description)}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="font-bold tabular-nums">
                  {CURRENCY} {tx.amount.toLocaleString()}
                </p>
                <span className="text-[10px] uppercase tracking-wide text-app-muted">
                  {tx.status.replace('_', ' ')}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
