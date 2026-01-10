
import React, { memo } from 'react';
import ProjectEquityManagement from '../projectManagement/ProjectEquityManagement';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { ICONS } from '../../constants';

const InvestmentManagementPage: React.FC = () => {
    const { state } = useAppContext();
    const { user } = useAuth();
    const { currentUser } = state;
    
    // Admin-only access check
    const isAdmin = user?.role === 'Admin' || currentUser?.role === 'Admin';

    if (!isAdmin) {
        return (
            <div className="flex items-center justify-center h-full bg-slate-50">
                <div className="text-center p-8 bg-white rounded-lg shadow-sm border border-slate-200 max-w-md">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
                        <div className="text-amber-600">{ICONS.lock || '🔒'}</div>
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 mb-2">Access Restricted</h2>
                    <p className="text-slate-600 mb-1">This feature is available to Administrators only.</p>
                    <p className="text-sm text-slate-500">Please contact your administrator for access.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full">
            <ProjectEquityManagement />
        </div>
    );
};

export default memo(InvestmentManagementPage);

