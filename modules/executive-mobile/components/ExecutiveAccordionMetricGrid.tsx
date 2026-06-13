import React, { type ReactNode } from 'react';
import { CURRENCY, ICONS } from '../../../constants';
import type { MobileMetric } from '../../../types/executiveMobile.types';

const SHORT_LABELS: Record<string, string> = {
  budgetUtilization: 'Budget Util.',
  pendingBillAmount: 'Pending Amt.',
  activeProjects: 'Active Projects',
  pendingBills: 'Pending Bills',
};

const METRIC_ICONS: Record<string, { icon: ReactNode; wrap: string }> = {
  activeProjects: { icon: ICONS.barChart, wrap: 'executive-metric-icon executive-metric-icon--teal' },
  budgetUtilization: { icon: ICONS.pieChart, wrap: 'executive-metric-icon executive-metric-icon--violet' },
  pendingBills: { icon: ICONS.barChart, wrap: 'executive-metric-icon executive-metric-icon--amber' },
  pendingBillAmount: { icon: ICONS.clock, wrap: 'executive-metric-icon executive-metric-icon--rose' },
  customers: { icon: ICONS.users, wrap: 'executive-metric-icon executive-metric-icon--teal' },
  leads: { icon: ICONS.trendingUp, wrap: 'executive-metric-icon executive-metric-icon--violet' },
  totalCashBalance: { icon: ICONS.creditCard, wrap: 'executive-metric-icon executive-metric-icon--teal' },
  accountsReceivable: { icon: ICONS.fileText, wrap: 'executive-metric-icon executive-metric-icon--violet' },
};

function formatValue(metric: MobileMetric): string {
  const v = metric.value;
  if (metric.format === 'percent') return `${v.toFixed(1)}%`;
  if (metric.format === 'number') return v.toLocaleString();
  return `${CURRENCY} ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function AccordionMetricCell({ metric }: { metric: MobileMetric }) {
  const style = METRIC_ICONS[metric.id] ?? {
    icon: ICONS.barChart,
    wrap: 'executive-metric-icon executive-metric-icon--muted',
  };
  const label = SHORT_LABELS[metric.id] ?? metric.label;

  return (
    <div className="executive-accordion-metric rounded-xl border border-app-border/50 bg-app-surface-2/80 p-3 min-h-[5.5rem] flex flex-col">
      <span className={`inline-flex w-8 h-8 items-center justify-center rounded-lg shrink-0 mb-2 ${style.wrap}`}>
        <span className="w-4 h-4">{style.icon}</span>
      </span>
      <p className="text-[10px] text-app-muted leading-tight line-clamp-2">{label}</p>
      <p className="text-sm font-bold tabular-nums text-app-text mt-auto pt-1">{formatValue(metric)}</p>
    </div>
  );
}

export default function ExecutiveAccordionMetricGrid({
  metrics,
  loading,
}: {
  metrics?: MobileMetric[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[5.5rem] rounded-xl bg-app-surface-2 animate-pulse" />
        ))}
      </div>
    );
  }

  const items = (metrics ?? []).slice(0, 4);
  if (items.length === 0) {
    return <p className="text-sm text-app-muted py-2">No metrics for this period.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((m) => (
        <AccordionMetricCell key={m.id} metric={m} />
      ))}
    </div>
  );
}
