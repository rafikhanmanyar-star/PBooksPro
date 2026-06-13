import React, { type ReactNode } from 'react';
import { CURRENCY, ICONS } from '../../../constants';
import type { MobileMetric } from '../../../types/executiveMobile.types';

type MetricStyle = {
  icon: ReactNode;
  iconWrap: string;
};

const METRIC_STYLES: Record<string, MetricStyle> = {
  totalCashBalance: { icon: ICONS.wallet, iconWrap: 'bg-ds-primary/10 text-ds-primary' },
  bankBalance: { icon: ICONS.building, iconWrap: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  accountsReceivable: { icon: ICONS.fileText, iconWrap: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  accountsPayable: { icon: ICONS.wallet, iconWrap: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' },
  revenue: { icon: ICONS.handDollar, iconWrap: 'bg-teal-500/10 text-teal-600 dark:text-teal-400' },
  expenses: { icon: ICONS.creditCard, iconWrap: 'bg-pink-500/10 text-pink-600 dark:text-pink-400' },
  netIncome: { icon: ICONS.trendingUp, iconWrap: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  activeEmployees: { icon: ICONS.users, iconWrap: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  onLeave: { icon: ICONS.calendar, iconWrap: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  unpaidPayslips: { icon: ICONS.fileText, iconWrap: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  monthlyPayroll: { icon: ICONS.dollarSign, iconWrap: 'bg-teal-500/10 text-teal-600 dark:text-teal-400' },
  payrollOutstanding: { icon: ICONS.clock, iconWrap: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  departments: { icon: ICONS.briefcase, iconWrap: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  payrollDraft: { icon: ICONS.edit, iconWrap: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
};

function formatValue(metric: MobileMetric): string {
  const v = metric.value;
  if (metric.format === 'percent') return `${v.toFixed(1)}%`;
  if (metric.format === 'number') return v.toLocaleString();
  return `${CURRENCY} ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function TrendBadge({ trend }: { trend?: number | null }) {
  if (trend === null || trend === undefined) {
    return <span className="text-app-muted text-xs">—</span>;
  }
  const up = trend > 0;
  const down = trend < 0;
  const abs = Math.abs(trend).toFixed(0);
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${
        up ? 'text-ds-success' : down ? 'text-ds-danger' : 'text-app-muted'
      }`}
    >
      {up && <span className="w-3.5 h-3.5">{ICONS.trendingUp}</span>}
      {down && <span className="w-3.5 h-3.5">{ICONS.trendingDown}</span>}
      {up ? `↑ ${abs}%` : down ? `↓ ${abs}%` : '—'}
    </span>
  );
}

function MetricCard({ metric, fullWidth = false }: { metric: MobileMetric; fullWidth?: boolean }) {
  const style = METRIC_STYLES[metric.id] ?? {
    icon: ICONS.barChart,
    iconWrap: 'bg-app-surface-2 text-app-muted',
  };
  const isNegative = metric.id === 'netIncome' && metric.value < 0;

  return (
    <div
      className={`rounded-2xl border border-app-border bg-app-card p-4 shadow-ds-card executive-kpi-card ${
        fullWidth ? 'col-span-2' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className={`inline-flex w-10 h-10 items-center justify-center rounded-xl shrink-0 ${style.iconWrap}`}>
          <span className="w-5 h-5">{style.icon}</span>
        </span>
        <TrendBadge trend={metric.trend} />
      </div>
      <p className="text-xs text-app-muted leading-tight mb-1">{metric.label}</p>
      <p
        className={`text-lg font-bold tabular-nums leading-tight ${
          isNegative ? 'text-ds-danger' : 'text-app-text'
        }`}
      >
        {formatValue(metric)}
      </p>
      {metric.trend != null && (
        <p className="text-[10px] text-app-muted mt-1">vs previous month</p>
      )}
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
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`h-28 rounded-2xl bg-app-card border border-app-border animate-pulse ${
              i === 5 ? 'col-span-2' : ''
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
