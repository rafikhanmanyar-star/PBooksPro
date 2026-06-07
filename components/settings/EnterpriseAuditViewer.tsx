import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { auditTrailApi, type AuditTrailItem } from '../../services/api/auditTrailApi';
import { apiClient } from '../../services/api/client';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import { useNotification } from '../../context/NotificationContext';
import { formatDate } from '../../utils/dateUtils';
import { isLocalOnlyMode } from '../../config/apiUrl';

type UserOption = { id: string; name: string; username: string };

const EnterpriseAuditViewer: React.FC = () => {
  const { showNotification } = useNotification();
  const [items, setItems] = useState<AuditTrailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [modules, setModules] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);

  const [userId, setUserId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [module, setModule] = useState('');
  const [action, setAction] = useState('');

  const loadFilters = useCallback(async () => {
    if (isLocalOnlyMode()) return;
    try {
      const [filterOpts, userRows] = await Promise.all([
        auditTrailApi.getFilterOptions(),
        apiClient.get<UserOption[]>('/users').catch(() => [] as UserOption[]),
      ]);
      setModules(filterOpts.modules);
      setActions(filterOpts.actions);
      setUsers(Array.isArray(userRows) ? userRows : []);
    } catch {
      /* optional metadata */
    }
  }, []);

  const load = useCallback(async () => {
    if (isLocalOnlyMode()) {
      setLoading(false);
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const res = await auditTrailApi.listEvents({
        userId: userId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        module: module || undefined,
        action: action || undefined,
        limit: 300,
      });
      setItems(res.items);
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'Failed to load audit trail.', 'error');
    } finally {
      setLoading(false);
    }
  }, [userId, startDate, endDate, module, action, showNotification]);

  useEffect(() => {
    void loadFilters();
  }, [loadFilters]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => items, [items]);

  if (isLocalOnlyMode()) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Enterprise audit trail is available in LAN / server mode. Local-only installs use the transaction log in Data Management.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Enterprise Audit Trail</h2>
        <p className="text-sm text-slate-500 mt-1">
          Immutable record of sign-ins, user changes, role changes, and financial postings. Records cannot be edited or deleted.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 p-4 rounded-lg border border-slate-200 bg-slate-50">
        <Select label="User" value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">All users</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name || u.username}
            </option>
          ))}
        </Select>
        <div>
          <label className="block text-xs text-slate-500 mb-1">From date</label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">To date</label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <Select label="Module" value={module} onChange={(e) => setModule(e.target.value)}>
          <option value="">All modules</option>
          {modules.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
        <Select label="Action" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex justify-end">
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading audit events…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">No audit events match your filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Module</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Summary</th>
                <th className="px-3 py-2 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.source}-${row.id}-${row.action}`} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                    {formatDate(row.occurredAt, true)}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {row.email || row.userId?.slice(0, 12) || '—'}
                  </td>
                  <td className="px-3 py-2">{row.module}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                      {row.action}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600 max-w-md">{row.summary || '—'}</td>
                  <td className="px-3 py-2 font-mono text-slate-500">{row.ipAddress || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default EnterpriseAuditViewer;
