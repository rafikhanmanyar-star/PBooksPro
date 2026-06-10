import React, { memo, useMemo, useState } from 'react';
import { HandCoins, Percent, RefreshCw, Timer, Wallet } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useStateSelector } from '../../hooks/useSelectiveState';
import Button from '../../components/ui/Button';
import {
  ChartCard,
  ColumnChart,
  DonutChart,
  HorizontalBarChart,
  MetricCard,
  MetricCardGridSkeleton,
} from '../../components/analytics';
import { CHART_COLORS } from '../../components/analytics/chartTheme';
import { useCollectionsAnalytics } from './hooks/useCollectionsAnalytics';
import { useCollectionsAnalyticsFiltersStore } from './store/collectionsAnalyticsFiltersStore';

const KPI_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  totalReceivable: Wallet,
  collectedInPeriod: HandCoins,
  collectionRate: Percent,
  overdueAmount: Timer,
  invoiceCount: HandCoins,
  periodDue: Wallet,
};

const CollectionsAnalyticsPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const projects = useStateSelector((s) => s.projects);
  const properties = useStateSelector((s) => s.properties);
  const filters = useCollectionsAnalyticsFiltersStore((s) => s.filters);
  const setFilter = useCollectionsAnalyticsFiltersStore((s) => s.setFilter);
  const [chartYear, setChartYear] = useState(() => new Date().getFullYear());

  const { data, isLoading, isFetching, isError, refetch } = useCollectionsAnalytics(isAuthenticated);

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

  const collectionsData = useMemo(
    () =>
      (data?.collectionsPerformance ?? [])
        .filter((p) => p.month.startsWith(String(chartYear)))
        .map((p) => ({ name: p.label, Due: p.due, Collected: p.collected })),
    [data?.collectionsPerformance, chartYear]
  );

  const agingBarData = useMemo(
    () =>
      (data?.receivablesAging ?? []).map((b) => ({
        label: b.label,
        value: b.value,
      })),
    [data?.receivablesAging]
  );

  const typeDonut = useMemo(
    () => (data?.invoiceTypeBreakdown ?? []).map((t) => ({ name: t.name, value: t.value })),
    [data?.invoiceTypeBreakdown]
  );

  const debtorsBarData = useMemo(
    () =>
      (data?.topDebtors ?? []).map((d) => ({
        label: d.contactName.length > 22 ? `${d.contactName.slice(0, 20)}…` : d.contactName,
        value: d.outstanding,
      })),
    [data?.topDebtors]
  );

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto p-3 md:p-4 space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-app-text flex items-center gap-2">
            <HandCoins className="w-6 h-6 text-primary" />
            Collections Analytics
          </h2>
          <p className="text-sm text-app-muted mt-1 max-w-2xl">
            Receivables, collection performance, aging buckets, and top debtors from PostgreSQL.
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
        {properties.length > 0 && (
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
          Failed to load collections analytics.{' '}
          <button type="button" className="underline" onClick={() => refetch()}>Retry</button>
        </div>
      )}

      {isLoading ? (
        <MetricCardGridSkeleton count={6} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {(data?.kpis ?? []).map((k) => {
            const Icon = KPI_ICONS[k.id] ?? HandCoins;
            return (
              <MetricCard key={k.id} label={k.label} value={k.value} format={k.format} icon={Icon} />
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <ChartCard title="Collections Performance" subtitle={`Due vs collected · ${chartYear}`} headerRight={yearSelector}>
          <ColumnChart
            data={collectionsData}
            series={[
              { key: 'Due', label: 'Due', color: CHART_COLORS.neutral },
              { key: 'Collected', label: 'Collected', color: CHART_COLORS.income },
            ]}
          />
        </ChartCard>

        <ChartCard title="Receivables Aging" subtitle="Outstanding invoice balances by bucket">
          <HorizontalBarChart data={agingBarData} emptyLabel="No outstanding receivables." />
        </ChartCard>

        <ChartCard title="Collections by Invoice Type" subtitle="Collected amount in filter period">
          <DonutChart data={typeDonut} emptyLabel="No collections in this period." />
        </ChartCard>

        <ChartCard title="Top Debtors" subtitle="Outstanding balances by contact">
          <HorizontalBarChart
            data={debtorsBarData}
            emptyLabel="No outstanding debtor balances."
          />
        </ChartCard>
      </div>
    </div>
  );
};

export default memo(CollectionsAnalyticsPage);
