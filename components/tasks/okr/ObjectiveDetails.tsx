import React, { useState, useEffect } from 'react';
import { ICONS } from '../../../constants';
import Modal from '../../ui/Modal';
import CreateKeyResult from './CreateKeyResult';
import { tasksApi, TaskObjective, TaskKeyResult } from '../../../services/api/repositories/tasksApi';
import Loading from '../../ui/Loading';

interface ObjectiveDetailsProps {
    objectiveId: string;
    onBack: () => void;
}

const ObjectiveDetails: React.FC<ObjectiveDetailsProps> = ({ objectiveId, onBack }) => {
    const [objective, setObjective] = useState<TaskObjective | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'activity'>('overview');
    const [isKRModalOpen, setIsKRModalOpen] = useState(false);
    const [selectedKR, setSelectedKR] = useState<TaskKeyResult | null>(null);

    useEffect(() => {
        loadObjective();
    }, [objectiveId]);

    const loadObjective = async () => {
        try {
            setLoading(true);
            const data = await tasksApi.getObjective(objectiveId);
            setObjective(data);
        } catch (error) {
            console.error('Error fetching objective:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <Loading message="Loading Objective Details..." />;
    if (!objective) return <div className="p-6 text-center text-gray-500">Objective not found.</div>;

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Navigation & Header */}
            <div>
                <button
                    onClick={onBack}
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"
                >
                    {ICONS.chevronLeft} Back to Dashboard
                </button>

                <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                    <div className="flex flex-col md:flex-row justify-between gap-4 mb-6">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full font-medium">{objective.level}</span>
                                <span className="text-gray-400 text-xs flex items-center gap-1">{ICONS.clock} Updated {new Date(objective.created_at).toLocaleDateString()}</span>
                            </div>
                            <h1 className="text-2xl font-bold text-gray-900 mb-2">{objective.title}</h1>
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
                                    {objective.owner_name?.charAt(0) || 'U'}
                                </div>
                                <span className="text-sm text-gray-600">Owned by <span className="font-medium text-gray-900">{objective.owner_name || 'Unassigned'}</span></span>
                            </div>
                        </div>

                        <div className="flex flex-col items-end gap-3 min-w-[200px]">
                            <div className="w-full">
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="font-medium text-gray-700">Progress</span>
                                    <span className="font-bold text-gray-900">{Math.round(objective.progress_percentage)}%</span>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-2.5">
                                    <div className="bg-green-600 h-2.5 rounded-full transition-all duration-500" style={{ width: `${objective.progress_percentage}%` }}></div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 bg-green-50 text-green-700 px-3 py-1 rounded-full text-sm font-medium">
                                <span className="w-2 h-2 rounded-full bg-green-600"></span>
                                {objective.confidence_score}% Confidence
                            </div>
                        </div>
                    </div>

                    <div className="flex border-b border-gray-200">
                        <button
                            onClick={() => setActiveTab('overview')}
                            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'overview' ? 'border-green-600 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                        >
                            Overview & Key Results
                        </button>
                        <button
                            onClick={() => setActiveTab('activity')}
                            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'activity' ? 'border-green-600 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                        >
                            Activity
                        </button>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    {/* Description Card */}
                    <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Description</h3>
                        <p className="text-gray-700 leading-relaxed">{objective.description || 'No description provided.'}</p>
                    </div>

                    {/* Key Results Section */}
                    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                        <div className="flex justify-between items-center p-6 border-b border-gray-200 bg-gray-50">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                {ICONS.target} Key Results
                                <span className="bg-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded-full">{objective.key_results?.length || 0}</span>
                            </h3>
                            <button
                                onClick={() => setIsKRModalOpen(true)}
                                className="text-sm font-medium text-green-600 hover:text-green-700 flex items-center gap-1"
                            >
                                {ICONS.plus} Add Key Result
                            </button>
                        </div>

                        <div className="divide-y divide-gray-100">
                            {objective.key_results?.map(kr => (
                                <div key={kr.id} className="p-4 hover:bg-gray-50 transition-colors group">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-2 h-2 rounded-full ${kr.progress_percentage >= 70 ? 'bg-green-500' : kr.progress_percentage >= 30 ? 'bg-amber-500' : 'bg-red-500'}`}></div>
                                            <h4 className="font-medium text-gray-900">{kr.title}</h4>
                                        </div>
                                        <div className="flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => setSelectedKR(kr)}
                                                className="text-gray-400 hover:text-blue-600 flex items-center gap-1 text-xs"
                                            >
                                                {ICONS.edit} Update Progress
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-12 gap-4 items-center pl-5">
                                        <div className="col-span-4 md:col-span-6">
                                            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                                                <div
                                                    className={`h-1.5 rounded-full transition-all duration-500 ${kr.progress_percentage >= 70 ? 'bg-green-500' : kr.progress_percentage >= 30 ? 'bg-amber-500' : 'bg-red-500'}`}
                                                    style={{ width: `${kr.progress_percentage}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                        <div className="col-span-3 text-xs text-gray-500">
                                            {kr.current_value} / {kr.target_value} {kr.metric_type === 'Percentage' ? '%' : ''}
                                        </div>
                                        <div className="col-span-2 text-right">
                                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${kr.progress_percentage >= 70 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {kr.status}
                                            </span>
                                        </div>
                                        <div className="col-span-1 md:col-span-1 flex justify-end">
                                            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-medium" title={`Owner: ${kr.owner_name}`}>
                                                {kr.owner_name?.charAt(0) || 'U'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {(!objective.key_results || objective.key_results.length === 0) && (
                                <div className="p-12 text-center text-gray-500">
                                    No key results defined yet.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Add Key Result Modal */}
            {isKRModalOpen && (
                <CreateKeyResult
                    objectiveId={objective.id}
                    onClose={() => setIsKRModalOpen(false)}
                    onSave={loadObjective}
                />
            )}

            {/* Update KR Progress Modal */}
            {selectedKR && (
                <UpdateKRModal
                    kr={selectedKR}
                    onClose={() => setSelectedKR(null)}
                    onSave={loadObjective}
                />
            )}
        </div>
    );
};

// Internal Modal for KR Progress Update
const UpdateKRModal: React.FC<{ kr: TaskKeyResult, onClose: () => void, onSave: () => void }> = ({ kr, onClose, onSave }) => {
    const [currentValue, setCurrentValue] = useState(kr.current_value);
    const [status, setStatus] = useState(kr.status);
    const [comment, setComment] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setSubmitting(true);
            await tasksApi.updateKeyResult(kr.id, {
                current_value: currentValue,
                status,
                comment
            });
            onSave();
            onClose();
        } catch (error) {
            console.error('Error updating KR:', error);
            alert('Failed to update progress.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal isOpen={true} onClose={onClose} title={`Update Progress: ${kr.title}`}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Current Value ({kr.metric_type})</label>
                    <input
                        type="number"
                        value={currentValue}
                        onChange={(e) => setCurrentValue(parseFloat(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Target: {kr.target_value}</p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500"
                    >
                        <option value="Not Started">Not Started</option>
                        <option value="On Track">On Track</option>
                        <option value="At Risk">At Risk</option>
                        <option value="Completed">Completed</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Comment</label>
                    <textarea
                        rows={3}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500"
                        placeholder="Describe the progress..."
                    />
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600">Cancel</button>
                    <button
                        type="submit"
                        disabled={submitting}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                        {submitting ? 'Saving...' : 'Save Update'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default ObjectiveDetails;
