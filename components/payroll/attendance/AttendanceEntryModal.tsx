import React, { useState, useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import type { AttendanceRecord, AttendanceStatus } from '../../../services/api/attendanceApi';
import { ATTENDANCE_STATUSES, ATTENDANCE_STATUS_LABELS } from './constants';
import { useAttendanceMutations } from './hooks/useAttendanceQueries';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  record?: AttendanceRecord | null;
  defaultDate: string;
  defaultEmployeeId?: string;
  employees: Array<{ id: string; name: string; department?: string }>;
  canWrite: boolean;
};

const AttendanceEntryModal: React.FC<Props> = ({
  isOpen,
  onClose,
  record,
  defaultDate,
  defaultEmployeeId,
  employees,
  canWrite,
}) => {
  const { createMutation, updateMutation } = useAttendanceMutations();
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId ?? '');
  const [date, setDate] = useState(defaultDate);
  const [status, setStatus] = useState<AttendanceStatus>('PRESENT');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [lateMinutes, setLateMinutes] = useState(0);
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setEmployeeId(record?.employee_id ?? defaultEmployeeId ?? '');
    setDate(record?.attendance_date ?? defaultDate);
    setStatus(record?.status ?? 'PRESENT');
    setCheckIn(record?.check_in ? record.check_in.slice(11, 16) : '');
    setCheckOut(record?.check_out ? record.check_out.slice(11, 16) : '');
    setLateMinutes(record?.late_minutes ?? 0);
    setRemarks(record?.remarks ?? '');
    setError(null);
  }, [isOpen, record, defaultDate, defaultEmployeeId]);

  if (!isOpen) return null;

  const busy = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) return;
    setError(null);
    try {
      const body = {
        employee_id: employeeId,
        attendance_date: date,
        status,
        check_in: checkIn ? `${date}T${checkIn}:00` : null,
        check_out: checkOut ? `${date}T${checkOut}:00` : null,
        late_minutes: lateMinutes,
        remarks: remarks || null,
      };
      if (record) {
        await updateMutation.mutateAsync({ id: record.id, body });
      } else {
        await createMutation.mutateAsync(body);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-app-card w-full max-w-lg rounded-2xl border border-app-border shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-app-border flex items-center justify-between">
          <h3 className="font-bold text-lg">{record ? 'Edit Attendance' : 'Add Attendance'}</h3>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-app-muted/20">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div>
            <label className="block text-xs font-semibold text-app-muted mb-1">Employee</label>
            <select
              required
              disabled={!!record}
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full rounded-xl border border-app-border px-3 py-2 text-sm"
            >
              <option value="">Select employee</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-app-muted mb-1">Date</label>
            <input
              type="date"
              required
              disabled={!!record}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-app-border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-app-muted mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as AttendanceStatus)}
              className="w-full rounded-xl border border-app-border px-3 py-2 text-sm"
            >
              {ATTENDANCE_STATUSES.map((s) => (
                <option key={s} value={s}>{ATTENDANCE_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-app-muted mb-1">Check in</label>
              <input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="w-full rounded-xl border border-app-border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-app-muted mb-1">Check out</label>
              <input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="w-full rounded-xl border border-app-border px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-app-muted mb-1">Late minutes</label>
            <input type="number" min={0} value={lateMinutes} onChange={(e) => setLateMinutes(Number(e.target.value) || 0)} className="w-full rounded-xl border border-app-border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-app-muted mb-1">Remarks</label>
            <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} className="w-full rounded-xl border border-app-border px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-app-border text-sm">Cancel</button>
            {canWrite && (
              <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold inline-flex items-center gap-2">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default AttendanceEntryModal;
