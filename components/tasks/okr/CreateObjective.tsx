import React, { useState, useEffect } from 'react';
import { ICONS } from '../../../constants';
import { tasksApi, TaskObjective } from '../../../services/api/repositories/tasksApi';
import { apiClient } from '../../../services/api/client';

interface User {
    id: string;
    name: string;
}

interface CreateObjectiveProps {
    onCancel: () => void;
    onSave: (data: any) => void;
}

const CreateObjective: React.FC<CreateObjectiveProps> = ({ onCancel, onSave }) => {
    const [users, setUsers] = useState<User[]>([]);
    const [objectives, setObjectives] = useState<TaskObjective[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        owner_id: '',
        parent_objective_id: '',
        period: 'Q1 2026',
        type: 'Operational' as 'Strategic' | 'Operational',
        level: 'Team' as 'Company' | 'Department' | 'Team' | 'Individual',
        visibility: 'Public',
        confidence_score: 50
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const [usersData, objectivesData] = await Promise.all([
                    apiClient.get<User[]>('/users'),
                    tasksApi.getObjectives()
                ]);
                setUsers(usersData);
                setObjectives(objectivesData);
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
            const result = await tasksApi.createObjective(formData);
            onSave(result);
        } catch (error) {
            console.error('Failed to create objective:', error);
            alert('Failed to create objective. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 animate-slide-up max-w-3xl mx-auto my-6 overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-gray-200 bg-gray-50">
                <h2 className="text-xl font-bold text-gray-800">Create New Objective</h2>
                <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
                    {ICONS.x}
                </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
                {/* Title Section */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Objective Title *</label>
                    <input
                        type="text"
                        required
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        placeholder="e.g. Increase Market Share by 10%"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                    />
                    <p className="mt-1 text-xs text-gray-500">Make it ambitious yet achievable.</p>
                </div>

                {/* Description */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                        rows={3}
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Add context, details, and why this matters..."
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Owner */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Owner *</label>
                        <select
                            required
                            value={formData.owner_id}
                            onChange={(e) => setFormData({ ...formData, owner_id: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        >
                            <option value="">Select User...</option>
                            {users.map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Level */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
                        <select
                            value={formData.level}
                            onChange={(e) => setFormData({ ...formData, level: e.target.value as any })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        >
                            <option value="Company">Company</option>
                            <option value="Department">Department</option>
                            <option value="Team">Team</option>
                            <option value="Individual">Individual</option>
                        </select>
                    </div>

                    {/* Period */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Time Period</label>
                        <select
                            value={formData.period}
                            onChange={(e) => setFormData({ ...formData, period: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        >
                            <option value="Q1 2026">Q1 2026</option>
                            <option value="Q2 2026">Q2 2026</option>
                            <option value="Q3 2026">Q3 2026</option>
                            <option value="Q4 2026">Q4 2026</option>
                        </select>
                    </div>

                    {/* Alignment */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Align With (Parent Objective)</label>
                        <select
                            value={formData.parent_objective_id}
                            onChange={(e) => setFormData({ ...formData, parent_objective_id: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        >
                            <option value="">No Parent (Top Level)</option>
                            {objectives.map(obj => (
                                <option key={obj.id} value={obj.id}>{obj.title}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Advanced Settings */}
                <div className="pt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Initial Confidence Score: <span className="text-green-600 font-bold">{formData.confidence_score}%</span>
                        </label>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={formData.confidence_score}
                            onChange={(e) => setFormData({ ...formData, confidence_score: parseInt(e.target.value) })}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-600"
                        />
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center gap-4">
                            <label className="text-sm font-medium text-gray-700 w-24">Type:</label>
                            <div className="flex bg-gray-100 p-1 rounded-lg">
                                {['Operational', 'Strategic'].map(type => (
                                    <button
                                        key={type}
                                        type="button"
                                        onClick={() => setFormData({ ...formData, type: type as any })}
                                        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${formData.type === type ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                            }`}
                                    >
                                        {type}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <label className="text-sm font-medium text-gray-700 w-24">Visibility:</label>
                            <select
                                value={formData.visibility}
                                onChange={(e) => setFormData({ ...formData, visibility: e.target.value })}
                                className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:ring-green-500"
                            >
                                <option value="Public">Public (Visible to All)</option>
                                <option value="Restricted">Restricted (Team Only)</option>
                                <option value="Private">Private (Owner Only)</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-6 border-t border-gray-200">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={submitting}
                        className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 shadow-sm transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        {submitting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                        {submitting ? 'Creating...' : 'Create Objective'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default CreateObjective;
