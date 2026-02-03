import React, { useState, useEffect } from 'react';
import { ICONS } from '../../../constants';
import { apiClient } from '../../../services/api/client';
import { tasksApi, TaskInitiative } from '../../../services/api/repositories/tasksApi';

interface User {
    id: string;
    username: string;
    name: string;
    role: string;
}

interface CreateTaskProps {
    onCancel: () => void;
    onSave: (data: any) => void;
}

const CreateTask: React.FC<CreateTaskProps> = ({ onCancel, onSave }) => {
    const [users, setUsers] = useState<User[]>([]);
    const [initiatives, setInitiatives] = useState<TaskInitiative[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        initiativeId: '',
        assigneeId: '',
        priority: 'Medium',
        status: 'Not Started',
        startDate: '',
        dueDate: '',
        estimatedEffort: ''
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const [userData, initiativeData] = await Promise.all([
                    apiClient.get<User[]>('/users'),
                    tasksApi.getInitiatives()
                ]);
                setUsers(userData);
                setInitiatives(initiativeData);
            } catch (error) {
                console.error('Error fetching data:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setSubmitting(true);
            const createdTask = await tasksApi.createTask({
                title: formData.title,
                description: formData.description,
                initiative_id: formData.initiativeId || undefined,
                owner_id: formData.assigneeId || undefined,
                priority: formData.priority as any,
                status: formData.status as any,
                start_date: formData.startDate || undefined,
                due_date: formData.dueDate,
                estimated_hours: parseFloat(formData.estimatedEffort) || 0
            });
            onSave(createdTask);
        } catch (error) {
            console.error('Failed to create task:', error);
            alert('Failed to create task. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 animate-slide-up max-w-3xl mx-auto my-6">
            <div className="flex justify-between items-center p-6 border-b border-gray-200 bg-gray-50 rounded-t-lg">
                <h2 className="text-lg font-bold text-gray-800">Create New Task</h2>
                <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
                    {ICONS.x}
                </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Task Title *</label>
                    <input
                        type="text"
                        required
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        placeholder="e.g. Conduct user interviews"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                        rows={3}
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Add details, acceptance criteria, or context..."
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 transition-all"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Linked Initiative</label>
                        <select
                            value={formData.initiativeId}
                            onChange={(e) => setFormData({ ...formData, initiativeId: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        >
                            <option value="">Select Initiative...</option>
                            {initiatives.map(initiative => (
                                <option key={initiative.id} value={initiative.id}>
                                    {initiative.title}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Assignee *</label>
                        <select
                            required
                            disabled={loading}
                            value={formData.assigneeId}
                            onChange={(e) => setFormData({ ...formData, assigneeId: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 disabled:bg-gray-50"
                        >
                            <option value="">{loading ? 'Loading users...' : 'Select User...'}</option>
                            {users.map(user => (
                                <option key={user.id} value={user.id}>
                                    {user.name} ({user.role})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                        <input
                            type="date"
                            value={formData.startDate}
                            onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Due Date *</label>
                        <input
                            type="date"
                            required
                            value={formData.dueDate}
                            onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                        <select
                            value={formData.priority}
                            onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        >
                            <option value="Low">Low</option>
                            <option value="Medium">Medium</option>
                            <option value="High">High</option>
                            <option value="Critical">Critical</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                        <select
                            value={formData.status}
                            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        >
                            <option value="Not Started">Not Started</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Blocked">Blocked</option>
                            <option value="On Hold">On Hold</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Est. Effort (Hrs)</label>
                        <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={formData.estimatedEffort}
                            onChange={(e) => setFormData({ ...formData, estimatedEffort: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                            placeholder="e.g. 4.5"
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-6 border-t border-gray-200">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={loading || submitting}
                        className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 shadow-sm disabled:opacity-50 flex items-center gap-2"
                    >
                        {submitting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                        {submitting ? 'Creating...' : 'Create Task'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default CreateTask;
