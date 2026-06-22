import React, { useState } from 'react';
import { X, AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import type { Payslip, PayrollEmployee } from '../types';
import { payslipDisplayPaidAmount, payslipIsFullyPaid } from '../utils/payslipPaymentState';
import { formatCurrency } from '../utils/formatters';

interface VoidPayslipModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  payslip: Payslip | null;
  employee: PayrollEmployee | null;
}

const VoidPayslipModal: React.FC<VoidPayslipModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  payslip,
  employee,
}) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !payslip) return null;

  const isPaid = payslipIsFullyPaid(payslip);
  const paidAmount = payslipDisplayPaidAmount(payslip);

  const handleConfirm = async () => {
    if (!reason.trim()) {
      setError('A reason is required to void a payslip.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onConfirm(reason.trim());
      setReason('');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to void payslip.');
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
              <h3 className="font-black text-app-text">Void Payslip</h3>
              <p className="text-xs text-app-muted">{employee?.name ?? 'Employee'}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="p-2 hover:bg-red-100 rounded-lg text-app-muted transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Payslip summary */}
          <div className="bg-app-toolbar/40 rounded-xl p-4 border border-app-border space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-app-muted">Net Pay</span>
              <span className="font-bold text-app-text">PKR {formatCurrency(payslip.net_pay)}</span>
            </div>
            {paidAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-app-muted">Amount Paid</span>
                <span className="font-bold text-ds-success">PKR {formatCurrency(paidAmount)}</span>
              </div>
            )}
          </div>

          {/* Payment warning */}
          {isPaid && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
              <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800 space-y-1">
                <p className="font-bold">Reverse payment first</p>
                <p className="text-xs">
                  This payslip has been paid (PKR {formatCurrency(paidAmount)}). Reverse the payroll payment
                  from Payment History before voiding the payslip.
                </p>
              </div>
            </div>
          )}

          {/* Reason input */}
          <div>
            <label className="block text-xs font-bold text-app-muted uppercase tracking-wider mb-1.5">
              Reason for voiding <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Duplicate payslip generated, employee data error, corrected in next cycle…"
              className="w-full px-3 py-2.5 rounded-xl border border-app-border bg-app-card text-app-text text-sm outline-none focus:ring-2 ring-primary/20 resize-none"
              aria-label="Void reason"
              disabled={busy}
            />
            <p className="text-[10px] text-app-muted mt-1">This reason will be recorded in the payroll audit trail.</p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="flex-1 py-2.5 border border-app-border rounded-xl text-app-text font-bold text-sm hover:bg-app-toolbar/50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={busy || !reason.trim() || isPaid}
              className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? <><Loader2 size={15} className="animate-spin" /> Voiding…</> : <><Trash2 size={15} /> Void Payslip</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoidPayslipModal;
