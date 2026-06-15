import React, { useMemo, useState } from 'react';
import { CURRENCY, ICONS } from '../../../constants';
import { formatDate } from '../../../utils/dateUtils';
import { formatApiErrorMessage } from '../../../utils/formatApiErrorMessage';
import { useNotification } from '../../../context/NotificationContext';
import ExecutiveCategoryChips from '../components/ExecutiveCategoryChips';
import MarketingPlanDetailSheet from '../components/MarketingPlanDetailSheet';
import ApprovalSwipeCard from '../components/ApprovalSwipeCard';
import ExecutiveApprovalAnalyticsBanner from '../components/ExecutiveApprovalAnalyticsBanner';
import { useMobileCommandCenter } from '../hooks/useMobileCommandCenter';
import { bulkApproveMobileItems } from '../../../services/api/mobileCommandCenterApi';
import {
  APPROVAL_TYPE_META,
  APPROVAL_TYPE_ORDER,
  type ApprovalCategoryId,
} from '../constants/mobileCategories';
import {
  useApproveMobileItem,
  useMobileApprovals,
  useMobileInstallmentPlanDetail,
  useRejectMobileItem,
} from '../hooks/useMobileApprovals';
import type { MobileApprovalItem } from '../../../types/executiveMobile.types';

type MarketingPlanFilter = 'all' | 'pending' | 'approved' | 'rejected';

function countByType(items: MobileApprovalItem[]) {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.type] = (counts[item.type] ?? 0) + 1;
  }
  return counts;
}

function marketingPlanPhase(item: MobileApprovalItem): MarketingPlanFilter {
  const s = item.status.toLowerCase();
  if (s.includes('pending')) return 'pending';
  if (s.includes('approved')) return 'approved';
  if (s.includes('rejected')) return 'rejected';
  return 'pending';
}

function isVisibleInQueue(item: MobileApprovalItem): boolean {
  if (item.type === 'installment_plan') return true;
  return item.canApprove;
}

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('approved')) return 'bg-green-500/15 text-green-400';
  if (s.includes('rejected')) return 'bg-ds-danger/15 text-ds-danger';
  if (s.includes('pending')) return 'bg-amber-500/15 text-amber-400';
  return 'bg-app-surface-2 text-app-muted';
}

