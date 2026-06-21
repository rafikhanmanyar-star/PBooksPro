import React, { useMemo, useState } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import type { AttendanceStatus } from '../../../services/api/attendanceApi';
import { ATTENDANCE_STATUSES, ATTENDANCE_STATUS_LABELS } from './constants';
import { useAttendanceMutations } from './hooks/useAttendanceQueries';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  date: string;
  departmentId: string;
  employees: Array<{ id: string; name: string; department_id?: string }>;
  canWrite: boolean;
};

const BulkAttendanceModal: React.FC<Props> = ({
  isOpen,
  onClose,
  date,
  departmentId,
  employees,
  canWrite,
}) => {
  const { bulkMutation } = useAttendanceMutations();
  const filtered = useMemo(() => {
    if (!departmentId) return employees;
    return employees.filter((e) => e.department_id === departmentId);
  }, [employees, departmentId]);

  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!canWrite) return;
    setError(null);
    const records = Object.entries(marks)
      .filter(([, status]) => status)
      .map(([employee_id, status]) => ({ employee_id, status }));
    if (records.length === 0) {
      setError('Mark at least one employee.');
      return;
    }
    try {
      await bulkMutation.mutateAsync({ date, records });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk save failed');
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-app-card w-full max-w-2xl max-h-[85vh] rounded-2xl border border-app-border shadow-2xl flex flex-col">
        <div className="px-6 py-4 border-b border-app-border flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-lg">Bulk Attendance</h3>
            <p className="text-xs text-app-muted">{date}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-app-muted/20">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {filtered.map((emp) => (
            <div key={emp.id} className="flex items-center gap-3 py-2 border-b border-app-border/50">
              <span className="flex-1 text-sm font-medium truncate">{emp.name}</span>
              <select
                value={marks[emp.id] ?? ''}
                onChange={(e) =>
                  setMarks((m) => ({
                    ...m,
                    [emp.id]: e.target.value as AttendanceStatus,
                  }))
                }
                className="rounded-lg border border-app-border px-2 py-1 text-sm min-w-[120px]"
              >
                <option value="">—</option>
                {ATTENDANCE_STATUSES.map((s) => (
                  <option key={s} value={s}>{ATTENDANCE_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-app-border flex justify-end gap-2 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-app-border text-sm">Cancel</button>
          {canWrite && (
            <button
              type="button"
              onClick={handleSave}
              disabled={bulkMutation.isPending}
              className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold inline-flex items-center gap-2"
            >
              {bulkMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Save all
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BulkAttendanceModal;
