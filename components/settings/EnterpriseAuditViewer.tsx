import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { auditTrailApi, type AuditTrailItem } from '../../services/api/auditTrailApi';
import { apiClient } from '../../services/api/client';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import { useNotification } from '../../context/NotificationContext';
import { formatDate } from '../../utils/dateUtils';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { useAuth } from '../../context/AuthContext';

type UserOption = { id: string; name: string; username: string };

const EnterpriseAuditViewer: React.FC = () => {
  const { tenant } = useAuth();
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
    if (isLocalOnlyMode() || !tenant?.id) {
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
      if (res.tenantId && res.tenantId !== tenant.id) {
        setItems([]);
        showNotification('Audit trail response did not match the active organization. Please refresh.', 'error');
        return;
      }
      setItems(res.items);
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'Failed to load audit trail.', 'error');
    } finally {
      setLoading(false);
    }
  }, [tenant?.id, userId, startDate, endDate, module, action, showNotification]);

  useEffect(() => {
    void loadFilters();
  }, [loadFilters]);

  useEffect(() => {
    setItems([]);
    void load();
  }, [load, tenant?.id]);

  const rows = useMemo(() => items, [items]);

  if (isLocalOnlyMode()) {
    return (
      <div className="rounded-lg border border-app-border bg-app-bg p-4 text-sm text-app-muted">
        Enterprise audit trail is available in LAN / server mode. Local-only installs use the transaction log in Data Management.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-app-text">Enterprise Audit Trail</h2>
        <p className="text-sm text-app-muted mt-1">
          Immutable record of sign-ins, user changes, role changes, and financial postings. Records cannot be edited or deleted.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 p-4 rounded-lg border border-app-border bg-app-bg">
        <Select label="User" value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">All users</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name || u.username}
            </option>
          ))}
        </Select>
        <div>
          <label className="block text-xs text-app-muted mb-1">From date</label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-app-muted mb-1">To date</label>
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
        <p className="text-sm text-app-muted">Loading audit events…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-app-muted">No audit events match your filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-app-border">
          <table className="min-w-full text-xs">
            <thead className="bg-app-bg text-left text-app-muted">
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
                <tr key={`${row.source}-${row.id}-${row.action}`} className="border-t border-app-border align-top">
                  <td className="px-3 py-2 whitespace-nowrap text-app-muted">
                    {formatDate(row.occurredAt, true)}
                  </td>
                  <td className="px-3 py-2 text-app-text">
                    {row.email || row.userId?.slice(0, 12) || '—'}
                  </td>
                  <td className="px-3 py-2">{row.module}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex rounded-full bg-app-surface-2 px-2 py-0.5 font-medium text-app-text">
                      {row.action}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-app-muted max-w-md">{row.summary || '—'}</td>
                  <td className="px-3 py-2 font-mono text-app-muted">{row.ipAddress || '—'}</td>
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
