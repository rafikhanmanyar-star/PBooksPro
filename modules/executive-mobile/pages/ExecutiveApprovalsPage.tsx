import React, { useMemo, useState } from 'react';
import { CURRENCY, ICONS } from '../../../constants';
import { formatDate } from '../../../utils/dateUtils';
import { formatApiErrorMessage } from '../../../utils/formatApiErrorMessage';
import { useNotification } from '../../../context/NotificationContext';
import ExecutiveCategoryChips from '../components/ExecutiveCategoryChips';
import {
  APPROVAL_TYPE_META,
  APPROVAL_TYPE_ORDER,
  type ApprovalCategoryId,
} from '../constants/mobileCategories';
import {
  useApproveMobileItem,
  useMobileApprovals,
  useRejectMobileItem,
} from '../hooks/useMobileApprovals';
import type { MobileApprovalItem } from '../../../types/executiveMobile.types';

function countByType(items: MobileApprovalItem[]) {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.type] = (counts[item.type] ?? 0) + 1;
  }
  return counts;
}

function ApprovalCard({
  item,
  busy,
  onApprove,
  onReject,
}: {
  item: MobileApprovalItem;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const meta = APPROVAL_TYPE_META[item.type];

  return (
    <li className="executive-summary-card rounded-2xl border border-app-border/60 bg-app-card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="executive-metric-icon executive-metric-icon--teal w-10 h-10 rounded-xl shrink-0">
          <span className="w-5 h-5">{ICONS.checkCircle}</span>
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ds-primary">
              {meta.shortLabel}
            </span>
            {item.requestedAt && (
              <span className="text-[10px] text-app-muted">{formatDate(item.requestedAt)}</span>
            )}
          </div>
          <p className="font-semibold text-app-text leading-snug">{item.title}</p>
          {item.subtitle && <p className="text-sm text-app-muted mt-1">{item.subtitle}</p>}
          {item.requestedByName && (
            <p className="text-xs text-app-muted mt-1">Requested by {item.requestedByName}</p>
          )}
          {item.amount != null && (
            <p className="text-base font-bold mt-2 tabular-nums text-app-text">
              {item.currency ?? CURRENCY} {item.amount.toLocaleString()}
            </p>
          )}
          {item.requiresFullErp && (
            <p className="text-xs text-ds-warning mt-2 rounded-lg bg-amber-500/10 px-2 py-1.5">
              Open full ERP to complete this approval
            </p>
          )}
        </div>
      </div>
      {item.canApprove && !item.requiresFullErp && (
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            disabled={busy}
            className="flex-1 py-2.5 rounded-xl bg-green-600 text-white font-semibold text-sm touch-manipulation disabled:opacity-50"
            onClick={onApprove}
          >
            Approve
          </button>
          <button
            type="button"
            disabled={busy}
            className="flex-1 py-2.5 rounded-xl border border-ds-danger text-ds-danger font-semibold text-sm touch-manipulation disabled:opacity-50"
            onClick={onReject}
          >
            Reject
          </button>
        </div>
      )}
    </li>
  );
}

export default function ExecutiveApprovalsPage() {
  const { data, isLoading, refetch, isFetching } = useMobileApprovals();
  const approve = useApproveMobileItem();
  const reject = useRejectMobileItem();
  const { showToast } = useNotification();
  const [category, setCategory] = useState<ApprovalCategoryId>('all');

  const pending = useMemo(() => (data ?? []).filter((item) => item.canApprove), [data]);
  const typeCounts = useMemo(() => countByType(pending), [pending]);

  const chips = useMemo(
    () => [
      { id: 'all', label: 'All', count: pending.length },
      ...APPROVAL_TYPE_ORDER.map((type) => ({
        id: type,
        label: APPROVAL_TYPE_META[type].shortLabel,
        count: typeCounts[type] ?? 0,
      })),
    ],
    [pending.length, typeCounts]
  );

  const filtered =
    category === 'all' ? pending : pending.filter((item) => item.type === category);

  const grouped = useMemo(() => {
    if (category !== 'all') return null;
    return APPROVAL_TYPE_ORDER.map((type) => ({
      type,
      items: pending.filter((item) => item.type === type),
    })).filter((group) => group.items.length > 0);
  }, [category, pending]);

  const busy = approve.isPending || reject.isPending;

  const handleApprove = async (type: string, id: string) => {
    try {
      await approve.mutateAsync({ type, id });
      showToast('Approved successfully.', 'success');
    } catch (e) {
      showToast(formatApiErrorMessage(e), 'error');
    }
  };

  const handleReject = async (type: string, id: string) => {
    const reason = window.prompt('Rejection reason (optional)') ?? undefined;
    try {
      await reject.mutateAsync({ type, id, reason });
      showToast('Rejected.', 'success');
    } catch (e) {
      showToast(formatApiErrorMessage(e), 'error');
    }
  };

  return (
    <div className="executive-home-page min-h-full pb-28">
      <div className="px-4 pt-5 pb-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-app-text">Approvals</h1>
            <p className="text-sm text-app-muted mt-1">
              {pending.length} item{pending.length === 1 ? '' : 's'} need your decision
            </p>
          </div>
          <button
            type="button"
            className="text-sm font-semibold text-ds-primary touch-manipulation min-h-[44px] px-1 shrink-0 disabled:opacity-50"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            {isFetching ? 'Updating…' : 'Refresh'}
          </button>
        </div>

        <ExecutiveCategoryChips
          categories={chips}
          activeId={category}
          onChange={(id) => setCategory(id as ApprovalCategoryId)}
          ariaLabel="Approval categories"
        />

        {category !== 'all' && (
          <p className="text-xs text-app-muted px-1">
            {APPROVAL_TYPE_META[category].description}
          </p>
        )}

        {isLoading && <p className="text-sm text-app-muted px-1">Loading approvals…</p>}

        {!isLoading && pending.length === 0 && (
          <div className="rounded-2xl border border-app-border/60 bg-app-card p-8 text-center">
            <span className="inline-flex w-12 h-12 items-center justify-center rounded-2xl executive-metric-icon executive-metric-icon--teal mb-3">
              <span className="w-6 h-6">{ICONS.checkCircle}</span>
            </span>
            <p className="font-medium text-app-text">All caught up</p>
            <p className="text-sm text-app-muted mt-1">No pending approvals for you right now.</p>
          </div>
        )}

        {grouped && grouped.length > 0 && (
          <div className="space-y-5">
            {grouped.map((group) => (
              <section key={group.type} aria-label={APPROVAL_TYPE_META[group.type].label}>
                <div className="flex items-center justify-between mb-2 px-1">
                  <h2 className="text-sm font-bold text-app-text">
                    {APPROVAL_TYPE_META[group.type].label}
                  </h2>
                  <span className="text-xs text-app-muted tabular-nums">{group.items.length}</span>
                </div>
                <ul className="space-y-3">
                  {group.items.map((item) => (
                    <ApprovalCard
                      key={`${item.type}:${item.id}`}
                      item={item}
                      busy={busy}
                      onApprove={() => void handleApprove(item.type, item.id)}
                      onReject={() => void handleReject(item.type, item.id)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {category !== 'all' && filtered.length > 0 && (
          <ul className="space-y-3">
            {filtered.map((item) => (
              <ApprovalCard
                key={`${item.type}:${item.id}`}
                item={item}
                busy={busy}
                onApprove={() => void handleApprove(item.type, item.id)}
                onReject={() => void handleReject(item.type, item.id)}
              />
            ))}
          </ul>
        )}

        {category !== 'all' && !isLoading && filtered.length === 0 && pending.length > 0 && (
          <p className="text-sm text-app-muted text-center py-8">
            No {APPROVAL_TYPE_META[category].label.toLowerCase()} in this queue.
          </p>
        )}
      </div>
    </div>
  );
}
