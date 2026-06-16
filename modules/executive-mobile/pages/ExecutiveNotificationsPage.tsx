import React, { useMemo, useState } from 'react';
import { ICONS } from '../../../constants';
import { formatDateTime } from '../../../utils/dateUtils';
import { useExecutiveMode } from '../../../context/ExecutiveModeContext';
import { useDismissUserNotification } from '../../../hooks/useUserNotifications';
import { useMobileNotifications } from '../hooks/useMobileNotifications';
import ExecutiveCategoryChips from '../components/ExecutiveCategoryChips';
import {
  ALERT_CATEGORY_META,
  ALERT_CATEGORY_ORDER,
  buildAlertCategoryChips,
  workflowAlertLabel,
  type AlertCategoryId,
} from '../constants/mobileCategories';
import type { MobileNotificationItem } from '../../../types/executiveMobile.types';

const SEVERITY_STYLES = {
  info: 'border-app-border/60 bg-app-card/40',
  warning: 'border-amber-400/35 bg-amber-500/5',
  urgent: 'border-ds-danger/40 bg-ds-danger/5',
} as const;

const SEVERITY_DOT = {
  info: 'bg-app-muted',
  warning: 'bg-amber-400',
  urgent: 'bg-ds-danger',
} as const;

const CATEGORY_ICON_WRAP: Record<MobileNotificationItem['category'], string> = {
  approval: 'executive-metric-icon executive-metric-icon--teal',
  finance: 'executive-metric-icon executive-metric-icon--violet',
  collections: 'executive-metric-icon executive-metric-icon--amber',
  rental: 'executive-metric-icon executive-metric-icon--blue',
  project: 'executive-metric-icon executive-metric-icon--green',
};

const CATEGORY_ICONS: Record<MobileNotificationItem['category'], React.ReactNode> = {
  approval: ICONS.checkCircle,
  finance: ICONS.wallet,
  collections: ICONS.handDollar,
  rental: ICONS.building,
  project: ICONS.briefcase,
};

function isApprovalAlert(item: MobileNotificationItem): boolean {
  return (
    item.category === 'approval' ||
    item.actionType === 'approval' ||
    item.actionType === 'approval_request'
  );
}

function alertActionLabel(item: MobileNotificationItem): string | null {
  if (item.actionType === 'approval_request') {
    const label = workflowAlertLabel(item.workflowEntityType ?? item.entityType);
    return label ? `Review ${label} →` : 'Open approval queue →';
  }
  if (item.actionType === 'approval' || isApprovalAlert(item)) {
    return 'Review approvals →';
  }
  if (item.actionType === 'unposted') {
    return 'View my captures →';
  }
  if (item.actionType === 'contract') {
    return 'View contract →';
  }
  return null;
}

