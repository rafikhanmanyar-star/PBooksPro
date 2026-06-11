import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  AreaTrendChart,
  ChartCard,
  ColumnChart,
  DonutChart,
  HorizontalBarChart,
  CHART_COLORS,
  WidgetDragGrid,
} from '../analytics';
import Button from '../ui/Button';
import { useDashboardCharts } from '../../hooks/useDashboardMetrics';
import {
  CHART_WIDGET_LABELS,
  type DashboardChartWidgetId,
  useDashboardPreferencesStore,
} from '../../stores/dashboardPreferencesStore';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

interface DashboardChartsSectionProps {
  enabled: boolean;
  customizeMode?: boolean;
}

const ChartSkeleton: React.FC = () => (
  <div className="h-[280px] w-full rounded-xl bg-app-toolbar/50 animate-pulse" />
);

const DashboardChartsSection: React.FC<DashboardChartsSectionProps> = ({ enabled, customizeMode }) => {
  const [chartYear, setChartYear] = useState(CURRENT_YEAR);
  const [layoutReady, setLayoutReady] = useState(false);
  const { data, isFetching, isError, refetch } = useDashboardCharts(chartYear, enabled);

  const chartWidgetOrder = useDashboardPreferencesStore((s) => s.chartWidgetOrder);
  const hiddenChartWidgets = useDashboardPreferencesStore((s) => s.hiddenChartWidgets);
  const setChartWidgetOrder = useDashboardPreferencesStore((s) => s.setChartWidgetOrder);
  const toggleChartWidget = useDashboardPreferencesStore((s) => s.toggleChartWidget);
  const resetChartWidgets = useDashboardPreferencesStore((s) => s.resetChartWidgets);

  useEffect(() => {
    const id = requestAnimationFrame(() => setLayoutReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const revenueData = useMemo(
    () =>
      (data?.revenueVsExpenses ?? []).map((p) => ({
        name: p.label,
        revenue: p.revenue,
        expenses: p.expenses,
      })),
    [data?.revenueVsExpenses]
  );

  const cashFlowData = useMemo(
    () =>
      (data?.cashFlowTrend ?? []).map((p) => ({
        name: p.label,
        inflow: p.inflow,
        outflow: p.outflow,
        net: p.net,
      })),
    [data?.cashFlowTrend]
  );

  const collectionsData = useMemo(
    () =>
      (data?.collectionsPerformance ?? []).map((p) => ({
        name: p.label,
        Due: p.due,
        Collected: p.collected,
        Outstanding: p.outstanding,
      })),
    [data?.collectionsPerformance]
  );

  const yearSelector = (
    <select
      value={chartYear}
      onChange={(e) => setChartYear(Number(e.target.value))}
      className="text-xs rounded-lg border border-app-border bg-app-toolbar px-2 py-1.5 text-app-text"
      aria-label="Chart year"
    >
      {YEAR_OPTIONS.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );

  const loading = isFetching && !data;

  const renderWidget = useCallback(
    (id: DashboardChartWidgetId) => {
      const sk = loading || !layoutReady ? <ChartSkeleton /> : null;
      switch (id) {
        case 'revenueVsExpenses':
          return (
            <ChartCard title="Revenue vs Expenses" subtitle={`Monthly trend · ${chartYear}`} headerRight={yearSelector}>
              {sk ?? (
                <AreaTrendChart
                  data={revenueData}
                  series={[
                    { key: 'revenue', label: 'Revenue', color: CHART_COLORS.income },
                    { key: 'expenses', label: 'Expenses', color: CHART_COLORS.expense },
                  ]}
                />
              )}
            </ChartCard>
          );
        case 'receivablesAging':
          return (
            <ChartCard title="Receivables Aging" subtitle="Outstanding by bucket">
              {sk ?? <HorizontalBarChart data={data?.receivablesAging ?? []} />}
            </ChartCard>
          );
        case 'cashFlowTrend':
          return (
            <ChartCard title="Cash Flow Trend" subtitle={`Inflow, outflow & net · ${chartYear}`}>
              {sk ?? (
                <AreaTrendChart
                  data={cashFlowData}
                  series={[
                    { key: 'inflow', label: 'Inflow', color: CHART_COLORS.inflow },
                    { key: 'outflow', label: 'Outflow', color: CHART_COLORS.outflow },
                    { key: 'net', label: 'Net Position', color: CHART_COLORS.net },
                  ]}
                />
              )}
            </ChartCard>
          );
        case 'salesPipeline':
          return (
            <ChartCard title="Sales Pipeline" subtitle="Unit status distribution">
              {sk ?? <DonutChart data={data?.salesPipeline ?? []} />}
            </ChartCard>
          );
        case 'expenseBreakdown':
          return (
            <ChartCard title="Expense Breakdown" subtitle="Top categories in filter period">
              {sk ?? (
                <DonutChart
                  data={(data?.expenseBreakdown ?? []).map((s) => ({ name: s.name, value: s.value }))}
                  valueFormatter={(v) => String(Math.round(v))}
                />
              )}
            </ChartCard>
          );
        case 'collectionsPerformance':
          return (
            <ChartCard title="Collections Performance" subtitle={`Due vs collected · ${chartYear}`}>
              {sk ?? (
                <ColumnChart
                  data={collectionsData}
                  series={[
                    { key: 'Due', label: 'Due', color: CHART_COLORS.neutral },
                    { key: 'Collected', label: 'Collected', color: CHART_COLORS.income },
                    { key: 'Outstanding', label: 'Outstanding', color: CHART_COLORS.expense },
                  ]}
                />
              )}
            </ChartCard>
          );
        default:
          return null;
      }
    },
    [loading, layoutReady, chartYear, yearSelector, revenueData, cashFlowData, collectionsData, data]
  );

  const visibleWidgets = useMemo(
    () => chartWidgetOrder.filter((id) => !hiddenChartWidgets[id]),
    [chartWidgetOrder, hiddenChartWidgets]
  );

  const dragItems = useMemo(
    () =>
      chartWidgetOrder.map((id) => ({
        id,
        label: CHART_WIDGET_LABELS[id],
        hidden: !!hiddenChartWidgets[id],
      })),
    [chartWidgetOrder, hiddenChartWidgets]
  );

  if (!enabled) {
    return (
      <div className="rounded-2xl border border-app-border bg-app-card p-8 text-center text-app-muted">
        Chart analytics require admin access.
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-ds-danger/30 bg-app-card p-6 text-center">
        <p className="text-sm text-ds-danger mb-3">Failed to load dashboard charts.</p>
        <Button variant="secondary" onClick={() => refetch()} className="text-xs">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 no-print">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-bold text-app-text uppercase tracking-wide">Analytics</h2>
        <div className="flex items-center gap-2">
          {yearSelector}
          <Button
            variant="secondary"
            onClick={() => refetch()}
            className="text-xs h-8 px-2"
            disabled={isFetching}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
          {customizeMode && (
            <Button variant="secondary" onClick={resetChartWidgets} className="text-xs h-8 px-2">
              Reset layout
            </Button>
          )}
        </div>
      </div>

      {customizeMode && (
        <WidgetDragGrid
          items={dragItems}
          onReorder={(ids) => setChartWidgetOrder(ids as DashboardChartWidgetId[])}
          onToggleHidden={(id) => toggleChartWidget(id as DashboardChartWidgetId)}
          title="Chart widgets — drag to reorder, hide to remove"
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {visibleWidgets.map((id) => (
          <div
            key={id}
            className={`min-w-0 ${id === 'revenueVsExpenses' ? 'lg:col-span-2' : ''}`}
            data-tour={id === 'cashFlowTrend' ? 'dashboard-cashflow' : undefined}
          >
            {renderWidget(id)}
          </div>
        ))}
      </div>
    </div>
  );
};

export default memo(DashboardChartsSection);
