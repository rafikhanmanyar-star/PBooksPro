import React, { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';
import { RefreshCw } from 'lucide-react';

type OrganizationStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED';

interface OrganizationRequestRow {
  id: string;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  status: OrganizationStatus;
  registrationReference: string | null;
  createdAt: string;
  ownerName: string | null;
  ownerEmail: string | null;
}

interface OrganizationRequestDetail extends OrganizationRequestRow {
  address: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
}

const STATUS_FILTERS: OrganizationStatus[] = ['PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED'];

const REJECTION_PRESETS = [
  'Incomplete information',
  'Duplicate registration',
  'Business verification failed',
  'Other',
];

const STATUS_COLORS: Record<OrganizationStatus, { bg: string; color: string }> = {
  PENDING: { bg: '#fef3c7', color: '#92400e' },
  ACTIVE: { bg: '#d1fae5', color: '#065f46' },
  REJECTED: { bg: '#fee2e2', color: '#991b1b' },
  SUSPENDED: { bg: '#e5e7eb', color: '#374151' },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

const OrganizationRequestManagement: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<OrganizationStatus>('PENDING');
  const [items, setItems] = useState<OrganizationRequestRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrganizationRequestDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState(REJECTION_PRESETS[0]!);
  const [customRejectReason, setCustomRejectReason] = useState('');

  const loadList = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const result = await adminApi.getOrganizationRequests({ status: statusFilter, limit: 200 });
      setItems(result.items);
      setTotal(result.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load organization requests');
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
    setError('');
    try {
      const d = await adminApi.getOrganizationRequest(id);
      setDetail(d);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load details');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const runAction = async (action: () => Promise<OrganizationRequestDetail>) => {
    setActionLoading(true);
    setError('');
    try {
      const updated = await action();
      setDetail(updated);
      await loadList();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const resolvedRejectReason =
    rejectReason === 'Other' ? customRejectReason.trim() : rejectReason;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, marginBottom: '0.5rem' }}>Organization Requests</h1>
          <p style={{ color: '#6b7280' }}>
            Review self-service registrations before new organizations can access PBooks Pro.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadList()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            background: 'white',
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#fee2e2', color: '#991b1b', borderRadius: '0.375rem' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {STATUS_FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => {
              setStatusFilter(status);
              setSelectedId(null);
              setDetail(null);
            }}
            style={{
              padding: '0.375rem 0.875rem',
              borderRadius: '9999px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: statusFilter === status ? 600 : 400,
              background: statusFilter === status ? '#1f2937' : '#f3f4f6',
              color: statusFilter === status ? 'white' : '#374151',
            }}
          >
            {status.charAt(0) + status.slice(1).toLowerCase()}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', alignSelf: 'center', color: '#6b7280', fontSize: '0.875rem' }}>
          {total} total
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
        <div style={{ background: 'white', borderRadius: '0.5rem', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          {loading ? (
            <p style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading…</p>
          ) : items.length === 0 ? (
            <p style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>No organizations in this status.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead style={{ background: '#f9fafb', textAlign: 'left' }}>
                <tr>
                  <th style={{ padding: '0.75rem 1rem' }}>Organization</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Owner</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Email</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Created</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const colors = STATUS_COLORS[row.status];
                  return (
                    <tr
                      key={row.id}
                      onClick={() => void openDetail(row.id)}
                      style={{
                        borderTop: '1px solid #f3f4f6',
                        cursor: 'pointer',
                        background: selectedId === row.id ? '#eff6ff' : 'white',
                      }}
                    >
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>{row.companyName || row.name}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#4b5563' }}>{row.ownerName ?? '—'}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#4b5563' }}>{row.ownerEmail ?? row.email ?? '—'}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#6b7280' }}>{formatDate(row.createdAt)}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.125rem 0.5rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: colors.bg,
                            color: colors.color,
                          }}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ background: 'white', borderRadius: '0.5rem', border: '1px solid #e5e7eb', padding: '1.25rem' }}>
          {!selectedId ? (
            <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>Select an organization to review and take action.</p>
          ) : detailLoading ? (
            <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>Loading details…</p>
          ) : detail ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>{detail.companyName || detail.name}</h2>
                  <p style={{ fontSize: '0.75rem', color: '#6b7280', fontFamily: 'monospace', marginTop: '0.25rem' }}>
                    {detail.registrationReference ?? detail.id}
                  </p>
                </div>
                <span
                  style={{
                    alignSelf: 'flex-start',
                    padding: '0.125rem 0.5rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    background: STATUS_COLORS[detail.status].bg,
                    color: STATUS_COLORS[detail.status].color,
                  }}
                >
                  {detail.status}
                </span>
              </div>

              <div style={{ fontSize: '0.875rem', lineHeight: 1.7, color: '#374151', marginBottom: '1rem' }}>
                <p><strong>Owner:</strong> {detail.ownerName ?? '—'}</p>
                <p><strong>Email:</strong> {detail.ownerEmail ?? detail.email ?? '—'}</p>
                <p><strong>Phone:</strong> {detail.phone ?? '—'}</p>
                <p><strong>Country:</strong> {detail.country ?? '—'}</p>
                <p><strong>Registered:</strong> {formatDate(detail.createdAt)}</p>
                {detail.rejectionReason && (
                  <p style={{ color: '#b91c1c' }}><strong>Rejection reason:</strong> {detail.rejectionReason}</p>
                )}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                {detail.status === 'PENDING' && (
                  <>
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => void runAction(() => adminApi.approveOrganizationRequest(detail.id))}
                      style={{ padding: '0.5rem 1rem', background: '#059669', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => {
                        if (!resolvedRejectReason) {
                          setError('Enter a rejection reason.');
                          return;
                        }
                        void runAction(() => adminApi.rejectOrganizationRequest(detail.id, resolvedRejectReason));
                      }}
                      style={{ padding: '0.5rem 1rem', background: 'white', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: '0.375rem', cursor: 'pointer' }}
                    >
                      Reject
                    </button>
                  </>
                )}
                {detail.status === 'ACTIVE' && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => void runAction(() => adminApi.suspendOrganizationRequest(detail.id))}
                    style={{ padding: '0.5rem 1rem', background: 'white', border: '1px solid #d1d5db', borderRadius: '0.375rem', cursor: 'pointer' }}
                  >
                    Suspend
                  </button>
                )}
                {(detail.status === 'SUSPENDED' || detail.status === 'REJECTED') && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => void runAction(() => adminApi.activateOrganizationRequest(detail.id))}
                    style={{ padding: '0.5rem 1rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}
                  >
                    Activate
                  </button>
                )}
              </div>

              {detail.status === 'PENDING' && (
                <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>
                    Rejection reason
                  </label>
                  <select
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', marginBottom: '0.5rem' }}
                  >
                    {REJECTION_PRESETS.map((preset) => (
                      <option key={preset} value={preset}>{preset}</option>
                    ))}
                  </select>
                  {rejectReason === 'Other' && (
                    <textarea
                      value={customRejectReason}
                      onChange={(e) => setCustomRejectReason(e.target.value)}
                      rows={3}
                      placeholder="Describe why this registration was rejected"
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }}
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

export default OrganizationRequestManagement;
