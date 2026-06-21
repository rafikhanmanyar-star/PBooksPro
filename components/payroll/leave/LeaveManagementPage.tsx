import React, { useState } from 'react';
import { LayoutDashboard, List, Wallet, CheckSquare, FileBarChart } from 'lucide-react';
import { usePermissions } from '../../../hooks/usePermissions';
import LeaveDashboard from './LeaveDashboard';
import LeaveRequestList from './LeaveRequestList';
import LeaveBalanceView from './LeaveBalanceView';
import LeaveReports from './LeaveReports';

type LeaveViewTab = 'dashboard' | 'requests' | 'approval' | 'balances' | 'reports';

const tabs: Array<{ id: LeaveViewTab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'requests', label: 'Requests', icon: List },
  { id: 'approval', label: 'Approvals', icon: CheckSquare },
  { id: 'balances', label: 'Balances', icon: Wallet },
  { id: 'reports', label: 'Reports', icon: FileBarChart },
];

const LeaveManagementPage: React.FC = () => {
  const { canReadLeave, canApproveLeave } = usePermissions();
  const [view, setView] = useState<LeaveViewTab>('requests');

  if (!canReadLeave) {
    return (
      <div className="p-8 text-center text-app-muted">
        You need <code className="text-xs">leave.read</code> permission to view leave management.
      </div>
    );
  }

  const visibleTabs = tabs.filter((t) => t.id !== 'approval' || canApproveLeave);

  return (
    <div className="flex flex-col h-full min-h-0 p-2 sm:p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-black text-app-text">Leave management</h1>
        <p className="text-sm text-app-muted">Request, approve, and track leave. Approved leave creates attendance records automatically.</p>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {visibleTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold ${view === id ? 'bg-primary text-white' : 'border border-app-border bg-app-card'}`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {view === 'dashboard' && <LeaveDashboard />}
        {view === 'requests' && <LeaveRequestList />}
        {view === 'approval' && canApproveLeave && <LeaveRequestList approvalMode />}
        {view === 'balances' && <LeaveBalanceView />}
        {view === 'reports' && <LeaveReports />}
      </div>
    </div>
  );
};

export default LeaveManagementPage;
