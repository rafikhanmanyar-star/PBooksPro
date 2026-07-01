import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useFinancialReportAppState, useProjects } from '../../hooks/useSelectiveState';
import Card from '../ui/Card';
import ComboBox from '../ui/ComboBox';
import { CURRENCY, ICONS } from '../../constants';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import ReportToolbar, { ReportDateRange } from './ReportToolbar';
import { formatDate, toLocalDateString } from '../../utils/dateUtils';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';
import {
  computeBalanceSheetReport,
  computeComparativeBalanceSheetReport,
  BS_GROUP_LABELS,
  flattenBalanceSheetLines,
  selectBalanceSheetView,
  type BalanceSheetLine,
  type BsGroupKey,
  type BalanceSheetReportResult,
  type BalanceSheetCompareMode,
} from './balanceSheetEngine';
import { computeProjectFinancialPosition } from './projectFinancialPositionEngine';
import { fetchBalanceSheetReport } from '../../services/api/financialReportsApi';
import { useReportTenantId } from '../../hooks/useReportTenantId';
import SettingsLedgerModal from '../settings/SettingsLedgerModal';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import PrintButton from '../ui/PrintButton';
import {
  exportBalanceSheetExcel,
  exportBalanceSheetPdf,
  exportComparativeBalanceSheetExcel,
} from './exportBalanceSheet';
import { priorFiscalYearEnd, priorMonthEnd } from '../../utils/fiscalYear';
import { FINANCIAL_ENTITY_FILTER_ALL } from './financialEntityScope';

