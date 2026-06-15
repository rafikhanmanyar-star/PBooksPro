import React from 'react';
import type { ExecutiveCommandCenterResponse } from '../../../types/executiveMobile.types';
import { ICONS } from '../../../constants';
import { formatExecutiveValue, formatTrend } from '../utils/executiveFormatters';

type Props = {
  collections: ExecutiveCommandCenterResponse['collections'];
  onViewAll?: () => void;
};

export default function ExecutiveCollectionsHealth({ collections, onViewAll }: Props) {
  return (
    <section className="mx-4 rounded-2xl border border-app-border/60 bg-app-card shadow-ds-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-app-border/40">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 text-ds-primary">{ICONS.clock}</span>
          <h2 className="text-sm font-bold text-app-text">Collections Health</h2>
        </div>
        {onViewAll && (
          <button type="button" onClick={onViewAll} className="text-xs font-semibold text-ds-primary touch-manipulation">
            View All
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-px bg-app-border/30">
        <div className="bg-app-card p-3">
          <p className="text-[10px] text-app-muted">This Month</p>
          <p className="text-sm font-bold tabular-nums">{formatExecutiveValue(collections.thisMonth)}</p>
          {collections.thisMonthTrend != null && (
            <p className="text-[10px] text-emerald-600 font-semibold">{formatTrend(collections.thisMonthTrend)}</p>
          )}
        </div>
        <div className="bg-app-card p-3">
          <p className="text-[10px] text-app-muted">Overdue</p>
          <p className="text-sm font-bold tabular-nums text-ds-danger">{formatExecutiveValue(collections.overdue)}</p>
          {collections.overdueTrend != null && (
            <p className="text-[10px] text-ds-danger font-semibold">{formatTrend(collections.overdueTrend)}</p>
          )}
        </div>
        <div className="bg-app-card p-3">
          <p className="text-[10px] text-app-muted">Collection Efficiency</p>
          <p className="text-lg font-bold tabular-nums">{collections.collectionEfficiency.toFixed(0)}%</p>
          {collections.efficiencyTrend != null && (
            <p className="text-[10px] text-emerald-600 font-semibold">{formatTrend(collections.efficiencyTrend)}</p>
          )}
        </div>
        <div className="bg-app-card p-3">
          <p className="text-[10px] text-app-muted">Top Overdue</p>
          <p className="text-sm font-bold tabular-nums">{formatExecutiveValue(collections.topOverdueAmount)}</p>
          <p className="text-[10px] text-app-muted">{collections.topOverdueCustomers} Customers</p>
        </div>
      </div>
    </section>
  );
}
