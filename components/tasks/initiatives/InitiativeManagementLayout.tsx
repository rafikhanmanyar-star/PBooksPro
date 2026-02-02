import React, { useState } from 'react';
import InitiativeDashboard from './InitiativeDashboard';
import CreateInitiative from './CreateInitiative';
import InitiativeDetails from './InitiativeDetails';
import { ICONS } from '../../../constants';

type ViewState = 'dashboard' | 'create' | 'details' | 'my-initiatives';

const InitiativeManagementLayout: React.FC = () => {
    const [currentView, setCurrentView] = useState<ViewState>('dashboard');
    const [selectedInitiativeId, setSelectedInitiativeId] = useState<string | undefined>(undefined);

    const handleNavigate = (view: string, id?: string) => {
        if (id) setSelectedInitiativeId(id);
        setCurrentView(view as ViewState);
    };

    const renderContent = () => {
        switch (currentView) {
            case 'dashboard':
                return <InitiativeDashboard onNavigate={handleNavigate} />;
            case 'create':
                return <CreateInitiative onCancel={() => setCurrentView('dashboard')} onSave={() => setCurrentView('dashboard')} />;
            case 'details':
                return <InitiativeDetails initiativeId={selectedInitiativeId || ''} onBack={() => setCurrentView('dashboard')} />;
            default:
                return <InitiativeDashboard onNavigate={handleNavigate} />;
        }
    };

    const menuItems = [
        { id: 'dashboard', label: 'All Initiatives', icon: ICONS.grid },
        { id: 'my-initiatives', label: 'My Initiatives', icon: ICONS.user },
    ];

    return (
        <div className="flex flex-col h-full bg-gray-50 flex-1">
            {/* Horizontal Tabs Navigation */}
            <div className="bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar shadow-sm">
                {menuItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setCurrentView(item.id === 'my-initiatives' ? 'dashboard' : item.id as ViewState)}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${(currentView === 'dashboard' && item.id === 'dashboard') || currentView === item.id
                                ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                    >
                        <span className={currentView === item.id || (currentView === 'dashboard' && item.id === 'dashboard') ? 'text-green-600' : 'text-gray-400'}>
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

export default InitiativeManagementLayout;
