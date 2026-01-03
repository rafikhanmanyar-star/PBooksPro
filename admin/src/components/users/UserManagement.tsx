import React, { useEffect, useState } from 'react';
import { adminApi } from '../../services/adminApi';
import { UserPlus, Search, Edit, Trash2, Shield, User, X, Save } from 'lucide-react';

interface AdminUser {
  id: string;
  username: string;
  name: string;
  email: string;
  role: 'super_admin' | 'admin';
  is_active: boolean;
  last_login: string | null;
  created_at: string;
}

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    name: '',
    email: '',
    password: '',
    role: 'admin' as 'super_admin' | 'admin',
    is_active: true,
  });

  useEffect(() => {
    loadUsers();
  }, [roleFilter, activeFilter]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const filters: any = {};
      if (roleFilter) filters.role = roleFilter;
      if (activeFilter !== '') filters.isActive = activeFilter;
      if (searchTerm) filters.search = searchTerm;
      
      const data = await adminApi.getAdminUsers(filters);
      setUsers(data);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load admin users');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingUser(null);
    setFormData({
      username: '',
      name: '',
      email: '',
      password: '',
      role: 'admin',
      is_active: true,
    });
    setShowModal(true);
  };

  const handleEdit = (user: AdminUser) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      name: user.name,
      email: user.email,
      password: '', // Don't pre-fill password
      role: user.role,
      is_active: user.is_active,
    });
    setShowModal(true);
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this admin user? This action cannot be undone.')) return;
    
    try {
      await adminApi.deleteAdminUser(userId);
      await loadUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to delete admin user');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      if (editingUser) {
        // Update existing user
        const updateData: any = {
          username: formData.username,
          name: formData.name,
          email: formData.email,
          role: formData.role,
          is_active: formData.is_active,
        };
        // Only include password if it's provided
        if (formData.password) {
          updateData.password = formData.password;
        }
        await adminApi.updateAdminUser(editingUser.id, updateData);
      } else {
        // Create new user
        if (!formData.password) {
          setError('Password is required for new users');
          return;
        }
        await adminApi.createAdminUser({
          username: formData.username,
          name: formData.name,
          email: formData.email,
          password: formData.password,
          role: formData.role,
        });
      }
      setShowModal(false);
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to save admin user');
    }
  };

  const getRoleBadge = (role: string) => {
    const isSuperAdmin = role === 'super_admin';
    return (
      <span className="badge" style={{ 
        backgroundColor: isSuperAdmin ? '#dbeafe' : '#e0e7ff', 
        color: isSuperAdmin ? '#1e40af' : '#3730a3' 
      }}>
        {isSuperAdmin ? <Shield size={14} style={{ marginRight: '0.25rem', display: 'inline' }} /> : <User size={14} style={{ marginRight: '0.25rem', display: 'inline' }} />}
        {role === 'super_admin' ? 'Super Admin' : 'Admin'}
      </span>
    );
  };

  const getStatusBadge = (isActive: boolean) => {
    return (
      <span className="badge" style={{ 
        backgroundColor: isActive ? '#d1fae5' : '#fee2e2', 
        color: isActive ? '#065f46' : '#991b1b' 
      }}>
        {isActive ? 'Active' : 'Inactive'}
      </span>
    );
  };

  const filteredUsers = users.filter(user => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      user.username.toLowerCase().includes(search) ||
      user.name.toLowerCase().includes(search) ||
      user.email.toLowerCase().includes(search)
    );
  });

  if (loading) {
    return <div>Loading admin users...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>Admin User Management</h1>
        <button
          className="btn btn-primary"
          onClick={handleCreate}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <UserPlus size={20} />
          Create User
        </button>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={20} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
            <input
              type="text"
              className="input"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '2.5rem' }}
            />
          </div>
          <select
            className="input"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={{ width: '150px' }}
          >
            <option value="">All Roles</option>
            <option value="super_admin">Super Admin</option>
            <option value="admin">Admin</option>
          </select>
          <select
            className="input"
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value)}
            style={{ width: '150px' }}
          >
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      </div>

      {error && (
        <div style={{ padding: '1rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '0.5rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {/* Users Table */}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last Login</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                  No admin users found
                </td>
              </tr>
            ) : (
              filteredUsers.map(user => (
                <tr key={user.id}>
                  <td style={{ fontWeight: 500 }}>{user.username}</td>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>{getRoleBadge(user.role)}</td>
                  <td>{getStatusBadge(user.is_active)}</td>
                  <td>
                    {user.last_login
                      ? new Date(user.last_login).toLocaleString()
                      : 'Never'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleEdit(user)}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                      >
                        <Edit size={16} style={{ marginRight: '0.25rem' }} />
                        Edit
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => handleDelete(user.id)}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                      >
                        <Trash2 size={16} style={{ marginRight: '0.25rem' }} />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }} onClick={() => setShowModal(false)}>
          <div className="card" style={{ maxWidth: '500px', width: '90%', maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                {editingUser ? 'Edit Admin User' : 'Create Admin User'}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                    Username *
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                    Name *
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                    Email *
                  </label>
                  <input
                    type="email"
                    className="input"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                    Password {editingUser ? '(leave blank to keep current)' : '*'}
                  </label>
                  <input
                    type="password"
                    className="input"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required={!editingUser}
                    minLength={6}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                    Role *
                  </label>
                  <select
                    className="input"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as 'super_admin' | 'admin' })}
                    required
                  >
                    <option value="admin">Admin</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </div>

                {editingUser && (
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                      <input
                        type="checkbox"
                        checked={formData.is_active}
                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      />
                      Active
                    </label>
                  </div>
                )}

                {error && (
                  <div style={{ padding: '0.75rem', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '0.375rem', fontSize: '0.875rem' }}>
                    {error}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    <Save size={16} />
                    {editingUser ? 'Update' : 'Create'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;

