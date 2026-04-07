import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCompanyOptional, CompanyDbUser } from '../../context/CompanyContext';
import { apiClient } from '../../services/api/client';
import { getDatabaseService } from '../../services/database/databaseService';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { UserRole } from '../../types';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import { ICONS } from '../../constants';
import Modal from '../ui/Modal';
import { useNotification } from '../../context/NotificationContext';

interface User {
    id: string;
    username: string;
    name: string;
    role: UserRole;
    email?: string;
    is_active?: boolean;
    last_login?: string;
    created_at?: string;
    force_password_change?: number;
}

/** API may return a bare array or { success, data }; unwrap safely for the table. */
function normalizeUsersApiPayload(raw: unknown): User[] {
    if (Array.isArray(raw)) return raw as User[];
    if (raw && typeof raw === 'object' && 'data' in raw && Array.isArray((raw as { data: unknown }).data)) {
        return (raw as { data: User[] }).data;
    }
    return [];
}

const UserManagement: React.FC = () => {
    const { user: currentUser, isAuthenticated } = useAuth();
    const companyCtx = useCompanyOptional();
    const { showConfirm, showToast, showAlert } = useNotification();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [userToEdit, setUserToEdit] = useState<User | null>(null);

    // Form State
    const [username, setUsername] = useState('');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<UserRole>('Accounts');

    const useCompanyBridge = isLocalOnlyMode() && !!companyCtx;

    const loadUsers = useCallback(async () => {
        try {
            setLoading(true);
            if (useCompanyBridge) {
                const rows = await companyCtx!.listUsers();
                setUsers(rows.map((r: CompanyDbUser) => ({
                    id: r.id,
                    username: r.username,
                    name: r.name,
                    role: r.role as UserRole,
                    email: r.email || undefined,
                    is_active: r.is_active !== 0,
                    force_password_change: r.force_password_change,
                    created_at: r.created_at,
                })));
            } else if (isLocalOnlyMode()) {
                const db = getDatabaseService();
                if (!db.isReady()) { setUsers([]); return; }
                const rows = db.query<{ id: string; username: string; name: string; role: string; email?: string; is_active?: number }>(
                    'SELECT id, username, name, role, email, is_active FROM users ORDER BY username'
                );
                setUsers(rows.map(r => ({
                    id: r.id, username: r.username, name: r.name,
                    role: r.role as UserRole, email: r.email || undefined,
                    is_active: r.is_active !== 0
                })));
            } else {
                if (!isAuthenticated) {
                    setUsers([]);
                    return;
                }
                const raw = await apiClient.get<unknown>('/users');
                setUsers(normalizeUsersApiPayload(raw));
            }
        } catch (error: any) {
            console.error('Error loading users:', error);
            await showAlert(error.message || 'Failed to load users');
        } finally {
            setLoading(false);
        }
    }, [useCompanyBridge, isAuthenticated]);

    useEffect(() => {
        void loadUsers();
    }, [loadUsers]);

    const openModal = async (user?: User) => {
        if (user) {
            setUserToEdit(user);
            setUsername(user.username);
            setName(user.name);
            setEmail(user.email || '');
            setRole(user.role);
            setPassword('');
        } else {
            setUserToEdit(null);
            setUsername('');
            setName('');
            setEmail('');
            setPassword('');
            setRole('Accounts');
        }
        setIsModalOpen(true);
    };

    const handleDelete = async (user: User) => {
        if (currentUser && user.id === currentUser.id) {
            await showAlert("You cannot delete your own account while logged in.");
            return;
        }

        if (await showConfirm(`Are you sure you want to delete user "${user.username}"?`)) {
            try {
                if (useCompanyBridge) {
                    const result = await companyCtx!.deleteUser(user.id);
                    if (!result.ok) { await showAlert(result.error || 'Failed to delete user'); return; }
                    showToast('User deleted successfully.');
                } else if (isLocalOnlyMode()) {
                    const db = getDatabaseService();
                    if (db.isReady()) db.execute('DELETE FROM users WHERE id = ?', [user.id]);
                    showToast('User deleted successfully.');
                } else {
                    await apiClient.delete(`/users/${user.id}`);
                    showToast('User deleted successfully.');
                }
                await loadUsers();
            } catch (error: any) {
                console.error('Error deleting user:', error);
                await showAlert(error.message || 'Failed to delete user');
            }
        }
    };

    const handleResetPassword = async (user: User) => {
        if (!useCompanyBridge) return;
        if (await showConfirm(`Reset password for "${user.username}"? They will be prompted to set a new password on next login.`)) {
            try {
                const result = await companyCtx!.resetUserPassword(user.id);
                if (!result.ok) { await showAlert(result.error || 'Failed to reset password'); return; }
                showToast('Password reset successfully. User will set a new password on next login.');
                await loadUsers();
            } catch (error: any) {
                await showAlert(error.message || 'Failed to reset password');
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!username || !name) {
            await showAlert("Username and Name are required.");
            return;
        }

        if (!userToEdit && !password && !useCompanyBridge) {
            await showAlert("Password is required for new users.");
            return;
        }

        try {
            if (useCompanyBridge) {
                if (userToEdit) {
                    const result = await companyCtx!.updateUser(userToEdit.id, {
                        username, name, role, email: email || undefined,
                        password: password || undefined,
                    });
                    if (!result.ok) { await showAlert(result.error || 'Failed to update user'); return; }
                    showToast('User updated successfully.');
                } else {
                    const result = await companyCtx!.createUser({
                        username, name, role, email: email || undefined,
                        password: password || undefined,
                    });
                    if (!result.ok) { await showAlert(result.error || 'Failed to create user'); return; }
                    showToast('User created successfully.');
                }
            } else if (isLocalOnlyMode()) {
                const db = getDatabaseService();
                if (!db.isReady()) { await showAlert('Local database is not ready.'); return; }
                const tenantId = (typeof window !== 'undefined' && localStorage.getItem('tenant_id')) || '';
                if (userToEdit) {
                    if (password) {
                        db.execute(
                            'UPDATE users SET username = ?, name = ?, email = ?, role = ?, password = ?, updated_at = datetime(\'now\') WHERE id = ?',
                            [username, name, email || null, role, password, userToEdit.id]
                        );
                    } else {
                        db.execute(
                            'UPDATE users SET username = ?, name = ?, email = ?, role = ?, updated_at = datetime(\'now\') WHERE id = ?',
                            [username, name, email || null, role, userToEdit.id]
                        );
                    }
                    showToast('User updated successfully.');
                } else {
                    const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
                    db.execute(
                        'INSERT INTO users (id, tenant_id, username, name, role, password, email, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime(\'now\'), datetime(\'now\'))',
                        [id, tenantId, username, name, role, password, email || null]
                    );
                    showToast('User created successfully.');
                }
            } else {
                if (userToEdit) {
                    const updateData: any = { username, name, email: email || undefined, role };
                    if (password) updateData.password = password;
                    await apiClient.put(`/users/${userToEdit.id}`, updateData);
                    showToast('User updated successfully.');
                } else {
                    const created = await apiClient.post<User>('/users', { username, name, email: email || undefined, password, role });
                    showToast('User created successfully.');
                    setUsers(prev => {
                        const map = new Map(prev.map(u => [u.id, u]));
                        map.set(created.id, {
                            ...created,
                            role: created.role as UserRole,
                            is_active: created.is_active !== false,
                        });
                        return Array.from(map.values()).sort((a, b) =>
                            a.username.localeCompare(b.username, undefined, { sensitivity: 'base' })
                        );
                    });
                }
            }
            setIsModalOpen(false);
            await loadUsers();
        } catch (error: any) {
            console.error('Error saving user:', error);
            await showAlert(error.message || error.error || 'Failed to save user');
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center p-8">
                <div className="text-slate-500">Loading users...</div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                <div>
                    <h3 className="text-lg font-bold text-slate-800">
                        {companyCtx?.activeCompany
                            ? `${companyCtx.activeCompany.company_name} — Users`
                            : 'Organization Users'}
                    </h3>
                    <p className="text-sm text-slate-500">
                        Manage users and assign roles.
                        {useCompanyBridge && ' Passwords are securely hashed.'}
                    </p>
                </div>
                <Button onClick={() => openModal()}>
                    <div className="w-4 h-4 mr-2">{ICONS.plus}</div> Add User
                </Button>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-x-auto">
                {users.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">
                        No users found. Click "Add User" to create your first user.
                    </div>
                ) : (
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-4 py-3 text-left font-semibold text-slate-600">Name</th>
                                <th className="px-4 py-3 text-left font-semibold text-slate-600">Username</th>
                                <th className="px-4 py-3 text-left font-semibold text-slate-600">Email</th>
                                <th className="px-4 py-3 text-left font-semibold text-slate-600">Role</th>
                                <th className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
                                <th className="px-4 py-3 text-right font-semibold text-slate-600">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {users.map(user => (
                                <tr key={user.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 text-slate-800 font-medium">{user.name}</td>
                                    <td className="px-4 py-3 text-slate-600">{user.username}</td>
                                    <td className="px-4 py-3 text-slate-600">{user.email || '-'}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                            user.role === 'Admin' || user.role === 'SUPER_ADMIN' ? 'bg-purple-100 text-purple-800' :
                                            user.role === 'Manager' ? 'bg-blue-100 text-blue-800' :
                                            user.role === 'Accounts' ? 'bg-slate-100 text-slate-800' :
                                            user.role === 'Store Manager' ? 'bg-emerald-100 text-emerald-800' :
                                            user.role === 'Cashier' ? 'bg-cyan-100 text-cyan-800' :
                                            user.role === 'Inventory Manager' ? 'bg-orange-100 text-orange-800' :
                                            user.role === 'Project Manager' ? 'bg-indigo-100 text-indigo-800' :
                                            user.role === 'Team Lead' ? 'bg-violet-100 text-violet-800' :
                                            'bg-gray-100 text-gray-800'
                                        }`}>
                                            {user.role === 'SUPER_ADMIN' ? 'Super Admin' : user.role}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        {user.force_password_change ? (
                                            <span className="px-2 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                                                No password set
                                            </span>
                                        ) : (
                                            <span className="px-2 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
                                                Active
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => openModal(user)}
                                                className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                                                title="Edit User"
                                            >
                                                <div className="w-4 h-4">{ICONS.edit}</div>
                                            </button>
                                            {useCompanyBridge && (
                                                <button
                                                    onClick={() => handleResetPassword(user)}
                                                    className="p-1 text-slate-400 hover:text-amber-600 transition-colors"
                                                    title="Reset Password"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                                </button>
                                            )}
                                            {currentUser && user.id !== currentUser.id && (
                                                <button
                                                    onClick={() => handleDelete(user)}
                                                    className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                                                    title="Delete User"
                                                >
                                                    <div className="w-4 h-4">{ICONS.trash}</div>
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={userToEdit ? 'Edit User' : 'New User'}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label="Full Name"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        required
                    />
                    <Input
                        label="Username"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        required
                    />
                    <Input
                        label="Email (Optional)"
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                    />

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            {userToEdit ? 'New Password (Optional)' : useCompanyBridge ? 'Password (Optional)' : 'Password'}
                        </label>
                        <input
                            type="password"
                            className="block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/50 sm:text-sm"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder={userToEdit ? "Leave blank to keep current" : useCompanyBridge ? "Leave blank — user sets on first login" : ""}
                            required={!userToEdit && !useCompanyBridge}
                            autoComplete="off"
                            data-form-type="other"
                        />
                        {useCompanyBridge && !userToEdit && !password && (
                            <p className="text-xs text-slate-400 mt-1">
                                If left blank, the user will be prompted to set a password on their first login.
                            </p>
                        )}
                    </div>

                    <Select
                        label="Role"
                        value={role}
                        onChange={e => setRole(e.target.value as UserRole)}
                    >
                        <optgroup label="Administrative Roles">
                            <option value="Admin">Admin (Full Access)</option>
                            <option value="Manager">Manager (Config + Data)</option>
                            <option value="Accounts">Accounts (Data Entry)</option>
                        </optgroup>
                        <optgroup label="POS & Shop Roles">
                            <option value="Store Manager">Store Manager (Shop Operations)</option>
                            <option value="Cashier">Cashier (POS Only)</option>
                            <option value="Inventory Manager">Inventory Manager (Stock Control)</option>
                        </optgroup>
                    </Select>

                    <div className="pt-2 text-xs text-slate-500 bg-slate-50 p-3 rounded-lg overflow-y-auto max-h-40">
                        {role === 'Admin' && (
                            <div>
                                <p className="font-bold text-slate-700 mb-1">Administrator</p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li>Full system access to all modules</li>
                                    <li>User management and system settings</li>
                                    <li>All financial reports including P&L</li>
                                    <li>Can manage POS, inventory, and procurement</li>
                                </ul>
                            </div>
                        )}
                        {role === 'Manager' && (
                            <div>
                                <p className="font-bold text-slate-700 mb-1">Manager</p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li>Can manage settings, contacts, and data</li>
                                    <li>Access to operational reports</li>
                                    <li>Cannot see Profit/Loss or Balance Sheet</li>
                                    <li>No access to sensitive investor reports</li>
                                </ul>
                            </div>
                        )}
                        {role === 'Accounts' && (
                            <div>
                                <p className="font-bold text-slate-700 mb-1">Accounts</p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li>Can enter transactions, invoices, bills</li>
                                    <li>Basic ledger and payment entry</li>
                                    <li>No access to Settings or analytical reports</li>
                                    <li>Cannot modify system configurations</li>
                                </ul>
                            </div>
                        )}
                        {role === 'Store Manager' && (
                            <div>
                                <p className="font-bold text-slate-700 mb-1">Store Manager</p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li>Full access to POS and Shop modules</li>
                                    <li>Manage products, pricing, and promotions</li>
                                    <li>View sales reports and analytics</li>
                                    <li>Manage cashiers and shift operations</li>
                                </ul>
                            </div>
                        )}
                        {role === 'Cashier' && (
                            <div>
                                <p className="font-bold text-slate-700 mb-1">Cashier</p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li>Access to POS sales screen only</li>
                                    <li>Process sales transactions and payments</li>
                                    <li>Handle customer checkouts</li>
                                    <li>Cannot modify prices or products</li>
                                </ul>
                            </div>
                        )}
                        {role === 'Inventory Manager' && (
                            <div>
                                <p className="font-bold text-slate-700 mb-1">Inventory Manager</p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li>Full access to Inventory module</li>
                                    <li>Manage stock levels and warehouses</li>
                                    <li>Process stock adjustments and transfers</li>
                                    <li>Handle procurement and purchase orders</li>
                                </ul>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-2 pt-4 border-t">
                        <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                        <Button type="submit">Save User</Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default UserManagement;
