import React, { useState } from 'react';
import { ICONS } from '../../../constants';

interface InitiativeCardProps {
    id: string;
    title: string;
    owner: string;
    progress: number;
    health: 'On Track' | 'At Risk' | 'Off Track';
    status: string;
    linkedOKR: string;
    dueDate: string;
    onClick: () => void;
}

const InitiativeCard: React.FC<InitiativeCardProps> = ({ title, owner, progress, health, status, linkedOKR, dueDate, onClick }) => {
    const getHealthColor = (h: string) => {
        switch (h) {
            case 'On Track': return 'bg-green-100 text-green-700 border-green-200';
            case 'At Risk': return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'Off Track': return 'bg-red-100 text-red-700 border-red-200';
            default: return 'bg-gray-100 text-gray-700 border-gray-200';
        }
    };

    return (
        <div
            onClick={onClick}
            className="group bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-all cursor-pointer hover:border-green-200"
        >
            <div className="flex justify-between items-start mb-3">
                <div className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${getHealthColor(health)}`}>
                    {health}
                </div>
                <button className="text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    {ICONS.moreVertical}
                </button>
            </div>

            <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2 min-h-[3rem]">{title}</h3>

            <div className="flex items-center gap-2 text-xs text-gray-500 mb-4">
                <span className="flex items-center gap-1">{ICONS.link} {linkedOKR}</span>
            </div>

            <div className="space-y-3">
                <div>
                    <div className="flex justify-between text-xs text-gray-600 mb-1.5">
                        <span className="font-medium">{status}</span>
                        <span>{progress}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                            className={`h-1.5 rounded-full transition-all duration-500 ${health === 'On Track' ? 'bg-green-500' :
                                    health === 'At Risk' ? 'bg-amber-500' : 'bg-red-500'
                                }`}
                            style={{ width: `${progress}%` }}
                        ></div>
                    </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-100 text-xs">
                    <div className="flex items-center gap-2 text-gray-600">
                        <div className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                            {owner.charAt(0)}
                        </div>
                        <span className="truncate max-w-[80px]">{owner}</span>
                    </div>
                    <div className="flex items-center gap-1 text-gray-500 bg-gray-50 px-2 py-1 rounded">
                        {ICONS.calendar} {dueDate}
                    </div>
                </div>
            </div>
        </div>
    );
};

interface InitiativeDashboardProps {
    onNavigate: (view: string, id?: string) => void;
}

const InitiativeDashboard: React.FC<InitiativeDashboardProps> = ({ onNavigate }) => {
    // Mock Data
    const initiatives = [
        {
            id: '1',
            title: 'Q1 Marketing Campaign Launch',
            owner: 'Sarah Connor',
            progress: 35,
            health: 'On Track',
            status: 'In Progress',
            linkedOKR: 'Achieve $10M ARR',
            dueDate: 'Mar 31'
        },
        {
            id: '2',
            title: 'Mobile App Redesign v2.0',
            owner: 'Mike Ross',
            progress: 75,
            health: 'At Risk',
            status: 'In Progress',
            linkedOKR: 'Improve UX Score',
            dueDate: 'Feb 28'
        },
        {
            id: '3',
            title: 'Backend Infrastructure Migration',
            owner: 'Dev Team',
            progress: 10,
            health: 'Off Track',
            status: 'On Hold',
            linkedOKR: 'Reduce Latency',
            dueDate: 'Apr 15'
        },
        {
            id: '4',
            title: 'Customer Success Playbook',
            owner: 'Jessica Pearson',
            progress: 100,
            health: 'On Track',
            status: 'Completed',
            linkedOKR: 'Reduce Churn',
            dueDate: 'Jan 15'
        }
    ] as const;

    const [filter, setFilter] = useState('All');

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="relative w-full md:w-96">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                        {ICONS.search}
                    </span>
                    <input
                        type="text"
                        placeholder="Search initiatives..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                </div>
                <div className="flex gap-3 w-full md:w-auto">
                    <select
                        className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-green-500"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    >
                        <option value="All">All Statuses</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Not Started">Not Started</option>
                        <option value="Completed">Completed</option>
                    </select>
                    <button
                        onClick={() => onNavigate('create')}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 shadow-sm whitespace-nowrap"
                    >
                        {ICONS.plus} New Initiative
                    </button>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm">
                    <p className="text-sm text-gray-500">Total Initiatives</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">12</p>
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm">
                    <p className="text-sm text-gray-500">Avg. Progress</p>
                    <p className="text-2xl font-bold text-blue-600 mt-1">45%</p>
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm">
                    <p className="text-sm text-gray-500">At Risk</p>
                    <p className="text-2xl font-bold text-amber-600 mt-1">3</p>
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm">
                    <p className="text-sm text-gray-500">Completed</p>
                    <p className="text-2xl font-bold text-green-600 mt-1">4</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {initiatives.map(initiative => (
                    <InitiativeCard
                        key={initiative.id}
                        {...initiative}
                        onClick={() => onNavigate('details', initiative.id)}
                    />
                ))}
            </div>

            {initiatives.length === 0 && (
                <div className="text-center py-16 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    <p>No initiatives found matching your filters.</p>
                </div>
            )}
        </div>
    );
};

export default InitiativeDashboard;