function ApprovalCard({
  item,
  busy,
  onApprove,
  onReject,
  onViewPlan,
}: {
  item: MobileApprovalItem;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onViewPlan?: () => void;
}) {
  const meta = APPROVAL_TYPE_META[item.type];
  const isMarketing = item.type === 'installment_plan';

  return (
    <li className="executive-summary-card rounded-2xl border border-app-border/60 bg-app-card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span
          className={`w-10 h-10 rounded-xl shrink-0 inline-flex items-center justify-center ${
            isMarketing
              ? 'executive-metric-icon executive-metric-icon--violet'
              : 'executive-metric-icon executive-metric-icon--teal'
          }`}
        >
          <span className="w-5 h-5">{isMarketing ? ICONS.fileText : ICONS.checkCircle}</span>
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ds-primary">
              {meta.shortLabel}
            </span>
            <span
              className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${statusBadgeClass(item.status)}`}
            >
              {item.status}
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
          {item.reviewedByName && (
            <p className="text-xs text-app-muted mt-1">
              Reviewed by {item.reviewedByName}
              {item.reviewedAt ? ` · ${formatDate(item.reviewedAt)}` : ''}
            </p>
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

      <div className="flex flex-wrap gap-2 pt-1">
        {isMarketing && onViewPlan && (
          <button
            type="button"
            className="flex-1 min-w-[8rem] py-2.5 rounded-xl border border-app-border text-app-text font-semibold text-sm touch-manipulation"
            onClick={onViewPlan}
          >
            View plan
          </button>
        )}
        {item.canApprove && !item.requiresFullErp && (
          <>
            <button
              type="button"
              disabled={busy}
              className="flex-1 min-w-[8rem] py-2.5 rounded-xl bg-green-600 text-white font-semibold text-sm touch-manipulation disabled:opacity-50"
              onClick={onApprove}
            >
              Approve
            </button>
            <button
              type="button"
              disabled={busy}
              className="flex-1 min-w-[8rem] py-2.5 rounded-xl border border-ds-danger text-ds-danger font-semibold text-sm touch-manipulation disabled:opacity-50"
              onClick={onReject}
            >
              Reject
            </button>
          </>
        )}
      </div>
    </li>
  );
}

export default function ExecutiveApprovalsPage() {
  const { data: commandCenter } = useMobileCommandCenter();
  const { data, isLoading, refetch, isFetching } = useMobileApprovals();
  const approve = useApproveMobileItem();
  const reject = useRejectMobileItem();
  const { showToast } = useNotification();
  const [category, setCategory] = useState<ApprovalCategoryId>('all');
  const [marketingFilter, setMarketingFilter] = useState<MarketingPlanFilter>('all');
  const [swipeMode, setSwipeMode] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const { data: planDetail, isLoading: planLoading } = useMobileInstallmentPlanDetail(selectedPlanId);

  const allItems = useMemo(() => (data ?? []).filter(isVisibleInQueue), [data]);
  const pendingActionCount = useMemo(
    () => (data ?? []).filter((item) => item.canApprove).length,
    [data]
  );

  const marketingItems = useMemo(
    () => allItems.filter((item) => item.type === 'installment_plan'),
    [allItems]
  );

  const typeCounts = useMemo(() => countByType(allItems), [allItems]);

  const chips = useMemo(
    () => [
      { id: 'all', label: 'All', count: allItems.length },
      ...APPROVAL_TYPE_ORDER.map((type) => ({
        id: type,
        label: APPROVAL_TYPE_META[type].shortLabel,
        count: typeCounts[type] ?? 0,
      })),
    ],
    [allItems.length, typeCounts]
  );

  const marketingFilterCounts = useMemo(() => {
    const counts = { all: marketingItems.length, pending: 0, approved: 0, rejected: 0 };
    for (const item of marketingItems) {
      const phase = marketingPlanPhase(item);
      if (phase in counts) counts[phase as keyof typeof counts] += 1;
    }
    return counts;
  }, [marketingItems]);

  const marketingFilterChips = useMemo(
    () => [
      { id: 'all', label: 'All plans', count: marketingFilterCounts.all },
      { id: 'pending', label: 'Pending', count: marketingFilterCounts.pending },
      { id: 'approved', label: 'Approved', count: marketingFilterCounts.approved },
      { id: 'rejected', label: 'Rejected', count: marketingFilterCounts.rejected },
    ],
    [marketingFilterCounts]
  );

  const filtered = useMemo(() => {
    let items =
      category === 'all' ? allItems : allItems.filter((item) => item.type === category);
    if (category === 'installment_plan' && marketingFilter !== 'all') {
      items = items.filter((item) => marketingPlanPhase(item) === marketingFilter);
    }
    return items;
  }, [allItems, category, marketingFilter]);

  const grouped = useMemo(() => {
    if (category !== 'all') return null;
    return APPROVAL_TYPE_ORDER.map((type) => ({
      type,
      items: allItems.filter((item) => item.type === type),
    })).filter((group) => group.items.length > 0);
  }, [category, allItems]);

  const busy = approve.isPending || reject.isPending;

  const handleApprove = async (type: string, id: string) => {
    try {
      await approve.mutateAsync({ type, id });
      showToast('Approved successfully.', 'success');
      setSelectedPlanId(null);
    } catch (e) {
      showToast(formatApiErrorMessage(e), 'error');
    }
  };

  const handleReject = async (type: string, id: string) => {
    const reason = window.prompt('Rejection reason (optional)') ?? undefined;
    try {
      await reject.mutateAsync({ type, id, reason });
      showToast('Rejected.', 'success');
      setSelectedPlanId(null);
    } catch (e) {
      showToast(formatApiErrorMessage(e), 'error');
    }
  };

  const renderList = (items: MobileApprovalItem[]) => (
    <ul className="space-y-3">
      {items.map((item) =>
        swipeMode && item.canApprove && !item.requiresFullErp ? (
          <li key={`${item.type}:${item.id}`}>
            <ApprovalSwipeCard
              item={item}
              busy={busy}
              onApprove={() => void handleApprove(item.type, item.id)}
              onReject={() => void handleReject(item.type, item.id)}
              onViewPlan={
                item.type === 'installment_plan' ? () => setSelectedPlanId(item.id) : undefined
              }
            />
          </li>
        ) : (
          <li key={`${item.type}:${item.id}`}>
            <ApprovalCard
              item={item}
              busy={busy}
              onApprove={() => void handleApprove(item.type, item.id)}
              onReject={() => void handleReject(item.type, item.id)}
              onViewPlan={
                item.type === 'installment_plan' ? () => setSelectedPlanId(item.id) : undefined
              }
            />
          </li>
        )
      )}
    </ul>
  );

  return (
    <div className="executive-home-page min-h-full pb-28">
      <div className="px-4 pt-5 pb-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-app-text">Approval Center</h1>
            <p className="text-sm text-app-muted mt-1">
              {pendingActionCount} pending · {allItems.length} total in queue
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <button
              type="button"
              className="text-sm font-semibold text-ds-primary touch-manipulation min-h-[36px] px-1 disabled:opacity-50"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              {isFetching ? 'Updating…' : 'Refresh'}
            </button>
            <button
              type="button"
              className="text-xs font-medium text-app-muted touch-manipulation"
              onClick={() => setSwipeMode((v) => !v)}
            >
              {swipeMode ? 'Card view' : 'Swipe view'}
            </button>
          </div>
        </div>

        {commandCenter?.approvalAnalytics && (
          <ExecutiveApprovalAnalyticsBanner analytics={commandCenter.approvalAnalytics} />
        )}

        {pendingActionCount > 0 && (
          <button
            type="button"
            disabled={busy}
            className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold text-sm touch-manipulation disabled:opacity-50"
            onClick={async () => {
              const actionable = (data ?? []).filter((a) => a.canApprove && !a.requiresFullErp);
              try {
                const result = await bulkApproveMobileItems(
                  actionable.map((a) => ({ type: a.type, id: a.id }))
                );
                showToast(`Bulk approved ${result.approved} item(s).`, 'success');
                await refetch();
              } catch (e) {
                showToast(formatApiErrorMessage(e), 'error');
              }
            }}
          >
            Approve all actionable ({pendingActionCount})
          </button>
        )}

        <ExecutiveCategoryChips
          categories={chips}
          activeId={category}
          onChange={(id) => {
            setCategory(id as ApprovalCategoryId);
            if (id !== 'installment_plan') setMarketingFilter('all');
          }}
          ariaLabel="Approval categories"
        />

        {category === 'installment_plan' && (
          <div className="space-y-2">
            <p className="text-xs text-app-muted px-1">{APPROVAL_TYPE_META.installment_plan.description}</p>
            <ExecutiveCategoryChips
              categories={marketingFilterChips}
              activeId={marketingFilter}
              onChange={(id) => setMarketingFilter(id as MarketingPlanFilter)}
              ariaLabel="Marketing plan status"
            />
          </div>
        )}

        {category !== 'all' && category !== 'installment_plan' && (
          <p className="text-xs text-app-muted px-1">{APPROVAL_TYPE_META[category].description}</p>
        )}

        {isLoading && <p className="text-sm text-app-muted px-1">Loading approvals…</p>}

        {!isLoading && allItems.length === 0 && (
          <div className="rounded-2xl border border-app-border/60 bg-app-card p-8 text-center">
            <span className="inline-flex w-12 h-12 items-center justify-center rounded-2xl executive-metric-icon executive-metric-icon--teal mb-3">
              <span className="w-6 h-6">{ICONS.checkCircle}</span>
            </span>
            <p className="font-medium text-app-text">All caught up</p>
            <p className="text-sm text-app-muted mt-1">No approvals in your queue right now.</p>
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
                {renderList(group.items)}
              </section>
            ))}
          </div>
        )}

        {category !== 'all' && filtered.length > 0 && renderList(filtered)}

        {category !== 'all' && !isLoading && filtered.length === 0 && allItems.length > 0 && (
          <p className="text-sm text-app-muted text-center py-8">
            No {APPROVAL_TYPE_META[category].label.toLowerCase()} match this filter.
          </p>
        )}
      </div>

      <MarketingPlanDetailSheet
        open={Boolean(selectedPlanId)}
        loading={planLoading}
        plan={planDetail}
        busy={busy}
        onClose={() => setSelectedPlanId(null)}
        onApprove={() => selectedPlanId && void handleApprove('installment_plan', selectedPlanId)}
        onReject={() => selectedPlanId && void handleReject('installment_plan', selectedPlanId)}
      />
    </div>
  );
}
