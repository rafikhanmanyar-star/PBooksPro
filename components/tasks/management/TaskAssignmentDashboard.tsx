import React, { useState, useEffect } from 'react';
import { ICONS } from '../../../constants';
import AssignTaskModal from './AssignTaskModal';
import { apiClient } from '../../../services/api/client';

interface User {
    id: string;
    username: string;
    name: string;
    role: string;
}

interface TaskAssignmentDashboardProps {
    onNavigate: (view: string, id?: string) => void;
}

const TaskAssignmentDashboard: React.FC<TaskAssignmentDashboardProps> = ({ onNavigate }) => {
    const [users, setUsers] = useState<User[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(true);

    // Mock Data - In a real scenario, this would also be fetched from the API
    const [tasks, setTasks] = useState([
        { id: '1', title: 'Prepare Q1 Budget Draft', owner_id: '', contributors_ids: [], status: 'Not Started', priority: 'High', dueDate: '2026-02-15' },
        { id: '2', title: 'Review Vendor Contracts', owner_id: '1', contributors_ids: ['2'], status: 'In Progress', priority: 'Medium', dueDate: '2026-02-20' },
        { id: '3', title: 'Update Website Content', owner_id: '3', contributors_ids: [], status: 'Blocked', priority: 'Low', dueDate: '2026-03-01' },
    ]);

    const [filterOwner, setFilterOwner] = useState('All');
    const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [taskToAssign, setTaskToAssign] = useState<any>(null);

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
        return user ? user.name : 'Unassigned';
    };

    const handleAssignClick = (task: any) => {
        setTaskToAssign(task);
        setIsAssignModalOpen(true);
    };

    const handleBulkAssign = () => {
        console.log('Bulk assigning:', selectedTasks);
    };

    const toggleSelectTask = (id: string) => {
        if (selectedTasks.includes(id)) {
            setSelectedTasks(selectedTasks.filter(t => t !== id));
        } else {
            setSelectedTasks([...selectedTasks, id]);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="relative w-full md:w-96">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        {ICONS.search}
                    </span>
                    <input
                        type="text"
                        placeholder="Search tasks..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                    />
                </div>
                <div className="flex gap-3 w-full md:w-auto">
                    <select
                        className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-green-500"
                        value={filterOwner}
                        onChange={(e) => setFilterOwner(e.target.value)}
                    >
                        <option value="All">All Owners</option>
                        <option value="Unassigned">Unassigned</option>
                        <option value="Assigned">Assigned</option>
                    </select>
                </div>
            </div>

            {selectedTasks.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex justify-between items-center animate-slide-up">
                    <span className="text-sm text-blue-800 font-medium">{selectedTasks.length} tasks selected</span>
                    <button
                        onClick={handleBulkAssign}
                        className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 shadow-sm"
                    >
                        Assign Selected
                    </button>
                </div>
            )}

            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left">
                                <input type="checkbox" className="rounded border-gray-300 text-green-600 focus:ring-green-500" />
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Task</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Owner</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contributors</th>
                            <th className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {tasks.map((task) => (
                            <tr key={task.id} className="hover:bg-gray-50 group">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <input
                                        type="checkbox"
                                        checked={selectedTasks.includes(task.id)}
                                        onChange={() => toggleSelectTask(task.id)}
                                        className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                                    />
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm font-medium text-gray-900">{task.title}</div>
                                    <div className="text-xs text-gray-500 flex items-center gap-1">
                                        <span className={`w-2 h-2 rounded-full ${task.priority === 'High' ? 'bg-red-500' : task.priority === 'Medium' ? 'bg-amber-500' : 'bg-blue-500'}`}></span>
                                        {task.priority} Priority
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    {!task.owner_id ? (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                            Unassigned
                                        </span>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">
                                                {getUserName(task.owner_id).charAt(0)}
                                            </div>
                                            <span className="text-sm text-gray-900">{getUserName(task.owner_id)}</span>
                                        </div>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                                        ${task.status === 'Not Started' ? 'bg-gray-100 text-gray-800' : 'bg-blue-100 text-blue-800'}`}>
                                        {task.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex -space-x-1 overflow-hidden">
                                        {task.contributors_ids.length > 0 ? task.contributors_ids.map((cid, i) => (
                                            <div key={i} className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600" title={getUserName(cid)}>
                                                {getUserName(cid).charAt(0)}
                                            </div>
                                        )) : <span className="text-xs text-gray-400 italic">None</span>}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button
                                        onClick={() => handleAssignClick(task)}
                                        className="text-blue-600 hover:text-blue-900 font-medium"
                                    >
                                        {!task.owner_id ? 'Assign' : 'Reassign'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {isAssignModalOpen && (
                <AssignTaskModal
                    task={taskToAssign}
                    onClose={() => setIsAssignModalOpen(false)}
                    onAssign={(data) => {
                        console.log('Assigned:', data);
                        // In a real app, you'd send this to the API. 
                        // Mock update:
                        setTasks(prev => prev.map(t => t.id === taskToAssign.id ? { ...t, owner_id: data.primaryOwner, contributors_ids: data.contributors } : t));
                        setIsAssignModalOpen(false);
                    }}
                />
            )}
        </div>
    );
};

export default TaskAssignmentDashboard;
