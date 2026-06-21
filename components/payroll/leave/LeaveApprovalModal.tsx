import React, { useState } from 'react';
import type { LeaveRequest } from '../../../services/api/leaveApi';
import { useLeaveMutations } from './hooks/useLeaveQueries';

type Props = {
  request: LeaveRequest;
  onClose: () => void;
};

const LeaveApprovalModal: React.FC<Props> = ({ request, onClose }) => {
  const mutations = useLeaveMutations();
  const [remarks, setRemarks] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const approve = async () => {
    setBusy(true);
    setError('');
    try {
      await mutations.approveRequest.mutateAsync({ id: request.id, remarks: remarks || undefined });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approval failed.');
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!rejectReason.trim()) {
      setError('Rejection reason is required.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await mutations.rejectRequest.mutateAsync({ id: request.id, reason: rejectReason });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rejection failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-app-card border border-app-border p-6 space-y-4">
        <h3 className="text-lg font-bold">Approve / reject leave</h3>
        <p className="text-sm text-app-muted">
          {request.employee_name} · {request.leave_type_name} · {request.from_date} → {request.to_date} ({request.days} days)
        </p>
        <label className="block text-xs font-semibold text-app-muted">Approval remarks (optional)</label>
        <input value={remarks} onChange={(e) => setRemarks(e.target.value)} className="w-full rounded-xl border border-app-border px-3 py-2 text-sm" />
        <label className="block text-xs font-semibold text-app-muted">Rejection reason (required)</label>
        <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={2} className="w-full rounded-xl border border-app-border px-3 py-2 text-sm" required />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-app-border text-sm">Close</button>
          <button type="button" disabled={busy || !rejectReason.trim()} onClick={() => void reject()} className="px-4 py-2 rounded-xl border border-red-200 text-red-700 text-sm font-semibold disabled:opacity-50">Reject</button>
          <button type="button" disabled={busy} onClick={() => void approve()} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold">Approve</button>
        </div>
      </div>
    </div>
  );
};

export default LeaveApprovalModal;
