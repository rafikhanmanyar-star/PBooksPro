import React, { useState } from 'react';
import { ICONS } from '../../../constants';
import Modal from '../../ui/Modal';

interface UpdateStatusModalProps {
    task: any;
    onClose: () => void;
    onUpdate: (data: any) => void;
}

const UpdateStatusModal: React.FC<UpdateStatusModalProps> = ({ task, onClose, onUpdate }) => {
    const [status, setStatus] = useState(task.status);
    const [comment, setComment] = useState('');
    const [isRequestingApproval, setIsRequestingApproval] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onUpdate({
            newStatus: status,
            comment,
            isRequestingApproval
        });
        onClose();
    };

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title={`Update Status: ${task?.title}`}
        >
            <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">New Status *</label>
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                            {ICONS.trendingUp}
                        </span>
                        <select
                            required
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500 appearance-none bg-white"
                        >
                            <option value="Not Started">Not Started</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Completed">Completed</option>
                            <option value="Blocked">Blocked</option>
                            <option value="On Hold">On Hold</option>
                            <option value="Pending Approval">Pending Approval</option>
                        </select>
                        <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-500">
                            {ICONS.chevronDown}
                        </span>
                    </div>
                </div>

                {status === 'Pending Approval' && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                            <span className="text-yellow-600 mt-0.5">{ICONS.alertTriangle}</span>
                            <div>
                                <p className="text-sm font-medium text-yellow-800">Approval Required</p>
                                <p className="text-xs text-yellow-700 mt-1">Updates to "Pending Approval" will notify the project manager.</p>
                            </div>
                        </div>
                    </div>
                )}

                {status === 'Blocked' && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Reason for Block *</label>
                        <textarea
                            required
                            rows={2}
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            className="w-full px-3 py-2 border border-red-300 rounded-lg focus:ring-red-500 focus:border-red-500"
                            placeholder="Explain why this task is blocked..."
                        />
                    </div>
                )}

                {(status !== 'Blocked') && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Comment (Optional)</label>
                        <textarea
                            rows={3}
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                            placeholder="Add a note about this status change..."
                        />
                    </div>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                    <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
                    <button
                        type="submit"
                        className={`px-4 py-2 text-white rounded-lg shadow-sm ${status === 'Blocked' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
                    >
                        Update Status
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default UpdateStatusModal;
