import React, { useState, useEffect } from 'react';
import { ICONS } from '../../../constants';
import UpdateProgressModal from './UpdateProgressModal';
import { tasksApi, TaskItem } from '../../../services/api/repositories/tasksApi';
import Loading from '../../ui/Loading';

interface TaskExecutionDashboardProps {
    onNavigate: (view: string, id?: string) => void;
}

const TaskExecutionDashboard: React.FC<TaskExecutionDashboardProps> = ({ onNavigate }) => {
    const [tasks, setTasks] = useState<TaskItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);

    useEffect(() => {
        loadTasks();
    }, []);

    const loadTasks = async () => {
        try {
            setLoading(true);
            const data = await tasksApi.getTasks();
            setTasks(data);
        } catch (error) {
            console.error('Error fetching tasks:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateClick = (task: TaskItem) => {
        setSelectedTask(task);
        setIsProgressModalOpen(true);
    };

    const getStatusBadge = (s: string) => {
        switch (s) {
            case 'Completed': return 'bg-green-100 text-green-800';
            case 'Blocked': return 'bg-red-100 text-red-800';
            case 'In Progress': return 'bg-blue-100 text-blue-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    if (loading) return <Loading message="Loading Execution Dashboard..." />;

    return (
        <div className="space-y-6 animate-fade-in p-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Task Execution & Collaboration</h1>
                    <p className="text-gray-500">Update progress, share files, and collaborate with your team.</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={loadTasks} title="Refresh" className="p-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                        {ICONS.rotateCw}
                    </button>
                    <button className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                        {ICONS.filter} Filter
                    </button>
                </div>
            </div>

            {/* Task Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {tasks.map((task) => (
                    <div key={task.id} className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getStatusBadge(task.status)}`}>
                                {task.status}
                            </span>
                            <button className="text-gray-400 hover:text-gray-600">
                                {ICONS.moreVertical}
                            </button>
                        </div>

                        <h3 className="text-lg font-semibold text-gray-900 mb-1 leading-tight">{task.title}</h3>
                        <div className="text-sm text-gray-500 mb-4 flex items-center gap-1">
                            {ICONS.user} {task.owner_name || 'Unassigned'}
                        </div>

                        <div className="mb-4">
                            <div className="flex justify-between text-xs text-gray-500 mb-1">
                                <span>Progress</span>
                                <span className="font-medium text-gray-900">{Math.round(task.progress_percentage)}%</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2">
                                <div
                                    className={`h-2 rounded-full transition-all duration-500 ${task.status === 'Blocked' ? 'bg-red-500' : 'bg-green-500'}`}
                                    style={{ width: `${task.progress_percentage}%` }}
                                ></div>
                            </div>
                        </div>

                        <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                            <div className="text-xs text-gray-400">
                                Due {new Date(task.due_date).toLocaleDateString()}
                            </div>
                            <div className="flex gap-2">
                                <button title="Attachments" className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-md">
                                    {ICONS.paperclip}
                                </button>
                                <button title="Comments" className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-md">
                                    {ICONS.messageSquare}
                                </button>
                                <button
                                    onClick={() => handleUpdateClick(task)}
                                    className="px-3 py-1.5 bg-blue-50 text-blue-600 text-xs font-medium rounded-md hover:bg-blue-100"
                                >
                                    Log Update
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {tasks.length === 0 && (
                <div className="text-center py-20 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                    <div className="text-gray-400 mb-2">{ICONS.checkSquare}</div>
                    <p className="text-gray-500">No tasks currently assigned for execution.</p>
                </div>
            )}

            {isProgressModalOpen && selectedTask && (
                <UpdateProgressModal
                    task={selectedTask}
                    onClose={() => setIsProgressModalOpen(false)}
                    onUpdate={() => {
                        loadTasks();
                        setIsProgressModalOpen(false);
                    }}
                />
            )}
        </div>
    );
};

export default TaskExecutionDashboard;
