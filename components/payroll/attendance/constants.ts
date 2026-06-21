import type { AttendanceStatus } from '../../../services/api/attendanceApi';

export const ATTENDANCE_STATUSES: AttendanceStatus[] = [
  'PRESENT',
  'ABSENT',
  'LEAVE',
  'HALF_DAY',
  'LATE',
];

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LEAVE: 'Leave',
  HALF_DAY: 'Half Day',
  LATE: 'Late',
};

export const ATTENDANCE_STATUS_SHORT: Record<AttendanceStatus, string> = {
  PRESENT: 'P',
  ABSENT: 'A',
  LEAVE: 'L',
  HALF_DAY: 'HD',
  LATE: 'LT',
};

export const ATTENDANCE_STATUS_COLORS: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  ABSENT: 'bg-red-100 text-red-800 border-red-200',
  LEAVE: 'bg-blue-100 text-blue-800 border-blue-200',
  HALF_DAY: 'bg-amber-100 text-amber-800 border-amber-200',
  LATE: 'bg-orange-100 text-orange-800 border-orange-200',
};

export type AttendanceViewTab = 'dashboard' | 'daily' | 'monthly' | 'reports';
