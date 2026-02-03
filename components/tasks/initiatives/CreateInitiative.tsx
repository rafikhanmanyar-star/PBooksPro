import React, { useState } from 'react';
import { ICONS } from '../../../constants';

interface CreateInitiativeProps {
    onCancel: () => void;
    onSave: (data: any) => void;
}

const CreateInitiative: React.FC<CreateInitiativeProps> = ({ onCancel, onSave }) => {
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        linkedOKR: '',
        owner: '',
        department: '',
        startDate: '',
        endDate: '',
        priority: 'Medium',
        status: 'Not Started'
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 animate-slide-up max-w-4xl mx-auto my-6">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-800">Create New Initiative</h2>
                <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
                    {ICONS.x}
                </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Initiative Title *</label>
                    <input
                        type="text"
                        required
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        placeholder="e.g. Q3 Marketing Blitz"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                        rows={4}
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Detailed project description..."
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Linked OKR</label>
                        <select
                            value={formData.linkedOKR}
                            onChange={(e) => setFormData({ ...formData, linkedOKR: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        >
                            <option value="">Select Objective...</option>
                            <option value="1">Achieve $10M ARR</option>
                            <option value="2">Improve Customer CSAT</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Owner *</label>
                        <select
                            required
                            value={formData.owner}
                            onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        >
                            <option value="">Select User...</option>
                            <option value="sarah">Sarah Connor</option>
                            <option value="mike">Mike Ross</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                        <input
                            type="date"
                            required
                            value={formData.startDate}
                            onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">End Date *</label>
                        <input
                            type="date"
                            required
                            value={formData.endDate}
                            onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        />
                    </div>

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
                            <option value="On Hold">On Hold</option>
                        </select>
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
                        className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 shadow-sm"
                    >
                        Create Initiative
                    </button>
                </div>
            </form>
        </div>
    );
};

export default CreateInitiative;
