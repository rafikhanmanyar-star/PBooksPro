import React, { useState } from 'react';
import { X, AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import type { Transaction } from '../../../types';
import { formatCurrency } from '../utils/formatters';

interface ReversePayrollPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  transaction: Transaction | null;
}

const ReversePayrollPaymentModal: React.FC<ReversePayrollPaymentModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  transaction,
}) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !transaction) return null;

  const handleConfirm = async () => {
    if (!reason.trim()) {
      setError('A reason is required to reverse this payment.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onConfirm(reason.trim());
      setReason('');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reverse payment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-app-card w-full max-w-md rounded-2xl shadow-2xl border border-app-border overflow-hidden">
        <div className="px-6 py-4 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg"><RotateCcw size={18} className="text-amber-700" /></div>
            <div>
              <h3 className="font-black text-app-text">Reverse Payroll Payment</h3>
              <p className="text-xs text-app-muted">{transaction.description || 'Salary payment'}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="p-2 hover:bg-amber-100 rounded-lg text-app-muted">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-app-toolbar/40 rounded-xl p-4 border border-app-border text-sm flex justify-between">
            <span className="text-app-muted">Amount</span>
            <span className="font-bold">PKR {formatCurrency(transaction.amount)}</span>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
            <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              Reverses the bank/AP journal entry and restores the payslip unpaid balance. Recorded in the payroll audit trail.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-app-muted uppercase tracking-wider mb-1.5">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Payment posted to wrong bank account, duplicate payment…"
              className="w-full px-3 py-2.5 rounded-xl border border-app-border bg-app-card text-app-text text-sm outline-none resize-none"
              disabled={busy}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={busy} className="flex-1 py-2.5 border border-app-border rounded-xl font-bold text-sm">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={busy || !reason.trim()}
              className="flex-1 py-2.5 bg-amber-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? <><Loader2 size={15} className="animate-spin" /> Reversing…</> : 'Reverse Payment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReversePayrollPaymentModal;
