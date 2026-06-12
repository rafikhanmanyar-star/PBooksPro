import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCompanyOptional, CompanyDbUser } from '../../context/CompanyContext';
import { apiClient } from '../../services/api/client';
import { getDatabaseService } from '../../services/database/databaseService';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { UserRole } from '../../types';
import { ASSIGNABLE_ROLES, ENTERPRISE_ROLE_LABELS, resolveEnterpriseRole } from '../../shared/rbac/permissions';
import Button from '../ui/Button';
import LoadingButton from '../ui/LoadingButton';
import Input from '../ui/Input';
import Select from '../ui/Select';
import { ICONS } from '../../constants';
import Modal from '../ui/Modal';
import { useNotification } from '../../context/NotificationContext';
import { isValidEmailFormat, normalizeUserEmail } from '../../shared/auth/emailIdentity';

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
    const [isSubmitting, setIsSubmitting] = useState(false);
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
        if (isSubmitting) return;

        if (!name.trim()) {
            await showAlert('Full name is required.');
            return;
        }
        const emailVal = email.trim();
        if (!emailVal) {
            await showAlert('Email address is required.');
            return;
        }
        if (!isValidEmailFormat(emailVal)) {
            await showAlert('Enter a valid email address.');
            return;
        }
        const normalizedEmail = normalizeUserEmail(emailVal);
        if (!normalizedEmail) {
            await showAlert('Email address is required.');
            return;
        }
        const duplicate = users.some(
            u => u.id !== userToEdit?.id && normalizeUserEmail(u.email) === normalizedEmail
        );
        if (duplicate) {
            await showAlert('This email address is already assigned to another user.');
            return;
        }
        const resolvedUsername = username.trim() || normalizedEmail.split('@')[0] || 'user';

        if (!userToEdit && !password && !useCompanyBridge) {
            await showAlert("Password is required for new users.");
            return;
        }

        setIsSubmitting(true);
        try {
            if (useCompanyBridge) {
                if (userToEdit) {
                    const result = await companyCtx!.updateUser(userToEdit.id, {
                        username: resolvedUsername, name, role, email: normalizedEmail,
                        password: password || undefined,
                    });
                    if (!result.ok) { await showAlert(result.error || 'Failed to update user'); return; }
                    showToast('User updated successfully.');
                } else {
                    const result = await companyCtx!.createUser({
                        username: resolvedUsername, name, role, email: normalizedEmail,
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
                            [resolvedUsername, name, normalizedEmail, role, password, userToEdit.id]
                        );
                    } else {
                        db.execute(
                            'UPDATE users SET username = ?, name = ?, email = ?, role = ?, updated_at = datetime(\'now\') WHERE id = ?',
                            [resolvedUsername, name, normalizedEmail, role, userToEdit.id]
                        );
                    }
                    showToast('User updated successfully.');
                } else {
                    const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
                    db.execute(
                        'INSERT INTO users (id, tenant_id, username, name, role, password, email, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime(\'now\'), datetime(\'now\'))',
                        [id, tenantId, resolvedUsername, name, role, password, normalizedEmail]
                    );
                    showToast('User created successfully.');
                }
            } else {
                if (userToEdit) {
                    const updateData: any = { username: resolvedUsername, name, email: normalizedEmail, role };
                    if (password) updateData.password = password;
                    await apiClient.put(`/users/${userToEdit.id}`, updateData);
                    showToast('User updated successfully.');
                } else {
                    const created = await apiClient.post<User>('/users', { username: resolvedUsername, name, email: normalizedEmail, password, role });
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
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center p-8">
                <div className="text-app-muted">Loading users...</div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-app-card p-4 rounded-lg border border-app-border shadow-ds-card">
                <div>
                    <h3 className="text-lg font-bold text-app-text">
                        {companyCtx?.activeCompany
                            ? `${companyCtx.activeCompany.company_name} — Users`
                            : 'Organization Users'}
                    </h3>
                    <p className="text-sm text-app-muted">
                        Manage users and assign roles.
                        {useCompanyBridge && ' Passwords are securely hashed.'}
                    </p>
                </div>
                <Button onClick={() => openModal()}>
                    <div className="w-4 h-4 mr-2">{ICONS.plus}</div> Add User
                </Button>
            </div>

            <div className="bg-app-card rounded-lg border border-app-border shadow-ds-card overflow-x-auto">
                {users.length === 0 ? (
                    <div className="p-8 text-center text-app-muted">
                        No users found. Click "Add User" to create your first user.
                    </div>
                ) : (
                    <table className="min-w-full divide-y divide-app-border text-sm">
                        <thead className="bg-app-bg">
                            <tr>
                                <th className="px-4 py-3 text-left font-semibold text-app-muted">Name</th>
                                <th className="px-4 py-3 text-left font-semibold text-app-muted">Username</th>
                                <th className="px-4 py-3 text-left font-semibold text-app-muted">Email</th>
                                <th className="px-4 py-3 text-left font-semibold text-app-muted">Role</th>
                                <th className="px-4 py-3 text-left font-semibold text-app-muted">Status</th>
                                <th className="px-4 py-3 text-right font-semibold text-app-muted">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-app-border">
                            {users.map(user => (
                                <tr key={user.id} className="hover:bg-app-bg">
                                    <td className="px-4 py-3 text-app-text font-medium">{user.name}</td>
                                    <td className="px-4 py-3 text-app-muted">{user.username}</td>
                                    <td className="px-4 py-3 text-app-muted">{user.email || '-'}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                            user.role === 'Admin' || user.role === 'SUPER_ADMIN' ? 'bg-purple-100 text-purple-800' :
                                            user.role === 'Manager' ? 'bg-blue-100 text-blue-800' :
                                            user.role === 'Accounts' ? 'bg-app-surface-2 text-app-text' :
                                            user.role === 'Project Manager' ? 'bg-app-highlight text-app-text' :
                                            user.role === 'Team Lead' ? 'bg-violet-100 text-violet-800' :
                                            'bg-app-surface-2 text-app-text'
                                        }`}>
                                            {user.role === 'SUPER_ADMIN' ? 'Super Admin' : user.role}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        {user.force_password_change ? (
                                            <span className="px-2 py-1 rounded-full text-xs font-bold bg-amber-100 text-ds-warning">
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
                                                className="p-1 text-app-muted hover:text-ds-primary transition-colors"
                                                title="Edit User"
                                            >
                                                <div className="w-4 h-4">{ICONS.edit}</div>
                                            </button>
                                            {useCompanyBridge && (
                                                <button
                                                    onClick={() => handleResetPassword(user)}
                                                    className="p-1 text-app-muted hover:text-ds-warning transition-colors"
                                                    title="Reset Password"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                                </button>
                                            )}
                                            {currentUser && user.id !== currentUser.id && (
                                                <button
                                                    onClick={() => handleDelete(user)}
                                                    className="p-1 text-app-muted hover:text-ds-danger transition-colors"
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

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} preventCloseWhile={isSubmitting} title={userToEdit ? 'Edit User' : 'New User'}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label="Email Address"
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        required
                    />
                    <Input
                        label="Username (display)"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        placeholder="Optional — defaults from email"
                    />
                    <Input
                        label="Full Name"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        required
                    />

                    <div>
                        <label className="block text-sm font-medium text-app-text mb-1">
                            {userToEdit ? 'New Password (Optional)' : useCompanyBridge ? 'Password (Optional)' : 'Password'}
                        </label>
                        <input
                            type="password"
                            className="block w-full px-3 py-2 border border-app-border rounded-lg shadow-ds-card focus:outline-none focus:ring-2 focus:ring-accent/50 sm:text-sm"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder={userToEdit ? "Leave blank to keep current" : useCompanyBridge ? "Leave blank — user sets on first login" : ""}
                            required={!userToEdit && !useCompanyBridge}
                            autoComplete="off"
                            data-form-type="other"
                        />
                        {useCompanyBridge && !userToEdit && !password && (
                            <p className="text-xs text-app-muted mt-1">
                                If left blank, the user will be prompted to set a password on their first login.
                            </p>
                        )}
                    </div>

                    <Select
                        label="Role"
                        value={role}
                        onChange={e => setRole(e.target.value as UserRole)}
                    >
                        {ASSIGNABLE_ROLES.map((r) => (
                            <option key={r.value} value={r.value}>
                                {r.label}
                            </option>
                        ))}
                        <optgroup label="Legacy roles">
                            <option value="Team Lead">Team Lead</option>
                            <option value="Task Contributor">Task Contributor</option>
                        </optgroup>
                    </Select>

                    <div className="pt-2 text-xs text-app-muted bg-app-bg p-3 rounded-lg overflow-y-auto max-h-40">
                        <p className="font-bold text-app-text mb-1">
                            {ENTERPRISE_ROLE_LABELS[resolveEnterpriseRole(role)]}
                        </p>
                        <p>Permissions are enforced server-side. See Settings → Permissions for the full matrix.</p>
                    </div>

                    <div className="flex justify-end gap-2 pt-4 border-t">
                        <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>Cancel</Button>
                        <LoadingButton type="submit" loading={isSubmitting} loadingText="Saving...">Save User</LoadingButton>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default UserManagement;
