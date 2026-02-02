import React from 'react';
import { ICONS } from '../../constants';
import { useAppContext } from '../../context/AppContext';
import { Page } from '../../types';

const TaskOverview: React.FC = () => {
    const { dispatch } = useAppContext();

    const handleNavigate = (page: Page) => {
        dispatch({ type: 'SET_PAGE', payload: page });
    };

    return (
        <div className="space-y-6 animate-fade-in p-6">
            <div className="bg-white rounded-lg p-8 border border-gray-200 shadow-sm text-center">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Task & Strategy Management</h2>
                <p className="text-gray-500 mb-6">Select a module from the sidebar to manage your organization's goals and tasks.</p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left max-w-4xl mx-auto">
                    <div onClick={() => handleNavigate('taskOKR')} className="p-4 border border-gray-100 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors group">
                        <div className="bg-blue-100 text-blue-600 w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-blue-200 transition-colors">
                            {ICONS.target}
                        </div>
                        <h3 className="font-bold text-gray-900 mb-1">Define Strategy</h3>
                        <p className="text-sm text-gray-500">Set OKRs and align teams.</p>
                    </div>
                    <div onClick={() => handleNavigate('taskInitiatives')} className="p-4 border border-gray-100 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors group">
                        <div className="bg-purple-100 text-purple-600 w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-purple-200 transition-colors">
                            {ICONS.briefcase}
                        </div>
                        <h3 className="font-bold text-gray-900 mb-1">Manage Initiatives</h3>
                        <p className="text-sm text-gray-500">Track major projects and milestones.</p>
                    </div>
                    <div onClick={() => handleNavigate('taskManagement')} className="p-4 border border-gray-100 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors group">
                        <div className="bg-green-100 text-green-600 w-10 h-10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-green-200 transition-colors">
                            {ICONS.checkSquare}
                        </div>
                        <h3 className="font-bold text-gray-900 mb-1">Execute Tasks</h3>
                        <p className="text-sm text-gray-500">Assign work and track progress.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TaskOverview;
