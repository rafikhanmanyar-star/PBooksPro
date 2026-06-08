import React, { useCallback, useEffect, useState } from 'react';
import Button from '../ui/Button';
import {
  privacyApi,
  type PrivacyRequest,
  type PrivacyRequestStatus,
  type PrivacyRequestType,
} from '../../services/api/privacyApi';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';

function statusBadgeClass(status: PrivacyRequestStatus): string {
  switch (status) {
    case 'completed':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'pending':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'processing':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'rejected':
      return 'bg-slate-100 text-slate-600 border-slate-200';
    case 'failed':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    default:
      return 'bg-slate-50 text-slate-600 border-slate-200';
  }
}

function typeLabel(type: PrivacyRequestType): string {
  const labels: Record<PrivacyRequestType, string> = {
    data_export: 'Data export',
    user_data_export: 'User data export',
    tenant_data_export: 'Tenant data export',
    deletion: 'Deletion',
    correction: 'Correction',
    anonymization: 'Anonymization',
  };
  return labels[type] ?? type;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const PrivacyCenter: React.FC = () => {
  const { user } = useAuth();
  const perms = usePermissions();
  const isAdmin = perms.canManageUsers;

  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [deletionNotes, setDeletionNotes] = useState('');
  const [correctionNotes, setCorrectionNotes] = useState('');
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});

  const loadRequests = useCallback(async () => {
    try {
      const res = await privacyApi.listRequests();
      setRequests(res.items);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load privacy requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const flash = (msg: string) => {
    setSuccess(msg);
    setError(null);
    setTimeout(() => setSuccess(null), 5000);
  };

  const handleDownload = async (scope: 'data' | 'user' | 'tenant') => {
    setBusy(`export-${scope}`);
    setError(null);
    try {
      if (scope === 'tenant') await privacyApi.exportTenantData();
      else if (scope === 'user') await privacyApi.exportUserData();
      else await privacyApi.exportData('data');
      flash('Your data export has been downloaded.');
      await loadRequests();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(null);
    }
  };

  const handleCreateRequest = async (requestType: 'deletion' | 'correction', notes: string) => {
    setBusy(requestType);
    setError(null);
    try {
      await privacyApi.createRequest({ requestType, notes });
      if (requestType === 'deletion') setDeletionNotes('');
      else setCorrectionNotes('');
      flash(
        requestType === 'deletion'
          ? 'Deletion request submitted. An administrator will review it.'
          : 'Correction request submitted.'
      );
      await loadRequests();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(null);
    }
  };

  const handleProcessDeletion = async (requestId: string) => {
    if (!window.confirm('Process this deletion request by anonymizing the user account? This cannot be undone.')) {
      return;
    }
    setBusy(`del-${requestId}`);
    setError(null);
    try {
      await privacyApi.processDeletion(requestId);
      flash('Deletion request processed. User data has been anonymized.');
      await loadRequests();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Processing failed');
    } finally {
      setBusy(null);
    }
  };

  const handleResolveCorrection = async (requestId: string, status: 'completed' | 'rejected') => {
    setBusy(`corr-${requestId}`);
    setError(null);
    try {
      await privacyApi.resolveCorrection(requestId, status, adminNotes[requestId]);
      flash(`Correction request marked as ${status}.`);
      await loadRequests();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Resolution failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Privacy Center</h2>
        <p className="text-sm text-slate-500 mt-1">
          Manage your personal data, export copies, and submit privacy requests. All actions are logged for compliance.
        </p>
        {user && (
          <p className="text-xs text-slate-400 mt-2">
            Signed in as <span className="font-medium text-slate-600">{user.name || user.username}</span>
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-800">Download data</h3>
          <p className="text-sm text-slate-500 mt-1 mb-4">
            Download a JSON copy of your personal data including profile, activity logs, and legal acceptances.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy !== null}
              onClick={() => void handleDownload('data')}
            >
              {busy === 'export-data' ? 'Exporting…' : 'Download my data'}
            </Button>
            <Button
              variant="secondary"
              disabled={busy !== null}
              onClick={() => void handleDownload('user')}
            >
              {busy === 'export-user' ? 'Exporting…' : 'User data export'}
            </Button>
            {isAdmin && (
              <Button
                variant="secondary"
                disabled={busy !== null}
                onClick={() => void handleDownload('tenant')}
              >
                {busy === 'export-tenant' ? 'Exporting…' : 'Tenant data export'}
              </Button>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-800">Request export</h3>
          <p className="text-sm text-slate-500 mt-1 mb-4">
            Submit a formal export request for audit tracking when immediate download is not sufficient.
          </p>
          <Button
            variant="secondary"
            disabled={busy !== null}
            onClick={async () => {
              setBusy('request-export');
              setError(null);
              try {
                await privacyApi.createRequest({ requestType: 'data_export', notes: 'Formal data export request' });
                flash('Export request recorded.');
                await loadRequests();
              } catch (e: unknown) {
                setError(e instanceof Error ? e.message : 'Request failed');
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === 'request-export' ? 'Submitting…' : 'Request export'}
          </Button>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-800">Request deletion</h3>
          <p className="text-sm text-slate-500 mt-1 mb-3">
            Ask for your account and associated personal data to be deleted or anonymized.
          </p>
          <textarea
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            placeholder="Describe what data you want deleted and why…"
            value={deletionNotes}
            onChange={(e) => setDeletionNotes(e.target.value)}
            disabled={busy !== null}
          />
          <Button
            className="mt-3"
            variant="secondary"
            disabled={busy !== null || !deletionNotes.trim()}
            onClick={() => void handleCreateRequest('deletion', deletionNotes.trim())}
          >
            {busy === 'deletion' ? 'Submitting…' : 'Submit deletion request'}
          </Button>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-800">Request correction</h3>
          <p className="text-sm text-slate-500 mt-1 mb-3">
            Report inaccurate personal data and describe the correction needed.
          </p>
          <textarea
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            placeholder="What information is incorrect and what should it be?"
            value={correctionNotes}
            onChange={(e) => setCorrectionNotes(e.target.value)}
            disabled={busy !== null}
          />
          <Button
            className="mt-3"
            variant="secondary"
            disabled={busy !== null || !correctionNotes.trim()}
            onClick={() => void handleCreateRequest('correction', correctionNotes.trim())}
          >
            {busy === 'correction' ? 'Submitting…' : 'Submit correction request'}
          </Button>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">Privacy request history</h3>
          <p className="text-sm text-slate-500 mt-0.5">
            {isAdmin ? 'All organization privacy requests' : 'Your privacy requests'}
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : requests.length === 0 ? (
          <p className="text-sm text-slate-500 px-5 py-8 text-center">No privacy requests yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Requested</th>
                  <th className="px-5 py-3 font-medium">Completed</th>
                  {isAdmin && <th className="px-5 py-3 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 text-slate-800">{typeLabel(req.request_type)}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${statusBadgeClass(req.status)}`}
                      >
                        {req.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-600 whitespace-nowrap">
                      {formatDate(req.requested_at)}
                    </td>
                    <td className="px-5 py-3 text-slate-600 whitespace-nowrap">
                      {formatDate(req.completed_at)}
                    </td>
                    {isAdmin && (
                      <td className="px-5 py-3">
                        {req.request_type === 'deletion' && req.status === 'pending' && (
                          <Button
                            variant="secondary"
                            className="!text-xs !py-1 !px-2"
                            disabled={busy !== null}
                            onClick={() => void handleProcessDeletion(req.id)}
                          >
                            Process deletion
                          </Button>
                        )}
                        {req.request_type === 'correction' && req.status === 'pending' && (
                          <div className="flex flex-col gap-2 min-w-[200px]">
                            <input
                              type="text"
                              className="rounded border border-slate-200 px-2 py-1 text-xs"
                              placeholder="Admin notes (optional)"
                              value={adminNotes[req.id] ?? ''}
                              onChange={(e) =>
                                setAdminNotes((prev) => ({ ...prev, [req.id]: e.target.value }))
                              }
                            />
                            <div className="flex gap-1">
                              <Button
                                variant="secondary"
                                className="!text-xs !py-1 !px-2"
                                disabled={busy !== null}
                                onClick={() => void handleResolveCorrection(req.id, 'completed')}
                              >
                                Complete
                              </Button>
                              <Button
                                variant="secondary"
                                className="!text-xs !py-1 !px-2"
                                disabled={busy !== null}
                                onClick={() => void handleResolveCorrection(req.id, 'rejected')}
                              >
                                Reject
                              </Button>
                            </div>
                          </div>
                        )}
                        {req.metadata?.notes && typeof req.metadata.notes === 'string' && (
                          <p className="text-xs text-slate-500 mt-1 max-w-xs truncate" title={req.metadata.notes}>
                            {req.metadata.notes}
                          </p>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default PrivacyCenter;
