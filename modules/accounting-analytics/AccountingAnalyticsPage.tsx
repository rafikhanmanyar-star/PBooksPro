import React, { memo, useMemo, useState } from 'react';
import { RefreshCw, Scale, Landmark, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
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
import { useAccountingAnalytics } from './hooks/useAccountingAnalytics';
import { useAccountingAnalyticsFiltersStore } from './store/accountingAnalyticsFiltersStore';

const KPI_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  assets: Landmark,
  liabilities: Scale,
  equity: Wallet,
  income: TrendingUp,
  expenses: TrendingDown,
  netProfit: TrendingUp,
};

const AccountingAnalyticsPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const projects = useStateSelector((s) => s.projects);
  const filters = useAccountingAnalyticsFiltersStore((s) => s.filters);
  const setFilter = useAccountingAnalyticsFiltersStore((s) => s.setFilter);
  const [chartYear, setChartYear] = useState(() => new Date().getFullYear());

  const { data, isLoading, isFetching, isError, refetch } = useAccountingAnalytics(isAuthenticated);

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

  const incomeExpenseData = useMemo(
    () =>
      (data?.incomeVsExpenseTrend ?? [])
        .filter((p) => p.month.startsWith(String(chartYear)))
        .map((p) => ({ name: p.label, Income: p.income, Expenses: p.expenses })),
    [data?.incomeVsExpenseTrend, chartYear]
  );

  const balanceSheetData = useMemo(() => {
    const snap = data?.balanceSheetSnapshot;
    if (!snap) return [];
    return [
      {
        name: 'Snapshot',
        Assets: snap.assets,
        Liabilities: snap.liabilities,
        Equity: snap.equity,
      },
    ];
  }, [data?.balanceSheetSnapshot]);

  const cashBarData = useMemo(
    () =>
      (data?.cashPosition ?? []).map((a) => ({
        label: a.name.length > 24 ? `${a.name.slice(0, 22)}…` : a.name,
        value: a.balance,
      })),
    [data?.cashPosition]
  );

  const categoryDonut = useMemo(
    () => (data?.categoryBreakdown ?? []).map((c) => ({ name: c.name, value: c.value })),
    [data?.categoryBreakdown]
  );

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto p-3 md:p-4 space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-app-text flex items-center gap-2">
            <Scale className="w-6 h-6 text-primary" />
            Accounting Analytics
          </h2>
          <p className="text-sm text-app-muted mt-1 max-w-2xl">
            Balance sheet position, P&amp;L performance, cash accounts, and expense categories from PostgreSQL.
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
            className="text-xs rounded-lg border border-app-border bg-app-toolbar px-2 py-1.5 max-w-[200px]"
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
          Failed to load accounting analytics.{' '}
          <button type="button" className="underline" onClick={() => refetch()}>Retry</button>
        </div>
      )}

      {isLoading ? (
        <MetricCardGridSkeleton count={6} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {(data?.kpis ?? []).map((k) => {
            const Icon = KPI_ICONS[k.id] ?? Scale;
            return (
              <MetricCard key={k.id} label={k.label} value={k.value} format={k.format} icon={Icon} />
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <ChartCard title="Income vs Expense Trend" subtitle={`Monthly P&amp;L · ${chartYear}`} headerRight={yearSelector}>
          <AreaTrendChart
            data={incomeExpenseData}
            series={[
              { key: 'Income', label: 'Income', color: CHART_COLORS.income },
              { key: 'Expenses', label: 'Expenses', color: CHART_COLORS.expense },
            ]}
            emptyLabel="No P&amp;L data for this year."
          />
        </ChartCard>

        <ChartCard title="Balance Sheet Snapshot" subtitle={`As of ${filters.to}`}>
          <ColumnChart
            data={balanceSheetData}
            series={[
              { key: 'Assets', label: 'Assets', color: CHART_COLORS.income },
              { key: 'Liabilities', label: 'Liabilities', color: CHART_COLORS.expense },
              { key: 'Equity', label: 'Equity', color: CHART_COLORS.profit },
            ]}
            stacked
          />
        </ChartCard>

        <ChartCard title="Cash Position" subtitle="Bank account balances">
          <HorizontalBarChart data={cashBarData} emptyLabel="No bank accounts found." />
        </ChartCard>

        <ChartCard title="Expense Category Breakdown" subtitle="Top categories in filter period">
          <DonutChart data={categoryDonut} emptyLabel="No categorized expenses in this period." />
        </ChartCard>
      </div>
    </div>
  );
};

export default memo(AccountingAnalyticsPage);
