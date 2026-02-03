import React, { useState, useEffect } from 'react';
import { ICONS } from '../../../constants';
import RoleDetailModal from './RoleDetailModal';
import { tasksApi } from '../../../services/api/repositories/tasksApi';
import { useNotification } from '../../../context/NotificationContext';

const RolesDashboard: React.FC = () => {
    const { showConfirm, showToast, showAlert } = useNotification();
    const [roles, setRoles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedRole, setSelectedRole] = useState<any>(null);

    const loadRoles = async () => {
        try {
            setLoading(true);
            const data = await tasksApi.getRoles();
            setRoles(data);
        } catch (error: any) {
            console.error('Error loading roles:', error);
            showAlert('Failed to load roles: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadRoles();
    }, []);

    const handleEditClick = (role: any) => {
        setSelectedRole(role);
        setIsModalOpen(true);
    };

    const handleCreateClick = () => {
        setSelectedRole(null);
        setIsModalOpen(true);
    };

    const handleDeleteClick = async (role: any) => {
        if (await showConfirm(`Are you sure you want to delete the role "${role.name}"?`)) {
            try {
                // TODO: Implement deleteRole in tasksApi
                // await tasksApi.deleteRole(role.id);
                showToast('Role deleted successfully');
                loadRoles();
            } catch (error: any) {
                showAlert('Failed to delete role: ' + error.message);
            }
        }
    };

    const handleSave = async (data: any) => {
        try {
            if (selectedRole) {
                // TODO: Implement updateRole in tasksApi
                // await tasksApi.updateRole(selectedRole.id, data);
                showToast('Role updated successfully');
            } else {
                await tasksApi.createRole(data);
                showToast('Role created successfully');
            }
            loadRoles();
            setIsModalOpen(false);
        } catch (error: any) {
            showAlert('Failed to save role: ' + error.message);
        }
    };

    if (loading) {
        return (
            <div className="p-8 text-center text-slate-500 flex flex-col items-center gap-4">
                <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="font-medium">Loading task roles...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in p-2 md:p-6">
            <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm gap-4 mb-6">
                <div>
                    <h3 className="text-xl font-bold text-slate-800">Task Roles & Permissions</h3>
                    <p className="text-sm text-slate-500">Define access levels for task management, OKRs, and team initiatives.</p>
                </div>
                <button
                    onClick={handleCreateClick}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100 flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
                >
                    <div className="w-4 h-4">{ICONS.plus}</div> Add Role
                </button>
            </div>

            {/* Roles Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-6 py-4 text-left text-xs font-black text-slate-500 uppercase tracking-widest">Role Name</th>
                            <th className="px-6 py-4 text-left text-xs font-black text-slate-500 uppercase tracking-widest">Description</th>
                            <th className="px-6 py-4 text-left text-xs font-black text-slate-500 uppercase tracking-widest hidden md:table-cell">Users</th>
                            <th className="px-6 py-4 text-right text-xs font-black text-slate-500 uppercase tracking-widest">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                        {roles.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-12 h-12 text-slate-200">{ICONS.box}</div>
                                        <p>No task roles defined yet.</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            roles.map((role) => (
                                <tr key={role.id} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-slate-800">{role.name}</span>
                                            {role.is_system && (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-500 uppercase tracking-tighter border border-slate-200">System</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-600 max-w-xs md:max-w-sm truncate">
                                        {role.description || <span className="text-slate-300 italic">No description</span>}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 hidden md:table-cell">
                                        <div className="flex items-center gap-2">
                                            <div className="w-4 h-4 opacity-40">{ICONS.users}</div>
                                            <span className="font-medium">{role.users_count || 0} users</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => handleEditClick(role)}
                                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                                title="Edit Role"
                                            >
                                                <div className="w-4 h-4">{ICONS.edit}</div>
                                            </button>
                                            {!role.is_system && (
                                                <button
                                                    onClick={() => handleDeleteClick(role)}
                                                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                                    title="Delete Role"
                                                >
                                                    <div className="w-4 h-4">{ICONS.trash}</div>
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

            {/* Info Box */}
            <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-6 flex gap-4 items-start shadow-sm">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-indigo-600 shadow-sm flex-shrink-0">
                    <div className="w-5 h-5">{ICONS.info}</div>
                </div>
                <div>
                    <h4 className="text-base font-bold text-indigo-900">About Task Roles</h4>
                    <p className="text-sm text-indigo-700/80 mt-1 leading-relaxed">
                        Task roles allow you to define granular permissions specifically for the Task Management and Performance modules.
                        Users can be assigned multiple task roles in addition to their primary organizational role.
                    </p>
                </div>
            </div>

            {isModalOpen && (
                <RoleDetailModal
                    role={selectedRole}
                    onClose={() => setIsModalOpen(false)}
                    onSave={handleSave}
                />
            )}
        </div>
    );
};

export default RolesDashboard;
