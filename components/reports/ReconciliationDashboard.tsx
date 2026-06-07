import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../ui/Button';
import {
  financialReconciliationApi,
  type FinancialReconciliationCertification,
  type CertificationStatus,
} from '../../services/api/financialReconciliationApi';
import { isLocalOnlyMode } from '../../config/apiUrl';

function statusColor(status: CertificationStatus): string {
  switch (status) {
    case 'reconciled':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'differences':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'critical':
      return 'bg-rose-50 text-rose-800 border-rose-200';
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

function scoreColor(score: number): string {
  if (score >= 85) return 'text-emerald-600';
  if (score >= 70) return 'text-amber-600';
  return 'text-rose-600';
}

function defaultPeriod(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const from = `${y}-${m}-01`;
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

const ReconciliationDashboard: React.FC = () => {
  const [{ from, to }, setPeriod] = useState(defaultPeriod);
  const [data, setData] = useState<FinancialReconciliationCertification | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (isLocalOnlyMode()) {
      setError('Reconciliation certification requires API mode with PostgreSQL journal data.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await financialReconciliationApi.getCertification({ from, to }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load reconciliation certification');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const unifiedCount = useMemo(
    () => data?.reportSources.filter((r) => r.status === 'unified').length ?? 0,
    [data]
  );

  if (isLocalOnlyMode()) {
    return (
      <div className="p-6 text-sm text-slate-600">
        Financial Reconciliation Certification is available in API / PostgreSQL mode where journal entries are stored
        on the server.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Financial Reconciliation Certification</h2>
          <p className="text-sm text-slate-500 mt-1">
            Validates Trial Balance, General Ledger, Profit &amp; Loss, and Balance Sheet against journal-backed data.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">From</label>
            <input
              type="date"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={from}
              onChange={(e) => setPeriod((p) => ({ ...p, from: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">To</label>
            <input
              type="date"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={to}
              onChange={(e) => setPeriod((p) => ({ ...p, to: e.target.value }))}
            />
          </div>
          <Button onClick={() => void load()} disabled={loading}>
            {loading ? 'Certifying…' : 'Run certification'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      {loading && !data && (
        <div className="flex justify-center py-16">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className={`rounded-xl border p-4 ${statusColor(data.overallStatus)}`}>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Status</p>
              <p className="text-lg font-bold mt-1 capitalize">{data.overallStatus}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Certification score</p>
              <p className={`text-3xl font-bold mt-1 ${scoreColor(data.score)}`}>{data.score}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Missing journals</p>
              <p className="text-3xl font-bold mt-1 text-slate-800">{data.missingJournalCount}</p>
              <p className="text-xs text-slate-500 mt-1">
                {data.transactionCount} transactions · {data.journalEntryCount} journal entries
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Unified reports</p>
              <p className="text-3xl font-bold mt-1 text-slate-800">
                {unifiedCount}/{data.reportSources.length}
              </p>
            </div>
          </div>

          <p className="text-sm text-slate-600">{data.summary}</p>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Reconciliation checks</h3>
            </div>
            <ul className="divide-y divide-slate-100">
              {data.checks.map((check) => (
                <li key={check.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        check.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {check.passed ? '✓' : '✗'}
                    </span>
                    <span className="text-sm text-slate-800">{check.label}</span>
                  </div>
                  <div className="text-xs text-slate-500 sm:text-right">
                    {check.expected != null && (
                      <span>
                        Expected {check.expected} · Actual {check.actual}
                        {check.difference != null && check.difference > 0 && (
                          <span className="text-rose-600 ml-1">(Δ {check.difference})</span>
                        )}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {data.differences.length > 0 && (
            <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-5">
              <h3 className="font-semibold text-amber-900 mb-3">Differences</h3>
              <ul className="space-y-2 text-sm text-amber-900">
                {data.differences.map((d, i) => (
                  <li key={`${d.code}-${i}`}>
                    <span className="font-medium">{d.code}:</span> {d.message}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.missingJournals.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800">Missing journal mirrors</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Transactions without posted journal entries — run{' '}
                  <code className="bg-slate-100 px-1 rounded">npm run backfill-transaction-journal --prefix backend</code>
                </p>
              </div>
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-5 py-2">Date</th>
                      <th className="px-5 py-2">Type</th>
                      <th className="px-5 py-2">Amount</th>
                      <th className="px-5 py-2">Transaction ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.missingJournals.map((m) => (
                      <tr key={m.transactionId}>
                        <td className="px-5 py-2 whitespace-nowrap">{m.date}</td>
                        <td className="px-5 py-2">{m.type}</td>
                        <td className="px-5 py-2">{m.amount.toFixed(2)}</td>
                        <td className="px-5 py-2 font-mono text-xs">{m.transactionId.slice(0, 12)}…</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Report source audit</h3>
              <p className="text-xs text-slate-500 mt-0.5">Data sources for each financial report</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-2">Report</th>
                    <th className="px-5 py-2">Source</th>
                    <th className="px-5 py-2">Status</th>
                    <th className="px-5 py-2">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.reportSources.map((r) => (
                    <tr key={r.reportId}>
                      <td className="px-5 py-2 font-medium text-slate-800">{r.reportName}</td>
                      <td className="px-5 py-2 capitalize">{r.primarySource}</td>
                      <td className="px-5 py-2">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            r.status === 'unified'
                              ? 'bg-emerald-50 text-emerald-700'
                              : r.status === 'partial'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-5 py-2 text-slate-600 text-xs max-w-md">{r.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
            <h3 className="font-semibold text-slate-800 mb-2">Totals (journal-backed)</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>Assets: <strong>{data.reconciliation.totalAssets.toFixed(2)}</strong></div>
              <div>Liabilities: <strong>{data.reconciliation.totalLiabilities.toFixed(2)}</strong></div>
              <div>Equity: <strong>{data.reconciliation.totalEquity.toFixed(2)}</strong></div>
              <div>Net profit: <strong>{data.reconciliation.netProfit.toFixed(2)}</strong></div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default ReconciliationDashboard;
