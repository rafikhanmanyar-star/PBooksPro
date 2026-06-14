import React, { useState, useMemo, useCallback } from 'react';
import { useFinancialReportAppState, useProjects, useBuildings } from '../../hooks/useSelectiveState';
import Card from '../ui/Card';
import { CURRENCY } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import ReportToolbar, { ReportDateRange } from './ReportToolbar';
import FinancialEntityFilterCombo from './FinancialEntityFilterCombo';
import {
  entityScopeFromFilterId,
  financialEntityFilterLabel,
  FINANCIAL_ENTITY_FILTER_ALL,
} from './financialEntityScope';
import { formatDate, toLocalDateString } from '../../utils/dateUtils';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';
import {
  computeProjectFinancialPosition,
  type PositionLine,
  type ProjectFinancialPositionResult,
} from './projectFinancialPositionEngine';

function formatMoney(n: number, hideZero: boolean): string | null {
  if (hideZero && Math.abs(n) < 0.01) return null;
  return `${CURRENCY} ${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function MoneyCell({ amount, hideZero }: { amount: number; hideZero: boolean }) {
  const txt = formatMoney(amount, hideZero);
  if (txt === null) return <span className="text-app-muted">—</span>;
  const neg = amount < -0.01;
  return <span className={`font-mono tabular-nums ${neg ? 'text-ds-danger' : 'text-app-text'}`}>{txt}</span>;
}

function DashboardCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: 'emerald' | 'amber' | 'indigo';
}) {
  const ring =
    accent === 'emerald'
      ? 'border-emerald-300/60 bg-emerald-50/80 dark:bg-emerald-950/30'
      : accent === 'amber'
        ? 'border-amber-300/60 bg-amber-50/80 dark:bg-amber-950/30'
        : accent === 'indigo'
          ? 'border-indigo-300/60 bg-indigo-50/80 dark:bg-indigo-950/30'
          : 'border-app-border bg-app-toolbar/50';
  return (
    <div className={`rounded-lg border p-3 ${ring}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-app-muted mb-1">{label}</p>
      <p className="text-lg font-bold tabular-nums text-app-text">
        {CURRENCY}{' '}
        {value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
      </p>
    </div>
  );
}

