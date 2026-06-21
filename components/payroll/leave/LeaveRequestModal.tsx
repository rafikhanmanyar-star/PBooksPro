import React, { useState } from 'react';
import type { LeaveRequest, LeaveType } from '../../../services/api/leaveApi';
import { useLeaveMutations } from './hooks/useLeaveQueries';

type Props = {
  request: LeaveRequest | null;
  employees: Array<{ id: string; name: string }>;
  types: LeaveType[];
  onClose: () => void;
};

const LeaveRequestModal: React.FC<Props> = ({ request, employees, types, onClose }) => {
  const mutations = useLeaveMutations();
  const [employeeId, setEmployeeId] = useState(request?.employee_id ?? employees[0]?.id ?? '');
  const [leaveTypeId, setLeaveTypeId] = useState(request?.leave_type_id ?? types[0]?.id ?? '');
  const [fromDate, setFromDate] = useState(request?.from_date ?? '');
  const [toDate, setToDate] = useState(request?.to_date ?? '');
  const [reason, setReason] = useState(request?.reason ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError('');
    setSaving(true);
    try {
      const body = { employee_id: employeeId, leave_type_id: leaveTypeId, from_date: fromDate, to_date: toDate, reason: reason || null };
      if (request) await mutations.updateRequest.mutateAsync({ id: request.id, body });
      else await mutations.createRequest.mutateAsync(body);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save leave request.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-app-card border border-app-border p-6 space-y-4">
        <h3 className="text-lg font-bold">{request ? 'Edit leave request' : 'New leave request'}</h3>
        <label className="block text-xs font-semibold text-app-muted">Employee</label>
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-full rounded-xl border border-app-border px-3 py-2 text-sm">
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <label className="block text-xs font-semibold text-app-muted">Leave type</label>
        <select value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)} className="w-full rounded-xl border border-app-border px-3 py-2 text-sm">
          {types.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-app-muted">From</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full rounded-xl border border-app-border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-app-muted">To</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full rounded-xl border border-app-border px-3 py-2 text-sm" />
          </div>
        </div>
        <label className="block text-xs font-semibold text-app-muted">Reason</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="w-full rounded-xl border border-app-border px-3 py-2 text-sm" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-app-border text-sm">Cancel</button>
          <button type="button" disabled={saving} onClick={() => void submit()} className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
};

export default LeaveRequestModal;
