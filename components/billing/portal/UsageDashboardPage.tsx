import React, { useEffect, useState } from 'react';
import {
  subscriptionBillingApi,
  type PortalUsage,
} from '../../../services/api/subscriptionBillingApi';
import { PortalSpinner, UsageMeters } from './BillingPortalShared';

const UsageDashboardPage: React.FC = () => {
  const [current, setCurrent] = useState<PortalUsage | null>(null);
  const [history, setHistory] = useState<
    Array<{ metric_date: string; users_count: number; projects_count: number; storage_bytes: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await subscriptionBillingApi.getUsageDashboard();
        setCurrent(res.current);
        setHistory(res.history);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load usage');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <PortalSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Usage dashboard</h2>
        <p className="text-sm text-slate-500 mt-1">Track users, projects, and storage against your plan.</p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {current ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-800">Current usage</h3>
            {!current.withinLimits && (
              <span className="text-xs font-medium text-rose-700 bg-rose-50 px-2 py-1 rounded">
                Over plan limits
              </span>
            )}
          </div>
          <UsageMeters usage={current} />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-500">
          No usage data available.
        </div>
      )}

      {history.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">Usage history</h3>
          </div>
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Date</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Users</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Projects</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Storage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {history.map((row) => (
                <tr key={row.metric_date}>
                  <td className="px-4 py-2">{row.metric_date}</td>
                  <td className="px-4 py-2">{row.users_count}</td>
                  <td className="px-4 py-2">{row.projects_count}</td>
                  <td className="px-4 py-2">
                    {(Number(row.storage_bytes) / (1024 * 1024 * 1024)).toFixed(2)} GB
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default UsageDashboardPage;
