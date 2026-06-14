import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useFinancialReportAppState, useProjects, useAccounts } from '../../hooks/useSelectiveState';
import Card from '../ui/Card';
import ComboBox from '../ui/ComboBox';
import { CURRENCY } from '../../constants';
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
  type BalanceSheetLine,
  type BsGroupKey,
  type BalanceSheetReportResult,
  type ComparativeBalanceSheetResult,
  type BalanceSheetCompareMode,
} from './balanceSheetEngine';
import { computeProjectFinancialPosition } from './projectFinancialPositionEngine';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { fetchBalanceSheetReport } from '../../services/api/financialReportsApi';
import { useReportTenantId } from '../../hooks/useReportTenantId';
import SettingsLedgerModal from '../settings/SettingsLedgerModal';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import {
  exportBalanceSheetExcel,
  exportBalanceSheetPdf,
  exportComparativeBalanceSheetExcel,
} from './exportBalanceSheet';
import { priorFiscalYearEnd, priorMonthEnd } from '../../utils/fiscalYear';

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

function groupLinesByKey(lines: BalanceSheetLine[]): Map<BsGroupKey, BalanceSheetLine[]> {
  const m = new Map<BsGroupKey, BalanceSheetLine[]>();
  for (const line of lines) {
    const arr = m.get(line.groupKey) ?? [];
    arr.push(line);
    m.set(line.groupKey, arr);
  }
  return m;
}

function isComparativeResult(
  r: BalanceSheetReportResult | ComparativeBalanceSheetResult
): r is ComparativeBalanceSheetResult {
  return 'current' in r && 'previous' in r;
}

const FISCAL_START_MONTH = 1;

