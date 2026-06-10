import React, { memo, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useStateSelector } from '../../hooks/useSelectiveState';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/ui/Button';
import {
  AreaTrendChart,
  ChartCard,
  ColumnChart,
  HorizontalBarChart,
  MetricCard,
  MetricCardGridSkeleton,
} from '../../components/analytics';
import { CHART_COLORS } from '../../components/analytics/chartTheme';
import { useRentalAnalytics } from './hooks/useRentalAnalytics';
import { useRentalAnalyticsFiltersStore } from './store/rentalAnalyticsFiltersStore';
import {
  Building2,
  CalendarClock,
  HandCoins,
  Percent,
  Shield,
  Users,
} from 'lucide-react';

const KPI_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  occupancyRate: Percent,
  monthlyRentalIncome: HandCoins,
  outstandingRent: HandCoins,
  expiringAgreements: CalendarClock,
  securityDeposits: Shield,
  activeTenants: Users,
};

const RentalAnalyticsPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const properties = useStateSelector((s) => s.properties);
  const buildings = useStateSelector((s) => s.buildings);
  const filters = useRentalAnalyticsFiltersStore((s) => s.filters);
  const setFilter = useRentalAnalyticsFiltersStore((s) => s.setFilter);
  const [chartYear, setChartYear] = useState(() => new Date().getFullYear());

  const { data, isLoading, isFetching, isError, refetch } = useRentalAnalytics(isAuthenticated);

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

  const occupancyChartData = useMemo(
    () =>
      (data?.occupancyTrend ?? [])
        .filter((p) => p.month.startsWith(String(chartYear)))
        .map((p) => ({ name: p.label, rate: p.rate, occupied: p.occupied })),
    [data?.occupancyTrend, chartYear]
  );

  const collectionChartData = useMemo(
    () =>
      (data?.rentCollectionTrend ?? [])
        .filter((p) => p.month.startsWith(String(chartYear)))
        .map((p) => ({ name: p.label, Due: p.due, Collected: p.collected })),
    [data?.rentCollectionTrend, chartYear]
  );

  const propertyBarData = useMemo(
    () =>
      (data?.propertyPerformance ?? []).map((p) => ({
        label: p.propertyName.length > 20 ? `${p.propertyName.slice(0, 18)}…` : p.propertyName,
        value: p.collected,
      })),
    [data?.propertyPerformance]
  );

  const leaseExpiryData = useMemo(
    () =>
      (data?.leaseExpiryForecast ?? []).map((p) => ({
        name: p.label,
        count: p.count,
      })),
    [data?.leaseExpiryForecast]
  );

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto p-3 md:p-4 space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-app-text flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" />
            Rental Analytics
          </h2>
          <p className="text-sm text-app-muted mt-1 max-w-2xl">
            Occupancy, rent collection, property performance, and lease expiry — aggregated from PostgreSQL.
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
        {buildings.length > 0 && (
          <select
            value={filters.buildingId ?? 'all'}
            onChange={(e) => setFilter('buildingId', e.target.value === 'all' ? undefined : e.target.value)}
            className="text-xs rounded-lg border border-app-border bg-app-toolbar px-2 py-1.5 max-w-[180px]"
          >
            <option value="all">All buildings</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
      </div>

      {isError && (
        <div className="rounded-xl border border-ds-danger/30 p-4 text-sm text-ds-danger">
          Failed to load rental analytics. <button type="button" className="underline" onClick={() => refetch()}>Retry</button>
        </div>
      )}

      {isLoading ? (
        <MetricCardGridSkeleton count={6} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {(data?.kpis ?? []).map((k) => {
            const Icon = KPI_ICONS[k.id] ?? Building2;
            return (
              <MetricCard
                key={k.id}
                label={k.label}
                value={k.value}
                format={k.format}
                icon={Icon}
              />
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <ChartCard title="Occupancy Trend" subtitle={`Occupancy % · ${chartYear}`} headerRight={yearSelector}>
          <AreaTrendChart
            data={occupancyChartData}
            series={[{ key: 'rate', label: 'Occupancy %', color: CHART_COLORS.profit }]}
            emptyLabel="No occupancy data for this year."
          />
        </ChartCard>

        <ChartCard title="Rent Collection Trend" subtitle={`Due vs collected · ${chartYear}`} headerRight={yearSelector}>
          <ColumnChart
            data={collectionChartData}
            series={[
              { key: 'Due', label: 'Due', color: CHART_COLORS.neutral },
              { key: 'Collected', label: 'Collected', color: CHART_COLORS.income },
            ]}
          />
        </ChartCard>

        <ChartCard title="Property Performance" subtitle="Rent collected in filter period">
          <HorizontalBarChart data={propertyBarData} emptyLabel="No property collections in this period." />
        </ChartCard>

        <ChartCard title="Lease Expiry Forecast" subtitle="Active agreements ending by month">
          <ColumnChart
            data={leaseExpiryData}
            series={[{ key: 'count', label: 'Expiring', color: CHART_COLORS.expense }]}
          />
        </ChartCard>
      </div>
    </div>
  );
};

export default memo(RentalAnalyticsPage);
