import React, { useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { todayLocalYyyyMmDd } from '../../../utils/dateUtils';
import { useAttendanceList, useAttendanceMonthlySheet } from './hooks/useAttendanceQueries';
import AttendanceFilters, { type AttendanceFilterValues } from './AttendanceFilters';
import { payrollApi } from '../../../services/api/payrollApi';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { ATTENDANCE_STATUS_SHORT, ATTENDANCE_STATUS_COLORS } from './constants';
import type { AttendanceStatus } from '../../../services/api/attendanceApi';

type ReportTab = 'daily' | 'monthly' | 'summary';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function cellClass(status: AttendanceStatus | null | undefined): string {
  if (!status) return 'bg-app-muted/5 text-app-muted';
  return ATTENDANCE_STATUS_COLORS[status] ?? 'bg-slate-100';
}

const AttendanceReports: React.FC = () => {
  const { tenant } = useAuth();
  const tenantId = tenant?.id ?? '';
  const [tab, setTab] = useState<ReportTab>('daily');
  const now = new Date();
  const [filters, setFilters] = useState<AttendanceFilterValues>({
    date: todayLocalYyyyMmDd(),
    departmentId: '',
    employeeId: '',
    status: '',
  });
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [monthlyDepartmentId, setMonthlyDepartmentId] = useState('');

  const dailyQuery = useAttendanceList(
    {
      date: filters.date,
      departmentId: filters.departmentId || undefined,
      employeeId: filters.employeeId || undefined,
      limit: 500,
    },
    tab === 'daily' || tab === 'summary'
  );

  const monthlyQuery = useAttendanceMonthlySheet(
    month,
    year,
    monthlyDepartmentId || filters.departmentId || undefined,
    tab === 'monthly' || tab === 'summary'
  );

  const { data: employees = [] } = useQuery({
    queryKey: ['payroll', 'employees', tenantId],
    queryFn: () => payrollApi.getEmployees(),
    enabled: !!tenantId,
  });
  const { data: departments = [] } = useQuery({
    queryKey: ['payroll', 'departments', tenantId],
    queryFn: () => payrollApi.getDepartments(),
    enabled: !!tenantId,
  });

  const dailyItems = dailyQuery.data?.data ?? [];
  const monthlyEmployees = monthlyQuery.data?.employees ?? [];
  const daysInMonth = monthlyQuery.data?.days_in_month ?? new Date(year, month, 0).getDate();
  const dayCols = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);

  const summaryRows = useMemo(() => {
    if (tab !== 'summary') return [];
    return (monthlyQuery.data?.employees ?? []).map((e) => ({
      name: e.employee_name,
      department: e.department,
      ...e.summary,
    }));
  }, [tab, monthlyQuery.data]);

  const exportCsv = (filename: string, headers: string[], rows: string[][]) => {
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = () => {
    if (tab === 'daily') {
      exportCsv(
        `daily_attendance_${filters.date}.csv`,
        ['Employee', 'Department', 'Status', 'Check In', 'Check Out', 'Remarks'],
        dailyItems.map((r) => [
          r.employee_name ?? r.employee_id,
          r.department ?? '',
          r.status,
          r.check_in ?? '',
          r.check_out ?? '',
          r.remarks ?? '',
        ])
      );
    } else if (tab === 'monthly') {
      const emps = monthlyQuery.data?.employees ?? [];
      const dim = monthlyQuery.data?.days_in_month ?? 31;
      const headers = ['Employee', 'Department', ...Array.from({ length: dim }, (_, i) => String(i + 1)), 'Present', 'Absent', 'Leave'];
      exportCsv(
        `monthly_attendance_${year}_${month}.csv`,
        headers,
        emps.map((e) => [
          e.employee_name,
          e.department,
          ...Array.from({ length: dim }, (_, i) => e.days[String(i + 1)] ?? ''),
          String(e.summary.present_days),
          String(e.summary.absent_days),
          String(e.summary.leave_days),
        ])
      );
    } else {
      exportCsv(
        `attendance_summary_${year}_${month}.csv`,
        ['Employee', 'Department', 'Working Days', 'Present', 'Absent', 'Leave', 'Late', 'Half Day'],
        summaryRows.map((r) => [
          r.name,
          r.department,
          String(r.working_days),
          String(r.present_days),
          String(r.absent_days),
          String(r.leave_days),
          String(r.late_days),
          String(r.half_days),
        ])
      );
    }
  };

  const loading = dailyQuery.isLoading || monthlyQuery.isLoading;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(['daily', 'monthly', 'summary'] as ReportTab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold capitalize ${tab === t ? 'bg-primary text-white' : 'border border-app-border'}`}
          >
            {t === 'summary' ? 'Summary' : `${t} report`}
          </button>
        ))}
        <button type="button" onClick={handleExport} className="ml-auto inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-app-border text-sm font-semibold">
          <Download size={16} /> Export CSV
        </button>
        {loading && <Loader2 size={18} className="animate-spin self-center" />}
      </div>
      {tab !== 'monthly' && (
        <AttendanceFilters
          values={filters}
          onChange={setFilters}
          departments={departments.filter((d: { is_active?: boolean }) => d.is_active !== false).map((d: { id: string; name: string }) => ({ id: d.id, name: d.name }))}
          employees={employees.map((e: { id: string; name: string }) => ({ id: e.id, name: e.name }))}
          showStatus={tab === 'daily'}
        />
      )}
      {tab === 'monthly' && (
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
            <select value={monthlyDepartmentId} onChange={(e) => setMonthlyDepartmentId(e.target.value)} className="w-full rounded-xl border border-app-border px-3 py-2 text-sm">
              <option value="">All</option>
              {departments.filter((d: { is_active?: boolean }) => d.is_active !== false).map((d: { id: string; name: string }) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}
      <div className="rounded-2xl border border-app-border bg-app-card overflow-x-auto">
        {tab === 'daily' && (
          <table className="w-full text-sm">
            <thead className="bg-app-muted/10 text-xs uppercase text-app-muted">
              <tr>
                <th className="px-4 py-2 text-left">Employee</th>
                <th className="px-4 py-2 text-left">Department</th>
                <th className="px-4 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {dailyItems.map((r) => (
                <tr key={r.id} className="border-t border-app-border/50">
                  <td className="px-4 py-2">{r.employee_name}</td>
                  <td className="px-4 py-2">{r.department}</td>
                  <td className="px-4 py-2">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'summary' && (
          <table className="w-full text-sm">
            <thead className="bg-app-muted/10 text-xs uppercase text-app-muted">
              <tr>
                <th className="px-4 py-2 text-left">Employee</th>
                <th className="px-4 py-2 text-left">Department</th>
                <th className="px-4 py-2 text-right">Present</th>
                <th className="px-4 py-2 text-right">Absent</th>
                <th className="px-4 py-2 text-right">Leave</th>
                <th className="px-4 py-2 text-right">Late</th>
                <th className="px-4 py-2 text-right">Half</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((r) => (
                <tr key={r.name + r.department} className="border-t border-app-border/50">
                  <td className="px-4 py-2">{r.name}</td>
                  <td className="px-4 py-2">{r.department}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.present_days}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.absent_days}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.leave_days}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.late_days}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.half_days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'monthly' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-max">
              <thead className="bg-app-muted/10 text-[10px] uppercase text-app-muted sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left sticky left-0 bg-app-card z-10 border-r border-app-border/60 min-w-[160px]">Employee</th>
                  <th className="px-3 py-2 text-left min-w-[100px]">Dept</th>
                  {dayCols.map((d) => (
                    <th key={d} className="px-1 py-2 text-center w-8">{d}</th>
                  ))}
                  <th className="px-2 py-2 text-center w-10">P</th>
                  <th className="px-2 py-2 text-center w-10">A</th>
                  <th className="px-2 py-2 text-center w-10">L</th>
                </tr>
              </thead>
              <tbody>
                {monthlyEmployees.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={dayCols.length + 5} className="px-4 py-6 text-center text-app-muted text-sm">
                      No employees found for this period.
                    </td>
                  </tr>
                ) : (
                  monthlyEmployees.map((emp) => (
                    <tr key={emp.employee_id} className="border-t border-app-border/50">
                      <td className="px-3 py-1.5 font-medium sticky left-0 bg-app-card border-r border-app-border/60 truncate max-w-[160px]">
                        {emp.employee_name}
                      </td>
                      <td className="px-3 py-1.5 text-app-muted truncate max-w-[100px]">{emp.department}</td>
                      {dayCols.map((d) => {
                        const st = emp.days[String(d)] as AttendanceStatus | undefined;
                        return (
                          <td key={d} className="px-1 py-1 text-center">
                            <span className={`inline-flex w-6 h-6 items-center justify-center rounded text-[10px] font-bold ${cellClass(st ?? null)}`}>
                              {st ? ATTENDANCE_STATUS_SHORT[st] : ''}
                            </span>
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5 text-center tabular-nums">{emp.summary.present_days}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{emp.summary.absent_days}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{emp.summary.leave_days}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AttendanceReports;
