import React, { type ReactNode } from 'react';
import { CURRENCY, ICONS } from '../../../constants';
import type { MobileMetric } from '../../../types/executiveMobile.types';

type Props = {
  metric: MobileMetric;
  icon?: ReactNode;
  iconWrap?: string;
  compact?: boolean;
};

function formatValue(metric: MobileMetric): string {
  const v = metric.value;
  if (metric.format === 'percent') return `${v.toFixed(1)}%`;
  if (metric.format === 'number') return v.toLocaleString();
  return `${CURRENCY} ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function TrendIndicator({ trend }: { trend?: number | null }) {
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

export default function ExecutiveKpiCard({ metric, icon, iconWrap, compact }: Props) {
  const defaultIcon = ICONS.barChart;
  const wrap =
    iconWrap ??
    'bg-ds-primary/10 text-ds-primary dark:bg-ds-primary/15';

  return (
    <article
      className={`executive-kpi-card shrink-0 rounded-2xl border border-app-border bg-app-card p-4 shadow-ds-card touch-manipulation ${
        compact ? 'w-[9.5rem]' : 'w-[10.5rem]'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span
          className={`inline-flex w-9 h-9 items-center justify-center rounded-xl shrink-0 ${wrap}`}
        >
          <span className="w-[18px] h-[18px]">{icon ?? defaultIcon}</span>
        </span>
        <TrendIndicator trend={metric.trend} />
      </div>
      <p className="text-[11px] text-app-muted leading-tight mb-1 line-clamp-2">{metric.label}</p>
      <p className="text-base font-bold tabular-nums text-app-text leading-tight">
        {formatValue(metric)}
      </p>
      {metric.trend != null && (
        <p className="text-[10px] text-app-muted mt-1">vs previous month</p>
      )}
    </article>
  );
}