function SectionTable({
  title,
  lines,
  total,
  totalLabel,
  hideZeros,
}: {
  title: string;
  lines: PositionLine[];
  total: number;
  totalLabel: string;
  hideZeros: boolean;
}) {
  const visible = hideZeros ? lines.filter((l) => Math.abs(l.amount) >= 0.01) : lines;
  return (
    <section>
      <h4 className="text-sm font-bold text-app-muted uppercase tracking-wide border-b border-app-border pb-2 mb-2">
        {title}
      </h4>
      <table className="w-full text-sm">
        <tbody>
          {visible.map((line) => (
            <tr key={line.key} className="border-b border-app-border/50">
              <td className="py-2 pr-2 text-app-text">{line.label}</td>
              <td className="py-2 text-right">
                <MoneyCell amount={line.amount} hideZero={false} />
              </td>
            </tr>
          ))}
          {visible.length === 0 && (
            <tr>
              <td colSpan={2} className="py-3 text-center text-app-muted italic">
                No amounts in this section
              </td>
            </tr>
          )}
          <tr className="bg-app-toolbar font-semibold">
            <td className="py-2 px-1">{totalLabel}</td>
            <td className="py-2 text-right">
              <MoneyCell amount={total} hideZero={false} />
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

const ProjectFinancialPositionReport: React.FC = () => {
  const projects = useProjects();
  const buildings = useBuildings();
  const reportState = useFinancialReportAppState();
  const { print: triggerPrint } = usePrintContext();
  const [dateRange, setDateRange] = useState<ReportDateRange>('all');
  const [asOfDate, setAsOfDate] = useState(toLocalDateString(new Date()));
  const [entityFilterId, setEntityFilterId] = useState<string>(FINANCIAL_ENTITY_FILTER_ALL);
  const entityScope = useMemo(() => entityScopeFromFilterId(entityFilterId), [entityFilterId]);
  const [hideZeros, setHideZeros] = useState(false);

  const entityLabel = useMemo(
    () => financialEntityFilterLabel(entityFilterId, projects, buildings),
    [entityFilterId, projects, buildings]
  );

  const report = useMemo<ProjectFinancialPositionResult>(
    () =>
      computeProjectFinancialPosition(reportState, {
        asOfDate,
        selectedProjectId: entityScope.projectId,
        selectedBuildingId: entityScope.buildingId,
      }),
    [reportState, asOfDate, entityScope]
  );

  const handleRangeChange = (type: ReportDateRange) => {
    setDateRange(type);
    const now = new Date();
    if (type === 'all') {
      setAsOfDate(toLocalDateString(now));
    } else if (type === 'thisMonth') {
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setAsOfDate(toLocalDateString(endOfMonth));
    } else if (type === 'lastMonth') {
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      setAsOfDate(toLocalDateString(endOfLastMonth));
    }
  };

  const handleDateChange = (date: string) => {
    setAsOfDate(date);
    if (dateRange !== 'custom') setDateRange('custom');
  };

  const handleExport = useCallback(() => {
    const rows: Record<string, string | number>[] = [];
    rows.push({ Section: 'Dashboard', Line: 'Net Position', Amount: report.dashboard.netPosition });
    rows.push({ Section: 'Dashboard', Line: 'Cash Invested', Amount: report.dashboard.cashInvested });
    rows.push({ Section: 'Dashboard', Line: 'Receivables', Amount: report.dashboard.receivables });
    rows.push({ Section: 'Dashboard', Line: 'Payables', Amount: report.dashboard.payables });
    rows.push({ Section: 'Dashboard', Line: 'Profit', Amount: report.dashboard.profit });
    for (const a of report.assets) {
      rows.push({ Section: 'Assets', Line: a.label, Amount: a.amount });
    }
    for (const l of report.liabilities) {
      rows.push({ Section: 'Liabilities', Line: l.label, Amount: l.amount });
    }
    rows.push({ Section: 'Net Position', Line: 'Assets − Liabilities', Amount: report.netPosition });
    exportJsonToExcel(rows as never, `ProjectFinancialPosition_${asOfDate}.xlsx`);
  }, [report, asOfDate]);

  return (
    <div className="flex flex-col h-full min-h-0 max-w-6xl mx-auto w-full">
      <style>{STANDARD_PRINT_STYLES}</style>
      <div
        className="flex-grow overflow-y-auto overflow-x-hidden min-h-0 p-4 print:p-2 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600"
        id="printable-area"
      >
        <Card className="p-4">
          <ReportHeader />
          <div className="text-center mb-4">
            <h3 className="text-2xl font-bold text-app-text">Project Financial Position</h3>
            <p className="text-sm text-app-muted mt-1">
              {entityLabel} · As of {formatDate(asOfDate)}
            </p>
            <p className="text-xs text-app-muted mt-1 max-w-2xl mx-auto">
              Construction project snapshot — not a statutory balance sheet. Shows cash invested, receivables,
              payables, and work in progress for project management.
            </p>
          </div>

          <ReportToolbar
            startDate={asOfDate}
            endDate={asOfDate}
            onDateChange={(start) => handleDateChange(start)}
            hideGroup={true}
            showDateFilterPills={true}
            showDatePickersWithPills={true}
            activeDateRange={dateRange}
            onRangeChange={handleRangeChange}
            hideSearch={true}
            singleDateMode={true}
            onExport={handleExport}
            onPrint={() => triggerPrint('REPORT', { elementId: 'printable-area' })}
          >
            <FinancialEntityFilterCombo
              className="w-44 sm:w-52 flex-shrink-0"
              selectedId={entityFilterId}
              onSelect={setEntityFilterId}
            />
            <label className="flex items-center gap-2 text-sm cursor-pointer ml-2">
              <input type="checkbox" checked={hideZeros} onChange={(e) => setHideZeros(e.target.checked)} />
              Hide zero lines
            </label>
          </ReportToolbar>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6 mt-4">
            <DashboardCard label="Net Position" value={report.dashboard.netPosition} accent="indigo" />
            <DashboardCard label="Cash Invested" value={report.dashboard.cashInvested} />
            <DashboardCard label="Receivables" value={report.dashboard.receivables} accent="amber" />
            <DashboardCard label="Payables" value={report.dashboard.payables} />
            <DashboardCard
              label="Profit"
              value={report.dashboard.profit}
              accent={report.dashboard.profit >= 0 ? 'emerald' : undefined}
            />
          </div>

          <div className="max-w-4xl mx-auto bg-app-card p-4 md:p-8 rounded-xl border border-app-border shadow-ds-card space-y-8">
            <SectionTable
              title="Assets"
              lines={report.assets}
              total={report.totalAssets}
              totalLabel="Total assets"
              hideZeros={hideZeros}
            />
            <SectionTable
              title="Liabilities"
              lines={report.liabilities}
              total={report.totalLiabilities}
              totalLabel="Total liabilities"
              hideZeros={hideZeros}
            />

            <div className="rounded-lg border-2 border-indigo-300/70 bg-indigo-50/50 dark:bg-indigo-950/30 p-4 flex flex-wrap justify-between items-center gap-2">
              <span className="font-bold text-app-text uppercase tracking-wide text-sm">Net Position</span>
              <span className="text-xl font-bold tabular-nums text-indigo-900 dark:text-indigo-100">
                {formatMoney(report.netPosition, false)}
              </span>
            </div>

            <section>
              <h4 className="text-sm font-bold text-app-muted uppercase tracking-wide border-b border-app-border pb-2 mb-3">
                Project KPIs
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <div className="flex justify-between border-b border-app-border/40 py-1.5">
                  <span className="text-app-muted">Contract Value</span>
                  <MoneyCell amount={report.kpis.contractValue} hideZero={false} />
                </div>
                <div className="flex justify-between border-b border-app-border/40 py-1.5">
                  <span className="text-app-muted">Billing Value</span>
                  <MoneyCell amount={report.kpis.billingValue} hideZero={false} />
                </div>
                <div className="flex justify-between border-b border-app-border/40 py-1.5">
                  <span className="text-app-muted">Collection Value</span>
                  <MoneyCell amount={report.kpis.collectionValue} hideZero={false} />
                </div>
                <div className="flex justify-between border-b border-app-border/40 py-1.5">
                  <span className="text-app-muted">Retention Held</span>
                  <MoneyCell amount={report.kpis.retentionHeld} hideZero={false} />
                </div>
                <div className="flex justify-between border-b border-app-border/40 py-1.5">
                  <span className="text-app-muted">Retention Released</span>
                  <MoneyCell amount={report.kpis.retentionReleased} hideZero={false} />
                </div>
                <div className="flex justify-between border-b border-app-border/40 py-1.5">
                  <span className="text-app-muted">Profit to Date</span>
                  <MoneyCell amount={report.kpis.profitToDate} hideZero={false} />
                </div>
                <div className="flex justify-between border-b border-app-border/40 py-1.5 sm:col-span-2">
                  <span className="text-app-muted">Profit %</span>
                  <span className="font-mono tabular-nums text-app-text">
                    {report.kpis.profitPct != null ? `${report.kpis.profitPct.toFixed(1)}%` : '—'}
                  </span>
                </div>
              </div>
            </section>
          </div>
        </Card>
        <ReportFooter />
      </div>
    </div>
  );
};

export default ProjectFinancialPositionReport;