function formatMoney(n: number, hideZero: boolean): string | null {
  if (hideZero && Math.abs(n) < 0.01) return null;
  return `${CURRENCY} ${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function lineSubtext(line: BalanceSheetLine): string | null {
  switch (line.groupKey) {
    case 'accounts_receivable':
      return 'From installment invoices';
    case 'retained_earnings':
      return 'Residual Close';
    case 'internal_clearing_suspense':
      return 'Clearing / suspense';
    case 'accounts_payable':
      return 'Vendor payables';
    default:
      return null;
  }
}

function MoneyCell({ amount, hideZero, className = '' }: { amount: number; hideZero: boolean; className?: string }) {
  const txt = formatMoney(amount, hideZero);
  if (txt === null) return <span className="text-app-muted">—</span>;
  const neg = amount < -0.01;
  return (
    <span className={`font-mono tabular-nums text-right ${neg ? 'text-ds-danger' : 'text-app-text'} ${className}`}>
      {txt}
    </span>
  );
}

function groupLinesByKey(lines: BalanceSheetLine[]): Map<BsGroupKey, BalanceSheetLine[]> {
  const m = new Map<BsGroupKey, BalanceSheetLine[]>();
  for (const line of lines) {
    const arr = m.get(line.groupKey) ?? [];
    arr.push(line);
    m.set(line.groupKey, arr);
  }
  return m;
}

const SIDE_STYLES = {
  asset: {
    columnHeader: 'bg-emerald-900/80 text-emerald-50 border-emerald-800/40',
    columnFooter: 'bg-ds-success text-black',
    sectionAccent: 'text-ds-success',
    icon: ICONS.trendingUp,
  },
  liability: {
    columnHeader: 'bg-red-900/75 text-red-50 border-red-800/40',
    columnFooter: 'bg-red-700 text-white',
    sectionAccent: 'text-ds-danger',
    icon: ICONS.trendingDown,
  },
  equity: {
    columnHeader: 'bg-blue-900/75 text-blue-50 border-blue-800/40',
    columnFooter: 'bg-blue-700 text-white',
    sectionAccent: 'text-primary',
    icon: ICONS.building,
  },
} as const;

const FISCAL_START_MONTH = 1;

const ProjectBalanceSheetReport: React.FC = () => {
  const projects = useProjects();
  const reportState = useFinancialReportAppState();
  const { print: triggerPrint } = usePrintContext();
  const [dateRange, setDateRange] = useState<ReportDateRange>('all');
  const [asOfDate, setAsOfDate] = useState(toLocalDateString(new Date()));
  const [selectedProjectId, setSelectedProjectId] = useState<string>(FINANCIAL_ENTITY_FILTER_ALL);
  const [hideZeros, setHideZeros] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [ledger, setLedger] = useState<{ id: string; name: string } | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [compareMode, setCompareMode] = useState<BalanceSheetCompareMode>('none');
  const [includeProjectAnalysis, setIncludeProjectAnalysis] = useState(false);
  const tenantId = useReportTenantId();
  const [serverReport, setServerReport] = useState<BalanceSheetReportResult | null>(null);
  const [serverPreviousReport, setServerPreviousReport] = useState<BalanceSheetReportResult | null>(null);
  const [serverPreviousDate, setServerPreviousDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const projectItems = useMemo(
    () => [
      { id: FINANCIAL_ENTITY_FILTER_ALL, name: 'All projects' },
      ...projects.map((p) => ({ id: p.id, name: p.name })),
    ],
    [projects]
  );

  const projectLabel = useMemo(() => {
    if (selectedProjectId === FINANCIAL_ENTITY_FILTER_ALL) return 'Consolidated';
    return projects.find((p) => p.id === selectedProjectId)?.name ?? 'Project';
  }, [selectedProjectId, projects]);

  const engineOptions = useMemo(
    () => ({
      asOfDate,
      selectedProjectId,
      selectedBuildingId: FINANCIAL_ENTITY_FILTER_ALL,
      fiscalStartMonth: FISCAL_START_MONTH,
    }),
    [asOfDate, selectedProjectId]
  );

  useEffect(() => {
    if (!tenantId) {
      setServerReport(null);
      setServerPreviousReport(null);
      setServerPreviousDate(null);
      return;
    }
    let cancelled = false;
    setServerReport(null);
    setServerPreviousReport(null);
    setLoading(true);

    const load = async () => {
      try {
        const current = await fetchBalanceSheetReport({
          asOfDate,
          projectId: selectedProjectId,
        });
        if (cancelled) return;
        setServerReport(current);

        if (compareMode !== 'none') {
          const prevDate =
            compareMode === 'prior_year'
              ? priorFiscalYearEnd(FISCAL_START_MONTH, asOfDate)
              : priorMonthEnd(asOfDate);
          const previous = await fetchBalanceSheetReport({
            asOfDate: prevDate,
            projectId: selectedProjectId,
          });
          if (!cancelled) {
            setServerPreviousReport(previous);
            setServerPreviousDate(prevDate);
          }
        } else {
          setServerPreviousReport(null);
          setServerPreviousDate(null);
        }
      } catch {
        if (!cancelled) setServerReport(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [tenantId, asOfDate, compareMode, selectedProjectId]);

  const clientResult = useMemo(() => {
    if (compareMode === 'none') {
      return computeBalanceSheetReport(reportState, engineOptions);
    }
    return computeComparativeBalanceSheetReport(reportState, {
      ...engineOptions,
      compareMode,
    });
  }, [reportState, engineOptions, compareMode]);

  const selectedView = useMemo(() => selectBalanceSheetView(clientResult), [clientResult]);
  const report: BalanceSheetReportResult | null = selectedView.report;
  const previousReport: BalanceSheetReportResult | null = selectedView.previousReport;
  const previousAsOfDate: string | null = selectedView.previousAsOfDate;

  const projectAnalysisRows = useMemo(() => {
    if (!includeProjectAnalysis || !report) return [];
    return projects.map((p) => {
      const snap = computeProjectFinancialPosition(reportState, {
        asOfDate,
        selectedProjectId: p.id,
      });
      return {
        projectId: p.id,
        projectName: p.name,
        assets: snap.totalAssets,
        liabilities: snap.totalLiabilities,
        netPosition: snap.netPosition,
      };
    });
  }, [includeProjectAnalysis, report, projects, reportState, asOfDate]);

  const previousByLineKey = useMemo(() => {
    if (!previousReport) return new Map<string, number>();
    return new Map(flattenBalanceSheetLines(previousReport).map((l) => [l.id + l.name, l.amount]));
  }, [previousReport]);

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

  const toggleGroup = useCallback((key: string) => {
    setOpenGroups((o) => {
      const isOpen = o[key] !== false;
      return { ...o, [key]: !isOpen };
    });
  }, []);

  const handleExportExcel = () => {
    if (!report) return;
    if (previousReport && previousAsOfDate) {
      exportComparativeBalanceSheetExcel(report, previousReport, previousAsOfDate);
    } else {
      exportBalanceSheetExcel(report);
    }
  };

  const handleExportPdf = () => {
    if (!report) return;
    exportBalanceSheetPdf(report, asOfDate);
  };

  const renderLineRow = (line: BalanceSheetLine) => {
    if (hideZeros && Math.abs(line.amount) < 0.01) return null;
    const prev = previousByLineKey.get(line.id + line.name);
    const showCompare = previousReport && prev !== undefined;
    const subtext = lineSubtext(line);
    return (
      <div
        key={line.id + line.name}
        className={`${
          showCompare ? 'grid grid-cols-[1fr_auto_auto_auto] gap-2' : 'flex justify-between gap-3'
        } py-1.5 px-2 hover:bg-app-toolbar/60 rounded cursor-pointer items-start sm:items-center border-b border-app-border/30 last:border-b-0`}
        onClick={() => {
          if (line.accountId) setLedger({ id: line.accountId, name: line.name });
        }}
        title={line.accountId ? 'Click for ledger drill-down' : undefined}
      >
        <div className="min-w-0 pr-2">
          <span className="text-app-text truncate block">{line.name}</span>
          {subtext && <span className="text-[10px] text-app-muted block mt-0.5">{subtext}</span>}
        </div>
        <MoneyCell amount={line.amount} hideZero={false} />
        {showCompare && (
          <>
            <MoneyCell amount={prev ?? 0} hideZero={false} />
            <MoneyCell amount={line.amount - (prev ?? 0)} hideZero={false} />
          </>
        )}
      </div>
    );
  };

  const renderSection = (
    title: string,
    lines: BalanceSheetLine[],
    side: 'asset' | 'liability' | 'equity',
    sectionKey: string
  ) => {
    const byKey = groupLinesByKey(lines);
    const keys = [...byKey.keys()];
    const styles = SIDE_STYLES[side];
    const total = lines.reduce((s, l) => s + l.amount, 0);
    const showCompare = !!previousReport;
    const isOpen = openGroups[sectionKey] !== false;

    if (hideZeros && Math.abs(total) < 0.01) return null;

    return (
      <div className="mb-2 rounded-lg border border-app-border/70 overflow-hidden bg-app-card/50">
        <button
          type="button"
          className="w-full flex justify-between items-center text-left text-[11px] font-bold text-app-text uppercase tracking-wide py-2 px-3 bg-app-toolbar/90 border-b border-app-border/60 hover:bg-app-toolbar"
          onClick={() => toggleGroup(sectionKey)}
        >
          <span>{title}</span>
          <span className={`transition-transform ${isOpen ? 'rotate-0' : '-rotate-90'} text-app-muted`}>
            <span className="inline-block w-3.5 h-3.5">{ICONS.chevronDown}</span>
          </span>
        </button>
        {isOpen && (
          <div className="p-2 space-y-2 text-xs leading-snug">
            {showCompare && (
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-2 pb-1 text-[10px] font-semibold text-app-muted uppercase border-b border-app-border/40">
                <span>Account</span>
                <span className="text-right">Current</span>
                <span className="text-right">Previous</span>
                <span className="text-right">Variance</span>
              </div>
            )}
            {keys.map((gk) => {
              const groupLines = byKey.get(gk) ?? [];
              const subtotal = groupLines.reduce((s, l) => s + l.amount, 0);
              if (hideZeros && Math.abs(subtotal) < 0.01) return null;
              return (
                <div key={gk} className="rounded-md overflow-hidden border border-app-border/50">
                  <div className="px-2 py-1 bg-app-toolbar/70 text-[11px] font-semibold text-app-muted leading-tight">
                    {BS_GROUP_LABELS[gk] ?? gk}
                  </div>
                  <div className="bg-app-card/30">{groupLines.map((line) => renderLineRow(line))}</div>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex justify-between py-2 px-3 bg-app-toolbar border-t border-app-border/60 font-semibold text-xs text-app-text">
          <span className="text-app-muted">Subtotal {title}</span>
          <span className={`tabular-nums font-mono font-bold ${styles.sectionAccent}`}>
            {formatMoney(total, false)}
          </span>
        </div>
      </div>
    );
  };

  const renderColumnHeader = (label: string, side: 'asset' | 'liability' | 'equity') => {
    const styles = SIDE_STYLES[side];
    return (
      <div
        className={`flex justify-between items-center px-3 py-2.5 font-bold uppercase tracking-wide text-sm border-b ${styles.columnHeader}`}
      >
        <span>{label}</span>
        <span className="w-4 h-4 opacity-80">{styles.icon}</span>
      </div>
    );
  };

  const renderColumnFooter = (label: string, amount: number, side: 'asset' | 'liability' | 'equity') => {
    const styles = SIDE_STYLES[side];
    return (
      <div className={`flex justify-between items-center px-3 py-3 font-bold text-sm uppercase tracking-wide ${styles.columnFooter}`}>
        <span>{label}</span>
        <span className="tabular-nums font-mono">{formatMoney(amount, false)}</span>
      </div>
    );
  };

  const summaryCards = report ? (
    <div className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      <div className="rounded-xl border border-ds-success/35 bg-app-card p-3 shadow-ds-card">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[10px] uppercase font-bold text-app-muted tracking-wider">Total Assets</p>
          <span className="w-4 h-4 text-ds-success shrink-0">{ICONS.trendingUp}</span>
        </div>
        <p className="text-lg sm:text-xl font-bold font-mono text-ds-success tabular-nums mt-1.5 leading-tight">
          {formatMoney(report.totals.assets, false)}
        </p>
      </div>
      <div className="rounded-xl border border-ds-danger/30 bg-app-card p-3 shadow-ds-card">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[10px] uppercase font-bold text-app-muted tracking-wider">Total Liabilities</p>
          <span className="w-4 h-4 text-ds-danger shrink-0">{ICONS.trendingDown}</span>
        </div>
        <p className="text-lg sm:text-xl font-bold font-mono text-ds-danger tabular-nums mt-1.5 leading-tight">
          {formatMoney(report.totals.liabilities, false)}
        </p>
      </div>
      <div className="rounded-xl border border-primary/30 bg-app-card p-3 shadow-ds-card">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[10px] uppercase font-bold text-app-muted tracking-wider">Total Equity</p>
          <span className="w-4 h-4 text-primary shrink-0">{ICONS.building}</span>
        </div>
        <p
          className={`text-lg sm:text-xl font-bold font-mono tabular-nums mt-1.5 leading-tight ${
            report.totals.equity < -0.01 ? 'text-ds-danger' : 'text-primary'
          }`}
        >
          {formatMoney(report.totals.equity, false)}
        </p>
      </div>
      <div
        className={`rounded-xl border p-3 bg-app-card shadow-ds-card ${
          report.isBalanced ? 'border-ds-success/40' : 'border-ds-danger/40'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-[10px] uppercase font-bold text-app-muted tracking-wider">Balance Status</p>
          <span
            className={`w-2 h-2 rounded-full shrink-0 mt-1 ${report.isBalanced ? 'bg-ds-success' : 'bg-ds-danger'}`}
          />
        </div>
        {report.isBalanced ? (
          <>
            <p className="text-lg font-bold text-ds-success mt-1.5">Balanced</p>
            <p className="text-[10px] text-app-muted mt-1">Assets = Liabilities + Equity</p>
          </>
        ) : (
          <>
            <p className="text-base font-bold text-ds-danger mt-1.5">Out of Balance</p>
            <p className="text-[10px] text-app-muted mt-1">{formatMoney(report.totals.difference, false)}</p>
          </>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className="flex flex-col h-full space-y-2 bg-background">
      <style>{STANDARD_PRINT_STYLES}</style>

      <div className="flex-shrink-0 no-print rounded-xl border border-app-border overflow-hidden shadow-ds-card">
        <ReportToolbar
          startDate={asOfDate}
          endDate={asOfDate}
          onDateChange={(start) => handleDateChange(start)}
          onExport={handleExportExcel}
          onPrint={() => triggerPrint('REPORT', { elementId: 'printable-area' })}
          hideGroup={true}
          showDateFilterPills={true}
          activeDateRange={dateRange}
          onRangeChange={handleRangeChange}
          hideSearch={true}
          singleDateMode={true}
          compact
        >
          <ComboBox
            items={projectItems}
            selectedId={selectedProjectId}
            onSelect={(item) => setSelectedProjectId(item?.id ?? FINANCIAL_ENTITY_FILTER_ALL)}
            placeholder="Project"
            className="w-40 sm:w-52 flex-shrink-0"
          />
        </ReportToolbar>

        <div className="bg-app-card border-t border-app-border px-2 sm:px-3 py-2 space-y-2">
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs items-center">
            <label className="flex items-center gap-2 cursor-pointer text-app-muted hover:text-app-text">
              <input
                type="checkbox"
                checked={hideZeros}
                onChange={(e) => setHideZeros(e.target.checked)}
                className="rounded border-app-border"
              />
              Hide zero lines
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-app-muted hover:text-app-text">
              <input
                type="checkbox"
                checked={compareMode !== 'none'}
                onChange={(e) => setCompareMode(e.target.checked ? 'prior_year' : 'none')}
                className="rounded border-app-border"
              />
              Compare period
            </label>
            {compareMode !== 'none' && (
              <select
                value={compareMode}
                onChange={(e) => setCompareMode(e.target.value as BalanceSheetCompareMode)}
                className="rounded border border-app-border bg-app-input text-app-text text-xs py-1 px-2"
                aria-label="Comparison period"
              >
                <option value="prior_year">Prior fiscal year</option>
                <option value="prior_month">Prior month</option>
              </select>
            )}
            <label className="flex items-center gap-2 cursor-pointer text-app-muted hover:text-app-text">
              <input
                type="checkbox"
                checked={includeProjectAnalysis}
                onChange={(e) => setIncludeProjectAnalysis(e.target.checked)}
                className="rounded border-app-border"
              />
              Include project analysis
            </label>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="text-xs h-8 px-3 bg-app-toolbar hover:bg-app-toolbar/80"
              onClick={handleExportPdf}
            >
              <span className="w-3.5 h-3.5 mr-1.5 inline-block">{ICONS.fileText}</span>
              Export PDF
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="text-xs h-8 px-3 bg-app-toolbar hover:bg-app-toolbar/80"
              onClick={() => setDebugOpen(true)}
            >
              <span className="w-3.5 h-3.5 mr-1.5 inline-block">{ICONS.info}</span>
              Validation / debug
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="text-xs h-8 px-3 bg-primary/15 text-primary border-primary/30 hover:bg-primary/20"
              onClick={handleExportExcel}
              disabled={!report}
            >
              <span className="w-3.5 h-3.5 mr-1.5 inline-block">{ICONS.export}</span>
              Export
            </Button>
            <PrintButton
              variant="secondary"
              size="sm"
              onPrint={() => triggerPrint('REPORT', { elementId: 'printable-area' })}
              className="text-xs h-8 px-3"
              showLabel={true}
            />
          </div>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto min-h-0" id="printable-area">
        <Card className="min-h-full p-3 sm:p-4 border-0 sm:border shadow-none sm:shadow-ds-card bg-transparent sm:bg-app-card">
          <ReportHeader />

          <div className="text-center py-4 mb-2">
            <h3 className="text-2xl sm:text-3xl font-bold text-app-text uppercase tracking-[0.2em] leading-tight">
              Balance Sheet
            </h3>
            <p className="text-sm text-app-muted mt-2">
              {projectLabel} · As of {formatDate(asOfDate)}
            </p>
            {previousAsOfDate && (
              <p className="text-xs text-app-muted mt-1">Compared with {formatDate(previousAsOfDate)}</p>
            )}
            {loading && <p className="text-xs text-app-muted mt-2">Loading from server…</p>}
          </div>

          {!report ? (
            <p className="text-center text-sm text-app-muted py-12">
              {loading ? 'Loading balance sheet…' : 'Could not load balance sheet from the server.'}
            </p>
          ) : (
            <>
              {summaryCards}

              <div className="max-w-7xl mx-auto mb-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-app-border/70 bg-app-toolbar/50 px-3 py-2">
                  <span className="text-app-muted">Retained Earnings (prior fiscal years): </span>
                  <span className="font-mono font-semibold text-app-text">
                    {formatMoney(report.retainedEarningsPriorYears, false)}
                  </span>
                </div>
                <div className="rounded-lg border border-app-border/70 bg-app-toolbar/50 px-3 py-2">
                  <span className="text-app-muted">Current Year Earnings: </span>
                  <span className="font-mono font-semibold text-app-text">
                    {formatMoney(report.currentYearEarningsFromPL, false)}
                  </span>
                </div>
              </div>

              {!report.isBalanced && (
                <div className="max-w-7xl mx-auto mb-4 p-3 rounded-xl border border-ds-danger/40 bg-[color:var(--badge-unpaid-bg)] text-sm text-ds-danger">
                  Balance Sheet is out of balance. Difference: {formatMoney(report.totals.difference, false)}
                </div>
              )}

              <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
                <div className="rounded-xl border border-app-border overflow-hidden shadow-ds-card">
                  {renderColumnHeader('Assets', 'asset')}
                  <div className="p-2 bg-app-card/40">
                    {renderSection('Current assets', report.assets.current, 'asset', 'assets-current')}
                    {renderSection('Non-current assets', report.assets.non_current, 'asset', 'assets-nc')}
                  </div>
                  {renderColumnFooter('Total Assets', report.totals.assets, 'asset')}
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl border border-app-border overflow-hidden shadow-ds-card">
                    {renderColumnHeader('Liabilities', 'liability')}
                    <div className="p-2 bg-app-card/40">
                      {renderSection('Current liabilities', report.liabilities.current, 'liability', 'liab-c')}
                      {renderSection('Non-current liabilities', report.liabilities.non_current, 'liability', 'liab-nc')}
                    </div>
                    {renderColumnFooter('Total Liabilities', report.totals.liabilities, 'liability')}
                  </div>

                  <div className="rounded-xl border border-app-border overflow-hidden shadow-ds-card">
                    {renderColumnHeader('Equity', 'equity')}
                    <div className="p-2 bg-app-card/40">
                      {renderSection("Owner's equity", report.equity.items, 'equity', 'eq')}
                    </div>
                    {renderColumnFooter('Total Equity', report.totals.equity, 'equity')}
                  </div>
                </div>
              </div>

              {includeProjectAnalysis && projectAnalysisRows.length > 0 && (
                <div className="max-w-7xl mx-auto mt-5 p-3 rounded-xl border border-app-border bg-app-toolbar/30">
                  <p className="text-xs font-bold text-app-text mb-2 uppercase tracking-wide">
                    Supplementary project analysis (does not affect balance sheet totals)
                  </p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-app-muted border-b border-app-border">
                        <th className="text-left py-1.5">Project</th>
                        <th className="text-right py-1.5">Assets</th>
                        <th className="text-right py-1.5">Liabilities</th>
                        <th className="text-right py-1.5">Net position</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectAnalysisRows.map((row) => (
                        <tr key={row.projectId} className="border-b border-app-border/40">
                          <td className="py-1.5 text-app-text">{row.projectName}</td>
                          <td className="py-1.5 text-right font-mono">{formatMoney(row.assets, false)}</td>
                          <td className="py-1.5 text-right font-mono">{formatMoney(row.liabilities, false)}</td>
                          <td className="py-1.5 text-right font-mono">{formatMoney(row.netPosition, false)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {report.supplemental.marketInventoryMemo > 0.01 && (
                <div className="max-w-7xl mx-auto mt-4 p-3 rounded-xl border border-app-border bg-app-toolbar/50 text-xs text-app-muted leading-snug">
                  <strong className="text-app-text">Supplemental (non-GAAP):</strong> aggregate list price of unsold
                  units — {formatMoney(report.supplemental.marketInventoryMemo, false)}. Not recognized as inventory
                  until sale.
                </div>
              )}

              <div className="max-w-7xl mx-auto mt-5">
                <div className="flex flex-col lg:flex-row justify-between items-center gap-4 bg-app-toolbar/90 p-4 rounded-xl border border-app-border shadow-ds-card">
                  <div className="text-center lg:text-left">
                    <p className="text-[10px] text-app-muted font-bold uppercase tracking-wider mb-1">
                      Accounting Equation
                    </p>
                    <p className="text-sm font-medium text-app-text">Assets = Liabilities + Equity</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-ds-success">
                      {formatMoney(report.totals.assets, false)}
                    </p>
                    <p className="text-[10px] text-app-muted uppercase tracking-wider mt-1">Calculation Value</p>
                  </div>
                  <div className="text-center lg:text-right">
                    {report.isBalanced ? (
                      <div className="inline-flex items-center gap-1.5 border border-ds-success/40 bg-ds-success/15 text-ds-success px-3 py-1 rounded-full text-xs font-bold">
                        <span className="w-3.5 h-3.5">{ICONS.checkCircle}</span>
                        Balanced
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 border border-ds-danger/40 bg-[color:var(--badge-unpaid-bg)] text-ds-danger px-3 py-1 rounded-full text-xs font-bold">
                        <span className="w-3.5 h-3.5">{ICONS.alertTriangle}</span>
                        Out of Balance
                      </div>
                    )}
                    <p className="text-xs text-app-muted mt-2">
                      Discrepancy: {formatMoney(report.totals.difference, false)}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          <ReportFooter />
        </Card>
      </div>

      {ledger && (
        <SettingsLedgerModal
          isOpen={!!ledger}
          onClose={() => setLedger(null)}
          entityId={ledger.id}
          entityType="account"
          entityName={ledger.name}
        />
      )}

      <Modal
        isOpen={debugOpen && !!report}
        onClose={() => setDebugOpen(false)}
        title="Balance sheet validation & debug"
        size="xl"
      >
        {report && (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto text-sm">
            <div>
              <p className="font-semibold text-app-text mb-2">Validation</p>
              {report.validation.length === 0 ? (
                <p className="text-app-muted">No issues reported.</p>
              ) : (
                <ul className="list-disc pl-5 space-y-1 text-app-text">
                  {report.validation.map((v, i) => (
                    <li key={i}>
                      <span className={v.severity === 'error' ? 'text-ds-danger' : 'text-app-muted'}>
                        [{v.code}] {v.message}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="text-app-muted text-xs space-y-1">
              <p>Cumulative P&amp;L (inception → as-of): {report.retainedEarningsFromPL.toFixed(2)}</p>
              <p>Retained earnings (prior fiscal years): {report.retainedEarningsPriorYears.toFixed(2)}</p>
              <p>Current year earnings: {report.currentYearEarningsFromPL.toFixed(2)}</p>
              <p>Equation difference: {report.totals.difference.toFixed(2)}</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ProjectBalanceSheetReport;
