import React from 'react';
import type { ExecutiveCommandCenterResponse } from '../../../types/executiveMobile.types';
import { ICONS } from '../../../constants';
import { formatExecutiveValue, formatTrend } from '../utils/executiveFormatters';

type Props = {
  projects: ExecutiveCommandCenterResponse['projects'];
  onViewAll?: () => void;
};

export default function ExecutiveProjectsOperations({ projects, onViewAll }: Props) {
  const trackPct = projects.onTrackPercent;
  const delayPct = projects.activeProjects > 0 ? 100 - trackPct : 0;

  return (
    <section className="mx-4 rounded-2xl border border-app-border/60 bg-app-card shadow-ds-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-app-border/40">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 text-ds-primary">{ICONS.building}</span>
          <h2 className="text-sm font-bold text-app-text">Projects &amp; Operations</h2>
        </div>
        {onViewAll && (
          <button type="button" onClick={onViewAll} className="text-xs font-semibold text-ds-primary touch-manipulation">
            View All
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-px bg-app-border/30">
        <div className="bg-app-card p-3">
          <p className="text-[10px] text-app-muted">Active Projects</p>
          <p className="text-lg font-bold tabular-nums">{projects.activeProjects}</p>
          {projects.activeProjectsTrend != null && (
            <p className="text-[10px] text-emerald-600 font-semibold">{formatTrend(projects.activeProjectsTrend)} this month</p>
          )}
        </div>
        <div className="bg-app-card p-3">
          <p className="text-[10px] text-app-muted">On Track</p>
          <p className="text-lg font-bold tabular-nums text-emerald-600">{projects.onTrack}</p>
          <p className="text-[10px] text-app-muted">{trackPct}%</p>
        </div>
        <div className="bg-app-card p-3">
          <p className="text-[10px] text-app-muted">Delayed</p>
          <p className="text-lg font-bold tabular-nums text-amber-500">{projects.delayed}</p>
          <p className="text-[10px] text-app-muted">{delayPct}%</p>
        </div>
        <div className="bg-app-card p-3">
          <p className="text-[10px] text-app-muted">Contract Value</p>
          <p className="text-sm font-bold tabular-nums">{formatExecutiveValue(projects.contractValue)}</p>
          {projects.contractValueTrend != null && (
            <p className="text-[10px] text-emerald-600 font-semibold">{formatTrend(projects.contractValueTrend)}</p>
          )}
        </div>
      </div>
      <div className="px-4 py-3">
        <div className="h-2 rounded-full overflow-hidden flex bg-app-border/40">
          <div className="bg-emerald-500 h-full transition-all" style={{ width: `${trackPct}%` }} />
          <div className="bg-amber-500 h-full transition-all" style={{ width: `${delayPct}%` }} />
        </div>
      </div>
    </section>
  );
}
