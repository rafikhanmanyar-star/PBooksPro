import React, { useState } from 'react';
import { ICONS } from '../../../constants';
import Modal from '../../ui/Modal';
import { tasksApi, TaskItem } from '../../../services/api/repositories/tasksApi';

interface UpdateProgressModalProps {
    task: TaskItem;
    onClose: () => void;
    onUpdate: () => void;
}

const UpdateProgressModal: React.FC<UpdateProgressModalProps> = ({ task, onClose, onUpdate }) => {
    const [progress, setProgress] = useState(task.progress_percentage || 0);
    const [comment, setComment] = useState('');
    const [status, setStatus] = useState(task.status);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setSubmitting(true);
            await tasksApi.updateTask(task.id, {
                progress_percentage: progress,
                status: status as any,
                // Comment feature not yet in main task item, but could be added later
            });
            onUpdate();
        } catch (error) {
            console.error('Failed to update task:', error);
            alert('Failed to update task.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title={`Update Progress: ${task?.title}`}
        >
            <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <label className="block text-sm font-medium text-gray-700">Progress (%)</label>
                        <span className="text-sm font-bold text-green-600">{progress}%</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={progress}
                        onChange={(e) => setProgress(parseInt(e.target.value))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-600"
                    />
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                        <span>0%</span>
                        <span>50%</span>
                        <span>100%</span>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                            {ICONS.trendingUp}
                        </span>
                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value as any)}
                            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500 appearance-none bg-white"
                        >
                            <option value="Not Started">Not Started</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Completed">Completed</option>
                            <option value="Blocked">Blocked</option>
                            <option value="On Hold">On Hold</option>
                        </select>
                        <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-500">
                            {ICONS.chevronDown}
                        </span>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Update Note / Comment</label>
                    <textarea
                        rows={3}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                        placeholder="Describe what was achieved..."
                    />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                    <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
                    <button
                        type="submit"
                        disabled={submitting}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-sm disabled:opacity-50 flex items-center gap-2"
                    >
                        {submitting && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                        {submitting ? 'Saving...' : 'Save Update'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default UpdateProgressModal;
