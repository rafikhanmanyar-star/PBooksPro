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
  type AlertCategoryId,
} from '../constants/mobileCategories';
import type { MobileNotificationItem } from '../../../types/executiveMobile.types';

const SEVERITY_STYLES = {
  info: 'border-app-border/60',
  warning: 'border-amber-400/40 bg-amber-500/5',
  urgent: 'border-ds-danger/40 bg-ds-danger/5',
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

function countByCategory(items: MobileNotificationItem[]) {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.category] = (counts[item.category] ?? 0) + 1;
  }
  return counts;
}

function AlertCard({
  item,
  onOpen,
}: {
  item: MobileNotificationItem;
  onOpen: () => void;
}) {
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
            <span className="text-[10px] font-semibold uppercase tracking-wider text-app-muted">
              {ALERT_CATEGORY_META[item.category].label}
            </span>
            {item.severity === 'urgent' && (
              <span className="text-[10px] font-bold uppercase text-ds-danger">Urgent</span>
            )}
          </div>
          <p className="font-semibold text-app-text leading-snug">{item.title}</p>
          <p className="text-sm text-app-muted mt-1 line-clamp-2">{item.body}</p>
          <p className="text-[10px] text-app-muted mt-2">{formatDateTime(item.createdAt)}</p>
          {item.actionType === 'approval' && (
            <span className="mt-2 inline-block text-xs font-semibold text-ds-primary">
              Review approvals →
            </span>
          )}
          {item.actionType === 'unposted' && (
            <span className="mt-2 inline-block text-xs font-semibold text-ds-primary">
              View my captures →
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export default function ExecutiveNotificationsPage() {
  const { setView } = useExecutiveMode();
  const { data, isLoading, refetch, isFetching } = useMobileNotifications();
  const dismissNotification = useDismissUserNotification();
  const [category, setCategory] = useState<AlertCategoryId>('all');

  const items = data ?? [];
  const categoryCounts = useMemo(() => countByCategory(items), [items]);

  const chips = useMemo(
    () => [
      { id: 'all', label: 'All', count: items.length },
      ...ALERT_CATEGORY_ORDER.map((cat) => ({
        id: cat,
        label: ALERT_CATEGORY_META[cat].label,
        count: categoryCounts[cat] ?? 0,
      })),
    ],
    [items.length, categoryCounts]
  );

  const filtered =
    category === 'all' ? items : items.filter((item) => item.category === category);

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
    if (n.actionType === 'approval') {
      setView('approvals');
      return;
    }
    if (n.actionType === 'unposted') {
      setView('myTransactions');
    }
  };

  return (
    <div className="executive-home-page min-h-full pb-28">
      <div className="px-4 pt-5 pb-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-app-text">Alerts</h1>
            <p className="text-sm text-app-muted mt-1">
              {items.length} active alert{items.length === 1 ? '' : 's'} across your organization
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
          onChange={(id) => setCategory(id as AlertCategoryId)}
          ariaLabel="Alert categories"
        />

        {category !== 'all' && (
          <p className="text-xs text-app-muted px-1">{ALERT_CATEGORY_META[category].description}</p>
        )}

        {isLoading && <p className="text-sm text-app-muted px-1">Loading alerts…</p>}

        {!isLoading && items.length === 0 && (
          <div className="rounded-2xl border border-app-border/60 bg-app-card p-8 text-center">
            <span className="inline-flex w-12 h-12 items-center justify-center rounded-2xl executive-metric-icon executive-metric-icon--muted mb-3">
              <span className="w-6 h-6">{ICONS.bell}</span>
            </span>
            <p className="font-medium text-app-text">You&apos;re all caught up</p>
            <p className="text-sm text-app-muted mt-1">No alerts right now.</p>
          </div>
        )}

        {grouped && grouped.length > 0 && (
          <div className="space-y-5">
            {grouped.map((group) => (
              <section key={group.category} aria-label={ALERT_CATEGORY_META[group.category].label}>
                <div className="flex items-center justify-between mb-2 px-1">
                  <h2 className="text-sm font-bold text-app-text">
                    {ALERT_CATEGORY_META[group.category].label}
                  </h2>
                  <span className="text-xs text-app-muted tabular-nums">{group.items.length}</span>
                </div>
                <ul className="space-y-2">
                  {group.items.map((n) => (
                    <li key={n.id}>
                      <AlertCard item={n} onOpen={() => handleOpen(n)} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {category !== 'all' && filtered.length > 0 && (
          <ul className="space-y-2">
            {filtered.map((n) => (
              <li key={n.id}>
                <AlertCard item={n} onOpen={() => handleOpen(n)} />
              </li>
            ))}
          </ul>
        )}

        {category !== 'all' && !isLoading && filtered.length === 0 && items.length > 0 && (
          <p className="text-sm text-app-muted text-center py-8">
            No {ALERT_CATEGORY_META[category].label.toLowerCase()} alerts right now.
          </p>
        )}
      </div>
    </div>
  );
}
