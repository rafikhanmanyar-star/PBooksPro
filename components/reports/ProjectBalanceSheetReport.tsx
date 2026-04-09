import React, { useState, useMemo, useCallback } from 'react';
import { useAppContext } from '../../context/AppContext';
import Card from '../ui/Card';
import { CURRENCY } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import ReportToolbar, { ReportDateRange } from './ReportToolbar';
import ComboBox from '../ui/ComboBox';
import { formatDate, toLocalDateString } from '../../utils/dateUtils';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';
import {
  computeBalanceSheetReport,
  BS_GROUP_LABELS,
  type BalanceSheetLine,
  type BsGroupKey,
} from './balanceSheetEngine';
import SettingsLedgerModal from '../settings/SettingsLedgerModal';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

function formatMoney(n: number, hideZero: boolean): string | null {
  if (hideZero && Math.abs(n) < 0.01) return null;
  const s = `${CURRENCY} ${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  return s;
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
    const k = line.groupKey;
    const arr = m.get(k) ?? [];
    arr.push(line);
    m.set(k, arr);
  }
  return m;
}

const ProjectBalanceSheetReport: React.FC = () => {
  const { state } = useAppContext();
  const { print: triggerPrint } = usePrintContext();
  const [dateRange, setDateRange] = useState<ReportDateRange>('all');
  const [asOfDate, setAsOfDate] = useState(toLocalDateString(new Date()));
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [hideZeros, setHideZeros] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [ledger, setLedger] = useState<{ id: string; name: string } | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);

  const projectItems = useMemo(() => [{ id: 'all', name: 'All Projects' }, ...state.projects], [state.projects]);

  const report = useMemo(
    () => computeBalanceSheetReport(state, { asOfDate, selectedProjectId }),
    [state, asOfDate, selectedProjectId]
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
    if (dateRange !== 'custom') {
      setDateRange('custom');
    }
  };

  const toggleGroup = useCallback((key: string) => {
    setOpenGroups((o) => {
      const isOpen = o[key] !== false;
      return { ...o, [key]: !isOpen };
    });
  }, []);

  const handleExport = () => {
    const rows: { Category: string; Amount: number | string }[] = [
      { Category: 'ASSETS', Amount: '' },
      { Category: '  Current', Amount: '' },
      ...report.assets.current.map((l) => ({
        Category: `    ${BS_GROUP_LABELS[l.groupKey] ?? l.groupKey}: ${l.name}`,
        Amount: l.amount,
      })),
      { Category: '  Non-current', Amount: '' },
      ...report.assets.non_current.map((l) => ({
        Category: `    ${BS_GROUP_LABELS[l.groupKey] ?? l.groupKey}: ${l.name}`,
        Amount: l.amount,
      })),
      { Category: 'TOTAL ASSETS', Amount: report.totals.assets },
      { Category: '', Amount: '' },
      { Category: 'LIABILITIES', Amount: '' },
      ...report.liabilities.current.map((l) => ({
        Category: `  Current: ${BS_GROUP_LABELS[l.groupKey] ?? l.groupKey}: ${l.name}`,
        Amount: l.amount,
      })),
      ...report.liabilities.non_current.map((l) => ({
        Category: `  Non-current: ${BS_GROUP_LABELS[l.groupKey] ?? l.groupKey}: ${l.name}`,
        Amount: l.amount,
      })),
      { Category: 'TOTAL LIABILITIES', Amount: report.totals.liabilities },
      { Category: '', Amount: '' },
      { Category: 'EQUITY', Amount: '' },
      ...report.equity.items.map((l) => ({ Category: `  ${l.name}`, Amount: l.amount })),
      { Category: 'TOTAL EQUITY', Amount: report.totals.equity },
    ];
    if (report.supplemental.marketInventoryMemo > 0.01) {
      rows.push(
        { Category: '', Amount: '' },
        {
          Category: 'SUPPLEMENTAL (non-GAAP): Unsold units list-price memo',
          Amount: report.supplemental.marketInventoryMemo,
        }
      );
    }
    exportJsonToExcel(rows, 'balance-sheet.xlsx', 'Balance Sheet');
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
            {keys.map((gk) => {
              const groupLines = byKey.get(gk) ?? [];
              const subtotal = groupLines.reduce((s, l) => s + l.amount, 0);
              if (hideZeros && Math.abs(subtotal) < 0.01) return null;
              return (
                <div key={gk} className="border border-app-border/60 rounded-md overflow-hidden">
                  <div className="px-1.5 py-0.5 bg-app-toolbar/80 text-[11px] font-semibold text-app-muted leading-tight">
                    {BS_GROUP_LABELS[gk] ?? gk}
                  </div>
                  {groupLines.map((line) => {
                    if (hideZeros && Math.abs(line.amount) < 0.01) return null;
                    return (
                      <div
                        key={line.id}
                        className="flex justify-between py-0.5 px-1.5 hover:bg-app-toolbar/50 rounded cursor-pointer"
                        onClick={() => {
                          if (line.accountId) setLedger({ id: line.accountId, name: line.name });
                        }}
                        title={line.accountId ? 'Click for ledger' : undefined}
                      >
                        <span className="text-app-text pr-2">{line.name}</span>
                        <MoneyCell amount={line.amount} hideZero={false} />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
        <div className="flex justify-between py-1.5 px-2 bg-app-toolbar border-t border-app-border font-bold text-sm text-app-text">
          <span>Subtotal {title}</span>
          <span className="tabular-nums">
            {CURRENCY}{' '}
            {total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full space-y-2 bg-background">
      <style>{STANDARD_PRINT_STYLES}</style>
      <div className="flex-shrink-0">
        <ReportToolbar
          startDate={asOfDate}
          endDate={asOfDate}
          onDateChange={(start) => handleDateChange(start)}
          onExport={handleExport}
          onPrint={() => triggerPrint('REPORT', { elementId: 'printable-area' })}
          hideGroup={true}
          showDateFilterPills={true}
          activeDateRange={dateRange}
          onRangeChange={handleRangeChange}
          hideSearch={true}
          singleDateMode={true}
          compact
        >
          <div className="w-40 sm:w-48 flex-shrink-0">
            <ComboBox
              items={projectItems}
              selectedId={selectedProjectId}
              onSelect={(item) => setSelectedProjectId(item?.id || 'all')}
              allowAddNew={false}
              placeholder="Select Project"
            />
          </div>
        </ReportToolbar>
      </div>

      <div className="flex flex-wrap gap-1.5 px-1 text-xs leading-none">
        <label className="flex items-center gap-2 cursor-pointer text-app-muted">
          <input
            type="checkbox"
            checked={hideZeros}
            onChange={(e) => setHideZeros(e.target.checked)}
            className="rounded border-app-border"
          />
          Hide zero lines
        </label>
        <Button type="button" variant="secondary" className="text-xs py-1" onClick={() => setDebugOpen(true)}>
          Discrepancy / debug
        </Button>
      </div>

      <div className="flex-grow overflow-y-auto printable-area min-h-0" id="printable-area">
        <Card className="min-h-full p-2 sm:p-3">
          <ReportHeader />
          <div className="text-center mb-2">
            <h3 className="text-lg font-bold text-app-text uppercase tracking-wide leading-tight">
              Statement of Financial Position
            </h3>
            <p className="text-xs text-app-muted font-medium mt-0.5 leading-tight">
              {selectedProjectId === 'all'
                ? 'All Projects'
                : state.projects.find((p) => p.id === selectedProjectId)?.name}
            </p>
            <p className="text-[11px] text-app-muted/90 leading-tight">As of {formatDate(asOfDate)}</p>
          </div>

          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
            <div>
              <h4 className="text-sm font-bold text-ds-success mb-1">Assets</h4>
              {renderSection('Current assets', report.assets.current, 'asset', 'assets-current')}
              {renderSection('Non-current assets', report.assets.non_current, 'asset', 'assets-nc')}
              <div className="flex justify-between py-1.5 px-2 bg-app-toolbar border border-ds-success/35 rounded-lg font-bold text-sm text-app-text">
                <span className="text-ds-success">Total assets</span>
                <span className="tabular-nums font-mono">
                  {formatMoney(report.totals.assets, false)}
                </span>
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
              {renderSection("Shareholders' equity", report.equity.items, 'equity', 'eq')}
              <div className="flex justify-between py-1.5 px-2 bg-app-toolbar border border-primary/25 rounded-lg font-bold text-sm">
                <span className="text-primary">Total equity</span>
                <span className="tabular-nums font-mono">{formatMoney(report.totals.equity, false)}</span>
              </div>
            </div>
          </div>

          {report.supplemental.marketInventoryMemo > 0.01 && (
            <div className="max-w-7xl mx-auto mt-2 p-2 rounded-lg border border-app-border bg-app-toolbar/50 text-xs text-app-muted leading-snug">
              <strong className="text-app-text">Supplemental (non-GAAP):</strong> aggregate list price of unsold units —{' '}
              {formatMoney(report.supplemental.marketInventoryMemo, false)}. Not recognized as inventory until sale.
            </div>
          )}

          <div className="max-w-7xl mx-auto mt-2 border-t border-app-border pt-2">
            <div className="flex flex-col md:flex-row justify-between items-center gap-2 bg-app-toolbar p-2 rounded-lg border border-app-border shadow-ds-card">
              <div className="text-center md:text-left mb-0">
                <p className="text-[10px] text-app-muted font-bold uppercase tracking-wide mb-0.5">Accounting equation</p>
                <p className="text-xs font-medium text-app-text leading-tight">Assets = Liabilities + Equity</p>
              </div>

              <div className="flex items-center gap-2 sm:gap-3 text-sm sm:text-base font-bold font-mono tabular-nums flex-wrap justify-center">
                <div className="text-ds-success">
                  <span className="text-[10px] text-app-muted block font-sans font-normal text-center leading-none">
                    Assets
                  </span>
                  {formatMoney(report.totals.assets, false)}
                </div>
                <div className="text-app-muted text-sm">=</div>
                <div className="text-app-text">
                  <span className="text-[10px] text-app-muted block font-sans font-normal text-center leading-none">
                    Liab + Equity
                  </span>
                  {formatMoney(report.totals.liabilities + report.totals.equity, false)}
                </div>
              </div>

              {report.isBalanced ? (
                <div className="flex items-center gap-1.5 border border-ds-success/40 bg-[color:var(--badge-paid-bg)] text-ds-success px-2 py-0.5 rounded-full text-[11px] font-bold">
                  <span>✓</span> Balanced
                </div>
              ) : (
                <div className="flex flex-col items-end gap-0.5">
                  <div className="flex items-center gap-1.5 border border-ds-danger/40 bg-[color:var(--badge-unpaid-bg)] text-[color:var(--badge-unpaid-text)] px-2 py-0.5 rounded-full text-[11px] font-bold">
                    <span>⚠</span> Discrepancy: {formatMoney(report.discrepancy, false)}
                  </div>
                  <span className="text-[9px] text-app-muted max-w-xs text-right leading-tight">
                    Review validation messages and debug detail. Common causes: unreconciled Internal Clearing, or data
                    entry timing.
                  </span>
                </div>
              )}
            </div>
          </div>

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
        isOpen={debugOpen}
        onClose={() => setDebugOpen(false)}
        title="Balance sheet validation & debug"
        size="xl"
      >
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
          <div>
            <p className="font-semibold text-app-text mb-2">Line items (breakdown)</p>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-app-border text-left text-app-muted">
                  <th className="py-1 pr-2">Name</th>
                  <th className="py-1 pr-2">Group</th>
                  <th className="py-1 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {report.debugLines.map((line) => (
                  <tr key={line.id + line.name} className="border-b border-app-border/50">
                    <td className="py-1 pr-2 text-app-text">{line.name}</td>
                    <td className="py-1 pr-2 text-app-muted">{line.groupKey}</td>
                    <td className="py-1 text-right font-mono">{line.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-app-muted text-xs">
            Retained earnings (cumulative P&amp;L): {report.retainedEarningsFromPL.toFixed(2)} (same rules as Project
            P&amp;L through this date).
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ProjectBalanceSheetReport;
