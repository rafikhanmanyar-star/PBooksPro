import React, { useCallback, useMemo, useState } from 'react';
import {
  useUnpostedTransactions,
  useUnpostedTransactionCounts,
  useUnpostedTransactionSubmitters,
  useUpdateUnpostedTransactionStatus,
} from '../../modules/executive-mobile/hooks/useUnpostedTransactions';
import { UNPOSTED_TRANSACTION_TYPES } from '../../types/executiveMobile.types';
import type { UnpostedTransactionStatus } from '../../types/executiveMobile.types';
import { CURRENCY } from '../../constants';
import { useNotification } from '../../context/NotificationContext';
import { usePermissions } from '../../hooks/usePermissions';
import { formatApiErrorMessage } from '../../utils/formatApiErrorMessage';
import { formatDate, formatDateTime } from '../../utils/dateUtils';

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

const STATUS_SUCCESS_MESSAGE: Partial<Record<UnpostedTransactionStatus, string>> = {
  under_review: 'Transaction moved to Under Review.',
  processed: 'Transaction marked as processed.',
  rejected: 'Transaction rejected.',
};

export default function UnpostedTransactionsQueuePage() {
  const [tab, setTab] = useState<UnpostedTransactionStatus | 'all'>('submitted');
  const [submittedByUserId, setSubmittedByUserId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const statusFilter = tab === 'all' ? undefined : tab;
  const listFilters = useMemo(
    () => ({
      status: statusFilter,
      createdBy: submittedByUserId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
    [statusFilter, submittedByUserId, dateFrom, dateTo]
  );

  const hasActiveFilters = Boolean(submittedByUserId || dateFrom || dateTo);

  const { data, isLoading, isError, error, refetch } = useUnpostedTransactions(listFilters);
  const { data: counts } = useUnpostedTransactionCounts();
  const { data: submitters } = useUnpostedTransactionSubmitters();
  const updateStatus = useUpdateUnpostedTransactionStatus();
  const { showToast } = useNotification();
  const { canWriteFinancial } = usePermissions();

  const pendingId = updateStatus.isPending ? updateStatus.variables?.id : undefined;

  const clearFilters = useCallback(() => {
    setSubmittedByUserId('');
    setDateFrom('');
    setDateTo('');
  }, []);

  const handleStatusUpdate = useCallback(
    (id: string, status: UnpostedTransactionStatus, rejectionReason?: string) => {
      updateStatus.mutate(
        { id, status, rejectionReason },
        {
          onSuccess: () => {
            const message = STATUS_SUCCESS_MESSAGE[status] ?? 'Transaction updated.';
            showToast(message, 'success');
            if (status === 'under_review') setTab('under_review');
            else if (status === 'processed') setTab('processed');
            else if (status === 'rejected') setTab('rejected');
          },
          onError: (err) => {
            showToast(formatApiErrorMessage(err), 'error');
          },
        }
      );
    },
    [showToast, updateStatus]
  );

  return (
    <div className="p-4 md:p-6 space-y-4 h-full overflow-auto">
      <div>
        <h2 className="text-lg font-bold text-app-text">Unposted Transactions</h2>
        <p className="text-sm text-app-muted">
          Field transactions submitted by executives. Review and mark processed when posted to the ledger
          (Phase 2 voucher wizard).
        </p>
      </div>

      {!canWriteFinancial && (
        <p className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
          Your role cannot review or process unposted transactions. Ask a company admin or accountant.
        </p>
      )}

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

      <div className="flex flex-wrap items-end gap-3 p-3 rounded-xl border border-app-border bg-app-card">
        <div className="flex flex-col gap-1 min-w-[10rem] flex-1 sm:flex-none sm:min-w-[12rem]">
          <label htmlFor="unposted-filter-user" className="text-xs font-medium text-app-muted">
            Submitted by
          </label>
          <select
            id="unposted-filter-user"
            value={submittedByUserId}
            onChange={(e) => setSubmittedByUserId(e.target.value)}
            className="rounded-lg border border-app-border bg-app-input text-app-text text-sm py-2 px-3"
          >
            <option value="">All users</option>
            {(submitters ?? []).map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="unposted-filter-from" className="text-xs font-medium text-app-muted">
            Transaction date from
          </label>
          <input
            id="unposted-filter-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-app-border bg-app-input text-app-text text-sm py-2 px-3"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="unposted-filter-to" className="text-xs font-medium text-app-muted">
            Transaction date to
          </label>
          <input
            id="unposted-filter-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-app-border bg-app-input text-app-text text-sm py-2 px-3"
          />
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="px-3 py-2 text-sm rounded-lg border border-app-border text-app-muted hover:text-app-text hover:bg-app-table-hover"
          >
            Clear filters
          </button>
        )}
      </div>

      {hasActiveFilters && !isLoading && (
        <p className="text-xs text-app-muted">
          Showing {data?.length ?? 0} transaction{(data?.length ?? 0) === 1 ? '' : 's'} matching filters
        </p>
      )}

      {isLoading && <p className="text-sm text-app-muted">Loading queue…</p>}

      {isError && (
        <div className="rounded-lg border border-ds-danger/40 bg-ds-danger/5 px-3 py-2 text-sm text-ds-danger flex flex-wrap items-center gap-2">
          <span>{formatApiErrorMessage(error)}</span>
          <button
            type="button"
            className="underline text-ds-danger"
            onClick={() => void refetch()}
          >
            Retry
          </button>
        </div>
      )}

      <div className="space-y-2">
        {(data ?? []).map((tx) => {
          const isRowPending = pendingId === tx.id;
          const submitterName = tx.createdByName ?? tx.createdBy;
          return (
            <div
              key={tx.id}
              className="p-4 rounded-xl border border-app-border bg-app-card flex flex-col md:flex-row md:items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-app-text">
                    {TYPE_LABELS[tx.transactionType] ?? tx.transactionType}
                  </p>
                  <span className="text-[11px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">
                    Submitted by {submitterName}
                  </span>
                </div>
                <p className="text-xs text-app-muted mt-1">
                  Transaction date: {formatDate(tx.transactionDate)}
                  {tx.partyName ? ` · ${tx.partyName}` : ''}
                </p>
                <p className="text-xs text-app-muted mt-0.5">
                  Captured {formatDateTime(tx.createdAt)}
                </p>
                {tx.description && (
                  <p className="text-xs text-app-muted mt-1 truncate">{tx.description}</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
                <p className="font-bold tabular-nums whitespace-nowrap">
                  {CURRENCY} {tx.amount.toLocaleString()}
                </p>
                <span className="text-xs uppercase text-app-muted">{tx.status.replace('_', ' ')}</span>
                {canWriteFinancial && tx.status === 'submitted' && (
                  <>
                    <button
                      type="button"
                      disabled={isRowPending}
                      className="px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white touch-manipulation disabled:opacity-50"
                      onClick={() => handleStatusUpdate(tx.id, 'under_review')}
                    >
                      {isRowPending ? 'Saving…' : 'Review'}
                    </button>
                    <button
                      type="button"
                      disabled={isRowPending}
                      className="px-3 py-1.5 text-sm rounded-lg bg-green-600 text-white touch-manipulation disabled:opacity-50"
                      onClick={() => handleStatusUpdate(tx.id, 'processed')}
                    >
                      {isRowPending ? 'Saving…' : 'Mark processed'}
                    </button>
                    <button
                      type="button"
                      disabled={isRowPending}
                      className="px-3 py-1.5 text-sm rounded-lg border border-ds-danger text-ds-danger touch-manipulation disabled:opacity-50"
                      onClick={() =>
                        handleStatusUpdate(tx.id, 'rejected', 'Rejected by accountant')
                      }
                    >
                      Reject
                    </button>
                  </>
                )}
                {canWriteFinancial && tx.status === 'under_review' && (
                  <>
                    <button
                      type="button"
                      disabled={isRowPending}
                      className="px-3 py-1.5 text-sm rounded-lg bg-green-600 text-white touch-manipulation disabled:opacity-50"
                      onClick={() => handleStatusUpdate(tx.id, 'processed')}
                    >
                      {isRowPending ? 'Saving…' : 'Mark processed'}
                    </button>
                    <button
                      type="button"
                      disabled={isRowPending}
                      className="px-3 py-1.5 text-sm rounded-lg border border-ds-danger text-ds-danger touch-manipulation disabled:opacity-50"
                      onClick={() =>
                        handleStatusUpdate(tx.id, 'rejected', 'Rejected by accountant')
                      }
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {!isLoading && !isError && (data?.length ?? 0) === 0 && (
          <p className="text-sm text-app-muted py-8 text-center">
            {hasActiveFilters ? 'No transactions match these filters.' : 'No transactions in this queue.'}
          </p>
        )}
      </div>
    </div>
  );
}
