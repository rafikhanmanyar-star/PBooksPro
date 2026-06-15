import React from 'react';
import type { ExecutiveCommandCenterResponse } from '../../../types/executiveMobile.types';
import { ICONS } from '../../../constants';
import ExecutiveSparkline, { sparklineFromTrend } from './ExecutiveSparkline';
import { formatExecutiveValue, formatTrend } from '../utils/executiveFormatters';

type Props = {
  financial: ExecutiveCommandCenterResponse['financial'];
  onViewAll?: () => void;
};

function MetricCell({
  label,
  value,
  trend,
  sparkColor,
}: {
  label: string;
  value: number;
  trend?: number | null;
  sparkColor: string;
}) {
  const trendStr = formatTrend(trend);
  const up = (trend ?? 0) >= 0;
  return (
    <div className="executive-section-metric">
      <p className="text-[10px] text-app-muted">{label}</p>
      <p className="text-sm font-bold tabular-nums text-app-text mt-0.5">
        {formatExecutiveValue(value)}
      </p>
      {trendStr && (
        <p className={`text-[10px] font-semibold mt-0.5 ${up ? 'text-emerald-600' : 'text-ds-danger'}`}>
          {trendStr}
        </p>
      )}
      <ExecutiveSparkline
        values={sparklineFromTrend(value, trend)}
        color={sparkColor}
        className="mt-2"
      />
    </div>
  );
}

export default function ExecutiveFinancialOverview({ financial, onViewAll }: Props) {
  return (
    <section className="mx-4 rounded-2xl border border-app-border/60 bg-app-card shadow-ds-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-app-border/40">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 text-ds-primary">{ICONS.trendingUp}</span>
          <h2 className="text-sm font-bold text-app-text">Financial Overview</h2>
        </div>
        {onViewAll && (
          <button type="button" onClick={onViewAll} className="text-xs font-semibold text-ds-primary touch-manipulation">
            View All
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-app-border/40">
        <MetricCell
          label="Cash Position"
          value={financial.cashPosition.value}
          trend={financial.cashPosition.trend}
          sparkColor="rgb(16 185 129)"
        />
        <MetricCell
          label="Receivables"
          value={financial.receivables.value}
          trend={financial.receivables.trend}
          sparkColor="rgb(59 130 246)"
        />
        <MetricCell
          label="Payables"
          value={financial.payables.value}
          trend={financial.payables.trend}
          sparkColor="rgb(245 158 11)"
        />
        <MetricCell
          label="Net Position"
          value={financial.netPosition.value}
          trend={financial.netPosition.trend}
          sparkColor="rgb(16 185 129)"
        />
      </div>
    </section>
  );
}
