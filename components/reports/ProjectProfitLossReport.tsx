import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useFinancialReportAppState, useProjects, useBuildings } from '../../hooks/useSelectiveState';
import { TransactionType } from '../../types';
import Card from '../ui/Card';
import { CURRENCY } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import ReportToolbar, { ReportDateRange } from './ReportToolbar';
import { computeProfitLossReport, type ProfitLossLine, type ProfitLossReportResult } from './profitLossEngine';
import FinancialEntityFilterCombo from './FinancialEntityFilterCombo';
import {
  entityScopeFromFilterId,
  financialEntityFilterLabel,
  FINANCIAL_ENTITY_FILTER_ALL,
} from './financialEntityScope';
import { formatDate, toLocalDateString } from '../../utils/dateUtils';
import ProjectTransactionModal from '../dashboard/ProjectTransactionModal';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';
import { fetchProfitLossReport } from '../../services/api/financialReportsApi';
import { useReportTenantId } from '../../hooks/useReportTenantId';

function MetricBanner({
  label,
  value,
  variant = 'dark',
}: {
  label: string;
  value: number;
  variant?: 'dark' | 'emerald' | 'amber';
}) {
  const bg =
    variant === 'emerald'
      ? 'bg-ds-success/10 border-ds-success/30'
      : variant === 'amber'
        ? 'bg-ds-warning/10 border-ds-warning/30'
        : 'bg-app-toolbar border-app-border';
  return (
    <div className={`rounded-lg border p-4 ${bg}`}>
      <p className="text-xs font-bold uppercase tracking-wider mb-1 text-app-muted">{label}</p>
      <p className="text-xl font-bold tabular-nums text-app-text">
        {CURRENCY} {value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
    </div>
  );
}

const ProjectProfitLossReport: React.FC = () => {
  const projects = useProjects();
  const buildings = useBuildings();
  const reportState = useFinancialReportAppState();
  const { print: triggerPrint } = usePrintContext();

  const [dateRange, setDateRange] = useState<ReportDateRange>('all');
  const [startDate, setStartDate] = useState('2000-01-01');
  const [endDate, setEndDate] = useState(() => toLocalDateString(new Date()));
  const [entityFilterId, setEntityFilterId] = useState<string>(FINANCIAL_ENTITY_FILTER_ALL);
  const entityScope = useMemo(() => entityScopeFromFilterId(entityFilterId), [entityFilterId]);
  const [collapsedOpexRoots, setCollapsedOpexRoots] = useState<Set<string>>(new Set());

  const [drilldownData, setDrilldownData] = useState<{
    isOpen: boolean;
    categoryId?: string;
    categoryName: string;
    type: TransactionType;
  } | null>(null);

  const entityLabel = useMemo(
    () => financialEntityFilterLabel(entityFilterId, projects, buildings),
    [entityFilterId, projects, buildings]
  );

    const tenantId = useReportTenantId();
  const [serverReport, setServerReport] = useState<ProfitLossReportResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!tenantId) {
      setServerReport(null);
      return;
    }
    let cancelled = false;
    setServerReport(null);
    setLoading(true);
    void fetchProfitLossReport({
      from: startDate,
      to: endDate,
      projectId: entityScope.projectId,
      buildingId: entityScope.buildingId,
    })
      .then((r) => {
        if (!cancelled) setServerReport(r);
      })
      .catch(() => {
        if (!cancelled) setServerReport(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, startDate, endDate, entityScope]);

  const handleRangeChange = (type: ReportDateRange) => {
    setDateRange(type);
    const now = new Date();
    if (type === 'all') {
      setStartDate('2000-01-01');
      setEndDate(toLocalDateString(now));
    } else if (type === 'thisMonth') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setStartDate(toLocalDateString(firstDay));
      setEndDate(toLocalDateString(lastDay));
    } else if (type === 'lastMonth') {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      setStartDate(toLocalDateString(firstDay));
      setEndDate(toLocalDateString(lastDay));
    }
  };

  const handleDateChange = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
    if (dateRange !== 'custom') setDateRange('custom');
  };

  const clientReport = useMemo(
    () =>
      computeProfitLossReport(reportState, {
        startDate,
        endDate,
        selectedProjectId: entityScope.projectId,
        selectedBuildingId: entityScope.buildingId,
      }),
    [reportState, startDate, endDate, entityScope]
  );
  const report = serverReport ?? clientReport;

  const validationErrors = useMemo(
    () => report?.validation?.issues.filter((iss) => iss.severity === 'error') ?? [],
    [report?.validation?.issues]
  );
  const showValidationBanner =
    !!report &&
    (validationErrors.length > 0 ||
      !report.validation.ledgerMatch ||
      (report.validation.equityReconciliation != null && !report.validation.equityReconciliation.passed));

  const toggleOpexRoot = useCallback((id: string) => {
    setCollapsedOpexRoots((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDrilldown = (categoryId: string | undefined, categoryName: string, type: TransactionType) => {
    setDrilldownData({ isOpen: true, categoryId, categoryName, type });
  };

  const opexVisible = useMemo(() => {
    if (!report) return [];
    const rows = report.operating_expenses;
    const out: ProfitLossLine[] = [];
    let skipChildrenOfCollapsedRoot = false;
    for (const row of rows) {
      if (row.level === 0) {
        skipChildrenOfCollapsedRoot = false;
        out.push(row);
        if (row.type === 'group' && collapsedOpexRoots.has(row.id)) {
          skipChildrenOfCollapsedRoot = true;
        }
      } else if (!skipChildrenOfCollapsedRoot) {
        out.push(row);
      }
    }
    return out;
  }, [report, collapsedOpexRoots]);

  const renderLineRows = (rows: ProfitLossLine[], txType: TransactionType, isOpex?: boolean) => (
    <>
      {rows.map((row) => (
        <tr
          key={`${row.id}-${row.level}`}
          className="border-b border-app-border hover:bg-app-table-hover cursor-pointer"
          onClick={() => handleDrilldown(row.id, row.name, txType)}
        >
          <td className="py-2 px-2 text-app-text">
            <div style={{ paddingLeft: `${row.level * 1.25}rem` }} className="flex items-center gap-1">
              {isOpex && row.level === 0 && row.type === 'group' && (
                <button
                  type="button"
                  className="text-app-muted hover:text-app-text p-0.5"
                  aria-expanded={collapsedOpexRoots.has(row.id) ? 'false' : 'true'}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleOpexRoot(row.id);
                  }}
                >
                  {collapsedOpexRoots.has(row.id) ? '▶' : '▼'}
                </button>
              )}
              {row.level > 0 && <span className="text-app-muted/50 mr-1">└</span>}
              <span className={row.type === 'group' ? 'font-semibold text-app-text' : ''}>{row.name}</span>
            </div>
          </td>
          <td className="py-2 px-2 text-right font-medium tabular-nums">{CURRENCY} {row.amount.toLocaleString()}</td>
          <td className="py-2 px-2 text-right text-app-muted text-xs tabular-nums">{row.pctOfRevenue.toFixed(1)}%</td>
        </tr>
      ))}
    </>
  );

  const handleExport = () => {
    if (!report) return;
    const r = report;
    const line = (label: string, amt: number, pct?: string) => ({ Category: label, Amount: amt, '%': pct ?? '' });
    const data: Record<string, unknown>[] = [
      line('A. Revenue', r.totalRevenue, ''),
      ...r.revenue.map((x) => line(`  ${'  '.repeat(x.level)}${x.name}`, x.amount, `${x.pctOfRevenue.toFixed(1)}%`)),
      line('B. Cost of sales', -r.cost_of_sales.reduce((s, x) => s + x.amount, 0), ''),
      ...r.cost_of_sales.map((x) => line(`  ${'  '.repeat(x.level)}${x.name}`, x.amount, `${x.pctOfRevenue.toFixed(1)}%`)),
      line('C. Gross profit', r.gross_profit, ''),
      line('D. Operating expenses', -r.operating_expenses.reduce((s, x) => s + x.amount, 0), ''),
      ...r.operating_expenses.map((x) => line(`  ${'  '.repeat(x.level)}${x.name}`, x.amount, `${x.pctOfRevenue.toFixed(1)}%`)),
      line('E. Operating profit', r.operating_profit, ''),
      line('F. Other income', r.other_income.reduce((s, x) => s + x.amount, 0), ''),
      ...r.other_income.map((x) => line(`  ${'  '.repeat(x.level)}${x.name}`, x.amount, `${x.pctOfRevenue.toFixed(1)}%`)),
      line('G. Finance costs', r.finance_cost.reduce((s, x) => s + x.amount, 0), ''),
      ...r.finance_cost.map((x) => line(`  ${'  '.repeat(x.level)}${x.name}`, x.amount, `${x.pctOfRevenue.toFixed(1)}%`)),
      line('H. Profit before tax', r.profit_before_tax, ''),
      line('I. Tax', r.tax, ''),
      line('J. Net profit', r.net_profit, ''),
    ];
    exportJsonToExcel(data, 'profit-loss-report.xlsx', 'P&L');
  };

  const projectLabel = entityLabel;

  if (!report) {
    return (
      <div className="flex flex-col h-full space-y-4">
        <ReportToolbar
          startDate={startDate}
          endDate={endDate}
          onDateChange={handleDateChange}
          onExport={handleExport}
          onPrint={() => triggerPrint('REPORT', { elementId: 'printable-area' })}
          hideGroup
          showDateFilterPills
          activeDateRange={dateRange}
          onRangeChange={handleRangeChange}
          hideSearch
          compact
        >
          <FinancialEntityFilterCombo
            className="w-44 sm:w-52 flex-shrink-0"
            selectedId={entityFilterId}
            onSelect={setEntityFilterId}
          />
        </ReportToolbar>
        <p className="text-center text-sm text-app-muted py-8">
          {loading ? 'Loading profit & loss for this organization…' : 'Could not load profit & loss from the server.'}
        </p>
      </div>
    );
  }

  const cogsSubtotal = report!.cost_of_sales.reduce((s, x) => s + x.amount, 0);
  const opexSubtotal = report!.operating_expenses.reduce((s, x) => s + x.amount, 0);
  const otherIncSub = report!.other_income.reduce((s, x) => s + x.amount, 0);
  const finSub = report!.finance_cost.reduce((s, x) => s + x.amount, 0);

  return (
    <div className="flex flex-col h-full space-y-4">
      <style>{STANDARD_PRINT_STYLES}</style>
      <div className="flex-shrink-0">
        <ReportToolbar
          startDate={startDate}
          endDate={endDate}
          onDateChange={handleDateChange}
          onExport={handleExport}
          onPrint={() => triggerPrint('REPORT', { elementId: 'printable-area' })}
          hideGroup={true}
          showDateFilterPills={true}
          activeDateRange={dateRange}
          onRangeChange={handleRangeChange}
          hideSearch={true}
        >
          <FinancialEntityFilterCombo
            className="w-44 sm:w-52 flex-shrink-0"
            selectedId={entityFilterId}
            onSelect={setEntityFilterId}
          />
        </ReportToolbar>
      </div>
      <div className="flex-grow overflow-y-auto min-h-0 bg-app-bg" id="printable-area">
        <Card className="min-h-full">
          <ReportHeader />
          <h3 className="text-2xl font-bold text-center mb-2 text-app-text">Profit &amp; Loss Statement</h3>
          <p className="text-center text-app-muted mb-4 text-sm">
            {projectLabel}
            <br />
            {formatDate(startDate)} — {formatDate(endDate)}
          </p>
          {loading && (
            <p className="text-center text-xs text-app-muted mb-2">Loading from server…</p>
          )}

          {showValidationBanner && (
            <div className="max-w-4xl mx-auto mb-4 space-y-1">
              {validationErrors.map((iss, i) => (
                <div
                  key={i}
                  className="text-sm rounded px-3 py-2 bg-ds-danger/10 text-ds-danger border border-ds-danger/30"
                >
                  {iss.message}
                </div>
              ))}
              {!report.validation.ledgerMatch && (
                <div className="text-xs text-app-muted">
                  Ledger P&amp;L net: {CURRENCY} {report.validation.legacyNetProfit.toFixed(2)} · Structured net: {CURRENCY}{' '}
                  {report.validation.structuredNetProfit.toFixed(2)}
                </div>
              )}
              {report.validation.equityReconciliation && !report.validation.equityReconciliation.passed && (
                <div className="text-sm rounded px-3 py-2 bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-700">
                  Net profit ({CURRENCY} {report.validation.equityReconciliation.netProfit.toFixed(2)}) does not equal
                  change in equity ({CURRENCY} {report.validation.equityReconciliation.equityChange.toFixed(2)}) for this
                  period (difference {CURRENCY} {report.validation.equityReconciliation.difference.toFixed(2)}).
                </div>
              )}
              {report.validation.equityReconciliation?.passed && (
                <div className="text-xs text-emerald-700 dark:text-emerald-300">
                  Reconciliation: net profit equals change in equity for {formatDate(startDate)} – {formatDate(endDate)}.
                </div>
              )}
            </div>
          )}

          <div className="max-w-4xl mx-auto bg-app-card p-4 md:p-8 rounded-xl border border-app-border shadow-ds-card space-y-6">
            <section>
              <h4 className="text-sm font-bold text-app-muted uppercase tracking-wide border-b border-app-border pb-2 mb-2">A. Revenue</h4>
              <table className="w-full text-sm">
                <thead className="bg-app-table-header text-xs text-app-muted uppercase">
                  <tr>
                    <th className="py-2 px-2 text-left">Line</th>
                    <th className="py-2 px-2 text-right">Amount</th>
                    <th className="py-2 px-2 text-right w-20">% Rev</th>
                  </tr>
                </thead>
                <tbody>
                  {renderLineRows(report.revenue, TransactionType.INCOME)}
                  {report.revenue.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-3 text-center text-app-muted italic">
                        No revenue lines
                      </td>
                    </tr>
                  )}
                  <tr className="bg-app-toolbar font-bold">
                    <td className="py-2 px-2">Total revenue</td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {CURRENCY} {report.totalRevenue.toLocaleString()}
                    </td>
                    <td className="py-2 px-2 text-right">100.0%</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section>
              <h4 className="text-sm font-bold text-app-muted uppercase tracking-wide border-b border-app-border pb-2 mb-2">B. Cost of sales</h4>
              <table className="w-full text-sm">
                <thead className="bg-app-table-header text-xs text-app-muted uppercase">
                  <tr>
                    <th className="py-2 px-2 text-left">Line</th>
                    <th className="py-2 px-2 text-right">Amount</th>
                    <th className="py-2 px-2 text-right w-20">% Rev</th>
                  </tr>
                </thead>
                <tbody>
                  {renderLineRows(report.cost_of_sales, TransactionType.EXPENSE)}
                  <tr className="bg-app-toolbar font-bold">
                    <td className="py-2 px-2">Total cost of sales</td>
                    <td className="py-2 px-2 text-right tabular-nums">{CURRENCY} {cogsSubtotal.toLocaleString()}</td>
                    <td className="py-2 px-2 text-right text-xs tabular-nums">
                      {report.totalRevenue !== 0 ? ((cogsSubtotal / report.totalRevenue) * 100).toFixed(1) : '0.0'}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            <MetricBanner label="C. Gross profit" value={report.gross_profit} variant="emerald" />

            <section>
              <h4 className="text-sm font-bold text-app-muted uppercase tracking-wide border-b border-app-border pb-2 mb-2">
                D. Operating expenses
              </h4>
              <table className="w-full text-sm">
                <thead className="bg-app-table-header text-xs text-app-muted uppercase">
                  <tr>
                    <th className="py-2 px-2 text-left">Line</th>
                    <th className="py-2 px-2 text-right">Amount</th>
                    <th className="py-2 px-2 text-right w-20">% Rev</th>
                  </tr>
                </thead>
                <tbody>
                  {renderLineRows(opexVisible, TransactionType.EXPENSE, true)}
                  <tr className="bg-app-toolbar font-bold">
                    <td className="py-2 px-2">Total operating expenses</td>
                    <td className="py-2 px-2 text-right tabular-nums">{CURRENCY} {opexSubtotal.toLocaleString()}</td>
                    <td className="py-2 px-2 text-right text-xs tabular-nums">
                      {report.totalRevenue !== 0 ? ((opexSubtotal / report.totalRevenue) * 100).toFixed(1) : '0.0'}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            <MetricBanner label="E. Operating profit" value={report.operating_profit} variant="amber" />

            <section>
              <h4 className="text-sm font-bold text-app-muted uppercase tracking-wide border-b border-app-border pb-2 mb-2">F. Other income</h4>
              <table className="w-full text-sm">
                <tbody>
                  {renderLineRows(report.other_income, TransactionType.INCOME)}
                  <tr className="bg-app-toolbar font-bold">
                    <td className="py-2 px-2">Total other income</td>
                    <td className="py-2 px-2 text-right">{CURRENCY} {otherIncSub.toLocaleString()}</td>
                    <td className="py-2 px-2 text-right text-xs">
                      {report.totalRevenue !== 0 ? ((otherIncSub / report.totalRevenue) * 100).toFixed(1) : '0.0'}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section>
              <h4 className="text-sm font-bold text-app-muted uppercase tracking-wide border-b border-app-border pb-2 mb-2">G. Finance costs</h4>
              <table className="w-full text-sm">
                <tbody>
                  {renderLineRows(report.finance_cost, TransactionType.EXPENSE)}
                  <tr className="bg-app-toolbar font-bold">
                    <td className="py-2 px-2">Total finance costs</td>
                    <td className="py-2 px-2 text-right">{CURRENCY} {finSub.toLocaleString()}</td>
                    <td className="py-2 px-2 text-right text-xs">
                      {report.totalRevenue !== 0 ? ((finSub / report.totalRevenue) * 100).toFixed(1) : '0.0'}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <MetricBanner label="H. Profit before tax" value={report.profit_before_tax} variant="dark" />
              <MetricBanner label="I. Tax expense" value={report.tax} variant="dark" />
            </div>
            <div className="rounded-xl border-2 border-primary/40 bg-app-toolbar p-6 text-center shadow-ds-card">
              <p className="text-xs font-bold text-app-muted uppercase tracking-widest mb-2">J. Net profit / (loss)</p>
              <p className={`text-4xl font-bold tabular-nums ${report.net_profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {CURRENCY}{' '}
                {report.net_profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          <ReportFooter />
        </Card>
      </div>

      <ProjectTransactionModal
        isOpen={!!drilldownData?.isOpen}
        onClose={() => setDrilldownData(null)}
        data={
          drilldownData
            ? {
                projectId: entityScope.projectId,
                buildingId: entityScope.buildingId,
                projectName: projectLabel || 'All Projects & Buildings',
                categoryId: drilldownData.categoryId,
                categoryName: drilldownData.categoryName,
                type: drilldownData.type === TransactionType.INCOME ? 'Income' : 'Expense',
                startDate,
                endDate,
              }
            : null
        }
      />
    </div>
  );
};

export default ProjectProfitLossReport;
