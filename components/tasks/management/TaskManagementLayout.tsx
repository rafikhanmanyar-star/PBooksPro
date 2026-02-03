import React, { useState } from 'react';
import TaskDashboard from './TaskDashboard';
import CreateTask from './CreateTask';
import TaskDetails from './TaskDetails';
import { ICONS } from '../../../constants';

type ViewState = 'dashboard' | 'create' | 'details' | 'team-tasks' | 'reports';

const TaskManagementLayout: React.FC = () => {
    const [currentView, setCurrentView] = useState<ViewState>('dashboard');
    const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>(undefined);

    const handleNavigate = (view: string, id?: string) => {
        if (id) setSelectedTaskId(id);
        setCurrentView(view as ViewState);
    };

    const renderContent = () => {
        switch (currentView) {
            case 'dashboard':
                return <TaskDashboard onNavigate={handleNavigate} />;
            case 'create':
                return <CreateTask onCancel={() => setCurrentView('dashboard')} onSave={() => setCurrentView('dashboard')} />;
            case 'details':
                return <TaskDetails taskId={selectedTaskId || ''} onBack={() => setCurrentView('dashboard')} />;
            default:
                return <TaskDashboard onNavigate={handleNavigate} />;
        }
    };

    const menuItems = [
        { id: 'dashboard', label: 'My Tasks', icon: ICONS.checkSquare },
        { id: 'team-tasks', label: 'Team Tasks', icon: ICONS.users },
        { id: 'reports', label: 'Reports', icon: ICONS.fileText },
    ];

    return (
        <div className="flex flex-col h-full bg-gray-50 flex-1">
            {/* Horizontal Tabs Navigation */}
            <div className="bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar shadow-sm">
                {menuItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setCurrentView(item.id === 'team-tasks' || item.id === 'reports' ? 'dashboard' : item.id as ViewState)}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${(currentView === 'dashboard' && item.id === 'dashboard')
                                ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                    >
                        <span className={(currentView === 'dashboard' && item.id === 'dashboard') ? 'text-green-600' : 'text-gray-400'}>
                            {item.icon}
                        </span>
                        {item.label}
                    </button>
                ))}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-7xl mx-auto animate-fade-in">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
};

export default TaskManagementLayout;
