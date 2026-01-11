import React, { useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';
import { Search, Eye, Ban, CheckCircle, Edit2, Save, X, Trash2, Users, Key, LogOut, UserX, RefreshCw } from 'lucide-react';

interface Tenant {
  id: string;
  name: string;
  company_name: string;
  email: string;
  phone?: string;
  address?: string;
  license_type: string;
  license_status: string;
  trial_start_date: string;
  license_expiry_date: string | null;
  created_at: string;
  max_users?: number;
  subscription_tier?: string;
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

  const handleDelete = async (tenantId: string, tenantName: string) => {
    const confirmMessage = `Are you sure you want to delete "${tenantName}"?\n\nThis action will permanently delete:\n- The tenant account\n- All associated users\n- All financial data\n- All transactions and records\n\nThis action CANNOT be undone!`;
    
    if (!confirm(confirmMessage)) return;
    
    // Double confirmation for safety
    const doubleConfirm = prompt(`Type "DELETE" to confirm deletion of "${tenantName}":`);
    if (doubleConfirm !== 'DELETE') {
      alert('Deletion cancelled. You must type "DELETE" to confirm.');
      return;
    }
    
    try {
      await adminApi.deleteTenant(tenantId);
      alert('Tenant deleted successfully');
      await loadTenants();
      if (selectedTenant?.id === tenantId) {
        setSelectedTenant(null);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete tenant');
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
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
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
                      <button
                        className="btn btn-danger"
                        onClick={() => handleDelete(tenant.id, tenant.company_name || tenant.name)}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        title="Delete tenant"
                      >
                        <Trash2 size={16} />
                      </button>
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
          onUpdate={loadTenants}
        />
      )}
    </div>
  );
};

interface TenantUser {
  id: string;
  username: string;
  name: string;
  role: string;
  email?: string;
  is_active: boolean;
  login_status: boolean;
  last_login?: string;
  created_at: string;
  is_tenant_admin: boolean;
}

const TenantDetailsModal: React.FC<{ tenant: Tenant; onClose: () => void; onUpdate?: () => void }> = ({ tenant, onClose, onUpdate }) => {
  const [stats, setStats] = useState<any>(null);
  const [tenantDetails, setTenantDetails] = useState<Tenant>(tenant);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<TenantUser | null>(null);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  
  // Form fields
  const [formData, setFormData] = useState({
    name: tenant.name,
    companyName: tenant.company_name || '',
    email: tenant.email,
    phone: tenant.phone || '',
    address: tenant.address || '',
    maxUsers: tenant.max_users || 5,
    subscriptionTier: tenant.subscription_tier || 'free',
    licenseType: tenant.license_type,
    licenseStatus: tenant.license_status
  });

  useEffect(() => {
    loadStats();
    loadTenantDetails();
    loadUsers();
  }, [tenant.id]);

  const loadTenantDetails = async () => {
    try {
      const data = await adminApi.getTenant(tenant.id);
      setTenantDetails(data);
      setFormData({
        name: data.name,
        companyName: data.company_name || '',
        email: data.email,
        phone: data.phone || '',
        address: data.address || '',
        maxUsers: data.max_users || 5,
        subscriptionTier: data.subscription_tier || 'free',
        licenseType: data.license_type,
        licenseStatus: data.license_status
      });
    } catch (error) {
      console.error('Failed to load tenant details:', error);
    }
  };

  const loadStats = async () => {
    try {
      const data = await adminApi.getTenantStats(tenant.id);
      setStats(data);
    } catch (error) {
      console.error('Failed to load tenant stats:', error);
    }
  };

  const loadUsers = async () => {
    try {
      setLoadingUsers(true);
      const data = await adminApi.getTenantUsers(tenant.id);
      setUsers(data);
    } catch (error: any) {
      console.error('Failed to load users:', error);
      setError(error.message || 'Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser || !newPassword || newPassword.length < 6) {
      alert('Password must be at least 6 characters long');
      return;
    }

    if (!confirm(`Are you sure you want to reset the password for "${selectedUser.name}" (${selectedUser.username})?`)) {
      return;
    }

    setResettingPassword(true);
    try {
      await adminApi.resetTenantUserPassword(tenant.id, selectedUser.id, newPassword);
      alert('Password reset successfully');
      setShowPasswordReset(false);
      setSelectedUser(null);
      setNewPassword('');
      await loadUsers();
    } catch (error: any) {
      alert(error.message || 'Failed to reset password');
    } finally {
      setResettingPassword(false);
    }
  };

  const handleDeleteUser = async (user: TenantUser) => {
    const userType = user.is_tenant_admin ? 'Tenant Admin' : 'Sub User';
    const confirmMessage = `Are you sure you want to delete "${user.name}" (${user.username})?\n\nUser Type: ${userType}\n\nThis action will permanently delete:\n- The user account\n- All associated sessions\n\nThis action CANNOT be undone!`;
    
    if (!confirm(confirmMessage)) return;
    
    try {
      await adminApi.deleteTenantUser(tenant.id, user.id);
      alert('User deleted successfully');
      await loadUsers();
      await loadStats();
    } catch (error: any) {
      alert(error.message || 'Failed to delete user');
    }
  };

  const handleForceLogout = async (user: TenantUser) => {
    if (!confirm(`Are you sure you want to forcefully logout "${user.name}" (${user.username})?\n\nThis will invalidate all their active sessions.`)) {
      return;
    }

    try {
      await adminApi.forceLogoutTenantUser(tenant.id, user.id);
      alert('User logged out successfully from all sessions');
      await loadUsers();
    } catch (error: any) {
      alert(error.message || 'Failed to force logout');
    }
  };

  const handleSave = async () => {
    if (formData.maxUsers < 1) {
      setError('Maximum users must be at least 1');
      return;
    }

    if (formData.maxUsers < (stats?.userCount || 0)) {
      setError(`Maximum users cannot be less than current user count (${stats?.userCount || 0})`);
      return;
    }

    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }

    if (!formData.email.trim()) {
      setError('Email is required');
      return;
    }

    setIsSaving(true);
    setError('');
    try {
      await adminApi.updateTenant(tenant.id, {
        name: formData.name,
        companyName: formData.companyName,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        maxUsers: formData.maxUsers,
        subscriptionTier: formData.subscriptionTier,
        licenseType: formData.licenseType,
        licenseStatus: formData.licenseStatus
      });
      await loadTenantDetails();
      await loadStats();
      setIsEditing(false);
      if (onUpdate) onUpdate();
    } catch (err: any) {
      setError(err.message || 'Failed to update tenant');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setFormData({
      name: tenantDetails.name,
      companyName: tenantDetails.company_name || '',
      email: tenantDetails.email,
      phone: tenantDetails.phone || '',
      address: tenantDetails.address || '',
      maxUsers: tenantDetails.max_users || 5,
      subscriptionTier: tenantDetails.subscription_tier || 'free',
      licenseType: tenantDetails.license_type,
      licenseStatus: tenantDetails.license_status
    });
    setError('');
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '1rem'
    }} onClick={onClose}>
      <div className="card" style={{ 
        maxWidth: '900px', 
        width: '100%', 
        maxHeight: '95vh', 
        overflow: 'auto',
        padding: '1rem'
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>Tenant Details</h2>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {!isEditing && (
              <button
                className="btn btn-secondary"
                onClick={() => setIsEditing(true)}
                style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}
              >
                <Edit2 size={14} style={{ marginRight: '0.375rem' }} />
                Edit
              </button>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', padding: '0.25rem', lineHeight: 1 }}>×</button>
          </div>
        </div>

        {error && (
          <div style={{ marginBottom: '0.75rem', padding: '0.625rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '0.375rem', fontSize: '0.8125rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {/* Basic Information - Compact Grid */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '0.75rem',
            paddingBottom: '0.75rem',
            borderBottom: '1px solid #e5e7eb'
          }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Name *</label>
              {isEditing ? (
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input"
                  required
                  style={{ padding: '0.375rem', fontSize: '0.8125rem' }}
                />
              ) : (
                <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{tenantDetails.name}</div>
              )}
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Company Name</label>
              {isEditing ? (
                <input
                  type="text"
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  className="input"
                  style={{ padding: '0.375rem', fontSize: '0.8125rem' }}
                />
              ) : (
                <div style={{ fontSize: '0.875rem' }}>{tenantDetails.company_name || 'N/A'}</div>
              )}
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Email *</label>
              {isEditing ? (
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="input"
                  required
                  style={{ padding: '0.375rem', fontSize: '0.8125rem' }}
                />
              ) : (
                <div style={{ fontSize: '0.875rem' }}>{tenantDetails.email}</div>
              )}
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Phone</label>
              {isEditing ? (
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="input"
                  style={{ padding: '0.375rem', fontSize: '0.8125rem' }}
                />
              ) : (
                <div style={{ fontSize: '0.875rem' }}>{tenantDetails.phone || 'N/A'}</div>
              )}
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Address</label>
            {isEditing ? (
              <textarea
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="input"
                rows={2}
                style={{ padding: '0.375rem', fontSize: '0.8125rem' }}
              />
            ) : (
              <div style={{ fontSize: '0.875rem' }}>{tenantDetails.address || 'N/A'}</div>
            )}
          </div>

          {/* License & Subscription Information - Compact Grid */}
          <div style={{ paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
              gap: '0.75rem' 
            }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>License Type</label>
                {isEditing ? (
                  <select
                    value={formData.licenseType}
                    onChange={(e) => setFormData({ ...formData, licenseType: e.target.value })}
                    className="input"
                    style={{ padding: '0.375rem', fontSize: '0.8125rem' }}
                  >
                    <option value="trial">Trial</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                    <option value="perpetual">Perpetual</option>
                  </select>
                ) : (
                  <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{tenantDetails.license_type}</div>
                )}
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>License Status</label>
                {isEditing ? (
                  <select
                    value={formData.licenseStatus}
                    onChange={(e) => setFormData({ ...formData, licenseStatus: e.target.value })}
                    className="input"
                    style={{ padding: '0.375rem', fontSize: '0.8125rem' }}
                  >
                    <option value="active">Active</option>
                    <option value="expired">Expired</option>
                    <option value="suspended">Suspended</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                ) : (
                  <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{tenantDetails.license_status}</div>
                )}
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Max Users</label>
                {isEditing ? (
                  <div>
                    <input
                      type="number"
                      min="1"
                      value={formData.maxUsers}
                      onChange={(e) => setFormData({ ...formData, maxUsers: parseInt(e.target.value) || 1 })}
                      className="input"
                      style={{ padding: '0.375rem', fontSize: '0.8125rem' }}
                    />
                    {stats && (
                      <div style={{ marginTop: '0.25rem', fontSize: '0.6875rem', color: '#6b7280' }}>
                        {stats.userCount} / {formData.maxUsers}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{tenantDetails.max_users || 5}</div>
                    {stats && (
                      <div style={{ marginTop: '0.25rem', fontSize: '0.6875rem', color: '#6b7280' }}>
                        {stats.userCount} / {tenantDetails.max_users || 5}
                        {stats.userCount >= (tenantDetails.max_users || 5) && (
                          <span style={{ marginLeft: '0.375rem', color: '#dc2626', fontWeight: 600 }}>• Limit</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Subscription Tier</label>
                {isEditing ? (
                  <select
                    value={formData.subscriptionTier}
                    onChange={(e) => setFormData({ ...formData, subscriptionTier: e.target.value })}
                    className="input"
                    style={{ padding: '0.375rem', fontSize: '0.8125rem' }}
                  >
                    <option value="free">Free</option>
                    <option value="basic">Basic</option>
                    <option value="premium">Premium</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                ) : (
                  <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{tenantDetails.subscription_tier || 'free'}</div>
                )}
              </div>
            </div>
          </div>

          {/* Statistics - Compact Grid */}
          {stats && (
            <div style={{ paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' }}>Statistics</h3>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', 
                gap: '0.75rem' 
              }}>
                <div>
                  <div style={{ fontSize: '0.6875rem', color: '#6b7280', marginBottom: '0.125rem' }}>Users</div>
                  <div style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                    {stats.userCount} / {tenantDetails.max_users || 5}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.6875rem', color: '#6b7280', marginBottom: '0.125rem' }}>Transactions</div>
                  <div style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{stats.transactionCount}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.6875rem', color: '#6b7280', marginBottom: '0.125rem' }}>Accounts</div>
                  <div style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{stats.accountCount}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.6875rem', color: '#6b7280', marginBottom: '0.125rem' }}>Contacts</div>
                  <div style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{stats.contactCount}</div>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          {isEditing && (
            <div style={{ paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                className="btn btn-secondary"
                onClick={handleCancel}
                disabled={isSaving}
                style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}
              >
                <X size={14} style={{ marginRight: '0.375rem' }} />
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={isSaving}
                style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}
              >
                <Save size={14} style={{ marginRight: '0.375rem' }} />
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}

          {/* Users Section */}
          <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.375rem', color: '#374151' }}>
                <Users size={16} />
                Users ({users.length})
              </h3>
              <button
                className="btn btn-secondary"
                onClick={loadUsers}
                disabled={loadingUsers}
                style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}
                title="Refresh Users"
              >
                <RefreshCw size={14} style={{ 
                  opacity: loadingUsers ? 0.6 : 1,
                  cursor: loadingUsers ? 'not-allowed' : 'pointer'
                }} />
                {loadingUsers ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            {loadingUsers ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#6b7280', fontSize: '0.8125rem' }}>Loading users...</div>
            ) : users.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#6b7280', fontSize: '0.8125rem' }}>No users found</div>
            ) : (
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <th style={{ padding: '0.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Name</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Username</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Type</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Role</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Status</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Last Login</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '0.5rem' }}>
                          <div style={{ fontWeight: 500, fontSize: '0.8125rem' }}>{user.name}</div>
                          {user.email && (
                            <div style={{ fontSize: '0.6875rem', color: '#6b7280' }}>{user.email}</div>
                          )}
                        </td>
                        <td style={{ padding: '0.5rem', fontSize: '0.8125rem' }}>{user.username}</td>
                        <td style={{ padding: '0.5rem' }}>
                          {user.is_tenant_admin ? (
                            <span style={{ 
                              padding: '0.1875rem 0.375rem', 
                              borderRadius: '0.25rem', 
                              fontSize: '0.6875rem', 
                              fontWeight: 600,
                              backgroundColor: '#dbeafe', 
                              color: '#1e40af' 
                            }}>
                              Admin
                            </span>
                          ) : (
                            <span style={{ 
                              padding: '0.1875rem 0.375rem', 
                              borderRadius: '0.25rem', 
                              fontSize: '0.6875rem', 
                              fontWeight: 600,
                              backgroundColor: '#f3f4f6', 
                              color: '#4b5563' 
                            }}>
                              User
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '0.5rem', fontSize: '0.8125rem' }}>{user.role}</td>
                        <td style={{ padding: '0.5rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1875rem' }}>
                            <span style={{ 
                              padding: '0.125rem 0.375rem', 
                              borderRadius: '0.25rem', 
                              fontSize: '0.6875rem', 
                              fontWeight: 500,
                              backgroundColor: user.is_active ? '#d1fae5' : '#fee2e2', 
                              color: user.is_active ? '#065f46' : '#991b1b',
                              width: 'fit-content'
                            }}>
                              {user.is_active ? 'Active' : 'Inactive'}
                            </span>
                            {user.login_status && (
                              <span style={{ 
                                padding: '0.125rem 0.375rem', 
                                borderRadius: '0.25rem', 
                                fontSize: '0.6875rem', 
                                fontWeight: 500,
                                backgroundColor: '#dbeafe', 
                                color: '#1e40af',
                                width: 'fit-content'
                              }}>
                                Online
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '0.5rem', fontSize: '0.8125rem', color: '#6b7280' }}>
                          {user.last_login ? (
                            <div>
                              <div style={{ fontSize: '0.75rem' }}>{new Date(user.last_login).toLocaleDateString()}</div>
                              <div style={{ fontSize: '0.6875rem', color: '#9ca3af' }}>
                                {new Date(user.last_login).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>Never</span>
                          )}
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                            <button
                              className="btn btn-secondary"
                              onClick={() => {
                                setSelectedUser(user);
                                setShowPasswordReset(true);
                                setNewPassword('');
                              }}
                              style={{ padding: '0.25rem 0.375rem', fontSize: '0.6875rem' }}
                              title="Reset Password"
                            >
                              <Key size={12} />
                            </button>
                            {user.login_status && (
                              <button
                                className="btn btn-warning"
                                onClick={() => handleForceLogout(user)}
                                style={{ padding: '0.25rem 0.375rem', fontSize: '0.6875rem' }}
                                title="Force Logout"
                              >
                                <LogOut size={12} />
                              </button>
                            )}
                            <button
                              className="btn btn-danger"
                              onClick={() => handleDeleteUser(user)}
                              style={{ padding: '0.25rem 0.375rem', fontSize: '0.6875rem' }}
                              title="Delete User"
                            >
                              <UserX size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Password Reset Modal */}
      {showPasswordReset && selectedUser && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '1rem'
        }} onClick={() => {
          setShowPasswordReset(false);
          setSelectedUser(null);
          setNewPassword('');
        }}>
          <div className="card" style={{ maxWidth: '400px', width: '100%', padding: '1rem' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Reset Password</h3>
              <button onClick={() => {
                setShowPasswordReset(false);
                setSelectedUser(null);
                setNewPassword('');
              }} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', padding: '0.25rem', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                Reset password for: <strong>{selectedUser.name}</strong> ({selectedUser.username})
              </p>
              <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
                New Password *
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input"
                placeholder="Enter new password (min 6 characters)"
                style={{ width: '100%', padding: '0.375rem', fontSize: '0.8125rem' }}
                autoFocus
              />
              <div style={{ fontSize: '0.6875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                Password must be at least 6 characters long
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowPasswordReset(false);
                  setSelectedUser(null);
                  setNewPassword('');
                }}
                disabled={resettingPassword}
                style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleResetPassword}
                disabled={resettingPassword || !newPassword || newPassword.length < 6}
                style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}
              >
                {resettingPassword ? 'Resetting...' : 'Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TenantManagement;

