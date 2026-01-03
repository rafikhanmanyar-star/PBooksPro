import React, { useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';
import { Users, Search, Eye, Ban, CheckCircle } from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  company_name: string;
  email: string;
  license_type: string;
  license_status: string;
  trial_start_date: string;
  license_expiry_date: string | null;
  created_at: string;
}

const TenantManagement: React.FC = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);

  useEffect(() => {
    loadTenants();
  }, [statusFilter]);

  const loadTenants = async () => {
    try {
      setLoading(true);
      const filters: any = {};
      if (statusFilter) filters.status = statusFilter;
      if (searchTerm) filters.search = searchTerm;
      
      const data = await adminApi.getTenants(filters);
      setTenants(data);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load tenants');
    } finally {
      setLoading(false);
    }
  };

  const handleSuspend = async (tenantId: string) => {
    if (!confirm('Are you sure you want to suspend this tenant?')) return;
    
    try {
      await adminApi.suspendTenant(tenantId);
      await loadTenants();
    } catch (err: any) {
      alert(err.message || 'Failed to suspend tenant');
    }
  };

  const handleActivate = async (tenantId: string) => {
    try {
      await adminApi.activateTenant(tenantId);
      await loadTenants();
    } catch (err: any) {
      alert(err.message || 'Failed to activate tenant');
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { bg: string; color: string }> = {
      active: { bg: '#d1fae5', color: '#065f46' },
      expired: { bg: '#fee2e2', color: '#991b1b' },
      suspended: { bg: '#fef3c7', color: '#92400e' },
      cancelled: { bg: '#e5e7eb', color: '#374151' }
    };
    const badge = badges[status] || badges.active;
    return (
      <span className="badge" style={{ backgroundColor: badge.bg, color: badge.color }}>
        {status}
      </span>
    );
  };

  const filteredTenants = tenants.filter(tenant => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      tenant.name.toLowerCase().includes(search) ||
      tenant.company_name?.toLowerCase().includes(search) ||
      tenant.email.toLowerCase().includes(search)
    );
  });

  if (loading) {
    return <div>Loading tenants...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>Tenant Management</h1>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={20} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
            <input
              type="text"
              className="input"
              placeholder="Search tenants..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '2.5rem' }}
            />
          </div>
          <select
            className="input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: '200px' }}
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="suspended">Suspended</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {error && (
        <div style={{ padding: '1rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '0.5rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {/* Tenants Table */}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Email</th>
              <th>License Type</th>
              <th>Status</th>
              <th>Expiry Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTenants.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                  No tenants found
                </td>
              </tr>
            ) : (
              filteredTenants.map(tenant => (
                <tr key={tenant.id}>
                  <td>
                    <div>
                      <div style={{ fontWeight: 500 }}>{tenant.company_name || tenant.name}</div>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{tenant.name}</div>
                    </div>
                  </td>
                  <td>{tenant.email}</td>
                  <td>
                    <span className="badge badge-info">{tenant.license_type}</span>
                  </td>
                  <td>{getStatusBadge(tenant.license_status)}</td>
                  <td>
                    {tenant.license_expiry_date
                      ? new Date(tenant.license_expiry_date).toLocaleDateString()
                      : tenant.license_type === 'perpetual' ? 'Never' : 'N/A'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn btn-secondary"
                        onClick={() => setSelectedTenant(tenant)}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                      >
                        <Eye size={16} style={{ marginRight: '0.25rem' }} />
                        View
                      </button>
                      {tenant.license_status === 'suspended' ? (
                        <button
                          className="btn btn-success"
                          onClick={() => handleActivate(tenant.id)}
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        >
                          <CheckCircle size={16} style={{ marginRight: '0.25rem' }} />
                          Activate
                        </button>
                      ) : (
                        <button
                          className="btn btn-danger"
                          onClick={() => handleSuspend(tenant.id)}
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        >
                          <Ban size={16} style={{ marginRight: '0.25rem' }} />
                          Suspend
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Tenant Details Modal */}
      {selectedTenant && (
        <TenantDetailsModal
          tenant={selectedTenant}
          onClose={() => setSelectedTenant(null)}
        />
      )}
    </div>
  );
};

const TenantDetailsModal: React.FC<{ tenant: Tenant; onClose: () => void }> = ({ tenant, onClose }) => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [tenant.id]);

  const loadStats = async () => {
    try {
      const data = await adminApi.getTenantStats(tenant.id);
      setStats(data);
    } catch (error) {
      console.error('Failed to load tenant stats:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }} onClick={onClose}>
      <div className="card" style={{ maxWidth: '600px', width: '90%', maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Tenant Details</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ display: 'grid', gap: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.25rem' }}>Company Name</label>
            <div style={{ fontWeight: 500 }}>{tenant.company_name || tenant.name}</div>
          </div>
          <div>
            <label style={{ fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.25rem' }}>Email</label>
            <div>{tenant.email}</div>
          </div>
          <div>
            <label style={{ fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.25rem' }}>License Type</label>
            <div>{tenant.license_type}</div>
          </div>
          <div>
            <label style={{ fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.25rem' }}>Status</label>
            <div>{tenant.license_status}</div>
          </div>
          {stats && (
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.75rem' }}>Statistics</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Users</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{stats.userCount}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Transactions</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{stats.transactionCount}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Accounts</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{stats.accountCount}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Contacts</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{stats.contactCount}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TenantManagement;