function AlertCard({
  item,
  onOpen,
}: {
  item: MobileNotificationItem;
  onOpen: () => void;
}) {
  const workflowLabel = workflowAlertLabel(item.workflowEntityType ?? item.entityType);
  const actionLabel = alertActionLabel(item);

  return (
    <button
      type="button"
      className={`w-full text-left rounded-2xl border p-4 touch-manipulation active:scale-[0.99] transition-transform ${SEVERITY_STYLES[item.severity]}`}
      onClick={onOpen}
    >
      <div className="flex items-start gap-3">
        <span
          className={`inline-flex w-10 h-10 items-center justify-center rounded-xl shrink-0 ${CATEGORY_ICON_WRAP[item.category]}`}
        >
          <span className="w-5 h-5">{CATEGORY_ICONS[item.category]}</span>
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${SEVERITY_DOT[item.severity]}`}
              aria-hidden
            />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-app-muted">
              {workflowLabel ?? ALERT_CATEGORY_META[item.category].label}
            </span>
            {item.severity === 'urgent' && (
              <span className="text-[10px] font-bold uppercase text-ds-danger px-1.5 py-0.5 rounded bg-ds-danger/10">
                Urgent
              </span>
            )}
          </div>
          <p className="font-semibold text-app-text leading-snug">{item.title}</p>
          <p className="text-sm text-app-muted mt-1 line-clamp-3">{item.body}</p>
          <p className="text-[10px] text-app-muted mt-2">{formatDateTime(item.createdAt)}</p>
          {actionLabel && (
            <span className="mt-2 inline-block text-xs font-semibold text-ds-primary">
              {actionLabel}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function SummaryStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: 'primary' | 'danger' | 'amber' | 'muted';
}) {
  const valueClass =
    accent === 'primary'
      ? 'text-ds-primary'
      : accent === 'danger'
        ? 'text-ds-danger'
        : accent === 'amber'
          ? 'text-amber-500'
          : 'text-app-text';
  return (
    <div className="flex-1 min-w-[4.5rem] rounded-xl border border-app-border/50 bg-app-card/60 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-app-muted">{label}</p>
      <p className={`text-lg font-bold tabular-nums mt-0.5 ${valueClass}`}>{value}</p>
    </div>
  );
}

export default function ExecutiveNotificationsPage({ variant = 'alerts' }: { variant?: 'alerts' | 'inbox' }) {
  const { setView } = useExecutiveMode();
  const { data, isLoading, refetch, isFetching } = useMobileNotifications();
  const dismissNotification = useDismissUserNotification();
  const [category, setCategory] = useState<AlertCategoryId>('all');

  const items = data ?? [];

  const urgentCount = useMemo(
    () => items.filter((item) => item.severity === 'urgent').length,
    [items]
  );
  const approvalCount = useMemo(
    () => items.filter((item) => isApprovalAlert(item)).length,
    [items]
  );

  const chips = useMemo(() => buildAlertCategoryChips(items), [items]);

  const filtered = useMemo(
    () => (category === 'all' ? items : items.filter((item) => item.category === category)),
    [category, items]
  );

  const grouped = useMemo(() => {
    if (category !== 'all') return null;
    return ALERT_CATEGORY_ORDER.map((cat) => ({
      category: cat,
      items: items.filter((item) => item.category === cat),
    })).filter((group) => group.items.length > 0);
  }, [category, items]);

  const handleOpen = (n: MobileNotificationItem) => {
    if (n.id.startsWith('notif_')) {
      void dismissNotification(n.id);
    }
    if (
      n.actionType === 'approval' ||
      n.actionType === 'approval_request' ||
      (n.category === 'approval' && !n.actionType)
    ) {
      setView('approvals');
      return;
    }
    if (n.actionType === 'unposted') {
      setView('myTransactions');
    }
  };

  const renderList = (listItems: MobileNotificationItem[]) => (
    <ul className="space-y-2.5">
      {listItems.map((n) => (
        <li key={n.id}>
          <AlertCard item={n} onOpen={() => handleOpen(n)} />
        </li>
      ))}
    </ul>
  );

  const renderSection = (
    title: string,
    groups: Array<{ category: MobileNotificationItem['category']; items: MobileNotificationItem[] }>
  ) => {
    if (groups.length === 0) return null;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-app-muted">{title}</h2>
          <div className="flex-1 h-px bg-app-border/50" />
        </div>
        {groups.map((group) => (
          <section key={group.category} aria-label={ALERT_CATEGORY_META[group.category].label}>
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="text-sm font-bold text-app-text">
                {ALERT_CATEGORY_META[group.category].label}
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

  const approvalGroups = grouped?.filter((g) => g.category === 'approval') ?? [];
  const signalGroups = grouped?.filter((g) => g.category !== 'approval') ?? [];

  return (
    <div className="executive-home-page executive-v2-page min-h-full pb-28">
      <div className="px-4 pt-5 pb-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-app-text">
              {variant === 'inbox' ? 'Executive Inbox' : 'Alerts'}
            </h1>
            <p className="text-sm text-app-muted mt-1">
              {variant === 'inbox'
                ? 'Workflow decisions and operational signals in one stream.'
                : `${items.length} active alert${items.length === 1 ? '' : 's'} across your organization`}
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold text-ds-primary touch-manipulation min-h-[36px] px-2 rounded-lg border border-ds-primary/30 disabled:opacity-50"
            disabled={isFetching}
            onClick={() => void refetch()}
            aria-label="Refresh alerts"
          >
            <span className={`w-4 h-4 inline-flex ${isFetching ? 'animate-spin' : ''}`}>
              {ICONS.repeat}
            </span>
            {isFetching ? 'Syncing' : 'Refresh'}
          </button>
        </div>

        {items.length > 0 && (
          <div className="flex gap-2">
            <SummaryStat label="Total" value={items.length} />
            <SummaryStat label="Approvals" value={approvalCount} accent="primary" />
            <SummaryStat label="Urgent" value={urgentCount} accent={urgentCount > 0 ? 'danger' : 'muted'} />
          </div>
        )}

        {chips.length > 1 && (
          <ExecutiveCategoryChips
            categories={chips}
            activeId={category}
            onChange={(id) => setCategory(id as AlertCategoryId)}
            ariaLabel="Alert categories"
          />
        )}

        {category !== 'all' && (
          <p className="text-xs text-app-muted px-1">{ALERT_CATEGORY_META[category].description}</p>
        )}

        {isLoading && (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-2xl bg-app-card border border-app-border/40" />
            ))}
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <div className="rounded-2xl border border-app-border/60 bg-gradient-to-b from-app-card to-app-card/40 p-10 text-center">
            <span className="inline-flex w-14 h-14 items-center justify-center rounded-2xl executive-metric-icon executive-metric-icon--muted mb-4">
              <span className="w-7 h-7">{ICONS.bell}</span>
            </span>
            <p className="font-semibold text-app-text text-lg">You&apos;re all caught up</p>
            <p className="text-sm text-app-muted mt-2 max-w-xs mx-auto">
              Workflow approvals, finance captures, and operational signals will appear here.
            </p>
          </div>
        )}

        {!isLoading && filtered.length === 0 && items.length > 0 && (
          <p className="text-sm text-app-muted text-center py-8 rounded-xl border border-dashed border-app-border/60">
            No {ALERT_CATEGORY_META[category].label.toLowerCase()} alerts right now.
          </p>
        )}

        {!isLoading && category === 'all' && grouped && grouped.length > 0 && (
          <div className="space-y-6">
            {renderSection('Workflow & approvals', approvalGroups)}
            {renderSection('Operational signals', signalGroups)}
          </div>
        )}

        {!isLoading && category === 'all' && items.length > 0 && (!grouped || grouped.length === 0) && (
          renderList(items)
        )}

        {!isLoading && category !== 'all' && filtered.length > 0 && renderList(filtered)}
      </div>
    </div>
  );
}
