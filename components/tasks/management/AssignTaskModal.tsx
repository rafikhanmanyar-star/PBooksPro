import React, { useState, useEffect } from 'react';
import { ICONS } from '../../../constants';
import Modal from '../../ui/Modal';
import { apiClient } from '../../../services/api/client';

interface User {
    id: string;
    username: string;
    name: string;
    role: string;
}

interface AssignTaskModalProps {
    task: any;
    onClose: () => void;
    onAssign: (data: any) => void;
}

const AssignTaskModal: React.FC<AssignTaskModalProps> = ({ task, onClose, onAssign }) => {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [formData, setFormData] = useState({
        primaryOwner: task ? task.owner_id || '' : '',
        contributors: [] as string[],
        note: ''
    });

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                setLoading(true);
                const data = await apiClient.get<User[]>('/users');
                setUsers(data);
            } catch (error) {
                console.error('Error fetching users:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchUsers();
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onAssign(formData);
        onClose();
    };

    const toggleContributor = (userId: string) => {
        if (formData.contributors.includes(userId)) {
            setFormData({ ...formData, contributors: formData.contributors.filter(c => c !== userId) });
        } else {
            setFormData({ ...formData, contributors: [...formData.contributors, userId] });
        }
    };

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title={`Assign Task: ${task?.title}`}
        >
            <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Primary Owner *</label>
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                            {ICONS.user}
                        </span>
                        <select
                            required
                            disabled={loading}
                            value={formData.primaryOwner}
                            onChange={(e) => setFormData({ ...formData, primaryOwner: e.target.value })}
                            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500 appearance-none bg-white disabled:bg-gray-50"
                        >
                            <option value="">{loading ? 'Loading users...' : 'Select Primary Owner...'}</option>
                            {users.map(user => (
                                <option key={user.id} value={user.id}>
                                    {user.name} ({user.role})
                                </option>
                            ))}
                        </select>
                        <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-500">
                            {ICONS.chevronDown}
                        </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">The person primarily responsible for completing the task.</p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Contributors</label>
                    <div className="border border-gray-300 rounded-lg max-h-40 overflow-y-auto divide-y divide-gray-100">
                        {loading ? (
                            <div className="p-4 text-center text-sm text-gray-500">Loading contributors...</div>
                        ) : users.filter(u => u.id !== formData.primaryOwner).length === 0 ? (
                            <div className="p-4 text-center text-sm text-gray-500">No other users available.</div>
                        ) : (
                            users.filter(u => u.id !== formData.primaryOwner).map(user => (
                                <div
                                    key={user.id}
                                    onClick={() => toggleContributor(user.id)}
                                    className={`flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 transition-colors ${formData.contributors.includes(user.id) ? 'bg-green-50' : ''}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                                            {user.name.charAt(0)}
                                        </div>
                                        <span className="text-sm text-gray-900">{user.name}</span>
                                    </div>
                                    {formData.contributors.includes(user.id) && (
                                        <span className="text-green-600">{ICONS.check}</span>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">People helping with the task but not primarily responsible.</p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Assignment Note (Optional)</label>
                    <textarea
                        rows={3}
                        value={formData.note}
                        onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                        placeholder="Add context or instructions for the assignee..."
                    />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                    <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
                    <button type="submit" disabled={loading} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-sm disabled:opacity-50">Save Assignment</button>
                </div>
            </form>
        </Modal>
    );
};

export default AssignTaskModal;
