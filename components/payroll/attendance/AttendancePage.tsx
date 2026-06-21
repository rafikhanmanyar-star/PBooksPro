import React, { useState } from 'react';
import { LayoutDashboard, CalendarDays, Grid3X3, FileBarChart } from 'lucide-react';
import { usePermissions } from '../../../hooks/usePermissions';
import type { AttendanceViewTab } from './constants';
import AttendanceDashboard from './AttendanceDashboard';
import DailyAttendance from './DailyAttendance';
import MonthlyAttendanceSheet from './MonthlyAttendanceSheet';
import AttendanceReports from './AttendanceReports';

const tabs: Array<{ id: AttendanceViewTab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'daily', label: 'Daily', icon: CalendarDays },
  { id: 'monthly', label: 'Monthly sheet', icon: Grid3X3 },
  { id: 'reports', label: 'Reports', icon: FileBarChart },
];

const AttendancePage: React.FC = () => {
  const { canReadAttendance } = usePermissions();
  const [view, setView] = useState<AttendanceViewTab>('daily');

  if (!canReadAttendance) {
    return (
      <div className="p-8 text-center text-app-muted">
        You need <code className="text-xs">attendance.read</code> permission to view attendance.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 p-2 sm:p-4 md:p-6">
      <div className="mb-4">
        <h1 className="text-xl font-black text-app-text">Attendance</h1>
        <p className="text-sm text-app-muted">Track daily and monthly employee attendance (informational only).</p>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {tabs.map(({ id, label, icon: Icon }) => (
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
        {view === 'dashboard' && <AttendanceDashboard />}
        {view === 'daily' && <DailyAttendance />}
        {view === 'monthly' && <MonthlyAttendanceSheet />}
        {view === 'reports' && <AttendanceReports />}
      </div>
    </div>
  );
};

export default AttendancePage;
