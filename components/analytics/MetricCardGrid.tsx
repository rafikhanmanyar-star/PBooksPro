import React from 'react';
import type { LucideIcon } from 'lucide-react';
import type { DashboardMetricValue } from '../../types/dashboardMetrics.types';
import { MetricCard } from './MetricCard';
import { MetricCardGridSkeleton } from './MetricCardSkeleton';

const METRIC_ICONS: Record<string, LucideIcon | undefined> = {};

export interface MetricCardGridProps {
  title?: string;
  metrics: DashboardMetricValue[];
  isLoading?: boolean;
  iconMap?: Record<string, LucideIcon>;
  onMetricClick?: (metric: DashboardMetricValue) => void;
  columns?: 2 | 3 | 4;
}

export const MetricCardGrid: React.FC<MetricCardGridProps> = ({
  title,
  metrics,
  isLoading,
  iconMap = METRIC_ICONS,
  onMetricClick,
  columns = 4,
}) => {
  const colClass =
    columns === 2
      ? 'sm:grid-cols-2'
      : columns === 3
        ? 'sm:grid-cols-2 lg:grid-cols-3'
        : 'sm:grid-cols-2 lg:grid-cols-4';

  if (isLoading) {
    return (
      <section>
        {title && <h2 className="text-sm font-bold text-app-text uppercase tracking-wide mb-3">{title}</h2>}
        <MetricCardGridSkeleton count={metrics.length || columns} />
      </section>
    );
  }

  return (
    <section>
      {title && <h2 className="text-sm font-bold text-app-text uppercase tracking-wide mb-3">{title}</h2>}
      <div className={`grid grid-cols-1 ${colClass} gap-3 md:gap-4`}>
        {metrics.map((m) => (
          <MetricCard
            key={m.id}
            label={m.label}
            value={m.value}
            format={m.format}
            icon={iconMap[m.id]}
            trendPercent={m.trendPercent}
            previousValue={m.previousValue}
            status={m.status}
            description={m.description}
            onClick={onMetricClick ? () => onMetricClick(m) : undefined}
          />
        ))}
      </div>
    </section>
  );
};

export default MetricCardGrid;
