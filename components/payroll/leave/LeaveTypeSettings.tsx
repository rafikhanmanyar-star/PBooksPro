import React, { useState } from 'react';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { useLeaveMutations, useLeaveTypes } from './hooks/useLeaveQueries';
import { usePermissions } from '../../../hooks/usePermissions';
import type { LeaveType } from '../../../services/api/leaveApi';

const LeaveTypeSettings: React.FC = () => {
  const { canWriteLeave, canDeleteLeave } = usePermissions();
  const { data: types = [], isLoading } = useLeaveTypes();
  const mutations = useLeaveMutations();
  const [editing, setEditing] = useState<LeaveType | null>(null);
  const [form, setForm] = useState({ name: '', annual_quota: 14, paid_leave: true, carry_forward: false, active: true });

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', annual_quota: 14, paid_leave: true, carry_forward: false, active: true });
  };

  const openEdit = (t: LeaveType) => {
    setEditing(t);
    setForm({
      name: t.name,
      annual_quota: t.annual_quota,
      paid_leave: t.paid_leave,
      carry_forward: t.carry_forward,
      active: t.active,
    });
  };

  const save = async () => {
    if (!form.name.trim()) return;
    if (editing) await mutations.updateType.mutateAsync({ id: editing.id, body: form });
    else await mutations.createType.mutateAsync(form);
    setEditing(null);
    openNew();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-app-text">Leave types</h3>
        {canWriteLeave && (
          <button type="button" onClick={openNew} className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
            <Plus size={14} /> Add type
          </button>
        )}
      </div>
      {isLoading && <Loader2 size={16} className="animate-spin" />}
      <ul className="space-y-2">
        {types.map((t) => (
          <li key={t.id} className="flex items-center justify-between rounded-xl border border-app-border px-3 py-2 text-sm">
            <div>
              <span className="font-semibold">{t.name}</span>
              <span className="text-app-muted ml-2">Quota {t.annual_quota} · {t.paid_leave ? 'Paid' : 'Unpaid'}{!t.active && ' · Inactive'}</span>
            </div>
            {canWriteLeave && (
              <div className="flex gap-1">
                <button type="button" onClick={() => openEdit(t)} className="p-1 rounded hover:bg-app-muted/10"><Pencil size={14} /></button>
                {canDeleteLeave && (
                  <button type="button" onClick={() => void mutations.deleteType.mutateAsync(t.id)} className="p-1 rounded hover:bg-red-50 text-red-600"><Trash2 size={14} /></button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {canWriteLeave && (editing !== null || form.name !== '') && (
        <div className="rounded-xl border border-app-border p-4 space-y-3 bg-app-muted/5">
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Name" className="w-full rounded-xl border border-app-border px-3 py-2 text-sm" />
          <input type="number" value={form.annual_quota} onChange={(e) => setForm((f) => ({ ...f, annual_quota: Number(e.target.value) }))} className="w-full rounded-xl border border-app-border px-3 py-2 text-sm" placeholder="Annual quota" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.paid_leave} onChange={(e) => setForm((f) => ({ ...f, paid_leave: e.target.checked }))} /> Paid leave</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.carry_forward} onChange={(e) => setForm((f) => ({ ...f, carry_forward: e.target.checked }))} /> Carry forward</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} /> Active</label>
          <button type="button" onClick={() => void save()} className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold">Save type</button>
        </div>
      )}
    </div>
  );
};

export default LeaveTypeSettings;
