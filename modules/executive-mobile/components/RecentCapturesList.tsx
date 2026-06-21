import React from 'react';
import { useExecutiveMode } from '../../../context/ExecutiveModeContext';
import { useUnpostedTransactions } from '../hooks/useUnpostedTransactions';
import {
  INFLOW_CAPTURE_TYPES,
  OUTFLOW_CAPTURE_TYPES,
  captureTypeDisplayLabel,
  captureTypeIcon,
} from '../constants/quickCaptureTypes';
import type { MoneyFlow } from '../constants/quickCaptureTypes';
import { getCaptureDisplayLabel, stripCaptureDescriptionPrefix } from '../utils/captureSubmitMapping';
import type { UnpostedTransactionStatus } from '../../../types/executiveMobile.types';
import { CURRENCY, ICONS } from '../../../constants';
import { formatDateTime } from '../../../utils/dateUtils';
import { useProjects } from '../../../hooks/useSelectiveState';

const STATUS_STYLES: Record<UnpostedTransactionStatus, string> = {
  draft: 'bg-slate-500/15 text-slate-500',
  submitted: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  under_review: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  processed: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  rejected: 'bg-red-500/15 text-red-600 dark:text-red-400',
};

function flowForTransaction(tx: { transactionType: string }): MoneyFlow {
  if (tx.transactionType === 'customer_collection' || tx.transactionType === 'cash_deposit') {
    return 'in';
  }
  return 'out';
}

function iconForTransaction(tx: { transactionType: string; description?: string }) {
  const flow = flowForTransaction(tx);
  const label = getCaptureDisplayLabel(tx);
  const allCore = [...OUTFLOW_CAPTURE_TYPES, ...INFLOW_CAPTURE_TYPES];
  const core = allCore.find(
    (t) => captureTypeDisplayLabel(t, flow) === label || t.label === label
  );
  if (core) return captureTypeIcon(core, flow);
  return ICONS.layers;
}

function statusLabel(status: UnpostedTransactionStatus): string {
  if (status === 'under_review') return 'Under Review';
  return status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ');
}

export default function RecentCapturesList({ limit = 4 }: { limit?: number }) {
  const { setView } = useExecutiveMode();
  const { data, isLoading } = useUnpostedTransactions({ mine: true, limit });
  const projects = useProjects();

  const items = data ?? [];

  return (
    <section className="space-y-3" aria-label="Recent captures">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-app-text">Recent Captures</h3>
        <button
          type="button"
          onClick={() => setView('myTransactions')}
          className="text-xs font-semibold text-ds-primary touch-manipulation"
        >
          View All
        </button>
      </div>

      {isLoading && <p className="text-sm text-app-muted">Loading…</p>}

      {!isLoading && items.length === 0 && (
        <p className="text-sm text-app-muted rounded-xl border border-app-border bg-app-card p-4">
          No captures yet. Record your first transaction above.
        </p>
      )}

      <ul className="space-y-2">
        {items.map((tx) => (
          <li
            key={tx.id}
            className="flex items-center gap-3 p-3 rounded-xl border border-app-border/60 bg-app-card"
          >
            <span className="w-10 h-10 rounded-xl executive-metric-icon executive-metric-icon--teal shrink-0 inline-flex items-center justify-center">
              <span className="w-5 h-5">{iconForTransaction(tx)}</span>
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-app-text truncate">
                {getCaptureDisplayLabel(tx)}
              </p>
              <p className="text-xs text-app-muted truncate">
                {tx.partyName ||
                  projects?.find((p) => p.id === tx.projectId)?.name ||
                  stripCaptureDescriptionPrefix(tx.description) ||
                  '—'}
              </p>
              <p className="text-[10px] text-app-muted mt-0.5">
                {formatDateTime(tx.createdAt || tx.transactionDate)}
              </p>
            </div>
            <div className="text-right shrink-0 space-y-1">
              <p className="text-sm font-bold tabular-nums text-app-text">
                {CURRENCY} {tx.amount.toLocaleString()}
              </p>
              <span
                className={`inline-block text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                  STATUS_STYLES[tx.status] ?? STATUS_STYLES.submitted
                }`}
              >
                {statusLabel(tx.status)}
              </span>
            </div>
            <span className="w-4 h-4 text-app-muted shrink-0">{ICONS.chevronRight}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
