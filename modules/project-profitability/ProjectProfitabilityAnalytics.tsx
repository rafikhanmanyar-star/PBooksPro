import { useProjectReportAppState } from '../../hooks/useSelectiveState';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { VisibilityState } from '@tanstack/react-table';
import { Download, FileSpreadsheet, Printer, RefreshCw, Settings2 } from 'lucide-react';
import ReportFooter from '../../components/reports/ReportFooter';
import ReportHeader from '../../components/reports/ReportHeader';
import Button from '../../components/ui/Button';
import { CURRENCY } from '../../constants';
import { useAuth } from '../../context/AuthContext';
import { usePrintReport } from '../../hooks/usePrintReport';
import { formatDate, toLocalDateString } from '../../utils/dateUtils';
import { formatCompactMoney, formatRoi } from './utils/financialFormat';
import {
    CollectionTrendChart,
    MonthlyProfitTrendChart,
    ProjectStatusDonutChart,
    RevenueVsExpenseChart,
    RoiComparisonChart,
    SalesTrendChart,
    TopProfitableProjectsChart,
    UnitStatusDonutChart,
} from './charts/ProfitabilityCharts';
import { ProjectSummaryKpiStrip } from './components/ProjectSummaryKpiStrip';
import { ColumnSettingsMenu, ProfitabilityDataTable } from './components/ProfitabilityDataTable';
import { exportProfitabilityCsv, exportProfitabilityExcel, exportProfitabilityPdf } from './components/exportProfitability';
import { ProfitabilityFilterBar } from './components/ProfitabilityFilterBar';
import { ProfitabilityKpiStrip } from './components/ProfitabilityKpiStrip';
import { ProjectProfitabilityDrawer } from './components/ProjectProfitabilityDrawer';
import {
    useFilteredProfitabilityRows,
    usePortfolioCollectionTrendQuery,
    usePortfolioMonthlyTrendQuery,
    useProfitabilityPermissions,
    useProjectProfitabilityDetailsQuery,
    useProjectProfitabilitySummaryQuery,
} from './hooks/useProjectProfitabilityAnalytics';
import { derivePortfolioSummaryFromRows } from './services/projectProfitability.service';
import { useProfitabilityFiltersStore } from './store/profitabilityFiltersStore';

const COLUMN_PRESETS: { id: string; label: string }[] = [
    { id: 'select', label: 'Select' },
    { id: 'projectName', label: 'Project' },
    { id: 'rowStatus', label: 'Status' },
    { id: 'completionPct', label: 'Completion %' },
    { id: 'unitsSold', label: 'Units sold' },
    { id: 'unitsRemaining', label: 'Units remaining' },
    { id: 'revenue', label: 'Revenue' },
    { id: 'expense', label: 'Expense' },
    { id: 'grossProfit', label: 'Gross profit' },
    { id: 'netProfit', label: 'Net profit' },
    { id: 'adjustedProfit', label: 'Adjusted profit' },
    { id: 'unsoldInventoryValue', label: 'Unsold inventory' },
    { id: 'receivable', label: 'Receivable' },
    { id: 'cashReceived', label: 'Cash received' },
    { id: 'payables', label: 'Payables' },
    { id: 'investorCapital', label: 'Investor capital' },
    { id: 'roiPct', label: 'ROI %' },
    { id: 'lastUpdated', label: 'Last updated' },
];

/**
 * Inv. Mgmt → Reports: enterprise project profitability analytics (Vite + React; data from synced AppState).
 */
