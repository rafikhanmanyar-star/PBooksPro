import React, { useState, useMemo, useCallback } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType } from '../../types';
import Card from '../ui/Card';
import { CURRENCY } from '../../constants';
import { exportJsonToExcel } from '../../services/exportService';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import ReportToolbar, { ReportDateRange } from './ReportToolbar';
import { computeProfitLossReport, type ProfitLossLine } from './profitLossEngine';
import ComboBox from '../ui/ComboBox';
import { formatDate, toLocalDateString } from '../../utils/dateUtils';
import ProjectTransactionModal from '../dashboard/ProjectTransactionModal';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';

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
      ? 'bg-emerald-50 border-emerald-200'
      : variant === 'amber'
        ? 'bg-amber-50 border-amber-200'
        : 'bg-slate-800 text-white border-slate-700';
  const sub =
    variant === 'dark' ? 'text-slate-400' : 'text-slate-600';
  const val =
    variant === 'dark'
      ? 'text-white'
      : 'text-slate-900';
  return (
    <div className={`rounded-lg border p-4 ${bg}`}>
      <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${sub}`}>{label}</p>
      <p className={`text-xl font-bold tabular-nums ${val}`}>
        {CURRENCY} {value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
    </div>
  );
}

const ProjectProfitLossReport: React.FC = () => {
  const { state } = useAppContext();
  const { print: triggerPrint } = usePrintContext();

  const [dateRange, setDateRange] = useState<ReportDateRange>('all');
  const [startDate, setStartDate] = useState('2000-01-01');
  const [endDate, setEndDate] = useState(() => toLocalDateString(new Date()));
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [collapsedOpexRoots, setCollapsedOpexRoots] = useState<Set<string>>(new Set());

  const [drilldownData, setDrilldownData] = useState<{
    isOpen: boolean;
    categoryId?: string;
    categoryName: string;
    type: TransactionType;
  } | null>(null);

  const projectItems = useMemo(() => [{ id: 'all', name: 'All Projects' }, ...state.projects], [state.projects]);

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

  const report = useMemo(
    () => computeProfitLossReport(state, { startDate, endDate, selectedProjectId }),
    [state, startDate, endDate, selectedProjectId]
  );

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
  }, [report.operating_expenses, collapsedOpexRoots]);

  const renderLineRows = (rows: ProfitLossLine[], txType: TransactionType, isOpex?: boolean) => (
    <>
      {rows.map((row) => (
        <tr
          key={`${row.id}-${row.level}`}
          className="border-b border-slate-50 hover:bg-slate-50/80 cursor-pointer"
          onClick={() => handleDrilldown(row.id, row.name, txType)}
        >
          <td className="py-2 px-2 text-slate-700">
            <div style={{ paddingLeft: `${row.level * 1.25}rem` }} className="flex items-center gap-1">
              {isOpex && row.level === 0 && row.type === 'group' && (
                <button
                  type="button"
                  className="text-slate-400 hover:text-slate-700 p-0.5"
                  aria-expanded={collapsedOpexRoots.has(row.id) ? 'false' : 'true'}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleOpexRoot(row.id);
                  }}
                >
                  {collapsedOpexRoots.has(row.id) ? '▶' : '▼'}
                </button>
              )}
              {row.level > 0 && <span className="text-slate-300 mr-1">└</span>}
              <span className={row.type === 'group' ? 'font-semibold text-slate-800' : ''}>{row.name}</span>
            </div>
          </td>
          <td className="py-2 px-2 text-right font-medium tabular-nums">{CURRENCY} {row.amount.toLocaleString()}</td>
          <td className="py-2 px-2 text-right text-slate-500 text-xs tabular-nums">{row.pctOfRevenue.toFixed(1)}%</td>
        </tr>
      ))}
    </>
  );

  const handleExport = () => {
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

  const projectLabel = selectedProjectId === 'all' ? 'All Projects' : state.projects.find((p) => p.id === selectedProjectId)?.name;
  const cogsSubtotal = report.cost_of_sales.reduce((s, x) => s + x.amount, 0);
  const opexSubtotal = report.operating_expenses.reduce((s, x) => s + x.amount, 0);
  const otherIncSub = report.other_income.reduce((s, x) => s + x.amount, 0);
  const finSub = report.finance_cost.reduce((s, x) => s + x.amount, 0);

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
      <div className="flex-grow overflow-y-auto printable-area min-h-0" id="printable-area">
        <Card className="min-h-full">
          <ReportHeader />
          <h3 className="text-2xl font-bold text-center mb-2 text-slate-800">Profit &amp; Loss Statement</h3>
          <p className="text-center text-slate-500 mb-4 text-sm">
            {projectLabel}
            <br />
            {formatDate(startDate)} — {formatDate(endDate)}
          </p>

          {report.validation.issues.length > 0 && (
            <div className="max-w-4xl mx-auto mb-4 space-y-1">
              {report.validation.issues.map((iss, i) => (
                <div
                  key={i}
                  className={`text-sm rounded px-3 py-2 ${iss.severity === 'error' ? 'bg-rose-50 text-rose-900 border border-rose-200' : 'bg-amber-50 text-amber-900 border border-amber-200'}`}
                >
                  {iss.message}
                </div>
              ))}
              {!report.validation.ledgerMatch && (
                <div className="text-xs text-slate-600">
                  Ledger P&amp;L net: {CURRENCY} {report.validation.legacyNetProfit.toFixed(2)} · Structured net: {CURRENCY}{' '}
                  {report.validation.structuredNetProfit.toFixed(2)}
                </div>
              )}
            </div>
          )}

          <div className="max-w-4xl mx-auto bg-white p-4 md:p-8 rounded-xl border border-slate-200 shadow-sm space-y-6">
            <section>
              <h4 className="text-sm font-bold text-slate-600 uppercase tracking-wide border-b pb-2 mb-2">A. Revenue</h4>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
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
                      <td colSpan={3} className="py-3 text-center text-slate-400 italic">
                        No revenue lines
                      </td>
                    </tr>
                  )}
                  <tr className="bg-slate-100 font-bold">
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
              <h4 className="text-sm font-bold text-slate-600 uppercase tracking-wide border-b pb-2 mb-2">B. Cost of sales</h4>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="py-2 px-2 text-left">Line</th>
                    <th className="py-2 px-2 text-right">Amount</th>
                    <th className="py-2 px-2 text-right w-20">% Rev</th>
                  </tr>
                </thead>
                <tbody>
                  {renderLineRows(report.cost_of_sales, TransactionType.EXPENSE)}
                  <tr className="bg-slate-100 font-bold">
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
              <h4 className="text-sm font-bold text-slate-600 uppercase tracking-wide border-b pb-2 mb-2">
                D. Operating expenses
              </h4>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="py-2 px-2 text-left">Line</th>
                    <th className="py-2 px-2 text-right">Amount</th>
                    <th className="py-2 px-2 text-right w-20">% Rev</th>
                  </tr>
                </thead>
                <tbody>
                  {renderLineRows(opexVisible, TransactionType.EXPENSE, true)}
                  <tr className="bg-slate-100 font-bold">
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
              <h4 className="text-sm font-bold text-slate-600 uppercase tracking-wide border-b pb-2 mb-2">F. Other income</h4>
              <table className="w-full text-sm">
                <tbody>
                  {renderLineRows(report.other_income, TransactionType.INCOME)}
                  <tr className="bg-slate-100 font-bold">
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
              <h4 className="text-sm font-bold text-slate-600 uppercase tracking-wide border-b pb-2 mb-2">G. Finance costs</h4>
              <table className="w-full text-sm">
                <tbody>
                  {renderLineRows(report.finance_cost, TransactionType.EXPENSE)}
                  <tr className="bg-slate-100 font-bold">
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
            <div className="rounded-xl border-2 border-slate-800 bg-slate-900 text-white p-6 text-center shadow-lg">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">J. Net profit / (loss)</p>
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
                projectId: selectedProjectId,
                projectName: projectLabel || 'All Projects',
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
