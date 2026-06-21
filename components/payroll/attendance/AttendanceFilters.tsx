import React from 'react';
import type { AttendanceStatus } from '../../../services/api/attendanceApi';
import { ATTENDANCE_STATUSES, ATTENDANCE_STATUS_LABELS } from './constants';

export type AttendanceFilterValues = {
  date: string;
  departmentId: string;
  employeeId: string;
  status: AttendanceStatus | '';
};

type Props = {
  values: AttendanceFilterValues;
  onChange: (next: AttendanceFilterValues) => void;
  departments: Array<{ id: string; name: string }>;
  employees: Array<{ id: string; name: string }>;
  showStatus?: boolean;
};

const AttendanceFilters: React.FC<Props> = ({
  values,
  onChange,
  departments,
  employees,
  showStatus = true,
}) => (
  <div className="flex flex-wrap gap-3 items-end">
    <div>
      <label className="block text-xs font-semibold text-app-muted mb-1">Date</label>
      <input
        type="date"
        value={values.date}
        onChange={(e) => onChange({ ...values, date: e.target.value })}
        className="rounded-xl border border-app-border bg-app-card px-3 py-2 text-sm"
      />
    </div>
    <div className="min-w-[160px]">
      <label className="block text-xs font-semibold text-app-muted mb-1">Department</label>
      <select
        value={values.departmentId}
        onChange={(e) => onChange({ ...values, departmentId: e.target.value })}
        className="w-full rounded-xl border border-app-border bg-app-card px-3 py-2 text-sm"
      >
        <option value="">All departments</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
    </div>
    <div className="min-w-[160px]">
      <label className="block text-xs font-semibold text-app-muted mb-1">Employee</label>
      <select
        value={values.employeeId}
        onChange={(e) => onChange({ ...values, employeeId: e.target.value })}
        className="w-full rounded-xl border border-app-border bg-app-card px-3 py-2 text-sm"
      >
        <option value="">All employees</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </select>
    </div>
    {showStatus && (
      <div className="min-w-[140px]">
        <label className="block text-xs font-semibold text-app-muted mb-1">Status</label>
        <select
          value={values.status}
          onChange={(e) => onChange({ ...values, status: e.target.value as AttendanceStatus | '' })}
          className="w-full rounded-xl border border-app-border bg-app-card px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {ATTENDANCE_STATUSES.map((s) => (
            <option key={s} value={s}>{ATTENDANCE_STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>
    )}
  </div>
);

export default AttendanceFilters;
