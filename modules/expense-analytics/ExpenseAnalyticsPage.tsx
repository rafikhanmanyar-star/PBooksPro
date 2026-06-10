import React, { memo, useEffect, useMemo, useState } from 'react';
import { FileText, Receipt, RefreshCw, TrendingDown, Wallet } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useStateSelector } from '../../hooks/useSelectiveState';
import Button from '../../components/ui/Button';
import {
  AreaTrendChart,
  ChartCard,
  DonutChart,
  HorizontalBarChart,
  MetricCard,
  MetricCardGridSkeleton,
} from '../../components/analytics';
import { CHART_COLORS } from '../../components/analytics/chartTheme';
import type { ExpenseScope } from '../../types/expenseAnalytics.types';
import { useExpenseAnalytics } from './hooks/useExpenseAnalytics';
import { useExpenseAnalyticsFiltersStore } from './store/expenseAnalyticsFiltersStore';

const KPI_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  totalExpenses: TrendingDown,
  billsIssued: FileText,
  billsPaid: Wallet,
  unpaidBills: Receipt,
  billCount: FileText,
  topVendor: Receipt,
};

export interface ExpenseAnalyticsPageProps {
  defaultScope?: ExpenseScope;
  showScopeFilter?: boolean;
}

const ExpenseAnalyticsPage: React.FC<ExpenseAnalyticsPageProps> = ({
  defaultScope = 'all',
  showScopeFilter = true,
}) => {
  const { isAuthenticated } = useAuth();
  const projects = useStateSelector((s) => s.projects);
  const properties = useStateSelector((s) => s.properties);
  const filters = useExpenseAnalyticsFiltersStore((s) => s.filters);
  const setFilter = useExpenseAnalyticsFiltersStore((s) => s.setFilter);
  const [chartYear, setChartYear] = useState(() => new Date().getFullYear());

  useEffect(() => {
    if (defaultScope !== 'all' && filters.scope !== defaultScope) {
      setFilter('scope', defaultScope);
    }
  }, [defaultScope, filters.scope, setFilter]);

  const { data, isLoading, isFetching, isError, refetch } = useExpenseAnalytics(isAuthenticated);

  const yearSelector = (
    <select
      value={chartYear}
      onChange={(e) => setChartYear(Number(e.target.value))}
      className="text-xs rounded-lg border border-app-border bg-app-toolbar px-2 py-1.5 text-app-text"
    >
      {[chartYear, chartYear - 1, chartYear - 2].map((y) => (
        <option key={y} value={y}>{y}</option>
      ))}
    </select>
  );

  const trendData = useMemo(
    () =>
      (data?.expenseTrend ?? [])
        .filter((p) => p.month.startsWith(String(chartYear)))
        .map((p) => ({ name: p.label, amount: p.amount })),
    [data?.expenseTrend, chartYear]
  );

  const categoryDonut = useMemo(
    () => (data?.categoryBreakdown ?? []).map((c) => ({ name: c.name, value: c.value })),
    [data?.categoryBreakdown]
  );

  const billStatusDonut = useMemo(
    () => (data?.billStatus ?? []).map((c) => ({ name: c.name, value: c.value })),
    [data?.billStatus]
  );

  const vendorBarData = useMemo(
    () =>
      (data?.vendorSpend ?? []).map((v) => ({
        label: v.vendorName.length > 22 ? `${v.vendorName.slice(0, 20)}…` : v.vendorName,
        value: v.amount,
      })),
    [data?.vendorSpend]
  );

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto p-3 md:p-4 space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-app-text flex items-center gap-2">
            <Receipt className="w-6 h-6 text-primary" />
            Expense Analytics
          </h2>
          <p className="text-sm text-app-muted mt-1 max-w-2xl">
            Bills, vendor spend, and expense transactions aggregated from PostgreSQL.
          </p>
        </div>
        <Button variant="secondary" onClick={() => refetch()} className="text-xs gap-1" disabled={isFetching}>
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-app-border bg-app-card">
        <input
          type="date"
          value={filters.from}
          onChange={(e) => setFilter('from', e.target.value)}
          className="text-xs rounded-lg border border-app-border bg-app-toolbar px-2 py-1.5"
        />
        <span className="text-app-muted text-xs">to</span>
        <input
          type="date"
          value={filters.to}
          onChange={(e) => setFilter('to', e.target.value)}
          className="text-xs rounded-lg border border-app-border bg-app-toolbar px-2 py-1.5"
        />
        {showScopeFilter && (
          <select
            value={filters.scope ?? 'all'}
            onChange={(e) => setFilter('scope', e.target.value as ExpenseScope)}
            className="text-xs rounded-lg border border-app-border bg-app-toolbar px-2 py-1.5"
          >
            <option value="all">All expenses</option>
            <option value="project">Project bills</option>
            <option value="rental">Rental bills</option>
          </select>
        )}
        {projects.length > 0 && (filters.scope === 'project' || filters.scope === 'all') && (
          <select
            value={filters.projectId ?? 'all'}
            onChange={(e) => setFilter('projectId', e.target.value === 'all' ? undefined : e.target.value)}
            className="text-xs rounded-lg border border-app-border bg-app-toolbar px-2 py-1.5 max-w-[180px]"
          >
            <option value="all">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
        {properties.length > 0 && (filters.scope === 'rental' || filters.scope === 'all') && (
          <select
            value={filters.propertyId ?? 'all'}
            onChange={(e) => setFilter('propertyId', e.target.value === 'all' ? undefined : e.target.value)}
            className="text-xs rounded-lg border border-app-border bg-app-toolbar px-2 py-1.5 max-w-[180px]"
          >
            <option value="all">All properties</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {isError && (
        <div className="rounded-xl border border-ds-danger/30 p-4 text-sm text-ds-danger">
          Failed to load expense analytics.{' '}
          <button type="button" className="underline" onClick={() => refetch()}>Retry</button>
        </div>
      )}

      {isLoading ? (
        <MetricCardGridSkeleton count={6} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {(data?.kpis ?? []).map((k) => {
            const Icon = KPI_ICONS[k.id] ?? Receipt;
            return (
              <MetricCard key={k.id} label={k.label} value={k.value} format={k.format} icon={Icon} />
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <ChartCard title="Expense Trend" subtitle={`Monthly expenses · ${chartYear}`} headerRight={yearSelector}>
          <AreaTrendChart
            data={trendData}
            series={[{ key: 'amount', label: 'Expenses', color: CHART_COLORS.expense }]}
            emptyLabel="No expense transactions for this year."
          />
        </ChartCard>

        <ChartCard title="Category Breakdown" subtitle="Top expense categories">
          <DonutChart data={categoryDonut} emptyLabel="No categorized expenses in this period." />
        </ChartCard>

        <ChartCard title="Bill Status" subtitle="Bills issued in filter period">
          <DonutChart data={billStatusDonut} emptyLabel="No bills in this period." />
        </ChartCard>

        <ChartCard title="Vendor Spend" subtitle="Top vendors by bill amount">
          <HorizontalBarChart data={vendorBarData} emptyLabel="No vendor bills in this period." />
        </ChartCard>
      </div>
    </div>
  );
};

export default memo(ExpenseAnalyticsPage);
