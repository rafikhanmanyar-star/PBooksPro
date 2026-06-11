import React, { useCallback, useEffect, useState } from 'react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { useNotification } from '../../context/NotificationContext';
import {
  accountingPeriodsApi,
  type AccountingPeriod,
} from '../../services/api/accountingPeriodsApi';

type Props = {
  isAdmin: boolean;
};

const AccountingPeriodsSection: React.FC<Props> = ({ isAdmin }) => {
  const { showNotification } = useNotification();
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [yearEndOnClose, setYearEndOnClose] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await accountingPeriodsApi.list();
      setPeriods(rows);
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'Failed to load accounting periods.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleOpen = async () => {
    if (!startDate || !endDate) {
      showNotification('Start and end dates are required.', 'error');
      return;
    }
    setBusyId('open');
    try {
      await accountingPeriodsApi.openPeriod(startDate, endDate);
      showNotification('Accounting period opened.', 'success');
      setStartDate('');
      setEndDate('');
      await load();
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'Failed to open period.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleClose = async (period: AccountingPeriod) => {
    if (period.status === 'closed') return;
    if (!window.confirm(`Close period ${period.startDate} – ${period.endDate}? This posts closing journal entries.`)) {
      return;
    }
    setBusyId(period.id);
    try {
      const result = await accountingPeriodsApi.closePeriod(period.id, {
        performYearEndTransfer: yearEndOnClose || period.endDate.endsWith('-12-31'),
      });
      const net = result.totals.netIncome;
      showNotification(
        `Period closed. Net income: ${net.toFixed(2)}${result.closingJournalEntryId ? '' : ' (no P&L activity)'}.`,
        'success'
      );
      await load();
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'Failed to close period.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleReopen = async (period: AccountingPeriod) => {
    if (!isAdmin) {
      showNotification('Only administrators can reopen closed periods.', 'error');
      return;
    }
    if (
      !window.confirm(
        `Reopen period ${period.startDate} – ${period.endDate}? Closing journal entries are not reversed automatically.`
      )
    ) {
      return;
    }
    setBusyId(period.id);
    try {
      await accountingPeriodsApi.reopenPeriod(period.id);
      showNotification('Accounting period reopened.', 'success');
      await load();
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'Failed to reopen period.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-app-text">Accounting Periods</h2>
        <p className="text-sm text-app-muted mt-1">
          Open fiscal periods for posting. Closing a period generates journal entries that transfer P&amp;L to
          Current Year Earnings (and Retained Earnings on year-end). Posting into closed periods is blocked.
        </p>
      </div>

      <div className="rounded-lg border border-app-border bg-app-bg p-4 space-y-3">
        <h3 className="text-sm font-medium text-app-text">Open new period</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-app-muted mb-1">Start date</label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-app-muted mb-1">End date</label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <Button onClick={() => void handleOpen()} disabled={busyId === 'open'}>
            Open Period
          </Button>
        </div>
        <label className="flex items-center gap-2 text-sm text-app-muted">
          <input
            type="checkbox"
            checked={yearEndOnClose}
            onChange={(e) => setYearEndOnClose(e.target.checked)}
          />
          Transfer Current Year Earnings to Retained Earnings when closing (year-end)
        </label>
      </div>

      {loading ? (
        <p className="text-sm text-app-muted">Loading periods…</p>
      ) : periods.length === 0 ? (
        <p className="text-sm text-app-muted">No accounting periods defined yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-app-border">
          <table className="min-w-full text-sm">
            <thead className="bg-app-bg text-left text-app-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Period</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Closed</th>
                <th className="px-3 py-2 font-medium">Closing journal</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.id} className="border-t border-app-border">
                  <td className="px-3 py-2">
                    {p.startDate} – {p.endDate}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        p.status === 'open'
                          ? 'inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700'
                          : 'inline-flex rounded-full bg-app-surface-2 px-2 py-0.5 text-xs font-medium text-app-muted'
                      }
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-app-muted">
                    {p.closedAt ? new Date(p.closedAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-app-muted">
                    {p.closingJournalEntryId?.slice(0, 8) ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right space-x-2">
                    {p.status === 'open' ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busyId === p.id}
                        onClick={() => void handleClose(p)}
                      >
                        Close Period
                      </Button>
                    ) : isAdmin ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busyId === p.id}
                        onClick={() => void handleReopen(p)}
                      >
                        Reopen
                      </Button>
                    ) : null}
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

export default AccountingPeriodsSection;
