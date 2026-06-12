import React from 'react';
import { CURRENCY } from '../../../constants';
import type { MobileMetric } from '../../../types/executiveMobile.types';

function formatValue(metric: MobileMetric): string {
  const v = metric.value;
  if (metric.format === 'percent') return `${v.toFixed(1)}%`;
  if (metric.format === 'number') return v.toLocaleString();
  return `${CURRENCY} ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
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
          <div key={i} className="h-24 rounded-xl bg-app-card border border-app-border animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {(metrics ?? []).map((m) => (
        <div
          key={m.id}
          className="rounded-xl border border-app-border bg-app-card p-4 shadow-sm touch-manipulation"
        >
          <p className="text-xs text-app-muted leading-tight mb-2">{m.label}</p>
          <p className="text-lg font-bold text-app-text tabular-nums">{formatValue(m)}</p>
        </div>
      ))}
    </div>
  );
}
