import React, { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Download, Users, Loader2 } from 'lucide-react';
import { todayLocalYyyyMmDd } from '../../../utils/dateUtils';
import { usePermissions } from '../../../hooks/usePermissions';
import AttendanceFilters, { type AttendanceFilterValues } from './AttendanceFilters';
import AttendanceSummaryCards, { statusBadge } from './AttendanceSummaryCards';
import AttendanceEntryModal from './AttendanceEntryModal';
import BulkAttendanceModal from './BulkAttendanceModal';
import { useAttendanceList, useAttendanceMutations } from './hooks/useAttendanceQueries';
import type { AttendanceRecord } from '../../../services/api/attendanceApi';
import { payrollApi } from '../../../services/api/payrollApi';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

const DailyAttendance: React.FC = () => {
  const { tenant } = useAuth();
  const tenantId = tenant?.id ?? '';
  const { canWriteAttendance, canDeleteAttendance } = usePermissions();
  const [filters, setFilters] = useState<AttendanceFilterValues>({
    date: todayLocalYyyyMmDd(),
    departmentId: '',
    employeeId: '',
    status: '',
  });
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState<AttendanceRecord | null>(null);
  const { deleteMutation } = useAttendanceMutations();

  const listParams = useMemo(
    () => ({
      date: filters.date,
      departmentId: filters.departmentId || undefined,
      employeeId: filters.employeeId || undefined,
      status: filters.status || undefined,
      page,
      limit: 50,
    }),
    [filters, page]
  );

  const { data, isLoading, isFetching } = useAttendanceList(listParams);
  const items = data?.data ?? [];
  const total = data?.totalCount ?? items.length;
  const dashboard = data?.dashboard;

  const { data: employees = [] } = useQuery({
    queryKey: ['payroll', 'employees', tenantId],
    queryFn: () => payrollApi.getEmployees(),
    enabled: !!tenantId,
    staleTime: 120_000,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['payroll', 'departments', tenantId],
    queryFn: () => payrollApi.getDepartments(),
    enabled: !!tenantId,
    staleTime: 120_000,
  });

  const deptOptions = useMemo(
    () => departments.filter((d: { is_active?: boolean }) => d.is_active !== false).map((d: { id: string; name: string }) => ({ id: d.id, name: d.name })),
    [departments]
  );

  const empOptions = useMemo(
    () => employees.map((e: { id: string; name: string; department_id?: string }) => ({ id: e.id, name: e.name, department_id: e.department_id })),
    [employees]
  );

  const handleExport = () => {
    const headers = ['Employee', 'Department', 'Date', 'Status', 'Check In', 'Check Out', 'Late Min', 'Remarks'];
    const rows = items.map((r: AttendanceRecord) => [
      r.employee_name ?? r.employee_id,
      r.department ?? '',
      r.attendance_date,
      r.status,
      r.check_in ?? '',
      r.check_out ?? '',
      String(r.late_minutes ?? 0),
      r.remarks ?? '',
    ]);
    const csv = [headers, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_${filters.date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (id: string) => {
    if (!canDeleteAttendance) return;
    if (!window.confirm('Delete this attendance record?')) return;
    await deleteMutation.mutateAsync(id);
  };

  return (
    <div className="space-y-4">
      <AttendanceSummaryCards counts={dashboard} isLoading={isLoading} />
      <AttendanceFilters
        values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
        departments={deptOptions}
        employees={empOptions}
      />
      <div className="flex flex-wrap gap-2">
        {canWriteAttendance && (
          <>
            <button type="button" onClick={() => { setEditing(null); setModalOpen(true); }} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary text-white text-sm font-semibold">
              <Plus size={16} /> Add
            </button>
            <button type="button" onClick={() => setBulkOpen(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-app-border text-sm font-semibold">
              <Users size={16} /> Bulk entry
            </button>
          </>
        )}
        <button type="button" onClick={handleExport} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-app-border text-sm font-semibold">
          <Download size={16} /> Export CSV
        </button>
        {isFetching && <Loader2 size={18} className="animate-spin text-app-muted self-center" />}
      </div>
      <div className="rounded-2xl border border-app-border overflow-hidden bg-app-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-app-muted/10 text-left text-xs uppercase tracking-wide text-app-muted">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Check in</th>
                <th className="px-4 py-3">Check out</th>
                <th className="px-4 py-3">Remarks</th>
                <th className="px-4 py-3 w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-app-muted">Loading…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-app-muted">No attendance for this date.</td></tr>
              ) : (
                items.map((row: AttendanceRecord) => (
                  <tr key={row.id} className="border-t border-app-border/60 hover:bg-app-muted/5">
                    <td className="px-4 py-3 font-medium">{row.employee_name ?? row.employee_id}</td>
                    <td className="px-4 py-3 text-app-muted">{row.department ?? '—'}</td>
                    <td className="px-4 py-3">{statusBadge(row.status)}</td>
                    <td className="px-4 py-3 tabular-nums">{formatTime(row.check_in)}</td>
                    <td className="px-4 py-3 tabular-nums">{formatTime(row.check_out)}</td>
                    <td className="px-4 py-3 text-app-muted max-w-[200px] truncate">{row.remarks ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {canWriteAttendance && (
                          <button type="button" onClick={() => { setEditing(row); setModalOpen(true); }} className="p-1.5 rounded-lg hover:bg-app-muted/20" title="Edit">
                            <Pencil size={14} />
                          </button>
                        )}
                        {canDeleteAttendance && (
                          <button type="button" onClick={() => handleDelete(row.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600" title="Delete">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {total > 50 && (
          <div className="flex justify-between items-center px-4 py-3 border-t border-app-border text-sm">
            <span className="text-app-muted">Page {page} · {total} records</span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 rounded-lg border border-app-border disabled:opacity-40">Prev</button>
              <button type="button" disabled={page * 50 >= total} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 rounded-lg border border-app-border disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
      <AttendanceEntryModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        record={editing}
        defaultDate={filters.date}
        employees={empOptions}
        canWrite={canWriteAttendance}
      />
      <BulkAttendanceModal
        isOpen={bulkOpen}
        onClose={() => setBulkOpen(false)}
        date={filters.date}
        departmentId={filters.departmentId}
        employees={empOptions}
        canWrite={canWriteAttendance}
      />
    </div>
  );
};

export default DailyAttendance;
