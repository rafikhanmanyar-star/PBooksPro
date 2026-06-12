import React, { useState } from 'react';
import {
  useUnpostedTransactions,
  useUnpostedTransactionCounts,
  useUpdateUnpostedTransactionStatus,
} from '../../modules/executive-mobile/hooks/useUnpostedTransactions';
import { UNPOSTED_TRANSACTION_TYPES } from '../../types/executiveMobile.types';
import type { UnpostedTransactionStatus } from '../../types/executiveMobile.types';
import { CURRENCY } from '../../constants';

const TYPE_LABELS = Object.fromEntries(
  UNPOSTED_TRANSACTION_TYPES.map((t) => [t.id, t.label])
);

const STATUS_TABS: { id: UnpostedTransactionStatus | 'all'; label: string }[] = [
  { id: 'submitted', label: 'New' },
  { id: 'under_review', label: 'Under Review' },
  { id: 'processed', label: 'Processed' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
];

export default function UnpostedTransactionsQueuePage() {
  const [tab, setTab] = useState<UnpostedTransactionStatus | 'all'>('submitted');
  const statusFilter = tab === 'all' ? undefined : tab;
  const { data, isLoading } = useUnpostedTransactions({ status: statusFilter });
  const { data: counts } = useUnpostedTransactionCounts();
  const updateStatus = useUpdateUnpostedTransactionStatus();

  return (
    <div className="p-4 md:p-6 space-y-4 h-full overflow-auto">
      <div>
        <h2 className="text-lg font-bold text-app-text">Unposted Transactions</h2>
        <p className="text-sm text-app-muted">
          Field transactions submitted by executives. Convert to ERP vouchers when ready (Phase 2 wizard).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-sm border touch-manipulation ${
              tab === t.id
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'border-app-border bg-app-card text-app-text'
            }`}
          >
            {t.label}
            {t.id !== 'all' && counts?.[t.id] != null && (
              <span className="ml-1 opacity-80">({counts[t.id]})</span>
            )}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-app-muted">Loading queue…</p>}

      <div className="space-y-2">
        {(data ?? []).map((tx) => (
          <div
            key={tx.id}
            className="p-4 rounded-xl border border-app-border bg-app-card flex flex-col md:flex-row md:items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-app-text">
                {TYPE_LABELS[tx.transactionType] ?? tx.transactionType}
              </p>
              <p className="text-xs text-app-muted">
                {tx.transactionDate} · {tx.createdByName ?? tx.createdBy}
              </p>
              {tx.partyName && <p className="text-sm text-app-text mt-1">{tx.partyName}</p>}
              {tx.description && (
                <p className="text-xs text-app-muted mt-1 truncate">{tx.description}</p>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <p className="font-bold tabular-nums whitespace-nowrap">
                {CURRENCY} {tx.amount.toLocaleString()}
              </p>
              <span className="text-xs uppercase text-app-muted">{tx.status.replace('_', ' ')}</span>
              {tx.status === 'submitted' && (
                <button
                  type="button"
                  disabled={updateStatus.isPending}
                  className="px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white touch-manipulation disabled:opacity-50"
                  onClick={() =>
                    updateStatus.mutate({ id: tx.id, status: 'under_review' })
                  }
                >
                  Review
                </button>
              )}
              {tx.status === 'under_review' && (
                <>
                  <button
                    type="button"
                    disabled={updateStatus.isPending}
                    className="px-3 py-1.5 text-sm rounded-lg bg-green-600 text-white touch-manipulation"
                    onClick={() =>
                      updateStatus.mutate({ id: tx.id, status: 'processed' })
                    }
                  >
                    Mark processed
                  </button>
                  <button
                    type="button"
                    disabled={updateStatus.isPending}
                    className="px-3 py-1.5 text-sm rounded-lg border border-ds-danger text-ds-danger touch-manipulation"
                    onClick={() =>
                      updateStatus.mutate({
                        id: tx.id,
                        status: 'rejected',
                        rejectionReason: 'Rejected by accountant',
                      })
                    }
                  >
                    Reject
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {!isLoading && (data?.length ?? 0) === 0 && (
          <p className="text-sm text-app-muted py-8 text-center">No transactions in this queue.</p>
        )}
      </div>
    </div>
  );
}
