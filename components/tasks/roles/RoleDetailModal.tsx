import React, { useState, useEffect } from 'react';
import { ICONS } from '../../../constants';
import Modal from '../../ui/Modal';
import { tasksApi } from '../../../services/api/repositories/tasksApi';
import { useNotification } from '../../../context/NotificationContext';

interface RoleDetailModalProps {
    role: any;
    onClose: () => void;
    onSave: (data: any) => void;
}

const RoleDetailModal: React.FC<RoleDetailModalProps> = ({ role, onClose, onSave }) => {
    const { showAlert } = useNotification();
    const [name, setName] = useState(role?.name || '');
    const [description, setDescription] = useState(role?.description || '');
    const [allPermissions, setAllPermissions] = useState<any[]>([]);
    const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                const [perms, activePerms] = await Promise.all([
                    tasksApi.getPermissions(),
                    role ? tasksApi.getRolePermissions(role.id) : Promise.resolve([])
                ]);
                setAllPermissions(perms);
                setSelectedPermissions(activePerms.map(p => p.id));
            } catch (error: any) {
                console.error('Error loading permission data:', error);
                showAlert('Failed to load permissions: ' + error.message);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [role]);

    const togglePermission = (id: string) => {
        setSelectedPermissions(prev =>
            prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            // We pass name, description and selected permission IDs to onSave
            onSave({ name, description, permission_ids: selectedPermissions });
        } catch (error: any) {
            showAlert('Failed to save role: ' + error.message);
        }
    };

    // Group permissions by module
    const groupedPermissions = allPermissions.reduce((acc: any, perm: any) => {
        if (!acc[perm.module]) acc[perm.module] = [];
        acc[perm.module].push(perm);
        return acc;
    }, {});

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title={role ? `Edit Role: ${role.name}` : 'Create New Role'}
            size="lg"
        >
            {loading ? (
                <div className="py-12 text-center text-slate-500">
                    <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p>Loading permissions matrix...</p>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-bold text-slate-700 mb-1">Role Name *</label>
                            <input
                                required
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium"
                                placeholder="e.g. Senior Project Manager"
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-sm font-bold text-slate-700 mb-1">Description</label>
                            <textarea
                                rows={2}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                                placeholder="Specify the responsibilities and access limits for this role..."
                            />
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest">Permissions Matrix</h4>
                            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full">{selectedPermissions.length} Active</span>
                        </div>

                        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                            {Object.entries(groupedPermissions).map(([module, perms]: [string, any]) => (
                                <div key={module} className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                                    <div className="px-4 py-2 bg-slate-100/50 border-b border-slate-200">
                                        <h5 className="text-xs font-black text-slate-600 uppercase tracking-tight">{module}</h5>
                                    </div>
                                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {perms.map((perm: any) => (
                                            <label key={perm.id} className="flex items-start gap-3 p-3 bg-white rounded-lg border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 cursor-pointer transition-all group">
                                                <div className="relative flex items-center mt-0.5">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedPermissions.includes(perm.id)}
                                                        onChange={() => togglePermission(perm.id)}
                                                        className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-slate-300 checked:bg-indigo-600 checked:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                                    />
                                                    <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100 transition-opacity">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" stroke="currentColor" strokeWidth="1">
                                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path>
                                                        </svg>
                                                    </div>
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-xs font-bold text-slate-800 capitalize">{perm.action}</p>
                                                    <p className="text-[10px] text-slate-500 leading-tight mt-0.5">{perm.description || `Allow ${perm.action} action on ${module}`}</p>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-black hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
                        >
                            {ICONS.checkCircle} Save Role Configuration
                        </button>
                    </div>
                </form>
            )}
        </Modal>
    );
};

export default RoleDetailModal;
