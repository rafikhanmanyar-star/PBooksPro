import React from 'react';
import type { ExecutiveKpiTickerItem } from '../../../types/executiveMobile.types';
import { formatExecutiveValue, formatTrend } from '../utils/executiveFormatters';
import { ICONS } from '../../../constants';

const ICONS_MAP: Record<string, React.ReactNode> = {
  collectionsToday: ICONS.handDollar,
  paymentsToday: ICONS.creditCard,
  pendingApprovals: ICONS.fileText,
  projectsAtRisk: ICONS.building,
  criticalAlerts: ICONS.alertTriangle,
};

const COLOR_MAP: Record<string, string> = {
  collectionsToday: 'executive-ticker--green',
  paymentsToday: 'executive-ticker--blue',
  pendingApprovals: 'executive-ticker--amber',
  projectsAtRisk: 'executive-ticker--violet',
  criticalAlerts: 'executive-ticker--danger',
};

type Props = {
  items: ExecutiveKpiTickerItem[];
  loading?: boolean;
  onItemClick?: (id: string) => void;
};

export default function ExecutiveKpiTicker({ items, loading, onItemClick }: Props) {
  if (loading) {
    return (
      <div className="flex gap-3 px-4 overflow-x-auto scrollbar-hide pb-1">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="executive-ticker-card animate-pulse min-w-[9.5rem] h-[5.5rem]" />
        ))}
      </div>
    );
  }

  return (
    <div
      className="flex gap-3 px-4 overflow-x-auto scrollbar-hide pb-1 snap-x snap-mandatory"
      role="list"
      aria-label="Real-time KPI stream"
    >
      {items.map((item) => {
        const trendText =
          item.trend != null && item.trendLabel === 'vs yesterday'
            ? formatTrend(item.trend, '%')
            : item.trend != null && item.trendLabel === 'new'
              ? `↑ ${item.trend} new`
              : item.trendLabel;

        const trendUp = (item.trend ?? 0) > 0;
        const trendDown = (item.trend ?? 0) < 0;
        const isDanger = item.severity === 'danger';
        const isWarning = item.severity === 'warning';

        return (
          <button
            key={item.id}
            type="button"
            role="listitem"
            onClick={() => onItemClick?.(item.id)}
            className={`executive-ticker-card snap-start min-w-[9.5rem] shrink-0 text-left touch-manipulation active:scale-[0.98] transition-transform ${COLOR_MAP[item.id] ?? ''}`}
          >
            <span className="executive-ticker-icon">{ICONS_MAP[item.id] ?? ICONS.activity}</span>
            <p className="text-[10px] font-medium text-app-muted leading-tight mt-2">{item.label}</p>
            <p className="text-sm font-bold text-app-text tabular-nums mt-0.5">
              {formatExecutiveValue(item.value, item.format)}
            </p>
            {trendText && (
              <p
                className={`text-[10px] font-semibold mt-1 ${
                  isDanger
                    ? 'text-ds-danger'
                    : isWarning
                      ? 'text-amber-500'
                      : trendUp
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : trendDown
                          ? 'text-ds-danger'
                          : 'text-app-muted'
                }`}
              >
                {typeof trendText === 'string' ? trendText : formatTrend(item.trend)}
                {item.trendLabel && item.trendLabel !== 'new' && item.trendLabel !== 'vs yesterday' && typeof trendText === 'string' && !trendText.includes(item.trendLabel)
                  ? ` ${item.trendLabel}`
                  : item.trendLabel === 'vs yesterday' && typeof trendText === 'string'
                    ? ' vs yesterday'
                    : ''}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
