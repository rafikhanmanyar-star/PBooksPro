import React, { useState } from 'react';
import { ICONS } from '../../../constants';
import RoleDetailModal from './RoleDetailModal';

// Mock types for user management context
interface User {
    id: string;
    name: string;
    email: string;
    roles: string[];
}

const RolesDashboard: React.FC = () => {
    // Mock Data
    const [roles, setRoles] = useState([
        { id: '1', name: 'Administrator', description: 'Full access to all modules and settings.', usersCount: 2, isSystem: true },
        { id: '2', name: 'Task Manager', description: 'Can create, edit, and approve tasks.', usersCount: 5, isSystem: false },
        { id: '3', name: 'Contributor', description: 'Can view and comment on tasks.', usersCount: 12, isSystem: false },
    ]);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedRole, setSelectedRole] = useState<any>(null);

    const handleEditClick = (role: any) => {
        setSelectedRole(role);
        setIsModalOpen(true);
    };

    const handleCreateClick = () => {
        setSelectedRole(null);
        setIsModalOpen(true);
    };

    const handleDeleteClick = (id: string) => {
        if (window.confirm('Are you sure you want to delete this role?')) {
            setRoles(roles.filter(r => r.id !== id));
        }
    };

    return (
        <div className="space-y-6 animate-fade-in p-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Roles & Permissions</h1>
                    <p className="text-gray-500">Manage access levels and ensure data security.</p>
                </div>
                <button
                    onClick={handleCreateClick}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 shadow-sm flex items-center gap-2"
                >
                    {ICONS.plus} Add Role
                </button>
            </div>

            {/* Roles Table */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Users</th>
                            <th className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {roles.map((role) => (
                            <tr key={role.id} className="hover:bg-gray-50 group">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-gray-900">{role.name}</span>
                                        {role.isSystem && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600 uppercase border border-gray-200">System</span>}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-500 max-w-sm truncate">
                                    {role.description}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    <div className="flex items-center gap-1.5">
                                        {ICONS.users} {role.usersCount} users
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <div className="flex justify-end gap-3">
                                        <button
                                            onClick={() => handleEditClick(role)}
                                            className="text-blue-600 hover:text-blue-900 transition-colors"
                                        >
                                            Edit
                                        </button>
                                        {!role.isSystem && (
                                            <button
                                                onClick={() => handleDeleteClick(role.id)}
                                                className="text-red-500 hover:text-red-700 transition-colors"
                                            >
                                                Delete
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* User Assignment Placeholder */}
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-4 items-start">
                <div className="text-blue-500 mt-1">{ICONS.info}</div>
                <div>
                    <h4 className="text-sm font-bold text-blue-900">User Assignments</h4>
                    <p className="text-sm text-blue-700 mt-1">
                        To assign roles to users, navigate to the Organization Settings or edit a specific User profile.
                    </p>
                </div>
            </div>

            {isModalOpen && (
                <RoleDetailModal
                    role={selectedRole}
                    onClose={() => setIsModalOpen(false)}
                    onSave={(data) => {
                        console.log('Role Save:', data);
                        if (selectedRole) {
                            setRoles(roles.map(r => r.id === selectedRole.id ? { ...r, ...data } : r));
                        } else {
                            setRoles([...roles, { id: Date.now().toString(), ...data, usersCount: 0, isSystem: false }]);
                        }
                        setIsModalOpen(false);
                    }}
                />
            )}
        </div>
    );
};

export default RolesDashboard;
