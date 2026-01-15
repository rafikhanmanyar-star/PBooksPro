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

    const openModal = (user?: User) => {
        if (user) {
            setUserToEdit(user);
            setUsername(user.username);
            setName(user.name);
            setEmail(user.email || '');
            setRole(user.role);
            setPassword(''); // Don't show password, allow reset
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
                showToast('User updated successfully.');
            } else {
                // Create new user
                await apiClient.post('/users', {
                    username,
                    name,
                    email: email || undefined,
                    password,
                    role
                });
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

            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
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
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                            user.role === 'Admin' ? 'bg-purple-100 text-purple-800' :
                                            user.role === 'Manager' ? 'bg-blue-100 text-blue-800' :
                                            'bg-slate-100 text-slate-800'
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
                        <option value="Admin">Admin (Full Access)</option>
                        <option value="Manager">Manager (Config + Data, No Sensitive Reports)</option>
                        <option value="Accounts">Accounts (Data Entry Only)</option>
                    </Select>
                    
                    <div className="pt-2 text-xs text-slate-500">
                        {role === 'Admin' && <p>• Full system access.</p>}
                        {role === 'Manager' && <p>• Can manage settings, contacts, and data.<br/>• Cannot see Profit/Loss, Balance Sheet, Investor reports.</p>}
                        {role === 'Accounts' && <p>• Can only enter transactions, invoices, bills.<br/>• No access to Settings or analytical reports.</p>}
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
