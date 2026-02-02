import React, { useState } from 'react';
import { ICONS } from '../../../constants';
import Modal from '../../ui/Modal';

interface RoleDetailModalProps {
    role: any;
    onClose: () => void;
    onSave: (data: any) => void;
}

const RoleDetailModal: React.FC<RoleDetailModalProps> = ({ role, onClose, onSave }) => {
    const [name, setName] = useState(role?.name || '');
    const [description, setDescription] = useState(role?.description || '');

    // Mock Permissions Matrix
    const [permissions, setPermissions] = useState({
        tasks: { read: true, write: false, delete: false, approve: false },
        okrs: { read: true, write: false, delete: false, approve: false },
        initiatives: { read: true, write: false, delete: false, approve: false },
        settings: { read: false, write: false, admin: false }
    });

    const togglePermission = (module: string, action: string) => {
        setPermissions(prev => ({
            ...prev,
            [module]: {
                ...prev[module as keyof typeof prev],
                [action]: !prev[module as keyof typeof prev][action as keyof typeof prev[keyof typeof prev]]
            }
        }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({ name, description, permissions });
        onClose();
    };

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title={role ? `Edit Role: ${role.name}` : 'Create New Role'}
        >
            <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role Name *</label>
                    <input
                        required
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                        placeholder="e.g. Content Reviewer"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                        rows={2}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                        placeholder="What actions can this user perform?"
                    />
                </div>

                <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-3 uppercase tracking-wide">Permissions</h4>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 text-center w-24">Module</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">Read</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">Write</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">Delete</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">Approve</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {['tasks', 'okrs', 'initiatives'].map((module) => (
                                    <tr key={module}>
                                        <td className="px-4 py-3 text-sm font-medium text-gray-900 capitalize bg-gray-50">{module}</td>
                                        {['read', 'write', 'delete', 'approve'].map((action) => (
                                            <td key={action} className="px-4 py-3 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={permissions[module as keyof typeof permissions][action as keyof typeof permissions['tasks']]}
                                                    onChange={() => togglePermission(module, action)}
                                                    className="rounded border-gray-300 text-green-600 focus:ring-green-500 h-4 w-4"
                                                />
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                    <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
                    <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-sm">Save Role</button>
                </div>
            </form>
        </Modal>
    );
};

export default RoleDetailModal;
