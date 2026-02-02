import React, { useState } from 'react';
import { ICONS } from '../../../constants';
import OrgDashboard from './OrgDashboard';
import DepartmentList from './DepartmentList';
import TeamList from './TeamList';
import RoleList from './RoleList';
import PeriodList from './PeriodList';
import BusinessCalendar from './BusinessCalendar';
import CompanyDetails from './CompanyDetails'; // Will create this next

type ViewType = 'dashboard' | 'company' | 'departments' | 'teams' | 'roles' | 'periods' | 'calendar';

const TaskConfigLayout: React.FC = () => {
    const [currentView, setCurrentView] = useState<ViewType>('dashboard');

    const menuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: ICONS.grid },
        { id: 'company', label: 'Company Details', icon: ICONS.building },
        { id: 'departments', label: 'Departments', icon: ICONS.layers },
        { id: 'teams', label: 'Teams', icon: ICONS.users },
        { id: 'roles', label: 'Roles & Permissions', icon: ICONS.lock },
        { id: 'periods', label: 'Strategy Periods', icon: ICONS.calendar },
        { id: 'calendar', label: 'Business Calendar', icon: ICONS.calendar },
    ];

    const renderContent = () => {
        switch (currentView) {
            case 'dashboard': return <OrgDashboard onNavigate={(view) => setCurrentView(view as ViewType)} />;
            case 'company': return <CompanyDetails />;
            case 'departments': return <DepartmentList />;
            case 'teams': return <TeamList />;
            case 'roles': return <RoleList />;
            case 'periods': return <PeriodList />;
            case 'calendar': return <BusinessCalendar />;
            default: return <OrgDashboard onNavigate={(view) => setCurrentView(view as ViewType)} />;
        }
    };

    return (
        <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-gray-50">
            {/* Sidebar */}
            <div className="w-64 bg-white border-r border-gray-200 flex-shrink-0 flex flex-col">
                <div className="p-4 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Organization</h2>
                </div>
                <nav className="flex-1 overflow-y-auto p-2 space-y-1">
                    {menuItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => setCurrentView(item.id as ViewType)}
                            className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${currentView === item.id
                                ? 'bg-green-50 text-green-700'
                                : 'text-gray-700 hover:bg-gray-50'
                                }`}
                        >
                            <span className={currentView === item.id ? 'text-green-600' : 'text-gray-400'}>
                                {item.icon}
                            </span>
                            {item.label}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-6xl mx-auto">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
};

export default TaskConfigLayout;
