import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ProjectExpenseVoucherReportApiRepository,
  type PeVAggregateRow,
  type PeVRegisterRow,
  type PeVTrendRow,
} from '../../services/api/repositories/projectExpenseVoucherApi';
import Card from '../ui/Card';
import ComboBox from '../ui/ComboBox';
import ReportToolbar, { ReportDateRange } from '../reports/ReportToolbar';
import { useProjectReportAppState } from '../../hooks/useSelectiveState';
import { CURRENCY } from '../../constants';
import { toLocalDateString } from '../../utils/dateUtils';
import { usePermissions } from '../../hooks/usePermissions';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const reportApi = new ProjectExpenseVoucherReportApiRepository();

type ReportTab = 'register' | 'byCategory' | 'byProject' | 'byVendor' | 'trend';

const TABS: { id: ReportTab; label: string }[] = [
  { id: 'register', label: 'Expense Register' },
  { id: 'byCategory', label: 'By Category' },
  { id: 'byProject', label: 'By Project' },
  { id: 'byVendor', label: 'By Vendor' },
  { id: 'trend', label: 'Expense Trend' },
];

const ProjectExpenseVoucherReportsPage: React.FC = () => {
  const state = useProjectReportAppState();
  const { canReadPeV } = usePermissions();
  const [tab, setTab] = useState<ReportTab>('register');
  const [dateRange, setDateRange] = useState<ReportDateRange>('thisMonth');
  const [startDate, setStartDate] = useState(
    toLocalDateString(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  );
  const [endDate, setEndDate] = useState(
    toLocalDateString(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0))
  );
  const [projectId, setProjectId] = useState(state.defaultProjectId || 'all');
  const [loading, setLoading] = useState(false);
  const [register, setRegister] = useState<PeVRegisterRow[]>([]);
  const [aggregates, setAggregates] = useState<PeVAggregateRow[]>([]);
  const [trend, setTrend] = useState<PeVTrendRow[]>([]);

  const projectItems = useMemo(() => [{ id: 'all', name: 'All Projects' }, ...state.projects], [state.projects]);

  const filters = useMemo(
    () => ({
      projectId: projectId !== 'all' ? projectId : undefined,
      fromDate: startDate,
      toDate: endDate,
    }),
    [projectId, startDate, endDate]
  );

  const load = useCallback(async () => {
    if (!canReadPeV) return;
    setLoading(true);
    try {
      if (tab === 'register') {
        setRegister(await reportApi.register(filters));
      } else if (tab === 'trend') {
        setTrend(await reportApi.trend(filters));
      } else if (tab === 'byCategory') {
        setAggregates(await reportApi.byCategory(filters));
      } else if (tab === 'byProject') {
        setAggregates(await reportApi.byProject(filters));
      } else if (tab === 'byVendor') {
        setAggregates(await reportApi.byVendor(filters));
      }
    } finally {
      setLoading(false);
    }
  }, [canReadPeV, tab, filters]);

  useEffect(() => {
    load();
  }, [load]);

  if (!canReadPeV) {
    return (
      <Card className="p-6">
        <p className="text-app-muted">You do not have permission to view PEV reports.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Project Expense Voucher Reports</h2>

      <ReportToolbar
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
      />

      <div className="flex flex-wrap gap-2 items-center">
        <div className="min-w-[200px]">
          <ComboBox
            items={projectItems}
            selectedId={projectId}
            onSelect={(id) => setProjectId(id || 'all')}
            placeholder="All projects"
          />
        </div>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              tab === t.id ? 'bg-primary text-white' : 'bg-app-hover text-app-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card className="p-4">
        {loading ? (
          <p className="text-center text-app-muted py-8">Loading…</p>
        ) : tab === 'register' ? (
          register.length === 0 ? (
            <p className="text-center text-app-muted py-8">No vouchers in range.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-app-muted">
                  <th className="py-2">Voucher #</th>
                  <th className="py-2">Date</th>
                  <th className="py-2">Project</th>
                  <th className="py-2">Category</th>
                  <th className="py-2">Vendor</th>
                  <th className="py-2 text-right">Amount</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {register.map((r) => (
                  <tr key={r.id} className="border-b border-app-border/50">
                    <td className="py-2">{r.voucherNumber}</td>
                    <td className="py-2">{r.voucherDate}</td>
                    <td className="py-2">{r.projectName}</td>
                    <td className="py-2">{r.categoryName}</td>
                    <td className="py-2">{r.vendorName ?? '—'}</td>
                    <td className="py-2 text-right">
                      {CURRENCY} {r.amount.toLocaleString()}
                    </td>
                    <td className="py-2 capitalize">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : tab === 'trend' ? (
          trend.length === 0 ? (
            <p className="text-center text-app-muted py-8">No posted expenses in range.</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => `${CURRENCY} ${v.toLocaleString()}`} />
                <Bar dataKey="amount" fill="var(--color-primary, #2563eb)" name="Amount" />
              </BarChart>
            </ResponsiveContainer>
          )
        ) : aggregates.length === 0 ? (
          <p className="text-center text-app-muted py-8">No data in range.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-app-muted">
                <th className="py-2">Name</th>
                <th className="py-2 text-right">Count</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {aggregates.map((a) => (
                <tr key={a.key} className="border-b border-app-border/50">
                  <td className="py-2">{a.label}</td>
                  <td className="py-2 text-right">{a.count}</td>
                  <td className="py-2 text-right">
                    {CURRENCY} {a.amount.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};

export default ProjectExpenseVoucherReportsPage;
