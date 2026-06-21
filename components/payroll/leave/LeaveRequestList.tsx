import React, { useState } from 'react';
import { Plus, Loader2, Pencil, Trash2, Check, X, Ban } from 'lucide-react';
import { useLeaveMutations, useLeaveRequests, useLeaveTypes } from './hooks/useLeaveQueries';
import { usePermissions } from '../../../hooks/usePermissions';
import LeaveRequestModal from './LeaveRequestModal';
import LeaveApprovalModal from './LeaveApprovalModal';
import type { LeaveRequest, LeaveStatus } from '../../../services/api/leaveApi';
import { payrollApi } from '../../../services/api/payrollApi';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';

const STATUS_COLORS: Record<LeaveStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-slate-100 text-slate-600',
};

const LeaveRequestList: React.FC<{ approvalMode?: boolean }> = ({ approvalMode = false }) => {
  const { tenant } = useAuth();
  const tenantId = tenant?.id ?? '';
  const { canWriteLeave, canDeleteLeave, canApproveLeave, canCancelLeave } = usePermissions();
  const [filters, setFilters] = useState({
    employeeId: '',
    departmentId: '',
    leaveTypeId: '',
    status: (approvalMode ? 'PENDING' : '') as LeaveStatus | '',
    fromDate: '',
    toDate: '',
  });
  const [page] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [editing, setEditing] = useState<LeaveRequest | null>(null);
  const [approving, setApproving] = useState<LeaveRequest | null>(null);

  const queryParams = {
    employeeId: filters.employeeId || undefined,
    departmentId: filters.departmentId || undefined,
    leaveTypeId: filters.leaveTypeId || undefined,
    status: filters.status || undefined,
    fromDate: filters.fromDate || undefined,
    toDate: filters.toDate || undefined,
    page,
    limit: 100,
  };

  const { data, isLoading } = useLeaveRequests(queryParams);
  const { data: types = [] } = useLeaveTypes();
  const mutations = useLeaveMutations();
  const items = data?.data ?? [];

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

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (row: LeaveRequest) => {
    setEditing(row);
    setModalOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        {!approvalMode && (
          <>
            <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as LeaveStatus | '' }))} className="rounded-xl border border-app-border px-3 py-2 text-sm">
              <option value="">All statuses</option>
              {(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as LeaveStatus[]).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select value={filters.departmentId} onChange={(e) => setFilters((f) => ({ ...f, departmentId: e.target.value }))} className="rounded-xl border border-app-border px-3 py-2 text-sm min-w-[140px]">
              <option value="">All departments</option>
              {departments.map((d: { id: string; name: string }) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <select value={filters.leaveTypeId} onChange={(e) => setFilters((f) => ({ ...f, leaveTypeId: e.target.value }))} className="rounded-xl border border-app-border px-3 py-2 text-sm min-w-[140px]">
              <option value="">All leave types</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </>
        )}
        {canWriteLeave && !approvalMode && (
          <button type="button" onClick={openCreate} className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold">
            <Plus size={16} /> New request
          </button>
        )}
        {isLoading && <Loader2 size={18} className="animate-spin" />}
      </div>

      <div className="rounded-2xl border border-app-border overflow-x-auto bg-app-card">
        <table className="w-full text-sm">
          <thead className="bg-app-muted/10 text-xs uppercase text-app-muted">
            <tr>
              <th className="px-4 py-2 text-left">Employee</th>
              <th className="px-4 py-2 text-left">Leave type</th>
              <th className="px-4 py-2 text-left">From</th>
              <th className="px-4 py-2 text-left">To</th>
              <th className="px-4 py-2 text-right">Days</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Created</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-t border-app-border/50">
                <td className="px-4 py-2">{r.employee_name ?? r.employee_id}</td>
                <td className="px-4 py-2">{r.leave_type_name ?? r.leave_type_id}</td>
                <td className="px-4 py-2">{r.from_date}</td>
                <td className="px-4 py-2">{r.to_date}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.days}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[r.status]}`}>{r.status}</span>
                </td>
                <td className="px-4 py-2 text-app-muted">{r.created_at.slice(0, 10)}</td>
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex gap-1">
                    {r.status === 'PENDING' && canApproveLeave && (
                      <button type="button" title="Approve / Reject" onClick={() => { setApproving(r); setApprovalOpen(true); }} className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-700">
                        <Check size={14} />
                      </button>
                    )}
                    {r.status === 'PENDING' && canWriteLeave && (
                      <button type="button" onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-app-muted/10"><Pencil size={14} /></button>
                    )}
                    {(r.status === 'PENDING' || r.status === 'APPROVED') && canCancelLeave && (
                      <button type="button" title="Cancel" onClick={() => void mutations.cancelRequest.mutateAsync(r.id)} className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-700"><Ban size={14} /></button>
                    )}
                    {r.status === 'PENDING' && canDeleteLeave && (
                      <button type="button" onClick={() => void mutations.deleteRequest.mutateAsync(r.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600"><Trash2 size={14} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && !isLoading && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-app-muted">No leave requests found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <LeaveRequestModal
          request={editing}
          employees={employees.map((e: { id: string; name: string }) => ({ id: e.id, name: e.name }))}
          types={types}
          onClose={() => setModalOpen(false)}
        />
      )}
      {approvalOpen && approving && (
        <LeaveApprovalModal request={approving} onClose={() => { setApprovalOpen(false); setApproving(null); }} />
      )}
    </div>
  );
};

export default LeaveRequestList;
