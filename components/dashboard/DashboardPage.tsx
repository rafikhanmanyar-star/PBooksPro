import React, { lazy, memo, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Download, LayoutGrid, Printer, RefreshCw } from 'lucide-react';
import { usePrintReport } from '../../hooks/usePrintReport';
import ReportHeader from '../reports/ReportHeader';
import ReportFooter from '../reports/ReportFooter';
import { useStateSelector } from '../../hooks/useSelectiveState';
import { useKpis } from '../../context/KPIContext';
import { useAuth } from '../../context/AuthContext';
import Button from '../ui/Button';
import { formatRoundedNumber } from '../../utils/numberUtils';
import { formatDate } from '../../utils/dateUtils';
import SubscriptionStatusWidget from '../billing/SubscriptionStatusWidget';
import ReportDashboardWidgets from './ReportDashboardWidgets';
import VendorQuotationComplianceWidget from '../procurement/VendorQuotationComplianceWidget';
import {
  useDashboardActivity,
  useDashboardCharts,
  useDashboardMetrics,
  useDashboardSnapshots,
} from '../../hooks/useDashboardMetrics';
import { isLocalOnlyMode } from '../../config/apiUrl';
import {
  DashboardFilterBar,
  DASHBOARD_METRIC_ICONS,
  MetricCardGrid,
  WidgetDragGrid,
  exportDashboardMetricsCsv,
  exportDashboardSnapshotExcel,
  exportDashboardSnapshotPdf,
} from '../analytics';
import { resolveDrilldownKpi } from './dashboardDrilldown';
import type { DashboardMetricValue } from '../../types/dashboardMetrics.types';
import {
  type DashboardKpiGroupId,
  useDashboardPreferencesStore,
} from '../../stores/dashboardPreferencesStore';

const DashboardChartsSection = lazy(() => import('./DashboardChartsSection'));

const KPI_GROUP_LABELS: Record<DashboardKpiGroupId, string> = {
  financial: 'Financial KPIs',
  realEstate: 'Real Estate KPIs',
  activity: 'Activity KPIs',
};