const ProjectBalanceSheetReport: React.FC = () => {
  const projects = useProjects();
  const accounts = useAccounts();
  const reportState = useFinancialReportAppState();
  const { print: triggerPrint } = usePrintContext();
  const [dateRange, setDateRange] = useState<ReportDateRange>('all');
  const [asOfDate, setAsOfDate] = useState(toLocalDateString(new Date()));
  const [hideZeros, setHideZeros] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [ledger, setLedger] = useState<{ id: string; name: string } | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [accountGroupKey, setAccountGroupKey] = useState<string>('all');
  const [accountId, setAccountId] = useState<string>('all');
  const [compareMode, setCompareMode] = useState<BalanceSheetCompareMode>('none');
  const [includeProjectAnalysis, setIncludeProjectAnalysis] = useState(false);
  const localOnly = isLocalOnlyMode();
  const tenantId = useReportTenantId();
  const [serverReport, setServerReport] = useState<BalanceSheetReportResult | null>(null);
  const [serverPreviousReport, setServerPreviousReport] = useState<BalanceSheetReportResult | null>(null);
  const [serverPreviousDate, setServerPreviousDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const accountGroupItems = useMemo(
    () => [
      { id: 'all', name: 'All account groups' },
      ...(Object.entries(BS_GROUP_LABELS) as [BsGroupKey, string][]).map(([id, name]) => ({ id, name })),
    ],
    []
  );

  const accountItems = useMemo(
    () => [{ id: 'all', name: 'All accounts' }, ...accounts.map((a) => ({ id: a.id, name: a.name }))],
    [accounts]
  );

  const engineOptions = useMemo(
    () => ({
      asOfDate,
      selectedProjectId: 'all' as const,
      selectedBuildingId: 'all' as const,
      fiscalStartMonth: FISCAL_START_MONTH,
      accountGroupKey: (accountGroupKey === 'all' ? 'all' : accountGroupKey) as BsGroupKey | 'all',
      accountId: accountId === 'all' ? 'all' : accountId,
    }),
    [asOfDate, accountGroupKey, accountId]
  );

  useEffect(() => {
    if (localOnly || !tenantId) {
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
        const current = await fetchBalanceSheetReport({ asOfDate, projectId: 'all' });
        if (cancelled) return;
        setServerReport(current);

        if (compareMode !== 'none') {
          const prevDate =
            compareMode === 'prior_year'
              ? priorFiscalYearEnd(FISCAL_START_MONTH, asOfDate)
              : priorMonthEnd(asOfDate);
          const previous = await fetchBalanceSheetReport({ asOfDate: prevDate, projectId: 'all' });
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
  }, [localOnly, tenantId, asOfDate, compareMode]);

  const clientResult = useMemo(() => {
    if (compareMode === 'none') {
      return computeBalanceSheetReport(reportState, engineOptions);
    }
    return computeComparativeBalanceSheetReport(reportState, {
      ...engineOptions,
      compareMode,
    });
  }, [reportState, engineOptions, compareMode]);

  const report: BalanceSheetReportResult | null = !localOnly
    ? serverReport
    : isComparativeResult(clientResult)
      ? clientResult.current
      : clientResult;

  const previousReport: BalanceSheetReportResult | null = !localOnly
    ? serverPreviousReport
    : isComparativeResult(clientResult)
      ? clientResult.previous
      : null;

  const previousAsOfDate: string | null = !localOnly
    ? serverPreviousDate
    : isComparativeResult(clientResult)
      ? clientResult.previousAsOfDate
      : null;

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
    return (
      <div
        key={line.id + line.name}
        className={`flex ${showCompare ? 'grid grid-cols-[1fr_auto_auto_auto] gap-2' : 'justify-between'} py-0.5 px-1.5 hover:bg-app-toolbar/50 rounded cursor-pointer items-center`}
        onClick={() => {
          if (line.accountId) setLedger({ id: line.accountId, name: line.name });
        }}
        title={line.accountId ? 'Click for ledger drill-down' : undefined}
      >
        <span className="text-app-text pr-2 truncate">{line.name}</span>
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
    const color =
      side === 'asset' ? 'text-ds-success' : side === 'liability' ? 'text-ds-danger' : 'text-primary';
    const total = lines.reduce((s, l) => s + l.amount, 0);
    const showCompare = !!previousReport;

    return (
      <div className="mb-2 rounded-lg border border-app-border overflow-hidden bg-app-card shadow-ds-card">
        <button
          type="button"
          className={`w-full flex justify-between items-center text-left text-xs font-bold ${color} uppercase tracking-wide py-1.5 px-2 bg-app-table-header border-b border-app-border`}
          onClick={() => toggleGroup(sectionKey)}
        >
          <span>{title}</span>
          <span className="text-app-muted font-mono text-[10px]">{openGroups[sectionKey] !== false ? '▼' : '▶'}</span>
        </button>
        {openGroups[sectionKey] !== false && (
          <div className="p-2 space-y-1.5 text-xs leading-snug">
            {showCompare && (
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-1.5 pb-1 text-[10px] font-semibold text-app-muted uppercase">
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
                <div key={gk} className="border border-app-border/60 rounded-md overflow-hidden">
                  <div className="px-1.5 py-0.5 bg-app-toolbar/80 text-[11px] font-semibold text-app-muted leading-tight">
                    {BS_GROUP_LABELS[gk] ?? gk}
                  </div>
                  {groupLines.map((line) => renderLineRow(line))}
                </div>
              );
            })}
          </div>
        )}
        <div className="flex justify-between py-1.5 px-2 bg-app-toolbar border-t border-app-border font-bold text-sm text-app-text">
          <span>Subtotal {title}</span>
          <span className="tabular-nums font-mono">{formatMoney(total, false)}</span>
        </div>
      </div>
    );
  };

  const summaryCards = report ? (
    <div className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
      <div className="rounded-lg border border-ds-success/30 bg-app-card p-2.5">
        <p className="text-[10px] uppercase font-bold text-app-muted tracking-wide">Total Assets</p>
        <p className="text-base font-bold font-mono text-ds-success tabular-nums mt-0.5">
          {formatMoney(report.totals.assets, false)}
        </p>
      </div>
      <div className="rounded-lg border border-ds-danger/25 bg-app-card p-2.5">
        <p className="text-[10px] uppercase font-bold text-app-muted tracking-wide">Total Liabilities</p>
        <p className="text-base font-bold font-mono text-ds-danger tabular-nums mt-0.5">
          {formatMoney(report.totals.liabilities, false)}
        </p>
      </div>
      <div className="rounded-lg border border-primary/25 bg-app-card p-2.5">
        <p className="text-[10px] uppercase font-bold text-app-muted tracking-wide">Total Equity</p>
        <p className="text-base font-bold font-mono text-primary tabular-nums mt-0.5">
          {formatMoney(report.totals.equity, false)}
        </p>
      </div>
      <div
        className={`rounded-lg border p-2.5 bg-app-card ${
          report.isBalanced ? 'border-ds-success/40' : 'border-ds-danger/40'
        }`}
      >
        <p className="text-[10px] uppercase font-bold text-app-muted tracking-wide">Balance Status</p>
        {report.isBalanced ? (
          <p className="text-sm font-bold text-ds-success mt-1">✓ Balanced</p>
        ) : (
          <p className="text-sm font-bold text-ds-danger mt-1">
            ⚠ Out of Balance — {formatMoney(report.totals.difference, false)}
          </p>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className="flex flex-col h-full space-y-2 bg-background">
      <style>{STANDARD_PRINT_STYLES}</style>
      <div className="flex-shrink-0">
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
            items={accountGroupItems}
            selectedId={accountGroupKey}
            onSelect={setAccountGroupKey}
            placeholder="Account group"
            className="w-36 sm:w-44 flex-shrink-0"
          />
          <ComboBox
            items={accountItems}
            selectedId={accountId}
            onSelect={setAccountId}
            placeholder="Account"
            className="w-36 sm:w-44 flex-shrink-0"
          />
        </ReportToolbar>
      </div>

      <div className="flex flex-wrap gap-3 px-1 text-xs leading-none items-center">
        <label className="flex items-center gap-2 cursor-pointer text-app-muted">
          <input
            type="checkbox"
            checked={hideZeros}
            onChange={(e) => setHideZeros(e.target.checked)}
            className="rounded border-app-border"
          />
          Hide zero lines
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-app-muted">
          <input
            type="checkbox"
            checked={compareMode !== 'none'}
            onChange={(e) => setCompareMode(e.target.checked ? 'prior_year' : 'none')}
            className="rounded border-app-border"
          />
          Compare with previous period
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
        <label className="flex items-center gap-2 cursor-pointer text-app-muted">
          <input
            type="checkbox"
            checked={includeProjectAnalysis}
            onChange={(e) => setIncludeProjectAnalysis(e.target.checked)}
            className="rounded border-app-border"
          />
          Include project analysis
        </label>
        <Button type="button" variant="secondary" className="text-xs py-1" onClick={handleExportPdf}>
          Export PDF
        </Button>
        <Button type="button" variant="secondary" className="text-xs py-1" onClick={() => setDebugOpen(true)}>
          Validation / debug
        </Button>
      </div>

      <div className="flex-grow overflow-y-auto min-h-0" id="printable-area">
        <Card className="min-h-full p-2 sm:p-3">
          <ReportHeader />
          <div className="text-center mb-2">
            <h3 className="text-lg font-bold text-app-text uppercase tracking-wide leading-tight">Balance Sheet</h3>
            <p className="text-[11px] text-app-muted/90 leading-tight">Consolidated · As of {formatDate(asOfDate)}</p>
            {previousAsOfDate && (
              <p className="text-[10px] text-app-muted leading-tight">
                Compared with {formatDate(previousAsOfDate)}
              </p>
            )}
            {!localOnly && loading && <p className="text-xs text-app-muted mt-1">Loading from server…</p>}
          </div>

          {!localOnly && !report ? (
            <p className="text-center text-sm text-app-muted py-8">
              {loading ? 'Loading balance sheet…' : 'Could not load balance sheet from the server.'}
            </p>
          ) : report ? (
            <>
              {summaryCards}

              <div className="max-w-7xl mx-auto mb-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border border-app-border bg-app-toolbar/40 px-2 py-1.5">
                  <span className="text-app-muted">Retained Earnings (prior fiscal years): </span>
                  <span className="font-mono font-semibold">{formatMoney(report.retainedEarningsPriorYears, false)}</span>
                </div>
                <div className="rounded-md border border-app-border bg-app-toolbar/40 px-2 py-1.5">
                  <span className="text-app-muted">Current Year Earnings: </span>
                  <span className="font-mono font-semibold">{formatMoney(report.currentYearEarningsFromPL, false)}</span>
                </div>
              </div>

              {!report.isBalanced && (
                <div className="max-w-7xl mx-auto mb-2 p-2 rounded-lg border border-ds-danger/40 bg-[color:var(--badge-unpaid-bg)] text-sm text-ds-danger">
                  ⚠ Balance Sheet is out of balance. Difference: {formatMoney(report.totals.difference, false)}
                </div>
              )}

              <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
                <div>
                  <h4 className="text-sm font-bold text-ds-success mb-1">Assets</h4>
                  {renderSection('Current assets', report.assets.current, 'asset', 'assets-current')}
                  {renderSection('Non-current assets', report.assets.non_current, 'asset', 'assets-nc')}
                  <div className="flex justify-between py-1.5 px-2 bg-app-toolbar border border-ds-success/35 rounded-lg font-bold text-sm text-app-text">
                    <span className="text-ds-success">Total assets</span>
                    <span className="tabular-nums font-mono">{formatMoney(report.totals.assets, false)}</span>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-ds-danger mb-1">Liabilities</h4>
                  {renderSection('Current liabilities', report.liabilities.current, 'liability', 'liab-c')}
                  {renderSection('Non-current liabilities', report.liabilities.non_current, 'liability', 'liab-nc')}
                  <div className="flex justify-between py-1.5 px-2 mb-2 bg-app-toolbar border border-ds-danger/25 rounded-lg font-bold text-sm">
                    <span className="text-ds-danger">Total liabilities</span>
                    <span className="tabular-nums font-mono">{formatMoney(report.totals.liabilities, false)}</span>
                  </div>

                  <h4 className="text-sm font-bold text-primary mb-1">Equity</h4>
                  {renderSection("Owner's equity", report.equity.items, 'equity', 'eq')}
                  <div className="flex justify-between py-1.5 px-2 bg-app-toolbar border border-primary/25 rounded-lg font-bold text-sm">
                    <span className="text-primary">Total equity</span>
                    <span className="tabular-nums font-mono">{formatMoney(report.totals.equity, false)}</span>
                  </div>
                </div>
              </div>

              {includeProjectAnalysis && projectAnalysisRows.length > 0 && (
                <div className="max-w-7xl mx-auto mt-3 p-2 rounded-lg border border-app-border bg-app-toolbar/30">
                  <p className="text-xs font-bold text-app-text mb-2 uppercase tracking-wide">
                    Supplementary project analysis (does not affect balance sheet totals)
                  </p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-app-muted border-b border-app-border">
                        <th className="text-left py-1">Project</th>
                        <th className="text-right py-1">Assets</th>
                        <th className="text-right py-1">Liabilities</th>
                        <th className="text-right py-1">Net position</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectAnalysisRows.map((row) => (
                        <tr key={row.projectId} className="border-b border-app-border/40">
                          <td className="py-1 text-app-text">{row.projectName}</td>
                          <td className="py-1 text-right font-mono">{formatMoney(row.assets, false)}</td>
                          <td className="py-1 text-right font-mono">{formatMoney(row.liabilities, false)}</td>
                          <td className="py-1 text-right font-mono">{formatMoney(row.netPosition, false)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {report.supplemental.marketInventoryMemo > 0.01 && (
                <div className="max-w-7xl mx-auto mt-2 p-2 rounded-lg border border-app-border bg-app-toolbar/50 text-xs text-app-muted leading-snug">
                  <strong className="text-app-text">Supplemental (non-GAAP):</strong> aggregate list price of unsold units —{' '}
                  {formatMoney(report.supplemental.marketInventoryMemo, false)}. Not recognized as inventory until sale.
                </div>
              )}

              <div className="max-w-7xl mx-auto mt-2 border-t border-app-border pt-2">
                <div className="flex flex-col md:flex-row justify-between items-center gap-2 bg-app-toolbar p-2 rounded-lg border border-app-border shadow-ds-card">
                  <div className="text-center md:text-left">
                    <p className="text-[10px] text-app-muted font-bold uppercase tracking-wide mb-0.5">Accounting equation</p>
                    <p className="text-xs font-medium text-app-text">Assets = Liabilities + Equity</p>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 text-sm sm:text-base font-bold font-mono tabular-nums flex-wrap justify-center">
                    <div className="text-ds-success">{formatMoney(report.totals.assets, false)}</div>
                    <div className="text-app-muted text-sm">=</div>
                    <div className="text-app-text">{formatMoney(report.totals.liabilities + report.totals.equity, false)}</div>
                  </div>
                  {report.isBalanced ? (
                    <div className="flex items-center gap-1.5 border border-ds-success/40 bg-[color:var(--badge-paid-bg)] text-ds-success px-2 py-0.5 rounded-full text-[11px] font-bold">
                      <span>✓</span> Balanced
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 border border-ds-danger/40 bg-[color:var(--badge-unpaid-bg)] text-[color:var(--badge-unpaid-text)] px-2 py-0.5 rounded-full text-[11px] font-bold">
                      <span>⚠</span> Out of Balance
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}

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

      <Modal isOpen={debugOpen && !!report} onClose={() => setDebugOpen(false)} title="Balance sheet validation & debug" size="xl">
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
