import React, { useState } from 'react';
import { ICONS } from '../../../constants';

interface OrgDashboardProps {
    onNavigate: (view: string) => void;
}

const OrgDashboard: React.FC<OrgDashboardProps> = ({ onNavigate }) => {
    // Mock Data for Dashboard
    const stats = {
        totalEmployees: 45,
        departments: 4,
        teams: 8,
        activePeriod: 'Q1 2026'
    };

    const mockHierarchy = [
        {
            id: '1', name: 'Executive', type: 'dept', expanded: true, children: [
                { id: '1-1', name: 'Leadership Team', type: 'team' }
            ]
        },
        {
            id: '2', name: 'Engineering', type: 'dept', expanded: true, children: [
                { id: '2-1', name: 'Frontend Squad', type: 'team' },
                { id: '2-2', name: 'Backend Squad', type: 'team' },
                { id: '2-3', name: 'DevOps', type: 'team' }
            ]
        },
        {
            id: '3', name: 'Product', type: 'dept', expanded: false, children: [
                { id: '3-1', name: 'Design', type: 'team' },
                { id: '3-2', name: 'Product Management', type: 'team' }
            ]
        },
        {
            id: '4', name: 'Sales & Marketing', type: 'dept', expanded: false, children: [
                { id: '4-1', name: 'Sales', type: 'team' },
                { id: '4-2', name: 'Marketing', type: 'team' }
            ]
        }
    ];

    const [hierarchy, setHierarchy] = useState(mockHierarchy);

    const toggleExpand = (id: string) => {
        setHierarchy(prev => prev.map(item =>
            item.id === id ? { ...item, expanded: !item.expanded } : item
        ));
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-sm text-gray-500">Total Employees</p>
                        <p className="text-2xl font-bold text-gray-800">{stats.totalEmployees}</p>
                    </div>
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                        {ICONS.users}
                    </div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-sm text-gray-500">Departments</p>
                        <p className="text-2xl font-bold text-gray-800">{stats.departments}</p>
                    </div>
                    <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                        {ICONS.building}
                    </div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-sm text-gray-500">Teams</p>
                        <p className="text-2xl font-bold text-gray-800">{stats.teams}</p>
                    </div>
                    <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                        {ICONS.users}
                    </div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-sm text-gray-500">Active Period</p>
                        <p className="text-2xl font-bold text-gray-800">{stats.activePeriod}</p>
                    </div>
                    <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                        {ICONS.calendar}
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-4 overflow-x-auto pb-2">
                <button
                    onClick={() => onNavigate('departments')}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700 whitespace-nowrap"
                >
                    <span className="text-green-600">{ICONS.plus}</span> Add Department
                </button>
                <button
                    onClick={() => onNavigate('teams')}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700 whitespace-nowrap"
                >
                    <span className="text-green-600">{ICONS.plus}</span> Add Team
                </button>
                <button
                    onClick={() => onNavigate('periods')}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700 whitespace-nowrap"
                >
                    <span className="text-green-600">{ICONS.plus}</span> Add Period
                </button>
            </div>

            {/* Organization Hierarchy */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-gray-800">Organization Structure</h3>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="Search structure..."
                            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                        />
                    </div>
                </div>
                <div className="p-4">
                    <div className="space-y-2">
                        {hierarchy.map(dept => (
                            <div key={dept.id} className="border border-gray-100 rounded-lg overflow-hidden">
                                <div
                                    className="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 cursor-pointer"
                                    onClick={() => toggleExpand(dept.id)}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className={`transform transition-transform ${dept.expanded ? 'rotate-90' : ''}`}>
                                            {ICONS.chevronRight}
                                        </span>
                                        <span className="font-semibold text-gray-800">{dept.name}</span>
                                        <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded-full">Department</span>
                                    </div>
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button className="p-1 hover:bg-white rounded text-gray-500">{ICONS.edit}</button>
                                    </div>
                                </div>
                                {dept.expanded && (
                                    <div className="p-2 pl-10 space-y-1 bg-white">
                                        {dept.children.length > 0 ? (
                                            dept.children.map(team => (
                                                <div key={team.id} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded group">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                                                        <span className="text-gray-700">{team.name}</span>
                                                        <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded-full">Team</span>
                                                    </div>
                                                    <button className="invisible group-hover:visible p-1 hover:bg-gray-200 rounded text-gray-500">
                                                        {ICONS.edit}
                                                    </button>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-sm text-gray-400 italic py-1">No teams assigned</div>
                                        )}
                                        <button
                                            className="ml-5 mt-2 text-xs text-green-600 hover:text-green-700 flex items-center gap-1 font-medium"
                                            onClick={(e) => { e.stopPropagation(); onNavigate('teams'); }}
                                        >
                                            {ICONS.plus} Add Team
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OrgDashboard;
