import React, { memo, useMemo, useState } from 'react';
import { ArrowLeftRight, Landmark, RefreshCw, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useStateSelector } from '../../hooks/useSelectiveState';
import { AccountType } from '../../types';
import Button from '../../components/ui/Button';
import {
  AreaTrendChart,
  ChartCard,
  DonutChart,
  HorizontalBarChart,
  MetricCard,
  MetricCardGridSkeleton,
  StackedAreaChart,
} from '../../components/analytics';
import { CHART_COLORS } from '../../components/analytics/chartTheme';
import { useBankingAnalytics } from './hooks/useBankingAnalytics';
import { useBankingAnalyticsFiltersStore } from './store/bankingAnalyticsFiltersStore';

const KPI_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  totalBalance: Wallet,
  accountCount: Landmark,
  inflows: TrendingUp,
  outflows: TrendingDown,
  netCashFlow: TrendingUp,
  transferCount: ArrowLeftRight,
};

const BankingAnalyticsPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const accounts = useStateSelector((s) => s.accounts);
  const filters = useBankingAnalyticsFiltersStore((s) => s.filters);
  const setFilter = useBankingAnalyticsFiltersStore((s) => s.setFilter);
  const [chartYear, setChartYear] = useState(() => new Date().getFullYear());

  const { data, isLoading, isFetching, isError, refetch } = useBankingAnalytics(isAuthenticated);

  const cashAccounts = useMemo(
    () => accounts.filter((a) => a.type === AccountType.BANK || a.type === AccountType.CASH),
    [accounts]
  );

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

  const cashFlowData = useMemo(
    () =>
      (data?.cashFlowTrend ?? [])
        .filter((p) => p.month.startsWith(String(chartYear)))
        .map((p) => ({ name: p.label, Inflow: p.inflow, Outflow: p.outflow, Net: p.net })),
    [data?.cashFlowTrend, chartYear]
  );

  const netCashData = useMemo(
    () =>
      (data?.cashFlowTrend ?? [])
        .filter((p) => p.month.startsWith(String(chartYear)))
        .map((p) => ({ name: p.label, net: p.net })),
    [data?.cashFlowTrend, chartYear]
  );

  const accountBarData = useMemo(
    () =>
      (data?.accountBalances ?? []).map((a) => ({
        label: a.accountName.length > 24 ? `${a.accountName.slice(0, 22)}…` : a.accountName,
        value: a.balance,
      })),
    [data?.accountBalances]
  );

  const movementDonut = useMemo(
    () => (data?.movementBreakdown ?? []).map((m) => ({ name: m.name, value: m.value })),
    [data?.movementBreakdown]
  );

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto p-3 md:p-4 space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-app-text flex items-center gap-2">
            <Landmark className="w-6 h-6 text-primary" />
            Banking &amp; Cash Analytics
          </h2>
          <p className="text-sm text-app-muted mt-1 max-w-2xl">
            Bank and cash balances, inflows, outflows, and movement breakdown from PostgreSQL.
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
        {cashAccounts.length > 0 && (
          <select
            value={filters.accountId ?? 'all'}
            onChange={(e) => setFilter('accountId', e.target.value === 'all' ? undefined : e.target.value)}
            className="text-xs rounded-lg border border-app-border bg-app-toolbar px-2 py-1.5 max-w-[200px]"
          >
            <option value="all">All accounts</option>
            {cashAccounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
      </div>

      {isError && (
        <div className="rounded-xl border border-ds-danger/30 p-4 text-sm text-ds-danger">
          Failed to load banking analytics.{' '}
          <button type="button" className="underline" onClick={() => refetch()}>Retry</button>
        </div>
      )}

      {isLoading ? (
        <MetricCardGridSkeleton count={6} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {(data?.kpis ?? []).map((k) => {
            const Icon = KPI_ICONS[k.id] ?? Landmark;
            return (
              <MetricCard key={k.id} label={k.label} value={k.value} format={k.format} icon={Icon} />
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <ChartCard title="Cash Flow Trend" subtitle={`Inflow vs outflow · ${chartYear}`} headerRight={yearSelector}>
          <StackedAreaChart
            data={cashFlowData}
            series={[
              { key: 'Inflow', label: 'Inflow', color: CHART_COLORS.income },
              { key: 'Outflow', label: 'Outflow', color: CHART_COLORS.expense },
            ]}
            emptyLabel="No cash movements for this year."
          />
        </ChartCard>

        <ChartCard title="Net Cash Flow" subtitle={`Monthly net · ${chartYear}`} headerRight={yearSelector}>
          <AreaTrendChart
            data={netCashData}
            series={[{ key: 'net', label: 'Net', color: CHART_COLORS.profit }]}
            emptyLabel="No net cash flow for this year."
          />
        </ChartCard>

        <ChartCard title="Account Balances" subtitle="Current bank and cash balances">
          <HorizontalBarChart data={accountBarData} emptyLabel="No bank or cash accounts found." />
        </ChartCard>

        <ChartCard title="Movement Breakdown" subtitle="Income, expense, and transfers in period">
          <DonutChart data={movementDonut} emptyLabel="No cash movements in this period." />
        </ChartCard>
      </div>
    </div>
  );
};

export default memo(BankingAnalyticsPage);
