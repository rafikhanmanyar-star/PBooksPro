import React from 'react';
import { CURRENCY, ICONS } from '../../../constants';
import type { MobileMetric } from '../../../types/executiveMobile.types';

const FEATURED_METRICS = [
  {
    id: 'totalCashBalance',
    icon: ICONS.creditCard,
    iconWrap: 'executive-metric-icon executive-metric-icon--teal',
  },
  {
    id: 'accountsReceivable',
    icon: ICONS.fileText,
    iconWrap: 'executive-metric-icon executive-metric-icon--violet',
  },
] as const;

function formatValue(metric: MobileMetric): string {
  const v = metric.value;
  if (metric.format === 'percent') return `${v.toFixed(1)}%`;
  if (metric.format === 'number') return v.toLocaleString();
  return `${CURRENCY} ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function FeaturedMetricCard({ metric, icon, iconWrap }: {
  metric: MobileMetric;
  icon: React.ReactNode;
  iconWrap: string;
}) {
  return (
    <article className="executive-featured-metric rounded-2xl border border-app-border/60 bg-app-card p-4 shadow-ds-card min-h-[9.5rem] flex flex-col">
      <span className={`inline-flex w-11 h-11 items-center justify-center rounded-xl shrink-0 mb-3 ${iconWrap}`}>
        <span className="w-5 h-5">{icon}</span>
      </span>
      <p className="text-xs text-app-muted leading-tight mb-1">{metric.label}</p>
      <p className="text-xl font-bold tabular-nums text-app-text leading-tight mt-auto">
        {formatValue(metric)}
      </p>
      <p className="text-[10px] text-app-muted mt-2">vs previous month</p>
    </article>
  );
}

function SkeletonFeatured() {
  return (
    <div className="rounded-2xl border border-app-border bg-app-card min-h-[9.5rem] animate-pulse" />
  );
}

export default function ExecutiveHomeKeyMetrics({
  metrics,
  loading,
}: {
  metrics?: MobileMetric[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 px-4">
        <SkeletonFeatured />
        <SkeletonFeatured />
      </div>
    );
  }

  const items = metrics ?? [];
  const featured = FEATURED_METRICS.map((def) => {
    const metric = items.find((m) => m.id === def.id);
    return metric ? { ...def, metric } : null;
  }).filter(Boolean) as Array<(typeof FEATURED_METRICS)[number] & { metric: MobileMetric }>;

  if (featured.length === 0) {
    return <p className="text-sm text-app-muted px-4">No KPI data available yet.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 px-4" role="list" aria-label="Key performance indicators">
      {featured.map(({ id, metric, icon, iconWrap }) => (
        <div key={id} role="listitem">
          <FeaturedMetricCard metric={metric} icon={icon} iconWrap={iconWrap} />
        </div>
      ))}
    </div>
  );
}
