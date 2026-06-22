import React, { useState } from 'react';
import { X, AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import type { PayrollRun } from '../types';
import { payrollRunStatusLabel } from '../utils/payrollStatusLabels';

interface VoidPayrollRunModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  run: PayrollRun | null;
}

const VoidPayrollRunModal: React.FC<VoidPayrollRunModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  run,
}) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !run) return null;

  const isPaid = run.status === 'PAID';

  const handleConfirm = async () => {
    if (!reason.trim()) {
      setError('A reason is required to void a payroll run.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onConfirm(reason.trim());
      setReason('');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to void payroll run.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-app-card w-full max-w-md rounded-2xl shadow-2xl border border-app-border overflow-hidden">
        <div className="px-6 py-4 bg-red-50 border-b border-red-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg"><Trash2 size={18} className="text-red-600" /></div>
            <div>
              <h3 className="font-black text-app-text">Void Payroll Run</h3>
              <p className="text-xs text-app-muted">{run.month} {run.year}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="p-2 hover:bg-red-100 rounded-lg text-app-muted transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-app-toolbar/40 rounded-xl p-4 border border-app-border space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-app-muted">Status</span>
              <span className="font-bold">{payrollRunStatusLabel(run.status)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-app-muted">Employees</span>
              <span className="font-bold">{run.employee_count ?? 0}</span>
            </div>
          </div>

          {isPaid && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
              <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">
                Paid payroll runs cannot be voided. Reverse all payments first.
              </p>
            </div>
          )}

          {run.status === 'APPROVED' && !isPaid && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
              <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                Voiding an approved run will reverse the payroll accrual journal before removing the run and all payslips.
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-app-muted uppercase tracking-wider mb-1.5">
              Reason for voiding <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Wrong period selected, duplicate run, cancelled payroll cycle…"
              className="w-full px-3 py-2.5 rounded-xl border border-app-border bg-app-card text-app-text text-sm outline-none focus:ring-2 ring-primary/20 resize-none"
              disabled={busy || isPaid}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={busy} className="flex-1 py-2.5 border border-app-border rounded-xl text-app-text font-bold text-sm">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={busy || !reason.trim() || isPaid}
              className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? <><Loader2 size={15} className="animate-spin" /> Voiding…</> : 'Void Run'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoidPayrollRunModal;
