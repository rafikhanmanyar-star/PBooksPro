import React, { useState } from 'react';
import OKRDashboard from './OKRDashboard';
import CreateObjective from './CreateObjective';
import ObjectiveDetails from './ObjectiveDetails';
import AlignmentTree from './AlignmentTree';
import { ICONS } from '../../../constants';

type ViewState = 'dashboard' | 'create' | 'details' | 'alignment' | 'reports';

const OKRManagementLayout: React.FC = () => {
    const [currentView, setCurrentView] = useState<ViewState>('dashboard');
    const [selectedObjectiveId, setSelectedObjectiveId] = useState<string | undefined>(undefined);

    const handleNavigate = (view: string, id?: string) => {
        if (id) setSelectedObjectiveId(id);
        setCurrentView(view as ViewState);
    };

    const renderContent = () => {
        switch (currentView) {
            case 'dashboard':
                return <OKRDashboard onNavigate={handleNavigate} />;
            case 'create':
                return <CreateObjective onCancel={() => setCurrentView('dashboard')} onSave={() => setCurrentView('dashboard')} />;
            case 'details':
                return <ObjectiveDetails objectiveId={selectedObjectiveId || ''} onBack={() => setCurrentView('dashboard')} />;
            case 'alignment':
                return <AlignmentTree />;
            default:
                return <OKRDashboard onNavigate={handleNavigate} />;
        }
    };

    const menuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: ICONS.grid },
        { id: 'alignment', label: 'Alignment Tree', icon: ICONS.layers },
        { id: 'reports', label: 'Reports', icon: ICONS.fileText },
        { id: 'my-okrs', label: 'My OKRs', icon: ICONS.target },
    ];

    return (
        <div className="flex flex-col h-full bg-gray-50 flex-1">
            {/* Horizontal Tabs Navigation */}
            <div className="bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar shadow-sm">
                {menuItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setCurrentView(item.id === 'my-okrs' ? 'dashboard' : item.id as ViewState)}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${currentView === item.id || (item.id === 'my-okrs' && currentView === 'dashboard')
                                ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                            }`}
                    >
                        <span className={currentView === item.id || (item.id === 'my-okrs' && currentView === 'dashboard') ? 'text-green-600' : 'text-gray-400'}>
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

export default OKRManagementLayout;
