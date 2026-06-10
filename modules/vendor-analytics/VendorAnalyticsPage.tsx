import React, { memo, useMemo, useState } from 'react';
import { FileText, RefreshCw, Store, TrendingDown, Users, Wallet } from 'lucide-react';
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
import { useVendorAnalytics } from './hooks/useVendorAnalytics';
import { useVendorAnalyticsFiltersStore } from './store/vendorAnalyticsFiltersStore';

const KPI_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  vendorCount: Users,
  totalPayable: Wallet,
  billsInPeriod: FileText,
  paidInPeriod: TrendingDown,
  billCount: FileText,
  activeVendors: Store,
  quotationCount: FileText,
};

const VendorAnalyticsPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const vendors = useStateSelector((s) => s.vendors);
  const filters = useVendorAnalyticsFiltersStore((s) => s.filters);
  const setFilter = useVendorAnalyticsFiltersStore((s) => s.setFilter);
  const [chartYear, setChartYear] = useState(() => new Date().getFullYear());

  const { data, isLoading, isFetching, isError, refetch } = useVendorAnalytics(isAuthenticated);

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

  const spendTrendData = useMemo(
    () =>
      (data?.spendTrend ?? [])
        .filter((p) => p.month.startsWith(String(chartYear)))
        .map((p) => ({ name: p.label, amount: p.amount })),
    [data?.spendTrend, chartYear]
  );

  const topVendorBar = useMemo(
    () =>
      (data?.topVendorsBySpend ?? []).map((v) => ({
        label: v.vendorName.length > 22 ? `${v.vendorName.slice(0, 20)}…` : v.vendorName,
        value: v.amount,
      })),
    [data?.topVendorsBySpend]
  );

  const payableBar = useMemo(
    () =>
      (data?.payableByVendor ?? []).map((v) => ({
        label: v.vendorName.length > 22 ? `${v.vendorName.slice(0, 20)}…` : v.vendorName,
        value: v.outstanding,
      })),
    [data?.payableByVendor]
  );

  const billStatusDonut = useMemo(
    () => (data?.billStatus ?? []).map((s) => ({ name: s.name, value: s.value })),
    [data?.billStatus]
  );

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto p-3 md:p-4 space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-app-text flex items-center gap-2">
            <Store className="w-6 h-6 text-primary" />
            Vendor Analytics
          </h2>
          <p className="text-sm text-app-muted mt-1 max-w-2xl">
            Vendor spend, payables, bill status, and quotation activity from PostgreSQL.
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
        {vendors.length > 0 && (
          <select
            value={filters.vendorId ?? 'all'}
            onChange={(e) => setFilter('vendorId', e.target.value === 'all' ? undefined : e.target.value)}
            className="text-xs rounded-lg border border-app-border bg-app-toolbar px-2 py-1.5 max-w-[200px]"
          >
            <option value="all">All vendors</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        )}
      </div>

      {isError && (
        <div className="rounded-xl border border-ds-danger/30 p-4 text-sm text-ds-danger">
          Failed to load vendor analytics.{' '}
          <button type="button" className="underline" onClick={() => refetch()}>Retry</button>
        </div>
      )}

      {isLoading ? (
        <MetricCardGridSkeleton count={7} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
          {(data?.kpis ?? []).map((k) => {
            const Icon = KPI_ICONS[k.id] ?? Store;
            return (
              <MetricCard key={k.id} label={k.label} value={k.value} format={k.format} icon={Icon} />
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <ChartCard title="Vendor Spend Trend" subtitle={`Bills issued · ${chartYear}`} headerRight={yearSelector}>
          <AreaTrendChart
            data={spendTrendData}
            series={[{ key: 'amount', label: 'Bill amount', color: CHART_COLORS.expense }]}
            emptyLabel="No vendor bills for this year."
          />
        </ChartCard>

        <ChartCard title="Top Vendors by Spend" subtitle="Bill amounts in filter period">
          <HorizontalBarChart data={topVendorBar} emptyLabel="No vendor spend in this period." />
        </ChartCard>

        <ChartCard title="Outstanding Payables" subtitle="Unpaid balances by vendor">
          <HorizontalBarChart data={payableBar} emptyLabel="No outstanding vendor payables." />
        </ChartCard>

        <ChartCard title="Bill Status" subtitle="Bills issued in filter period">
          <DonutChart data={billStatusDonut} emptyLabel="No bills in this period." />
        </ChartCard>
      </div>
    </div>
  );
};

export default memo(VendorAnalyticsPage);
