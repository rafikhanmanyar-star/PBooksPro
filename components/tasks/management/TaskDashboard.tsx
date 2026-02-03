import React, { useState, useEffect } from 'react';
import { ICONS } from '../../../constants';
import { tasksApi, TaskItem } from '../../../services/api/repositories/tasksApi';
import Loading from '../../ui/Loading';

interface TaskCardProps {
    title: string;
    initiative: string;
    owner: string;
    status: string;
    priority: string;
    dueDate: string;
    progress: number;
    onClick: () => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ title, initiative, owner, status, priority, dueDate, progress, onClick }) => {
    const getPriorityColor = (p: string) => {
        switch (p) {
            case 'High': return 'text-red-600 bg-red-50';
            case 'Medium': return 'text-amber-600 bg-amber-50';
            case 'Low': return 'text-blue-600 bg-blue-50';
            default: return 'text-gray-600 bg-gray-50';
        }
    };

    const getStatusColor = (s: string) => {
        switch (s) {
            case 'Completed': return 'text-green-600 bg-green-50 border-green-200';
            case 'Blocked': return 'text-red-600 bg-red-50 border-red-200';
            case 'In Progress': return 'text-blue-600 bg-blue-50 border-blue-200';
            default: return 'text-gray-600 bg-gray-50 border-gray-200';
        }
    };

    return (
        <div
            onClick={onClick}
            className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm hover:shadow-md transition-all cursor-pointer group"
        >
            <div className="flex justify-between items-start mb-2">
                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${getPriorityColor(priority)}`}>
                    {priority}
                </span>
                <div className="flex items-center gap-2">
                    {status === 'Blocked' && (
                        <span className="text-red-500" title="This task is blocked">{ICONS.alertCircle}</span>
                    )}
                    <button className="text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
                        {ICONS.moreVertical}
                    </button>
                </div>
            </div>

            <h3 className="font-semibold text-gray-900 mb-1 leading-tight">{title}</h3>
            <p className="text-xs text-gray-500 mb-3 flex items-center gap-1">
                {ICONS.folder} {initiative || 'No Initiative'}
            </p>

            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                    <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-600 font-bold uppercase">
                        {owner ? owner.charAt(0) : '?'}
                    </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded border ${getStatusColor(status)}`}>
                    {status}
                </span>
            </div>

            <div>
                <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                    <span className="flex items-center gap-1">
                        {ICONS.calendar} {dueDate}
                    </span>
                    <span>{Math.round(progress)}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1">
                    <div className="bg-green-500 h-1 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                </div>
            </div>
        </div>
    );
};

interface TaskDashboardProps {
    onNavigate: (view: string, id?: string) => void;
}

const TaskDashboard: React.FC<TaskDashboardProps> = ({ onNavigate }) => {
    const [tasks, setTasks] = useState<TaskItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        loadTasks();
    }, []);

    const loadTasks = async () => {
        try {
            setLoading(true);
            const data = await tasksApi.getTasks();
            setTasks(data);
        } catch (error) {
            console.error('Failed to load tasks:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredTasks = tasks.filter(task => {
        const matchesStatus = filterStatus === 'All' || task.status === filterStatus;
        const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (task.initiative_name?.toLowerCase() || '').includes(searchQuery.toLowerCase());
        return matchesStatus && matchesSearch;
    });

    // Stats calculations
    const stats = {
        pending: tasks.filter(t => t.status !== 'Completed').length,
        overdue: tasks.filter(t => t.status !== 'Completed' && new Date(t.due_date) < new Date()).length,
        dueSoon: tasks.filter(t => {
            const dueDate = new Date(t.due_date);
            const now = new Date();
            const nextWeek = new Date();
            nextWeek.setDate(now.getDate() + 7);
            return t.status !== 'Completed' && dueDate >= now && dueDate <= nextWeek;
        }).length,
        completed: tasks.filter(t => t.status === 'Completed').length
    };

    if (loading) return <Loading message="Loading Tasks..." />;

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header Controls */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="relative w-full md:w-96">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        {ICONS.search}
                    </span>
                    <input
                        type="text"
                        placeholder="Search tasks..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                </div>
                <div className="flex gap-3 w-full md:w-auto">
                    <select
                        className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-green-500"
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                    >
                        <option value="All">All Statuses</option>
                        <option value="Not Started">Not Started</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Blocked">Blocked</option>
                        <option value="Completed">Completed</option>
                        <option value="On Hold">On Hold</option>
                    </select>
                    <button
                        onClick={() => onNavigate('create')}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-sm whitespace-nowrap"
                    >
                        {ICONS.plus} New Task
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs text-gray-500 uppercase font-semibold">Total Pending</p>
                        <p className="text-2xl font-bold text-gray-900">{stats.pending}</p>
                    </div>
                    <span className="text-blue-500 bg-blue-50 p-2 rounded-lg">{ICONS.checkCircle}</span>
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs text-gray-500 uppercase font-semibold">Overdue</p>
                        <p className="text-2xl font-bold text-red-600">{stats.overdue}</p>
                    </div>
                    <span className="text-red-500 bg-red-50 p-2 rounded-lg">{ICONS.alertTriangle}</span>
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs text-gray-500 uppercase font-semibold">Due Soon</p>
                        <p className="text-2xl font-bold text-amber-600">{stats.dueSoon}</p>
                    </div>
                    <span className="text-amber-500 bg-amber-50 p-2 rounded-lg">{ICONS.calendar}</span>
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs text-gray-500 uppercase font-semibold">Completed</p>
                        <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
                    </div>
                    <span className="text-green-500 bg-green-50 p-2 rounded-lg">{ICONS.trendingUp}</span>
                </div>
            </div>

            {/* Task Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredTasks.map(task => (
                    <TaskCard
                        key={task.id}
                        title={task.title}
                        initiative={task.initiative_name || ''}
                        owner={task.owner_name || ''}
                        status={task.status}
                        priority={task.priority}
                        dueDate={new Date(task.due_date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                        progress={task.progress_percentage}
                        onClick={() => onNavigate('details', task.id)}
                    />
                ))}
            </div>

            {filteredTasks.length === 0 && (
                <div className="text-center py-16 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    <p>No tasks found.</p>
                </div>
            )}
        </div>
    );
};

export default TaskDashboard;
