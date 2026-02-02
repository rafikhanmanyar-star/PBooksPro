import React, { useState, useEffect } from 'react';
import { ICONS } from '../../../constants';
import UpdateStatusModal from './UpdateStatusModal';
import { apiClient } from '../../../services/api/client';

interface User {
    id: string;
    username: string;
    name: string;
    role: string;
}

interface WorkflowDashboardProps {
    onNavigate: (view: string, id?: string) => void;
}

const WorkflowDashboard: React.FC<WorkflowDashboardProps> = ({ onNavigate }) => {
    const [users, setUsers] = useState<User[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(true);

    // Mock Tasks for Workflow
    const [tasks, setTasks] = useState([
        { id: '1', title: 'Q1 Budget Approval', owner_id: '', status: 'Pending Approval', priority: 'High', due: '2026-02-15', sla: 'On Time' },
        { id: '2', title: 'Marketing Copy Review', owner_id: '', status: 'In Progress', priority: 'Medium', due: '2026-02-20', sla: 'At Risk' },
        { id: '3', title: 'Legacy Data Migration', owner_id: '', status: 'Blocked', priority: 'Critical', due: '2026-02-10', sla: 'Breached' },
        { id: '4', title: 'User Interviews', owner_id: '', status: 'Completed', priority: 'Low', due: '2026-01-30', sla: 'On Time' },
    ]);

    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState<any>(null);

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                setLoadingUsers(true);
                const data = await apiClient.get<User[]>('/users');
                setUsers(data);

                // Update mock data owner_ids to match some real IDs if available
                if (data.length > 0) {
                    setTasks(prevTasks => prevTasks.map((t, i) => ({
                        ...t,
                        owner_id: data[i % data.length]?.id || ''
                    })));
                }
            } catch (error) {
                console.error('Error fetching users:', error);
            } finally {
                setLoadingUsers(false);
            }
        };
        fetchUsers();
    }, []);

    const getUserName = (userId: string) => {
        const user = users.find(u => u.id === userId);
        return user ? user.name : 'Unknown User';
    };

    const handleUpdateClick = (task: any) => {
        setSelectedTask(task);
        setIsStatusModalOpen(true);
    };

    const getStatusColor = (s: string) => {
        switch (s) {
            case 'Completed': return 'bg-green-100 text-green-800';
            case 'Blocked': return 'bg-red-100 text-red-800';
            case 'In Progress': return 'bg-blue-100 text-blue-800';
            case 'Pending Approval': return 'bg-yellow-100 text-yellow-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const getSlaColor = (s: string) => {
        switch (s) {
            case 'Breached': return 'text-red-600 font-bold';
            case 'At Risk': return 'text-amber-600 font-medium';
            default: return 'text-green-600';
        }
    };

    return (
        <div className="space-y-6 animate-fade-in p-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Workflow & Lifecycle</h1>
                    <p className="text-gray-500">Track task progress, approvals, and SLA compliance.</p>
                </div>
                <div className="flex gap-2">
                    <button className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                        {ICONS.filter} Filter
                    </button>
                    <button className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 shadow-sm flex items-center gap-2">
                        {ICONS.plus} Create Task
                    </button>
                </div>
            </div>

            {/* SLA Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-1">Pending Approval</p>
                    <p className="text-2xl font-bold text-yellow-600">3</p>
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-1">Blocked Tasks</p>
                    <p className="text-2xl font-bold text-red-600">5</p>
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-1">SLA At Risk</p>
                    <p className="text-2xl font-bold text-amber-600">2</p>
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-1">SLA Breached</p>
                    <p className="text-2xl font-bold text-red-800">1</p>
                </div>
            </div>

            {/* Task Kanban/List Hybrid */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Task</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Owner</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SLA</th>
                            <th className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {tasks.map((task) => (
                            <tr key={task.id} className="hover:bg-gray-50 group transition-colors">
                                <td className="px-6 py-4">
                                    <div className="text-sm font-medium text-gray-900">{task.title}</div>
                                    <div className="text-xs text-gray-500 mt-0.5">{task.priority} Priority</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                                            {getUserName(task.owner_id).charAt(0)}
                                        </div>
                                        {getUserName(task.owner_id)}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(task.status)}`}>
                                        {task.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {task.due}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span className={`flex items-center gap-1 ${getSlaColor(task.sla)}`}>
                                        {task.sla === 'Breached' && ICONS.alertTriangle}
                                        {task.sla}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button
                                        onClick={() => handleUpdateClick(task)}
                                        className="text-blue-600 hover:text-blue-900 font-medium"
                                    >
                                        Update
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {isStatusModalOpen && (
                <UpdateStatusModal
                    task={selectedTask}
                    onClose={() => setIsStatusModalOpen(false)}
                    onUpdate={(data) => {
                        console.log('Update Status:', data);
                        // Mock update logic
                        const updatedTasks = tasks.map(t => t.id === selectedTask.id ? { ...t, status: data.newStatus } : t);
                        setTasks(updatedTasks);
                        setIsStatusModalOpen(false);
                    }}
                />
            )}
        </div>
    );
};

export default WorkflowDashboard;
