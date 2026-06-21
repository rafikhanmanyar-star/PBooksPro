import React from 'react';
import { todayLocalYyyyMmDd } from '../../../utils/dateUtils';
import AttendanceSummaryCards from './AttendanceSummaryCards';
import { useAttendanceList } from './hooks/useAttendanceQueries';

const AttendanceDashboard: React.FC = () => {
  const today = todayLocalYyyyMmDd();
  const { data, isLoading } = useAttendanceList({ date: today, limit: 1 });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-app-text">Today&apos;s attendance</h2>
        <p className="text-sm text-app-muted">{today}</p>
      </div>
      <AttendanceSummaryCards counts={data?.dashboard} isLoading={isLoading} />
      <p className="text-sm text-app-muted">Use the Daily tab to mark or edit attendance records.</p>
    </div>
  );
};

export default AttendanceDashboard;
