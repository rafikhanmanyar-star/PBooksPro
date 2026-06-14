import React, { memo, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  HandCoins,
  Percent,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useStateSelector } from '../../hooks/useSelectiveState';
import Button from '../../components/ui/Button';
import {
  AreaTrendChart,
  ChartCard,
  ColumnChart,
  DonutChart,
  HorizontalBarChart,
  MetricCard,
  MetricCardGridSkeleton,
} from '../../components/analytics';
import { CHART_COLORS } from '../../components/analytics/chartTheme';
import { useSellingAnalytics } from './hooks/useSellingAnalytics';
import { useSellingAnalyticsFiltersStore } from './store/sellingAnalyticsFiltersStore';

const KPI_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  totalSalesValue: TrendingUp,
  agreementsSigned: Users,
  unitsSold: Building2,
  unitsAvailable: Building2,
  collectedInPeriod: HandCoins,
  outstandingReceivable: HandCoins,
  collectionRate: Percent,
  marketingPlans: ShoppingBag,
  salesReturns: ShoppingBag,
};

const SALES_TREND_SERIES = [{ key: 'salesValue', label: 'Sales value', color: CHART_COLORS.profit }] as const;

const ChartSkeleton: React.FC = () => (
  <div className="h-[280px] w-full rounded-xl bg-app-toolbar/50 animate-pulse" />
);

const SellingAnalyticsPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const projects = useStateSelector((s) => s.projects);
  const filters = useSellingAnalyticsFiltersStore((s) => s.filters);
  const setFilter = useSellingAnalyticsFiltersStore((s) => s.setFilter);
  const [chartYear, setChartYear] = useState(() => new Date().getFullYear());
  const [layoutReady, setLayoutReady] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setLayoutReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const { data, isLoading, isFetching, isError, refetch } = useSellingAnalytics(isAuthenticated);
  const chartsReady = layoutReady && !isLoading;

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

  const salesTrendData = useMemo(
    () =>
      (data?.salesTrend ?? [])
        .filter((p) => p.month.startsWith(String(chartYear)))
        .map((p) => ({ name: p.label, salesValue: p.salesValue })),
    [data?.salesTrend, chartYear]
  );

  const collectionTrendData = useMemo(
    () =>
      (data?.collectionTrend ?? [])
        .filter((p) => p.month.startsWith(String(chartYear)))
        .map((p) => ({ name: p.label, Invoiced: p.invoiced, Collected: p.collected })),
    [data?.collectionTrend, chartYear]
  );

  const unitPipelineDonut = useMemo(
    () => (data?.unitPipeline ?? []).map((c) => ({ name: c.name, value: c.value })),
    [data?.unitPipeline]
  );

  const agreementStatusDonut = useMemo(
    () => (data?.agreementStatus ?? []).map((c) => ({ name: c.name, value: c.value })),
    [data?.agreementStatus]
  );

  const topProjectsBarData = useMemo(
    () =>
      (data?.topProjects ?? []).map((p) => ({
        label: p.projectName.length > 22 ? `${p.projectName.slice(0, 20)}…` : p.projectName,
        value: p.salesValue,
      })),
    [data?.topProjects]
  );

  const showTopProjects = !filters.projectId && topProjectsBarData.length > 0;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto p-3 md:p-4 space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-app-text flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" />
            Selling Analytics
          </h2>
          <p className="text-sm text-app-muted mt-1 max-w-2xl">
            Agreements, unit sales, collections, and marketing plans aggregated from PostgreSQL.
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
        {projects.length > 0 && (
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
      </div>

      {isError && (
        <div className="rounded-xl border border-ds-danger/30 p-4 text-sm text-ds-danger">
          Failed to load selling analytics.{' '}
          <button type="button" className="underline" onClick={() => refetch()}>Retry</button>
        </div>
      )}

      {isLoading ? (
        <MetricCardGridSkeleton count={6} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {(data?.kpis ?? []).map((k) => {
            const Icon = KPI_ICONS[k.id] ?? TrendingUp;
            return (
              <MetricCard key={k.id} label={k.label} value={k.value} format={k.format} icon={Icon} />
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <ChartCard title="Sales Trend" subtitle={`Agreement value by month · ${chartYear}`} headerRight={yearSelector}>
          {chartsReady ? (
            <AreaTrendChart
              data={salesTrendData}
              series={SALES_TREND_SERIES}
              emptyLabel="No agreements signed for this year."
            />
          ) : (
            <ChartSkeleton />
          )}
        </ChartCard>

        <ChartCard title="Collection Trend" subtitle={`Invoiced vs collected · ${chartYear}`} headerRight={yearSelector}>
          {chartsReady ? (
            <ColumnChart
              data={collectionTrendData}
              series={[
                { key: 'Invoiced', label: 'Invoiced', color: CHART_COLORS.neutral },
                { key: 'Collected', label: 'Collected', color: CHART_COLORS.income },
              ]}
              emptyLabel="No installment invoices for this year."
            />
          ) : (
            <ChartSkeleton />
          )}
        </ChartCard>

        <ChartCard title="Unit Pipeline" subtitle="Available, reserved, and sold units">
          {chartsReady ? (
            <DonutChart data={unitPipelineDonut} emptyLabel="No units found for this project." />
          ) : (
            <ChartSkeleton />
          )}
        </ChartCard>

        <ChartCard title="Agreement Status" subtitle="All agreements (current snapshot)">
          {chartsReady ? (
            <DonutChart data={agreementStatusDonut} emptyLabel="No agreements found." />
          ) : (
            <ChartSkeleton />
          )}
        </ChartCard>

        {showTopProjects && (
          <ChartCard title="Top Projects by Sales" subtitle="Agreement value in filter period" className="lg:col-span-2">
            {chartsReady ? (
              <HorizontalBarChart data={topProjectsBarData} emptyLabel="No sales in this period." />
            ) : (
              <ChartSkeleton />
            )}
          </ChartCard>
        )}
      </div>
    </div>
  );
};

export default memo(SellingAnalyticsPage);
