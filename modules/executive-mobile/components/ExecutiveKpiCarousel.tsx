import React from 'react';
import { ICONS } from '../../../constants';
import type { MobileMetric } from '../../../types/executiveMobile.types';
import ExecutiveKpiCard from './ExecutiveKpiCard';

const KPI_ICONS: Record<string, { icon: React.ReactNode; wrap: string }> = {
  totalCashBalance: { icon: ICONS.wallet, wrap: 'bg-ds-primary/10 text-ds-primary' },
  bankBalance: { icon: ICONS.building, wrap: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  accountsReceivable: { icon: ICONS.fileText, wrap: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  accountsPayable: { icon: ICONS.wallet, wrap: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' },
  revenue: { icon: ICONS.handDollar, wrap: 'bg-teal-500/10 text-teal-600 dark:text-teal-400' },
  expenses: { icon: ICONS.creditCard, wrap: 'bg-pink-500/10 text-pink-600 dark:text-pink-400' },
  netIncome: { icon: ICONS.trendingUp, wrap: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
};

function SkeletonCard() {
  return (
    <div className="shrink-0 w-[10.5rem] h-[7.5rem] rounded-2xl bg-app-card border border-app-border animate-pulse" />
  );
}

export default function ExecutiveKpiCarousel({
  metrics,
  loading,
}: {
  metrics?: MobileMetric[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 snap-x snap-mandatory scrollbar-hide">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  const items = metrics ?? [];
  if (items.length === 0) {
    return (
      <p className="text-sm text-app-muted px-1">No KPI data available yet.</p>
    );
  }

  return (
    <div
      className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 snap-x snap-mandatory scrollbar-hide"
      role="list"
      aria-label="Key performance indicators"
    >
      {items.map((m) => {
        const style = KPI_ICONS[m.id];
        return (
          <div key={m.id} className="snap-start" role="listitem">
            <ExecutiveKpiCard
              metric={m}
              icon={style?.icon}
              iconWrap={style?.wrap}
            />
          </div>
        );
      })}
    </div>
  );
}
