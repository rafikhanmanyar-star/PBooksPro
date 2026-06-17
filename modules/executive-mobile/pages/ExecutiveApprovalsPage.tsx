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
  buildApprovalCategoryChips,
  getApprovalTypeMeta,
  isWorkflowApprovalItem,
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
type QueueFilter = 'actionable' | 'all';

function marketingPlanPhase(item: MobileApprovalItem): MarketingPlanFilter {
  const s = item.status.toLowerCase();
  if (s.includes('pending')) return 'pending';
  if (s.includes('approved')) return 'approved';
  if (s.includes('rejected')) return 'rejected';
  return 'pending';
}

function isVisibleInQueue(item: MobileApprovalItem): boolean {
  if (item.type === 'installment_plan') return true;
  return item.canApprove || isWorkflowApprovalItem(item);
}

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('approved')) return 'bg-green-500/15 text-green-400';
  if (s.includes('rejected')) return 'bg-ds-danger/15 text-ds-danger';
  if (s.includes('pending')) return 'bg-amber-500/15 text-amber-400';
  return 'bg-app-surface-2 text-app-muted';
}

function typeIcon(item: MobileApprovalItem): React.ReactNode {
  if (item.type === 'installment_plan') return ICONS.fileText;
  if (item.type === 'payment') return ICONS.wallet;
  if (item.type === 'contract' || item.type === 'variation_order') return ICONS.checkCircle;
  if (item.type === 'bill' || item.type === 'contractor_bill') return ICONS.fileText;
  if (item.type === 'purchase_order') return ICONS.briefcase;
  return ICONS.checkCircle;
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
  const meta = getApprovalTypeMeta(item.type);
  const isMarketing = item.type === 'installment_plan';
  const isWorkflow = isWorkflowApprovalItem(item);

  const openPlan = () => onViewPlan?.();

  return (
    <div
      className={`executive-summary-card rounded-2xl border border-app-border/60 bg-app-card p-4 space-y-3 ${
        isMarketing && onViewPlan ? 'cursor-pointer active:bg-app-surface-2/40' : ''
      }`}
      role={isMarketing && onViewPlan ? 'button' : undefined}
      tabIndex={isMarketing && onViewPlan ? 0 : undefined}
      onClick={isMarketing && onViewPlan ? openPlan : undefined}
      onKeyDown={
        isMarketing && onViewPlan
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openPlan();
              }
            }
          : undefined
      }
    >
      <div className="flex items-start gap-3">
        <span className={`w-10 h-10 rounded-xl shrink-0 inline-flex items-center justify-center ${meta.iconWrap}`}>
          <span className="w-5 h-5">{typeIcon(item)}</span>
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
            {isWorkflow && item.currentLevel != null && item.maxLevel != null && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-app-surface-2 text-app-muted">
                Level {item.currentLevel}/{item.maxLevel}
              </span>
            )}
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

      <div className="flex flex-wrap gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
        {isMarketing && onViewPlan && (
          <button
            type="button"
            className="flex-1 min-w-[8rem] py-2.5 rounded-xl border border-app-border text-app-text font-semibold text-sm touch-manipulation min-h-[44px]"
            onClick={openPlan}
          >
            View plan
          </button>
        )}
        {item.canApprove && !item.requiresFullErp && (
          <>
            <button
              type="button"
              disabled={busy}
              className="flex-1 min-w-[8rem] py-2.5 rounded-xl bg-green-600 text-white font-semibold text-sm touch-manipulation disabled:opacity-50 min-h-[44px]"
              onClick={onApprove}
            >
              Approve
            </button>
            <button
              type="button"
              disabled={busy}
              className="flex-1 min-w-[8rem] py-2.5 rounded-xl border border-ds-danger text-ds-danger font-semibold text-sm touch-manipulation disabled:opacity-50 min-h-[44px]"
              onClick={onReject}
            >
              Reject
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: 'primary' | 'amber' | 'muted';
}) {
  const valueClass =
    accent === 'primary'
      ? 'text-ds-primary'
      : accent === 'amber'
        ? 'text-amber-500'
        : 'text-app-text';
  return (
    <div className="flex-1 min-w-[5.5rem] rounded-xl border border-app-border/50 bg-app-card/60 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-app-muted">{label}</p>
      <p className={`text-lg font-bold tabular-nums mt-0.5 ${valueClass}`}>{value}</p>
    </div>
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
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('actionable');
  const [swipeMode, setSwipeMode] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const {
    data: planDetail,
    isLoading: planLoading,
    isError: planError,
    error: planErrorDetail,
  } = useMobileInstallmentPlanDetail(selectedPlanId);

  const allItems = useMemo(() => (data ?? []).filter(isVisibleInQueue), [data]);
  const pendingActionCount = useMemo(
    () => (data ?? []).filter((item) => item.canApprove).length,
    [data]
  );

  const workflowCount = useMemo(
    () => allItems.filter((item) => isWorkflowApprovalItem(item)).length,
    [allItems]
  );

  const domainCount = useMemo(
    () => allItems.filter((item) => !isWorkflowApprovalItem(item)).length,
    [allItems]
  );

  const marketingItems = useMemo(
    () => allItems.filter((item) => item.type === 'installment_plan'),
    [allItems]
  );

  const chips = useMemo(() => buildApprovalCategoryChips(allItems), [allItems]);

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
    if (queueFilter === 'actionable') {
      items = items.filter((item) => item.canApprove || item.type === 'installment_plan');
    }
    if (category === 'installment_plan' && marketingFilter !== 'all') {
      items = items.filter((item) => marketingPlanPhase(item) === marketingFilter);
    }
    return items;
  }, [allItems, category, marketingFilter, queueFilter]);

  const grouped = useMemo(() => {
    if (category !== 'all') return null;
    const workflowTypes = APPROVAL_TYPE_ORDER.filter(
      (type) => APPROVAL_TYPE_META[type].group === 'workflow'
    );
    const domainTypes = APPROVAL_TYPE_ORDER.filter(
      (type) => APPROVAL_TYPE_META[type].group === 'domain'
    );

    const workflowGroups = workflowTypes
      .map((type) => ({
        type,
        items: filtered.filter((item) => item.type === type),
        section: 'workflow' as const,
      }))
      .filter((group) => group.items.length > 0);

    const domainGroups = domainTypes
      .map((type) => ({
        type,
        items: filtered.filter((item) => item.type === type),
        section: 'domain' as const,
      }))
      .filter((group) => group.items.length > 0);

    return { workflowGroups, domainGroups };
  }, [category, filtered]);

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
      {items.map((item) => {
        const useSwipeCard =
          swipeMode &&
          item.canApprove &&
          !item.requiresFullErp &&
          item.type !== 'installment_plan';

        return useSwipeCard ? (
          <li key={`${item.type}:${item.id}`}>
            <ApprovalSwipeCard
              item={item}
              busy={busy}
              onApprove={() => void handleApprove(item.type, item.id)}
              onReject={() => void handleReject(item.type, item.id)}
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
        );
      })}
    </ul>
  );

  const renderSection = (
    title: string,
    groups: Array<{ type: MobileApprovalItem['type']; items: MobileApprovalItem[] }>
  ) => {
    if (groups.length === 0) return null;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-app-muted">{title}</h2>
          <div className="flex-1 h-px bg-app-border/50" />
        </div>
        {groups.map((group) => (
          <section key={group.type} aria-label={APPROVAL_TYPE_META[group.type].label}>
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="text-sm font-bold text-app-text">
                {APPROVAL_TYPE_META[group.type].label}
              </h3>
              <span className="text-xs font-semibold tabular-nums text-app-muted bg-app-surface-2 px-2 py-0.5 rounded-full">
                {group.items.length}
              </span>
            </div>
            {renderList(group.items)}
          </section>
        ))}
      </div>
    );
  };

  return (
    <div className="executive-home-page min-h-full pb-28">
      <div className="px-4 pt-5 pb-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-app-text">Approval Center</h1>
            <p className="text-sm text-app-muted mt-1">
              Workflow-driven decisions across procurement, finance, and projects
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold text-ds-primary touch-manipulation min-h-[36px] px-2 rounded-lg border border-ds-primary/30 disabled:opacity-50"
            disabled={isFetching}
            onClick={() => void refetch()}
            aria-label="Refresh approvals"
          >
            <span className={`w-4 h-4 inline-flex ${isFetching ? 'animate-spin' : ''}`}>{ICONS.repeat}</span>
            {isFetching ? 'Syncing' : 'Refresh'}
          </button>
        </div>

        <div className="flex gap-2">
          <SummaryStat label="Your action" value={pendingActionCount} accent="primary" />
          <SummaryStat label="Workflow" value={workflowCount} accent="amber" />
          <SummaryStat label="Other" value={domainCount} />
        </div>

        {commandCenter?.approvalAnalytics && (
          <ExecutiveApprovalAnalyticsBanner analytics={commandCenter.approvalAnalytics} />
        )}

        <div className="flex items-center justify-between gap-3">
          <div
            className="inline-flex rounded-xl border border-app-border/60 bg-app-card p-0.5"
            role="tablist"
            aria-label="Queue filter"
          >
            {(
              [
                { id: 'actionable', label: 'Needs action' },
                { id: 'all', label: 'All items' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={queueFilter === tab.id}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold touch-manipulation transition-colors ${
                  queueFilter === tab.id
                    ? 'bg-ds-primary text-white'
                    : 'text-app-muted'
                }`}
                onClick={() => setQueueFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div
            className="inline-flex rounded-xl border border-app-border/60 bg-app-card p-0.5"
            role="tablist"
            aria-label="View mode"
          >
            {(
              [
                { id: true, label: 'Swipe' },
                { id: false, label: 'List' },
              ] as const
            ).map((tab) => (
              <button
                key={String(tab.id)}
                type="button"
                role="tab"
                aria-selected={swipeMode === tab.id}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold touch-manipulation transition-colors ${
                  swipeMode === tab.id ? 'bg-app-surface-2 text-app-text' : 'text-app-muted'
                }`}
                onClick={() => setSwipeMode(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {pendingActionCount > 0 && (
          <button
            type="button"
            disabled={busy}
            className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold text-sm touch-manipulation disabled:opacity-50 shadow-sm"
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

        {chips.length > 1 && (
          <ExecutiveCategoryChips
            categories={chips}
            activeId={category}
            onChange={(id) => {
              setCategory(id as ApprovalCategoryId);
              if (id !== 'installment_plan') setMarketingFilter('all');
            }}
            ariaLabel="Approval categories"
          />
        )}

        {category === 'installment_plan' && (
          <div className="space-y-2">
            <p className="text-xs text-app-muted px-1">
              {APPROVAL_TYPE_META.installment_plan.description}
            </p>
            <ExecutiveCategoryChips
              categories={marketingFilterChips}
              activeId={marketingFilter}
              onChange={(id) => setMarketingFilter(id as MarketingPlanFilter)}
              ariaLabel="Marketing plan status"
            />
          </div>
        )}

        {category !== 'all' && category !== 'installment_plan' && (
          <p className="text-xs text-app-muted px-1">{getApprovalTypeMeta(category).description}</p>
        )}

        {isLoading && (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 rounded-2xl bg-app-card border border-app-border/40" />
            ))}
          </div>
        )}

        {!isLoading && allItems.length === 0 && (
          <div className="rounded-2xl border border-app-border/60 bg-gradient-to-b from-app-card to-app-card/40 p-10 text-center">
            <span className="inline-flex w-14 h-14 items-center justify-center rounded-2xl executive-metric-icon executive-metric-icon--teal mb-4">
              <span className="w-7 h-7">{ICONS.checkCircle}</span>
            </span>
            <p className="font-semibold text-app-text text-lg">All caught up</p>
            <p className="text-sm text-app-muted mt-2 max-w-xs mx-auto">
              No approvals in your queue. Workflow items from bills, contracts, payments, and more
              will appear here when submitted.
            </p>
          </div>
        )}

        {!isLoading && allItems.length > 0 && filtered.length === 0 && (
          <p className="text-sm text-app-muted text-center py-8 rounded-xl border border-dashed border-app-border/60">
            No items match the current filters.
          </p>
        )}

        {grouped && (grouped.workflowGroups.length > 0 || grouped.domainGroups.length > 0) && (
          <div className="space-y-6">
            {renderSection('Workflow approvals', grouped.workflowGroups)}
            {renderSection('Domain approvals', grouped.domainGroups)}
          </div>
        )}

        {category !== 'all' && filtered.length > 0 && renderList(filtered)}
      </div>

      <MarketingPlanDetailSheet
        open={Boolean(selectedPlanId)}
        loading={planLoading}
        error={planError}
        errorMessage={planError ? formatApiErrorMessage(planErrorDetail) : undefined}
        plan={planDetail}
        busy={busy}
        onClose={() => setSelectedPlanId(null)}
        onApprove={() => selectedPlanId && void handleApprove('installment_plan', selectedPlanId)}
        onReject={() => selectedPlanId && void handleReject('installment_plan', selectedPlanId)}
      />
    </div>
  );
}
