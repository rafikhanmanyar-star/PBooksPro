import React, { type ReactNode } from 'react';
import { CURRENCY, ICONS } from '../../../constants';
import type { MobileMetric } from '../../../types/executiveMobile.types';

type MetricStyle = {
  icon: ReactNode;
  iconWrap: string;
};

const METRIC_STYLES: Record<string, MetricStyle> = {
  totalCashBalance: { icon: ICONS.wallet, iconWrap: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400' },
  bankBalance: { icon: ICONS.building, iconWrap: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400' },
  accountsReceivable: { icon: ICONS.fileText, iconWrap: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400' },
  accountsPayable: { icon: ICONS.wallet, iconWrap: 'bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400' },
  revenue: { icon: ICONS.handDollar, iconWrap: 'bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400' },
  expenses: { icon: ICONS.creditCard, iconWrap: 'bg-pink-50 text-pink-600 dark:bg-pink-950/40 dark:text-pink-400' },
  netIncome: { icon: ICONS.trendingDown, iconWrap: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400' },
};

function formatValue(metric: MobileMetric): string {
  const v = metric.value;
  if (metric.format === 'percent') return `${v.toFixed(1)}%`;
  if (metric.format === 'number') return v.toLocaleString();
  const prefix = v < 0 ? `${CURRENCY} ` : `${CURRENCY} `;
  return `${prefix}${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function TrendBadge({ trend, value }: { trend?: number | null; value: number }) {
  const effective = trend ?? (value < 0 ? -1 : value > 0 ? 1 : 0);
  if (effective > 0) {
    return (
      <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400">
        <span className="w-4 h-4">{ICONS.trendingUp}</span>
      </span>
    );
  }
  if (effective < 0) {
    return (
      <span className="inline-flex items-center text-rose-600 dark:text-rose-400">
        <span className="w-4 h-4">{ICONS.trendingDown}</span>
      </span>
    );
  }
  return <span className="text-app-muted text-sm font-medium">—</span>;
}

function MetricCard({ metric, fullWidth = false }: { metric: MobileMetric; fullWidth?: boolean }) {
  const style = METRIC_STYLES[metric.id] ?? {
    icon: ICONS.barChart,
    iconWrap: 'bg-slate-50 text-slate-600',
  };
  const isNegative = metric.id === 'netIncome' && metric.value < 0;

  return (
    <div
      className={`rounded-2xl border border-app-border bg-white dark:bg-app-card p-4 shadow-sm ${
        fullWidth ? 'col-span-2' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className={`inline-flex w-10 h-10 items-center justify-center rounded-xl shrink-0 ${style.iconWrap}`}>
          <span className="w-5 h-5">{style.icon}</span>
        </span>
        <TrendBadge trend={metric.trend} value={metric.value} />
      </div>
      <p className="text-xs text-app-muted leading-tight mb-1">{metric.label}</p>
      <p
        className={`text-lg font-bold tabular-nums leading-tight ${
          isNegative ? 'text-rose-600 dark:text-rose-400' : 'text-app-text'
        }`}
      >
        {formatValue(metric)}
      </p>
    </div>
  );
}

export function ExecutiveMetricGrid({
  metrics,
  loading,
}: {
  metrics?: MobileMetric[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className={`h-28 rounded-2xl bg-white dark:bg-app-card border border-app-border animate-pulse ${
              i === 6 ? 'col-span-2' : ''
            }`}
          />
        ))}
      </div>
    );
  }

  const items = metrics ?? [];
  const regular = items.filter((m) => m.id !== 'netIncome');
  const profit = items.find((m) => m.id === 'netIncome');

  return (
    <div className="grid grid-cols-2 gap-3">
      {regular.map((m) => (
        <MetricCard key={m.id} metric={m} />
      ))}
      {profit && <MetricCard metric={profit} fullWidth />}
    </div>
  );
}
