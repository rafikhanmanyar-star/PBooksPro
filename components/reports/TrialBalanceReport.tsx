import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAppContext } from '../../context/AppContext';
import Card from '../ui/Card';
import { CURRENCY } from '../../constants';
import ReportHeader from './ReportHeader';
import ReportFooter from './ReportFooter';
import ReportToolbar, { ReportDateRange } from './ReportToolbar';
import { toLocalDateString } from '../../utils/dateUtils';
import { usePrintContext } from '../../context/PrintContext';
import { STANDARD_PRINT_STYLES } from '../../utils/printStyles';
import Button from '../ui/Button';
import {
  fetchTrialBalanceReport,
  type TrialBalanceReportResult,
} from '../../services/financialEngine/ledgerReports';
import type { TrialBalanceBasis } from '../../services/financialEngine/trialBalanceCore';
import { compareTrialBalanceType } from '../../services/financialEngine/trialBalanceCore';
import { exportJsonToExcel } from '../../services/exportService';

function money(n: number): string {
  return `${CURRENCY} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const TrialBalanceReport: React.FC = () => {
  const { state } = useAppContext();
  const { print: triggerPrint } = usePrintContext();
  const [dateRange, setDateRange] = useState<ReportDateRange>('thisMonth');
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return toLocalDateString(first);
  });
  const [endDate, setEndDate] = useState(() => toLocalDateString(new Date()));
  const [basis, setBasis] = useState<TrialBalanceBasis>('period');
  const [hideZeros, setHideZeros] = useState(false);
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set());

  const [data, setData] = useState<TrialBalanceReportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tenantId = useMemo(() => {
    if (typeof window === 'undefined') return 'local';
    return localStorage.getItem('tenant_id')?.trim() || 'local';
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetchTrialBalanceReport(tenantId, {
          from: startDate,
          to: endDate,
          basis,
          ledgerFallback: {
            transactions: state.transactions,
            accounts: state.accounts,
          },
        });
        if (!cancelled) setData(r);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, startDate, endDate, basis, state.transactions, state.accounts]);

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

  const grouped = useMemo(() => {
    if (!data) return [];
    const rows = hideZeros
      ? data.accounts.filter((a) => Math.abs(a.netBalance) >= 0.005)
      : data.accounts;
    const byType = new Map<string, typeof rows>();
    for (const a of rows) {
      const list = byType.get(a.accountType) ?? [];
      list.push(a);
      byType.set(a.accountType, list);
    }
    const types = [...byType.keys()].sort(compareTrialBalanceType);
    return types.map((t) => ({
      type: t,
      rows: (byType.get(t) ?? []).slice().sort((x, y) => {
        const cx = (x.accountCode || '').localeCompare(y.accountCode || '');
        if (cx !== 0) return cx;
        return x.accountName.localeCompare(y.accountName);
      }),
    }));
  }, [data, hideZeros]);

  const toggleType = useCallback((t: string) => {
    setCollapsedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }, []);

  const handleExport = () => {
    if (!data) return;
    const flat: Record<string, string | number>[] = [];
    for (const g of grouped) {
      flat.push({ Section: g.type, Account: '', Code: '', Debit: '', Credit: '' });
      for (const a of g.rows) {
        flat.push({
          Section: g.type,
          Account: a.accountName,
          Code: a.accountCode ?? '',
          Debit: a.debit,
          Credit: a.credit,
        });
      }
    }
    flat.push({
      Section: 'TOTALS',
      Account: '',
      Code: '',
      Debit: data.totals.totalDebit,
      Credit: data.totals.totalCredit,
    });
    exportJsonToExcel(flat as never, `TrialBalance_${startDate}_${endDate}.xlsx`);
  };

  const subtitle =
    basis === 'cumulative'
      ? `Cumulative through ${endDate} (all journal activity on or before end date)`
      : `Period activity ${startDate} – ${endDate}`;

  return (
    <div className="flex flex-col gap-4 p-4 max-w-6xl mx-auto print:p-2 printable-area" id="printable-area">
      <style>{STANDARD_PRINT_STYLES}</style>

      <Card className="p-4">
        <ReportHeader />
        <div className="text-center mb-6">
          <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Trial Balance</h3>
          <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
        </div>
        <div className="flex flex-col gap-4">
          <ReportToolbar
            startDate={startDate}
            endDate={endDate}
            onDateChange={handleDateChange}
            hideGroup={true}
            showDateFilterPills={true}
            activeDateRange={dateRange}
            onRangeChange={handleRangeChange}
            hideSearch={true}
          />

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <span>Basis</span>
              <select
                value={basis}
                onChange={(e) => setBasis(e.target.value as TrialBalanceBasis)}
                className="border border-slate-300 dark:border-slate-600 rounded-md px-2 py-1 bg-white dark:bg-slate-800"
              >
                <option value="period">Period (from–to)</option>
                <option value="cumulative">Cumulative (through end date)</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={hideZeros}
                onChange={(e) => setHideZeros(e.target.checked)}
              />
              Hide zero net
            </label>
            <Button variant="secondary" type="button" onClick={handleExport} disabled={!data}>
              Export Excel
            </Button>
            <Button variant="secondary" type="button" onClick={() => triggerPrint('REPORT', { elementId: 'printable-area' })} disabled={!data}>
              Print
            </Button>
          </div>

          {loading && <p className="text-slate-500 text-sm">Loading journal-based trial balance…</p>}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/40 dark:border-red-800 px-3 py-2 text-sm text-red-800 dark:text-red-200">
              {error}
            </div>
          )}

          {data?.dataSource === 'transactions_fallback' && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
              No posted <strong>journal</strong> lines in this range — amounts are reconstructed from your{' '}
              <strong>transaction ledger</strong> (Income, Expense, Transfer, Loan) with a balancing clearing line.
              Post journals from Settings → Journal entry (GL) for immutable double-entry in the database.
            </div>
          )}

          {data && !data.isBalanced && (
            <div
              className="rounded-lg border-2 border-red-500 bg-red-50 dark:bg-red-950/50 px-4 py-3 text-red-800 dark:text-red-100 font-semibold"
              role="alert"
            >
              UNBALANCED BOOKS — total debits and credits do not match. Review journal entries for the selected
              range.
            </div>
          )}

          {data && (
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 text-left">
                    <th className="px-3 py-2">Account</th>
                    <th className="px-3 py-2 w-28">Code</th>
                    <th className="px-3 py-2 text-right w-36">Debit</th>
                    <th className="px-3 py-2 text-right w-36">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map((g) => (
                    <React.Fragment key={g.type}>
                      <tr className="bg-slate-50 dark:bg-slate-900/80">
                        <td colSpan={4} className="px-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => toggleType(g.type)}
                            className="font-semibold text-indigo-700 dark:text-indigo-300 flex items-center gap-2"
                          >
                            <span className="tabular-nums w-4">{collapsedTypes.has(g.type) ? '▶' : '▼'}</span>
                            {g.type}
                            <span className="text-slate-500 font-normal text-xs">({g.rows.length})</span>
                          </button>
                        </td>
                      </tr>
                      {!collapsedTypes.has(g.type) &&
                        g.rows.map((a) => (
                          <tr
                            key={a.accountId}
                            className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                          >
                            <td className="px-3 py-2 pl-8">
                              {a.parentAccountId ? (
                                <span className="text-slate-600 dark:text-slate-400">↳ {a.accountName}</span>
                              ) : (
                                a.accountName
                              )}
                            </td>
                            <td className="px-3 py-2 text-slate-500 font-mono text-xs">{a.accountCode ?? '—'}</td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums">
                              {a.debit > 0 ? money(a.debit) : '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums">
                              {a.credit > 0 ? money(a.credit) : '—'}
                            </td>
                          </tr>
                        ))}
                    </React.Fragment>
                  ))}
                  <tr className="bg-slate-200/80 dark:bg-slate-700 font-semibold border-t-2 border-slate-300 dark:border-slate-600">
                    <td colSpan={2} className="px-3 py-3">
                      Totals
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">{money(data.totals.totalDebit)}</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">{money(data.totals.totalCredit)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {data && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Gross postings: debit {money(data.totals.grossDebit)} · credit {money(data.totals.grossCredit)}. Net
              columns follow double-entry: each account shows the net of debits minus credits on one side.
            </p>
          )}
        </div>
      </Card>

      <ReportFooter />
    </div>
  );
};

export default TrialBalanceReport;
