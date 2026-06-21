import React, { useMemo, useState } from 'react';
import { List, type RowComponentProps } from 'react-window';
import { Loader2 } from 'lucide-react';
import { payrollApi } from '../../../services/api/payrollApi';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { useAttendanceMonthlySheet } from './hooks/useAttendanceQueries';
import { ATTENDANCE_STATUS_SHORT, ATTENDANCE_STATUS_COLORS } from './constants';
import type { AttendanceStatus, MonthlySheetEmployee } from '../../../services/api/attendanceApi';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const ROW_HEIGHT = 36;
const LIST_HEIGHT = 560;

function cellClass(status: AttendanceStatus | null | undefined): string {
  if (!status) return 'bg-app-muted/5 text-app-muted';
  return ATTENDANCE_STATUS_COLORS[status] ?? 'bg-slate-100';
}

type RowExtra = {
  employees: MonthlySheetEmployee[];
  dayCols: number[];
};

function SheetRow({ index, style, employees, dayCols }: RowComponentProps<RowExtra>) {
  const emp = employees[index];
  if (!emp) return <div style={style} />;
  return (
    <div style={style} className="flex items-center border-b border-app-border/50 text-xs">
      <div className="sticky left-0 z-10 bg-app-card w-[180px] shrink-0 px-3 py-1 font-medium truncate border-r border-app-border/60">
        {emp.employee_name}
      </div>
      {dayCols.map((d) => {
        const st = emp.days[String(d)] as AttendanceStatus | undefined;
        return (
          <div key={d} className="w-8 shrink-0 flex justify-center">
            <span className={`w-6 h-6 flex items-center justify-center rounded text-[10px] font-bold ${cellClass(st ?? null)}`}>
              {st ? ATTENDANCE_STATUS_SHORT[st] : ''}
            </span>
          </div>
        );
      })}
      <div className="w-10 text-center tabular-nums shrink-0">{emp.summary.present_days}</div>
      <div className="w-10 text-center tabular-nums shrink-0">{emp.summary.absent_days}</div>
      <div className="w-10 text-center tabular-nums shrink-0">{emp.summary.leave_days}</div>
    </div>
  );
}

const MonthlyAttendanceSheet: React.FC = () => {
  const { tenant } = useAuth();
  const tenantId = tenant?.id ?? '';
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [departmentId, setDepartmentId] = useState('');

  const { data: sheet, isLoading } = useAttendanceMonthlySheet(month, year, departmentId || undefined);
  const { data: departments = [] } = useQuery({
    queryKey: ['payroll', 'departments', tenantId],
    queryFn: () => payrollApi.getDepartments(),
    enabled: !!tenantId,
  });

  const employees = sheet?.employees ?? [];
  const daysInMonth = sheet?.days_in_month ?? new Date(year, month, 0).getDate();
  const dayCols = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);
  const rowWidth = 180 + dayCols.length * 32 + 120;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-semibold text-app-muted mb-1">Month</label>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="rounded-xl border border-app-border px-3 py-2 text-sm">
            {MONTH_NAMES.map((name, i) => (
              <option key={name} value={i + 1}>{name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-app-muted mb-1">Year</label>
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24 rounded-xl border border-app-border px-3 py-2 text-sm" />
        </div>
        <div className="min-w-[160px]">
          <label className="block text-xs font-semibold text-app-muted mb-1">Department</label>
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="w-full rounded-xl border border-app-border px-3 py-2 text-sm">
            <option value="">All</option>
            {departments.filter((d: { is_active?: boolean }) => d.is_active !== false).map((d: { id: string; name: string }) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        {isLoading && <Loader2 className="animate-spin text-app-muted mb-2" size={20} />}
      </div>
      <div className="rounded-2xl border border-app-border overflow-x-auto bg-app-card">
        <div style={{ minWidth: rowWidth }}>
          <div className="flex items-center border-b border-app-border bg-app-muted/10 text-xs font-semibold sticky top-0 z-20">
            <div className="w-[180px] shrink-0 px-3 py-2 sticky left-0 bg-app-card border-r border-app-border">Employee</div>
            {dayCols.map((d) => (
              <div key={d} className="w-8 shrink-0 text-center py-2">{d}</div>
            ))}
            <div className="w-10 shrink-0 text-center py-2">P</div>
            <div className="w-10 shrink-0 text-center py-2">A</div>
            <div className="w-10 shrink-0 text-center py-2">L</div>
          </div>
          {employees.length === 0 && !isLoading ? (
            <p className="p-6 text-center text-app-muted text-sm">No employees found.</p>
          ) : (
            <List
              rowCount={employees.length}
              rowHeight={ROW_HEIGHT}
              rowComponent={SheetRow}
              rowProps={{ employees, dayCols }}
              style={{ height: Math.min(LIST_HEIGHT, employees.length * ROW_HEIGHT), width: rowWidth }}
              overscanCount={10}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default MonthlyAttendanceSheet;
