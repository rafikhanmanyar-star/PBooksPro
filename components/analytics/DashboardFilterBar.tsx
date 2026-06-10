import React from 'react';
import { Calendar, Filter, RotateCcw } from 'lucide-react';
import Button from '../ui/Button';
import type { DashboardComparisonPeriod, DashboardDatePreset } from '../../types/dashboardMetrics.types';
import { useDashboardFiltersStore } from '../../stores/dashboardFiltersStore';
import { DashboardSavedViews } from './DashboardSavedViews';

const DATE_PRESETS: { id: DashboardDatePreset; label: string }[] = [
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'this_quarter', label: 'This quarter' },
  { id: 'this_year', label: 'This year' },
  { id: 'last_30_days', label: 'Last 30 days' },
];

const COMPARISON_OPTIONS: { id: DashboardComparisonPeriod; label: string }[] = [
  { id: 'previous_period', label: 'vs prior period' },
  { id: 'previous_year', label: 'vs prior year' },
  { id: 'none', label: 'No comparison' },
];

export interface DashboardFilterBarProps {
  projectOptions?: { id: string; name: string }[];
  showProjectFilter?: boolean;
  className?: string;
}

export const DashboardFilterBar: React.FC<DashboardFilterBarProps> = ({
  projectOptions = [],
  showProjectFilter = true,
  className = '',
}) => {
  const filters = useDashboardFiltersStore((s) => s.filters);
  const datePreset = useDashboardFiltersStore((s) => s.datePreset);
  const setFilter = useDashboardFiltersStore((s) => s.setFilter);
  const setDatePreset = useDashboardFiltersStore((s) => s.setDatePreset);
  const setDateRange = useDashboardFiltersStore((s) => s.setDateRange);
  const resetFilters = useDashboardFiltersStore((s) => s.resetFilters);

  return (
    <div
      className={`flex flex-col lg:flex-row lg:items-center gap-3 p-3 md:p-4 rounded-2xl border border-app-border bg-app-card/80 backdrop-blur-sm ${className}`}
    >
      <div className="flex items-center gap-2 text-app-muted shrink-0">
        <Filter className="w-4 h-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">Filters</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 flex-1">
        {DATE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setDatePreset(p.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              datePreset === p.id
                ? 'bg-primary text-white shadow-sm'
                : 'bg-app-toolbar text-app-muted hover:text-app-text border border-app-border'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-app-muted">
          <Calendar className="w-3.5 h-3.5" />
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setDateRange(e.target.value, filters.to)}
            className="text-xs rounded-lg border border-app-border bg-app-toolbar px-2 py-1.5 text-app-text"
          />
          <span className="text-xs">–</span>
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setDateRange(filters.from, e.target.value)}
            className="text-xs rounded-lg border border-app-border bg-app-toolbar px-2 py-1.5 text-app-text"
          />
        </div>

        <select
          value={filters.comparisonPeriod}
          onChange={(e) => setFilter('comparisonPeriod', e.target.value as DashboardComparisonPeriod)}
          className="text-xs rounded-lg border border-app-border bg-app-toolbar px-2 py-1.5 text-app-text"
        >
          {COMPARISON_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>

        {showProjectFilter && projectOptions.length > 0 && (
          <select
            value={filters.projectId ?? 'all'}
            onChange={(e) =>
              setFilter('projectId', e.target.value === 'all' ? undefined : e.target.value)
            }
            className="text-xs rounded-lg border border-app-border bg-app-toolbar px-2 py-1.5 text-app-text max-w-[160px]"
          >
            <option value="all">All projects</option>
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}

        <DashboardSavedViews />

        <Button variant="secondary" onClick={resetFilters} className="text-xs h-8 px-2 gap-1">
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </Button>
      </div>
    </div>
  );
};

export default DashboardFilterBar;
