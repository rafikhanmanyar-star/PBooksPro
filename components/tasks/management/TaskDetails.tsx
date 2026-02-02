import React, { useState, useEffect } from 'react';
import { ICONS } from '../../../constants';
import { tasksApi, TaskItem } from '../../../services/api/repositories/tasksApi';
import Loading from '../../ui/Loading';

interface TaskDetailsProps {
    taskId: string;
    onBack: () => void;
}

const TaskDetails: React.FC<TaskDetailsProps> = ({ taskId, onBack }) => {
    const [task, setTask] = useState<TaskItem | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'subtasks' | 'comments'>('overview');

    useEffect(() => {
        const fetchTask = async () => {
            try {
                setLoading(true);
                const data = await tasksApi.getTask(taskId);
                setTask(data);
            } catch (error) {
                console.error('Error fetching task details:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchTask();
    }, [taskId]);

    const getStatusBadge = (status: string) => {
        const colors = {
            'Completed': 'bg-green-100 text-green-700',
            'In Progress': 'bg-blue-100 text-blue-700',
            'Blocked': 'bg-red-100 text-red-700',
            'Not Started': 'bg-gray-100 text-gray-700',
            'On Hold': 'bg-amber-100 text-amber-700',
        };
        return <span className={`px-2 py-1 rounded-md text-sm font-medium ${colors[status as keyof typeof colors] || colors['Not Started']}`}>{status}</span>;
    };

    const getPriorityBadge = (priority: string) => {
        const colors = {
            'Critical': 'bg-red-100 text-red-700 border-red-200',
            'High': 'bg-orange-100 text-orange-700 border-orange-200',
            'Medium': 'bg-amber-100 text-amber-700 border-amber-200',
            'Low': 'bg-blue-100 text-blue-700 border-blue-200',
        };
        return <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${colors[priority as keyof typeof colors] || 'bg-gray-50 text-gray-700 border-gray-200'}`}>
            {priority} Priority
        </span>;
    };

    if (loading) return <Loading message="Loading Task Details..." />;
    if (!task) return (
        <div className="text-center py-10">
            <p className="text-gray-500 mb-4">Task not found or failed to load.</p>
            <button onClick={onBack} className="text-green-600 font-medium">Back to Tasks</button>
        </div>
    );

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div>
                <button
                    onClick={onBack}
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4"
                >
                    {ICONS.chevronLeft} Back to Tasks
                </button>

                <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                    <div className="flex flex-col md:flex-row justify-between gap-6 mb-6">
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                                {getPriorityBadge(task.priority)}
                                <div className="flex items-center gap-1 text-xs text-gray-400">
                                    {ICONS.folder} {task.initiative_name || 'No Initiative'}
                                </div>
                            </div>
                            <h1 className="text-2xl font-bold text-gray-900 mb-3">{task.title}</h1>
                            <div className="flex items-center gap-4 text-sm text-gray-600">
                                <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold uppercase">
                                        {task.owner_name ? task.owner_name.charAt(0) : '?'}
                                    </div>
                                    <span>{task.owner_name || 'Unassigned'}</span>
                                </div>
                                <div className="flex items-center gap-1 text-gray-500">
                                    {ICONS.calendar} Due: {new Date(task.due_date).toLocaleDateString()}
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col items-end gap-4 min-w-[200px]">
                            <div className="flex items-center gap-2">
                                {getStatusBadge(task.status)}
                                <button className="text-gray-400 hover:text-gray-600 border p-1 rounded-md">{ICONS.moreVertical}</button>
                            </div>
                            <div className="w-full text-right">
                                <div className="flex justify-between text-xs text-gray-500 mb-1">
                                    <span>Progress</span>
                                    <span>{task.progress_percentage}%</span>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-2">
                                    <div className="bg-green-600 h-2 rounded-full transition-all duration-500" style={{ width: `${task.progress_percentage}%` }}></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex border-b border-gray-200">
                        {['overview', 'subtasks', 'comments'].map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab as any)}
                                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${activeTab === tab ? 'border-green-600 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Content Content */}
            {activeTab === 'overview' && (
                <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm space-y-6">
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-2">Description</h3>
                        <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{task.description || 'No description provided.'}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-gray-100">
                        <div>
                            <span className="text-xs text-gray-500 block mb-1">Estimated Effort</span>
                            <span className="text-sm font-medium text-gray-900">{task.estimated_hours || 0} hrs</span>
                        </div>
                        <div>
                            <span className="text-xs text-gray-500 block mb-1">Actual Time</span>
                            <span className="text-sm font-medium text-gray-900">{task.actual_hours || 0} hrs</span>
                        </div>
                        <div>
                            <span className="text-xs text-gray-500 block mb-1">Start Date</span>
                            <span className="text-sm font-medium text-gray-900">{task.start_date ? new Date(task.start_date).toLocaleDateString() : 'N/A'}</span>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'subtasks' && (
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden p-10 text-center">
                    <p className="text-gray-500">Subtasks feature coming soon.</p>
                </div>
            )}

            {activeTab === 'comments' && (
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden p-10 text-center">
                    <p className="text-gray-500">Comments feature coming soon.</p>
                </div>
            )}
        </div>
    );
};

export default TaskDetails;
