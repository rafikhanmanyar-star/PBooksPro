import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../services/api/client';
import { UserRole } from '../../types';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import { ICONS } from '../../constants';
import Modal from '../ui/Modal';
import { useNotification } from '../../context/NotificationContext';
import { tasksApi } from '../../services/api/repositories/tasksApi';

interface User {
    id: string;
    username: string;
    name: string;
    role: UserRole;
    email?: string;
    is_active?: boolean;
    last_login?: string;
    created_at?: string;
}

const UserManagement: React.FC = () => {
    const { user: currentUser } = useAuth();
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

    // Task Roles state
    const [allTaskRoles, setAllTaskRoles] = useState<any[]>([]);
    const [selectedTaskRoleIds, setSelectedTaskRoleIds] = useState<string[]>([]);
    const [loadingTaskRoles, setLoadingTaskRoles] = useState(false);

    // Initial load of all available task roles
    useEffect(() => {
        const fetchTaskRoles = async () => {
            try {
                const data = await tasksApi.getRoles();
                setAllTaskRoles(data);
            } catch (error) {
                console.error('Error fetching task roles:', error);
            }
        };
        fetchTaskRoles();
    }, []);

    // Load users from API
    const loadUsers = async () => {
        try {
            setLoading(true);
            const data = await apiClient.get<User[]>('/users');
            setUsers(data);
        } catch (error: any) {
            console.error('Error loading users:', error);
            await showAlert(error.message || 'Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadUsers();
    }, []);

    const openModal = async (user?: User) => {
        if (user) {
            setUserToEdit(user);
            setUsername(user.username);
            setName(user.name);
            setEmail(user.email || '');
            setRole(user.role);
            setPassword(''); // Don't show password, allow reset

            // Fetch user's granular task roles
            try {
                setLoadingTaskRoles(true);
                const userRoles = await tasksApi.getUserRoles(user.id);
                setSelectedTaskRoleIds(userRoles.map(r => r.id));
            } catch (error) {
                console.error('Error fetching user roles:', error);
            } finally {
                setLoadingTaskRoles(false);
            }
        } else {
            setUserToEdit(null);
            setUsername('');
            setName('');
            setEmail('');
            setPassword('');
            setRole('Accounts');
            setSelectedTaskRoleIds([]);
        }
        setIsModalOpen(true);
    };

    const handleDelete = async (user: User) => {
        // Prevent deleting own account
        if (currentUser && user.id === currentUser.id) {
            await showAlert("You cannot delete your own account while logged in.");
            return;
        }

        if (await showConfirm(`Are you sure you want to delete user "${user.username}"?`)) {
            try {
                await apiClient.delete(`/users/${user.id}`);
                showToast('User deleted successfully.');
                await loadUsers();
            } catch (error: any) {
                console.error('Error deleting user:', error);
                await showAlert(error.message || 'Failed to delete user');
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Basic Validation
        if (!username || !name) {
            await showAlert("Username and Name are required.");
            return;
        }

        // Password validation for new users
        if (!userToEdit && !password) {
            await showAlert("Password is required for new users.");
            return;
        }

        try {
            if (userToEdit) {
                // Update existing user
                const updateData: any = {
                    username,
                    name,
                    email: email || undefined,
                    role
                };
                // Only include password if provided
                if (password) {
                    updateData.password = password;
                }
                await apiClient.put(`/users/${userToEdit.id}`, updateData);

                // Update task roles
                await tasksApi.updateUserRoles(userToEdit.id, selectedTaskRoleIds);

                showToast('User updated successfully.');
            } else {
                // Create new user
                const newUser = await apiClient.post<User>('/users', {
                    username,
                    name,
                    email: email || undefined,
                    password,
                    role
                });

                // Update task roles for new user
                if (selectedTaskRoleIds.length > 0) {
                    await tasksApi.updateUserRoles(newUser.id, selectedTaskRoleIds);
                }

                showToast('User created successfully.');
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
                    <h3 className="text-lg font-bold text-slate-800">Organization Users</h3>
                    <p className="text-sm text-slate-500">Manage users and assign roles for your organization.</p>
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
                                <th className="px-4 py-3 text-left font-semibold text-slate-600">Last Login</th>
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
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${user.role === 'Admin' ? 'bg-purple-100 text-purple-800' :
                                            user.role === 'Manager' ? 'bg-blue-100 text-blue-800' :
                                                user.role === 'Accounts' ? 'bg-slate-100 text-slate-800' :
                                                    user.role === 'Store Manager' ? 'bg-emerald-100 text-emerald-800' :
                                                        user.role === 'Cashier' ? 'bg-cyan-100 text-cyan-800' :
                                                            user.role === 'Inventory Manager' ? 'bg-orange-100 text-orange-800' :
                                                                user.role === 'Project Manager' ? 'bg-indigo-100 text-indigo-800' :
                                                                    user.role === 'Team Lead' ? 'bg-violet-100 text-violet-800' :
                                                                        user.role === 'Task Contributor' ? 'bg-sky-100 text-sky-800' :
                                                                            'bg-gray-100 text-gray-800'
                                            }`}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                        {user.last_login
                                            ? new Date(user.last_login).toLocaleDateString()
                                            : 'Never'}
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
                            {userToEdit ? 'New Password (Optional)' : 'Password'}
                        </label>
                        <input
                            type="password"
                            className="block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/50 sm:text-sm"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder={userToEdit ? "Leave blank to keep current" : ""}
                            required={!userToEdit}
                            autoComplete="off"
                            data-form-type="other"
                        />
                    </div>

                    <Select
                        label="Role"
                        value={role}
                        onChange={e => setRole(e.target.value as UserRole)}
                    >
                        <optgroup label="Administrative Roles">
                            <option value="Admin">👑 Admin (Full Access)</option>
                            <option value="Manager">📊 Manager (Config + Data)</option>
                            <option value="Accounts">💰 Accounts (Data Entry)</option>
                        </optgroup>
                        <optgroup label="POS & Shop Roles">
                            <option value="Store Manager">🏪 Store Manager (Shop Operations)</option>
                            <option value="Cashier">🛒 Cashier (POS Only)</option>
                            <option value="Inventory Manager">📦 Inventory Manager (Stock Control)</option>
                        </optgroup>
                        <optgroup label="Task & Performance Roles">
                            <option value="Project Manager">📅 Project Manager (Tasks + OKRs)</option>
                            <option value="Team Lead">👥 Team Lead (Manage Team Tasks)</option>
                            <option value="Task Contributor">✍️ Task Contributor (Execution Only)</option>
                        </optgroup>
                    </Select>

                    <div className="pt-2">
                        <label className="block text-sm font-bold text-slate-700 mb-2">Granular Task Roles</label>
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 max-h-48 overflow-y-auto space-y-2">
                            {allTaskRoles.length === 0 ? (
                                <p className="text-xs text-slate-400 italic">No custom task roles defined. Create them in "Task Roles" section.</p>
                            ) : (
                                allTaskRoles.map(tr => (
                                    <label key={tr.id} className="flex items-center gap-3 p-2 bg-white border border-slate-100 rounded-lg hover:bg-indigo-50 cursor-pointer transition-all">
                                        <input
                                            type="checkbox"
                                            checked={selectedTaskRoleIds.includes(tr.id)}
                                            onChange={(e) => {
                                                if (e.target.checked) setSelectedTaskRoleIds([...selectedTaskRoleIds, tr.id]);
                                                else setSelectedTaskRoleIds(selectedTaskRoleIds.filter(id => id !== tr.id));
                                            }}
                                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <div>
                                            <p className="text-xs font-bold text-slate-800">{tr.name}</p>
                                            {tr.description && <p className="text-[10px] text-slate-500 leading-tight">{tr.description}</p>}
                                        </div>
                                    </label>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="pt-2 text-xs text-slate-500 bg-slate-50 p-3 rounded-lg overflow-y-auto max-h-40">
                        {role === 'Admin' && (
                            <div>
                                <p className="font-bold text-slate-700 mb-1">👑 Administrator</p>
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
                                <p className="font-bold text-slate-700 mb-1">📊 Manager</p>
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
                                <p className="font-bold text-slate-700 mb-1">💰 Accounts</p>
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
                                <p className="font-bold text-slate-700 mb-1">🏪 Store Manager</p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li>Full access to POS and Shop modules</li>
                                    <li>Manage products, pricing, and promotions</li>
                                    <li>View sales reports and analytics</li>
                                    <li>Manage cashiers and shift operations</li>
                                    <li>Oversee inventory and procurement</li>
                                    <li>Handle customer loyalty programs</li>
                                </ul>
                            </div>
                        )}
                        {role === 'Cashier' && (
                            <div>
                                <p className="font-bold text-slate-700 mb-1">🛒 Cashier</p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li>Access to POS sales screen only</li>
                                    <li>Process sales transactions and payments</li>
                                    <li>Handle customer checkouts</li>
                                    <li>View own shift sales summary</li>
                                    <li>Cannot modify prices or products</li>
                                    <li>Cannot access other modules</li>
                                </ul>
                            </div>
                        )}
                        {role === 'Inventory Manager' && (
                            <div>
                                <p className="font-bold text-slate-700 mb-1">📦 Inventory Manager</p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li>Full access to Inventory module</li>
                                    <li>Manage stock levels and warehouses</li>
                                    <li>Process stock adjustments and transfers</li>
                                    <li>Handle procurement and purchase orders</li>
                                    <li>View inventory reports and analytics</li>
                                    <li>Cannot access POS or financial data</li>
                                </ul>
                            </div>
                        )}
                        {role === 'Project Manager' && (
                            <div>
                                <p className="font-bold text-slate-700 mb-1">📅 Project Manager (Tasks)</p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li>Create and manage Task Initiatives</li>
                                    <li>Set up and track OKRs (Objectives & Key Results)</li>
                                    <li>Full access to Task Reports and Analytics</li>
                                    <li>Configure Task Workflows and Stages</li>
                                    <li>Assign tasks to any team member</li>
                                </ul>
                            </div>
                        )}
                        {role === 'Team Lead' && (
                            <div>
                                <p className="font-bold text-slate-700 mb-1">👥 Team Lead</p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li>Manage tasks for specific teams/projects</li>
                                    <li>Review and approve task completions</li>
                                    <li>View team productivity and status reports</li>
                                    <li>Reassign tasks within their department</li>
                                    <li>Submit initiative progress updates</li>
                                </ul>
                            </div>
                        )}
                        {role === 'Task Contributor' && (
                            <div>
                                <p className="font-bold text-slate-700 mb-1">✍️ Task Contributor</p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li>Execute assigned tasks and update status</li>
                                    <li>Log time and progress on tasks</li>
                                    <li>Upload attachments and add comments</li>
                                    <li>View personal task calendar and deadline</li>
                                    <li>Cannot create initiatives or review others' work</li>
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
