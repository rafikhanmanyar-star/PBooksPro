import React from 'react';
import { useUnpostedTransactions } from '../hooks/useUnpostedTransactions';
import { UNPOSTED_TRANSACTION_TYPES } from '../../../types/executiveMobile.types';
import { CURRENCY } from '../../../constants';

const TYPE_LABELS = Object.fromEntries(
  UNPOSTED_TRANSACTION_TYPES.map((t) => [t.id, t.label])
);

export default function MyTransactionsPage() {
  const { data, isLoading } = useUnpostedTransactions({ mine: true });

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
                <p className="font-medium text-app-text">
                  {TYPE_LABELS[tx.transactionType] ?? tx.transactionType}
                </p>
                <p className="text-xs text-app-muted">{tx.transactionDate}</p>
                {tx.partyName && (
                  <p className="text-xs text-app-muted mt-1">{tx.partyName}</p>
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