const ProjectProfitabilityAnalytics: React.FC = () => {
    const state = useProjectReportAppState();
    const { projects, defaultProjectId } = state;
    const { user } = useAuth();
    const perm = useProfitabilityPermissions(user?.role);
    const printReport = usePrintReport();
    const queryClient = useQueryClient();
    const filters = useProfitabilityFiltersStore((s) => s.filters);
    const setFilter = useProfitabilityFiltersStore((s) => s.setFilter);
    const defaultProjectBootstrapped = useRef(false);

    const [endDate, setEndDate] = useState(() => toLocalDateString(new Date()));
    const [drawerProjectId, setDrawerProjectId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

    const summaryQuery = useProjectProfitabilitySummaryQuery(state, endDate);
    const monthlyQuery = usePortfolioMonthlyTrendQuery(state, endDate);
    const collectionQuery = usePortfolioCollectionTrendQuery(state, endDate);
    const focusedProjectId = filters.projectId && filters.projectId !== 'all' ? filters.projectId : null;
    const projectDetailsQuery = useProjectProfitabilityDetailsQuery(state, focusedProjectId, endDate, !!focusedProjectId);

    useEffect(() => {
        if (defaultProjectBootstrapped.current) return;
        defaultProjectBootstrapped.current = true;
        if (defaultProjectId && (!filters.projectId || filters.projectId === 'all')) {
            setFilter('projectId', defaultProjectId);
            setDrawerProjectId(defaultProjectId);
        }
    }, [defaultProjectId, filters.projectId, setFilter]);

    useEffect(() => {
        if (!filters.projectId || filters.projectId === 'all') {
            setDrawerProjectId(null);
        }
    }, [filters.projectId]);

    const filterPayload = useMemo(
        () => ({
            projectId: filters.projectId || 'all',
            search: filters.search,
            projectStatus: filters.projectStatus,
            investorId: filters.investorId,
            projectType: filters.projectType,
            city: filters.city,
            completionMin: filters.completionMin,
            completionMax: filters.completionMax,
            profitability: filters.profitability,
            brokerId: filters.brokerId,
            tag: filters.tag,
        }),
        [filters]
    );

    const filteredRows = useFilteredProfitabilityRows(summaryQuery.data, state, endDate, filterPayload);

    const exportRows = useMemo(() => {
        if (selectedIds.length === 0) return filteredRows;
        const set = new Set(selectedIds);
        return filteredRows.filter((r) => set.has(r.projectId));
    }, [filteredRows, selectedIds]);

    const handleRefresh = useCallback(() => {
        void queryClient.invalidateQueries({ queryKey: ['project-profitability-summary'] });
        void queryClient.invalidateQueries({ queryKey: ['project-profitability-monthly'] });
        void queryClient.invalidateQueries({ queryKey: ['project-profitability-collection'] });
        void queryClient.invalidateQueries({ queryKey: ['project-profitability-details'] });
    }, [queryClient]);

    const displaySummary = useMemo(() => {
        if (!summaryQuery.data) return undefined;
        return derivePortfolioSummaryFromRows(filteredRows, endDate);
    }, [summaryQuery.data, filteredRows, endDate]);

    const monthlyChartPoints = useMemo(() => {
        if (focusedProjectId && projectDetailsQuery.data?.monthlyTrend?.length) {
            return projectDetailsQuery.data.monthlyTrend;
        }
        return monthlyQuery.data ?? [];
    }, [focusedProjectId, projectDetailsQuery.data, monthlyQuery.data]);

    const selectedProjectName =
        focusedProjectId != null ? projects.find((p) => p.id === focusedProjectId)?.name : null;

    return (
        <div className="flex flex-col h-full min-h-0 space-y-4 bg-app-bg">
            <div className="flex flex-col gap-3 shrink-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h3 className="text-2xl font-bold tracking-tight text-app-text">Project Profitability Analytics</h3>
                        <p className="text-ds-body text-app-muted mt-1 max-w-3xl leading-relaxed">
                            {selectedProjectName ? (
                                <>
                                    Viewing <span className="font-semibold text-ds-primary">{selectedProjectName}</span> as of{' '}
                                    {formatDate(endDate)}. KPIs and charts reflect this project; open the drilldown panel for revenue, expense, and investor detail.
                                </>
                            ) : (
                                <>
                                    Track project revenue, expenses, profitability, investor returns, and inventory valuation. Select a project above or use the table
                                    for portfolio-wide analysis.
                                </>
                            )}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2 print:hidden">
                        <Button
                            variant="secondary"
                            type="button"
                            onClick={() => exportProfitabilityPdf(exportRows, `Project profitability as of ${endDate}`)}
                            disabled={!perm.canExport || exportRows.length === 0}
                            title={!perm.canExport ? 'Export requires elevated role' : undefined}
                        >
                            <Download className="h-4 w-4 mr-1 inline" />
                            PDF
                        </Button>
                        <Button variant="secondary" type="button" onClick={() => exportProfitabilityExcel(exportRows)} disabled={!perm.canExport || exportRows.length === 0}>
                            <FileSpreadsheet className="h-4 w-4 mr-1 inline" />
                            Excel
                        </Button>
                        <Button variant="secondary" type="button" onClick={() => exportProfitabilityCsv(exportRows)} disabled={!perm.canExport || exportRows.length === 0}>
                            CSV
                        </Button>
                        <Button variant="secondary" type="button" onClick={() => printReport({ elementId: 'project-profitability-print' })}>
                            <Printer className="h-4 w-4 mr-1 inline" />
                            Print
                        </Button>
                        <Button variant="secondary" type="button" onClick={() => void handleRefresh()}>
                            <RefreshCw className={`h-4 w-4 mr-1 inline ${summaryQuery.isFetching ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                        <details className="relative">
                            <summary className="list-none cursor-pointer inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-app-border bg-app-card text-ds-body font-medium text-app-text hover:bg-app-table-hover">
                                <Settings2 className="h-4 w-4" />
                                Columns
                            </summary>
                            <div className="absolute right-0 mt-1 z-40">
                                <ColumnSettingsMenu columnIds={COLUMN_PRESETS} visibility={columnVisibility} onChange={setColumnVisibility} />
                            </div>
                        </details>
                    </div>
                </div>

                <ProfitabilityFilterBar
                    state={state}
                    endDate={endDate}
                    onEndDateChange={setEndDate}
                    allRows={summaryQuery.data?.rows ?? []}
                    canManageFilters={perm.canManageFilters}
                    onProjectSelect={(id) => setDrawerProjectId(id)}
                />
            </div>

            {displaySummary && (
                <div className="print:hidden space-y-4">
                    <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-app-muted mb-2">Project summary</p>
                        <ProjectSummaryKpiStrip summary={displaySummary} isFetching={summaryQuery.isFetching} />
                    </div>
                    <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-app-muted mb-2">Profitability</p>
                        <ProfitabilityKpiStrip summary={displaySummary} isFetching={summaryQuery.isFetching} />
                    </div>
                </div>
            )}

            <div id="project-profitability-print" className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden">
                <div className="report-print-only">
                    <ReportHeader reportTitle="Project Profitability Analytics" />
                    <p className="text-center text-sm text-slate-600 mt-2">
                        {CURRENCY} · As of {formatDate(endDate)}
                        {selectedProjectName ? ` · ${selectedProjectName}` : ''}
                    </p>
                </div>

                {displaySummary && (
                    <div className="report-print-only mb-2">
                        <table className="w-full text-xs border-collapse border border-slate-300">
                            <tbody>
                                <tr className="border-b border-slate-200">
                                    <td className="px-2 py-1.5 font-medium text-slate-700">Total revenue</td>
                                    <td className="px-2 py-1.5 text-right tabular-nums">{formatCompactMoney(displaySummary.totalRevenue)}</td>
                                </tr>
                                <tr className="border-b border-slate-200">
                                    <td className="px-2 py-1.5 font-medium text-slate-700">Total expense</td>
                                    <td className="px-2 py-1.5 text-right tabular-nums">{formatCompactMoney(displaySummary.totalExpense)}</td>
                                </tr>
                                <tr className="border-b border-slate-200">
                                    <td className="px-2 py-1.5 font-medium text-slate-700">Net profit</td>
                                    <td className="px-2 py-1.5 text-right tabular-nums">{formatCompactMoney(displaySummary.netProfit)}</td>
                                </tr>
                                <tr>
                                    <td className="px-2 py-1.5 font-medium text-slate-700">Portfolio ROI</td>
                                    <td className="px-2 py-1.5 text-right tabular-nums">{formatRoi(displaySummary.roiPctAggregate)}</td>
                                </tr>
                            </tbody>
                        </table>
                        <p className="mt-2 text-[10px] text-slate-500 text-center">Charts omitted from print — see project table below.</p>
                    </div>
                )}

                {displaySummary && (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 print:hidden shrink-0">
                        <div className="rounded-2xl border border-app-border bg-app-card p-4 shadow-ds-card">
                            <p className="text-xs font-bold uppercase tracking-wider text-app-muted mb-2">Sales trend</p>
                            <SalesTrendChart points={monthlyChartPoints} />
                        </div>
                        <div className="rounded-2xl border border-app-border bg-app-card p-4 shadow-ds-card">
                            <p className="text-xs font-bold uppercase tracking-wider text-app-muted mb-2">Collection trend</p>
                            <CollectionTrendChart points={collectionQuery.data ?? []} />
                        </div>
                        <div className="rounded-2xl border border-app-border bg-app-card p-4 shadow-ds-card">
                            <p className="text-xs font-bold uppercase tracking-wider text-app-muted mb-2">
                                {focusedProjectId ? 'Revenue vs expense' : 'Expense vs revenue (top projects)'}
                            </p>
                            <RevenueVsExpenseChart rows={filteredRows} />
                        </div>
                        <div className="rounded-2xl border border-app-border bg-app-card p-4 shadow-ds-card">
                            <p className="text-xs font-bold uppercase tracking-wider text-app-muted mb-2">Unit status distribution</p>
                            <UnitStatusDonutChart rows={filteredRows} />
                        </div>
                        <div className="rounded-2xl border border-app-border bg-app-card p-4 shadow-ds-card">
                            <p className="text-xs font-bold uppercase tracking-wider text-app-muted mb-2">Profitability trend</p>
                            <MonthlyProfitTrendChart points={monthlyChartPoints} />
                        </div>
                        {!focusedProjectId && (
                            <>
                                <div className="rounded-2xl border border-app-border bg-app-card p-4 shadow-ds-card">
                                    <p className="text-xs font-bold uppercase tracking-wider text-app-muted mb-2">Top net profit</p>
                                    <TopProfitableProjectsChart rows={filteredRows} />
                                </div>
                                <div className="rounded-2xl border border-app-border bg-app-card p-4 shadow-ds-card">
                                    <p className="text-xs font-bold uppercase tracking-wider text-app-muted mb-2">Project status</p>
                                    <ProjectStatusDonutChart rows={filteredRows} />
                                </div>
                            </>
                        )}
                        <div
                            className={`rounded-2xl border border-app-border bg-app-card p-4 shadow-ds-card ${focusedProjectId ? 'xl:col-span-2' : ''}`}
                        >
                            <p className="text-xs font-bold uppercase tracking-wider text-app-muted mb-2">ROI comparison</p>
                            <RoiComparisonChart rows={filteredRows} />
                        </div>
                    </div>
                )}

                <div className="flex-1 min-h-0 overflow-auto border border-app-border rounded-2xl bg-app-card">
                    <ProfitabilityDataTable
                        rows={filteredRows}
                        isLoading={summaryQuery.isLoading}
                        onRowOpen={(id) => {
                            setFilter('projectId', id);
                            setDrawerProjectId(id);
                        }}
                        selectedIds={selectedIds}
                        onSelectionChange={setSelectedIds}
                        columnVisibility={columnVisibility}
                        onColumnVisibilityChange={setColumnVisibility}
                    />
                </div>

                <div className="report-print-only mt-6">
                    <ReportFooter />
                </div>
            </div>

            <ProjectProfitabilityDrawer state={state} projectId={drawerProjectId} endDate={endDate} onClose={() => setDrawerProjectId(null)} />
        </div>
    );
};

export default ProjectProfitabilityAnalytics;
