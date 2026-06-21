import React from 'react';
import type { AttendanceDashboardCounts } from '../../../services/api/attendanceApi';
import { ATTENDANCE_STATUS_LABELS } from './constants';

type Props = {
  counts: AttendanceDashboardCounts | undefined;
  isLoading?: boolean;
};

const cards: Array<{
  key: keyof AttendanceDashboardCounts;
  label: string;
  color: string;
}> = [
  { key: 'present', label: 'Present Today', color: 'text-emerald-600' },
  { key: 'absent', label: 'Absent Today', color: 'text-red-600' },
  { key: 'leave', label: 'Leave Today', color: 'text-blue-600' },
  { key: 'late', label: 'Late Today', color: 'text-orange-600' },
  { key: 'half_day', label: 'Half Day Today', color: 'text-amber-600' },
];

const AttendanceSummaryCards: React.FC<Props> = ({ counts, isLoading }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
    {cards.map(({ key, label, color }) => (
      <div
        key={key}
        className="rounded-2xl border border-app-border bg-app-card p-4 shadow-ds-card"
      >
        <p className="text-[10px] font-bold uppercase tracking-widest text-app-muted">{label}</p>
        <p className={`mt-1 text-2xl font-black tabular-nums ${color}`}>
          {isLoading ? '—' : (counts?.[key] ?? 0)}
        </p>
      </div>
    ))}
  </div>
);

export default AttendanceSummaryCards;

export function statusBadge(status: string): React.ReactNode {
  const label = ATTENDANCE_STATUS_LABELS[status as keyof typeof ATTENDANCE_STATUS_LABELS] ?? status;
  return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border bg-slate-50 text-slate-700 border-slate-200">
      {label}
    </span>
  );
}
