import React, { useCallback, useEffect, useState } from 'react';
import Button from '../ui/Button';
import {
  adminOrganizationRequestsApi,
  type OrganizationRequestDetail,
  type OrganizationRequestRow,
  type OrganizationStatus,
} from '../../services/api/adminOrganizationRequestsApi';

const STATUS_FILTERS: OrganizationStatus[] = ['PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED'];

const REJECTION_PRESETS = [
  'Incomplete information',
  'Duplicate registration',
  'Business verification failed',
  'Other',
];

function statusBadge(status: OrganizationStatus): string {
  switch (status) {
    case 'PENDING':
      return 'bg-amber-100 text-amber-900';
    case 'ACTIVE':
      return 'bg-emerald-100 text-emerald-800';
    case 'REJECTED':
      return 'bg-rose-100 text-rose-800';
    case 'SUSPENDED':
      return 'bg-slate-200 text-slate-800';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const OrganizationRequestsDashboard: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<OrganizationStatus>('PENDING');
  const [items, setItems] = useState<OrganizationRequestRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrganizationRequestDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState(REJECTION_PRESETS[0]!);
  const [customRejectReason, setCustomRejectReason] = useState('');

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminOrganizationRequestsApi.list({ status: statusFilter, limit: 200 });
      setItems(res.items);
      setTotal(res.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load organization requests.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const openDetail = async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    setError(null);
    try {
      const d = await adminOrganizationRequestsApi.get(id);
      setDetail(d);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load organization details.');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelectedId(null);
    setDetail(null);
    setCustomRejectReason('');
    setRejectReason(REJECTION_PRESETS[0]!);
  };

  const runAction = async (action: () => Promise<OrganizationRequestDetail>) => {
    setActionLoading(true);
    setError(null);
    try {
      const updated = await action();
      setDetail(updated);
      await loadList();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const resolvedRejectReason =
    rejectReason === 'Other' ? customRejectReason.trim() : rejectReason;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Organization Requests</h2>
        <p className="text-sm text-slate-500">
          Review and approve new organization registrations before they can access PBooks Pro.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => {
              setStatusFilter(status);
              closeDetail();
            }}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              statusFilter === status
                ? 'bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {status.charAt(0) + status.slice(1).toLowerCase()}
          </button>
        ))}
        <span className="ml-auto self-center text-sm text-slate-500">{total} total</span>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {loading ? (
            <p className="p-6 text-center text-slate-500">Loading…</p>
          ) : items.length === 0 ? (
            <p className="p-6 text-center text-slate-500">No organizations in this status.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Organization</th>
                    <th className="px-4 py-3 font-medium">Owner</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => void openDetail(row.id)}
                      className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${
                        selectedId === row.id ? 'bg-indigo-50/60' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {row.companyName || row.name}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.ownerName ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{row.ownerEmail ?? row.email ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(row.createdAt)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadge(row.status)}`}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5">
          {!selectedId ? (
            <p className="text-sm text-slate-500">Select an organization to view details and take action.</p>
          ) : detailLoading ? (
            <p className="text-sm text-slate-500">Loading details…</p>
          ) : detail ? (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-800">{detail.companyName || detail.name}</h3>
                  <p className="text-xs text-slate-500 font-mono mt-1">
                    {detail.registrationReference ?? detail.id}
                  </p>
                </div>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadge(detail.status)}`}
                >
                  {detail.status}
                </span>
              </div>

              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-medium text-slate-700">Owner:</span>{' '}
                  {detail.ownerName ?? '—'}
                </p>
                <p>
                  <span className="font-medium text-slate-700">Email:</span>{' '}
                  {detail.ownerEmail ?? detail.email ?? '—'}
                </p>
                <p>
                  <span className="font-medium text-slate-700">Phone:</span> {detail.phone ?? '—'}
                </p>
                <p>
                  <span className="font-medium text-slate-700">Country:</span> {detail.country ?? '—'}
                </p>
                <p>
                  <span className="font-medium text-slate-700">Registered:</span>{' '}
                  {formatDate(detail.createdAt)}
                </p>
                {detail.rejectionReason && (
                  <p className="text-rose-700">
                    <span className="font-medium">Rejection reason:</span> {detail.rejectionReason}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                {detail.status === 'PENDING' && (
                  <>
                    <Button
                      disabled={actionLoading}
                      onClick={() => void runAction(() => adminOrganizationRequestsApi.approve(detail.id))}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      disabled={actionLoading}
                      className="!border-rose-300 !text-rose-700"
                      onClick={() => {
                        if (!resolvedRejectReason) {
                          setError('Enter a rejection reason.');
                          return;
                        }
                        void runAction(() =>
                          adminOrganizationRequestsApi.reject(detail.id, resolvedRejectReason)
                        );
                      }}
                    >
                      Reject
                    </Button>
                  </>
                )}
                {detail.status === 'ACTIVE' && (
                  <Button
                    variant="outline"
                    disabled={actionLoading}
                    onClick={() => void runAction(() => adminOrganizationRequestsApi.suspend(detail.id))}
                  >
                    Suspend
                  </Button>
                )}
                {(detail.status === 'SUSPENDED' || detail.status === 'REJECTED') && (
                  <Button
                    disabled={actionLoading}
                    onClick={() => void runAction(() => adminOrganizationRequestsApi.activate(detail.id))}
                  >
                    Activate
                  </Button>
                )}
              </div>

              {detail.status === 'PENDING' && (
                <div className="space-y-2 border-t border-slate-100 pt-4">
                  <label className="block text-sm font-medium text-slate-700">Rejection reason</label>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  >
                    {REJECTION_PRESETS.map((preset) => (
                      <option key={preset} value={preset}>
                        {preset}
                      </option>
                    ))}
                  </select>
                  {rejectReason === 'Other' && (
                    <textarea
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      rows={3}
                      value={customRejectReason}
                      onChange={(e) => setCustomRejectReason(e.target.value)}
                      placeholder="Describe why this registration was rejected"
                    />
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default OrganizationRequestsDashboard;
