import React, { useState, useEffect } from 'react';
import { ICONS } from '../../../constants';
import Modal from '../../ui/Modal';
import { tasksApi } from '../../../services/api/repositories/tasksApi';
import { apiClient } from '../../../services/api/client';

interface User {
    id: string;
    name: string;
}

interface CreateKeyResultProps {
    objectiveId: string;
    onClose: () => void;
    onSave: (data: any) => void;
}

const CreateKeyResult: React.FC<CreateKeyResultProps> = ({ objectiveId, onClose, onSave }) => {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        objective_id: objectiveId,
        title: '',
        owner_id: '',
        target_value: 0,
        current_value: 0,
        metric_type: 'Number' as 'Number' | 'Percentage' | 'Currency' | 'Boolean',
        status: 'Not Started',
        weight: 1,
        due_date: ''
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

    const calculateProgress = () => {
        if (formData.target_value === 0) return 0;
        return Math.min(100, Math.round((formData.current_value / formData.target_value) * 100));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setSubmitting(true);
            const result = await tasksApi.createKeyResult(formData);
            onSave(result);
            onClose();
        } catch (error) {
            console.error('Failed to create key result:', error);
            alert('Failed to create key result.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title="Add Key Result"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Key Result Title *</label>
                    <input
                        type="text"
                        required
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        placeholder="e.g. Close 5 Enterprise Deals"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Owner *</label>
                        <select
                            required
                            value={formData.owner_id}
                            onChange={(e) => setFormData({ ...formData, owner_id: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                        >
                            <option value="">Select User...</option>
                            {users.map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                        <select
                            value={formData.status}
                            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                        >
                            <option value="Not Started">Not Started</option>
                            <option value="In Progress">In Progress</option>
                            <option value="On Track">On Track</option>
                            <option value="At Risk">At Risk</option>
                            <option value="Completed">Completed</option>
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Target Value *</label>
                        <input
                            type="number"
                            required
                            value={formData.target_value}
                            onChange={(e) => setFormData({ ...formData, target_value: parseFloat(e.target.value) })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Current Value</label>
                        <input
                            type="number"
                            value={formData.current_value}
                            onChange={(e) => setFormData({ ...formData, current_value: parseFloat(e.target.value) })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Progress %</label>
                        <div className="px-3 py-2 bg-gray-100 border border-gray-200 rounded-md text-gray-700 font-medium">
                            {calculateProgress()}%
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Metric Type</label>
                        <select
                            value={formData.metric_type}
                            onChange={(e) => setFormData({ ...formData, metric_type: e.target.value as any })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                        >
                            <option value="Number">Number</option>
                            <option value="Percentage">Percentage (%)</option>
                            <option value="Currency">Currency</option>
                            <option value="Boolean">Boolean (0/1)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Weight</label>
                        <input
                            type="number"
                            value={formData.weight}
                            onChange={(e) => setFormData({ ...formData, weight: parseFloat(e.target.value) })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                    <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">Cancel</button>
                    <button
                        type="submit"
                        disabled={submitting}
                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                    >
                        {submitting ? 'Saving...' : 'Save Key Result'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default CreateKeyResult;