const DashboardPage: React.FC = () => {
  const currentUser = useStateSelector((s) => s.currentUser);
  const currentPage = useStateSelector((s) => s.currentPage);
  const projects = useStateSelector((s) => s.projects);
  const buildings = useStateSelector((s) => s.buildings);
  const { isAuthenticated } = useAuth();
  const { allKpis, openDrilldown } = useKpis();
  const isAdmin = currentUser?.role === 'Admin';
  const isDashboardActive = currentPage === 'dashboard';

  const [greeting, setGreeting] = useState('');
  const [customizeMode, setCustomizeMode] = useState(false);
  const [chartYear] = useState(() => new Date().getFullYear());
  const printReport = usePrintReport();
  const metricsQuery = useDashboardMetrics(isAuthenticated && isAdmin && isDashboardActive);
  const snapshotsQuery = useDashboardSnapshots(
    undefined,
    isAuthenticated && isAdmin && isDashboardActive && !isLocalOnlyMode()
  );
  const chartsQuery = useDashboardCharts(chartYear, isAuthenticated && isAdmin && isDashboardActive);
  const activityQuery = useDashboardActivity(5, isAuthenticated && isDashboardActive);

  const kpiGroupOrder = useDashboardPreferencesStore((s) => s.kpiGroupOrder);
  const setKpiGroupOrder = useDashboardPreferencesStore((s) => s.setKpiGroupOrder);
  const resetKpiGroups = useDashboardPreferencesStore((s) => s.resetKpiGroups);

  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');
  }, []);

  const projectOptions = useMemo(
    () => projects.map((p) => ({ id: p.id, name: p.name })),
    [projects]
  );

  const buildingOptions = useMemo(
    () => buildings.map((b) => ({ id: b.id, name: b.name })),
    [buildings]
  );

  const recentActivity = activityQuery.data?.items ?? [];

  const handleMetricClick = useCallback(
    (metric: DashboardMetricValue) => {
      const kpi = resolveDrilldownKpi(metric, allKpis);
      if (kpi) openDrilldown(kpi);
    },
    [allKpis, openDrilldown]
  );

  const handleExportCsv = useCallback(() => {
    if (metricsQuery.data) exportDashboardMetricsCsv(metricsQuery.data);
  }, [metricsQuery.data]);

  const handleExportExcel = useCallback(() => {
    if (metricsQuery.data) {
      exportDashboardSnapshotExcel(metricsQuery.data, chartsQuery.data ?? null);
    }
  }, [metricsQuery.data, chartsQuery.data]);

  const handleExportPdf = useCallback(() => {
    if (metricsQuery.data) {
      exportDashboardSnapshotPdf(metricsQuery.data, chartsQuery.data ?? null);
    }
  }, [metricsQuery.data, chartsQuery.data]);

  const metrics = metricsQuery.data;
  const metricsLoading = metricsQuery.isLoading || (metricsQuery.isFetching && !metrics);

  const kpiGroups = useMemo(() => {
    const map: Record<DashboardKpiGroupId, DashboardMetricValue[]> = {
      financial: metrics?.financial ?? [],
      realEstate: metrics?.realEstate ?? [],
      activity: metrics?.activity ?? [],
    };
    return kpiGroupOrder.map((id) => ({ id, metrics: map[id] }));
  }, [kpiGroupOrder, metrics]);

  const kpiDragItems = useMemo(
    () => kpiGroupOrder.map((id) => ({ id, label: KPI_GROUP_LABELS[id] })),
    [kpiGroupOrder]
  );

  return (
    <div className="space-y-4 md:space-y-6 max-w-[1600px] mx-auto px-2 sm:px-4 pb-28 md:pb-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-app-text">
            {greeting}, {currentUser?.name?.split(' ')[0]}
          </h1>
          <p className="text-app-muted text-xs md:text-sm mt-1">
            Executive overview — financial, real estate, and activity metrics from PostgreSQL.
          </p>
          {metrics?.generatedAt && (
            <p className="text-[11px] text-app-muted mt-1">
              Updated {formatDate(new Date(metrics.generatedAt))}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap justify-end">
          {isAdmin && (
            <Button
              variant={customizeMode ? 'primary' : 'secondary'}
              onClick={() => setCustomizeMode((v) => !v)}
              className="text-xs gap-1"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              {customizeMode ? 'Done' : 'Customize'}
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => metricsQuery.refetch()}
            className="text-xs gap-1"
            disabled={metricsQuery.isFetching}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${metricsQuery.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {metrics && (
            <>
              <Button variant="secondary" onClick={handleExportCsv} className="text-xs gap-1">
                <Download className="w-3.5 h-3.5" />
                CSV
              </Button>
              <Button variant="secondary" onClick={handleExportExcel} className="text-xs gap-1">
                <Download className="w-3.5 h-3.5" />
                Excel
              </Button>
              <Button variant="secondary" onClick={handleExportPdf} className="text-xs gap-1">
                <Download className="w-3.5 h-3.5" />
                PDF
              </Button>
              <Button variant="secondary" onClick={() => printReport({ elementId: 'dashboard-print-area' })} className="text-xs gap-1">
                <Printer className="w-3.5 h-3.5" />
                Print
              </Button>
            </>
          )}
        </div>
      </div>

      {isAdmin && isAuthenticated && (
        <div className="no-print">
          <DashboardFilterBar projectOptions={projectOptions} buildingOptions={buildingOptions} />
        </div>
      )}

      {!isAdmin && (
        <div className="rounded-2xl border border-app-border bg-app-card p-6 text-center text-app-muted text-sm">
          Dashboard KPIs and charts are available to administrators. Use the KPI panel for your role metrics.
        </div>
      )}

      {isAdmin && isAuthenticated && (
        <div id="dashboard-print-area" className="space-y-4 md:space-y-6">
          <ReportHeader reportTitle="Executive Dashboard" />
          {metrics?.generatedAt && (
            <p className="text-center text-xs text-slate-600 -mt-2 report-title-block">
              Snapshot as of {formatDate(new Date(metrics.generatedAt))}
            </p>
          )}
          {customizeMode && (
            <div className="no-print">
              <WidgetDragGrid
                items={kpiDragItems}
                onReorder={(ids) => setKpiGroupOrder(ids as DashboardKpiGroupId[])}
                title="KPI sections — drag to reorder"
              />
            </div>
          )}

          {kpiGroups.map((group) => (
            <div key={group.id} data-tour={group.id === 'financial' ? 'dashboard-kpis' : undefined}>
              <MetricCardGrid
                title={KPI_GROUP_LABELS[group.id].replace(' KPIs', '')}
                metrics={group.metrics}
                isLoading={metricsLoading}
                iconMap={DASHBOARD_METRIC_ICONS}
                onMetricClick={handleMetricClick}
                columns={group.id === 'activity' ? 3 : 4}
              />
            </div>
          ))}

          <ReportDashboardWidgets enabled={isAuthenticated && isAdmin && !isLocalOnlyMode()} />

          {customizeMode && (
            <Button variant="secondary" onClick={resetKpiGroups} className="text-xs no-print">
              Reset KPI section order
            </Button>
          )}

          {metricsQuery.isError && (
            <div className="rounded-2xl border border-ds-danger/30 bg-app-card p-4 text-sm text-ds-danger">
              Failed to load dashboard metrics.{' '}
              <button type="button" className="underline" onClick={() => metricsQuery.refetch()}>
                Retry
              </button>
            </div>
          )}

          <Suspense
            fallback={
              <div className="h-64 rounded-2xl bg-app-toolbar/40 animate-pulse border border-app-border" />
            }
          >
            <DashboardChartsSection enabled={isAdmin && isAuthenticated} customizeMode={customizeMode} />
          </Suspense>
          <p className="report-print-only text-center text-[10px] text-slate-500 -mt-2">
            Charts omitted from print — KPI cards above reflect the same snapshot.
          </p>
          <ReportFooter />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {isAuthenticated && isAdmin && (
          <div className="md:col-span-3">
            <VendorQuotationComplianceWidget />
          </div>
        )}

        {isAuthenticated && isAdmin && (
          <div className="md:col-span-1">
            <SubscriptionStatusWidget />
          </div>
        )}

        <div
          className={`bg-app-card p-4 md:p-5 rounded-2xl border border-app-border shadow-ds-card ${
            isAdmin ? 'md:col-span-2' : 'md:col-span-3'
          }`}
          data-tour="dashboard-activity"
        >
          <h3 className="text-xs md:text-sm font-bold text-app-text mb-3 md:mb-4 uppercase tracking-wide">
            Recent Activity
          </h3>
          <div className="space-y-3 md:space-y-4">
            {activityQuery.isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-10 rounded-lg bg-app-toolbar/50 animate-pulse" />
                ))}
              </div>
            ) : recentActivity.length === 0 ? (
              <p className="text-sm text-app-muted">No recent transactions or invoices.</p>
            ) : (
              recentActivity.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <div
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      item.type === 'Income'
                        ? 'bg-ds-success'
                        : item.type === 'Expense'
                          ? 'bg-ds-danger'
                          : 'bg-app-muted'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-app-text truncate">{item.title}</div>
                    <div className="text-xs text-app-muted">{formatDate(new Date(item.date))}</div>
                  </div>
                  <div className="text-sm font-bold text-app-text tabular-nums">
                    {formatRoundedNumber(item.amount)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(DashboardPage);
