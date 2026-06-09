import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ProjectExpenseCategoryApiRepository,
  ProjectExpenseVoucherApiRepository,
} from '../../services/api/repositories/projectExpenseVoucherApi';
import type { ProjectExpenseCategory, ProjectExpenseVoucher, PeVStatus } from '../../types';
import { AccountType } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import { CURRENCY, ICONS } from '../../constants';
import { useNotification } from '../../context/NotificationContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useFinancialReportAppState } from '../../hooks/useSelectiveState';
import { uploadEntityDocument } from '../../services/documentUploadService';
import { useDispatchOnly } from '../../hooks/useSelectiveState';
import { toLocalDateString } from '../../utils/dateUtils';
import { formatApiErrorMessage } from '../../services/api/client';
import ProjectExpenseCategoriesModal from './ProjectExpenseCategoriesModal';

const pevApi = new ProjectExpenseVoucherApiRepository();
const peCatApi = new ProjectExpenseCategoryApiRepository();

const STATUS_LABELS: Record<PeVStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
  posted: 'Posted',
};

const STATUS_COLORS: Record<PeVStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  submitted: 'bg-amber-100 text-amber-800',
  approved: 'bg-blue-100 text-blue-800',
  rejected: 'bg-red-100 text-red-800',
  posted: 'bg-emerald-100 text-emerald-800',
};

interface ProjectExpenseVouchersPageProps {
  projectContext?: boolean;
}

const emptyForm = (): Partial<ProjectExpenseVoucher> => ({
  voucherDate: toLocalDateString(new Date()),
  amount: 0,
  status: 'draft',
});

const ProjectExpenseVouchersPage: React.FC<ProjectExpenseVouchersPageProps> = ({ projectContext }) => {
  const state = useFinancialReportAppState();
  const { projects, vendors, accounts, defaultProjectId } = state;
  const dispatch = useDispatchOnly();
  const { showToast, showAlert } = useNotification();
  const { canReadPeV, canCreatePeV, canApprovePeV, canPostPeV } = usePermissions();

  const [vouchers, setVouchers] = useState<ProjectExpenseVoucher[]>([]);
  const [categories, setCategories] = useState<ProjectExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProjectId, setFilterProjectId] = useState<string>(projectContext ? defaultProjectId || 'all' : 'all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [editing, setEditing] = useState<ProjectExpenseVoucher | null>(null);
  const [form, setForm] = useState<Partial<ProjectExpenseVoucher>>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);

  const paymentAccounts = useMemo(
    () =>
      accounts.filter(
        (a) =>
          a.isActive !== false &&
          (a.type === AccountType.BANK || a.type === AccountType.CASH || a.name !== 'Internal Clearing')
      ),
    [accounts]
  );

  const projectItems = useMemo(
    () => [{ id: 'all', name: 'All Projects' }, ...projects],
    [projects]
  );

  const loadData = useCallback(async () => {
    if (!canReadPeV) return;
    setLoading(true);
    try {
      const [vList, cList] = await Promise.all([
        pevApi.findAll({
          projectId: filterProjectId !== 'all' ? filterProjectId : undefined,
          status: filterStatus !== 'all' ? (filterStatus as PeVStatus) : undefined,
        }),
        peCatApi.findAll(true),
      ]);
      setVouchers(vList);
      setCategories(cList);
    } catch (e) {
      showAlert(formatApiErrorMessage(e), 'Error');
    } finally {
      setLoading(false);
    }
  }, [canReadPeV, filterProjectId, filterStatus, showAlert]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...emptyForm(),
      projectId: projectContext && defaultProjectId ? defaultProjectId : undefined,
    });
    setShowForm(true);
  };

  const openEdit = (v: ProjectExpenseVoucher) => {
    if (v.status !== 'draft' && v.status !== 'rejected') {
      showToast('Only draft or rejected vouchers can be edited.', 'warning');
      return;
    }
    setEditing(v);
    setForm({ ...v });
    setShowForm(true);
  };

  const saveVoucher = async () => {
    if (!canCreatePeV) return;
    if (!form.projectId) {
      showToast('Project is required.', 'warning');
      return;
    }
    if (!form.expenseCategoryId) {
      showToast('Expense category is required.', 'warning');
      return;
    }
    if (!form.paymentSourceAccountId) {
      showToast('Payment source account is required.', 'warning');
      return;
    }
    if (!form.amount || form.amount <= 0) {
      showToast('Amount must be positive.', 'warning');
      return;
    }
    setSubmitting(true);
    try {
      if (editing) {
        await pevApi.update(editing.id, form);
        showToast('Voucher updated.', 'success');
      } else {
        await pevApi.create(form);
        showToast('Voucher created.', 'success');
      }
      setShowForm(false);
      await loadData();
    } catch (e) {
      showAlert(formatApiErrorMessage(e), 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAttachment = async (file: File) => {
    if (!form.id && !editing?.id) {
      showToast('Save the voucher first, then attach a receipt.', 'info');
      return;
    }
    const entityId = editing?.id || form.id!;
    try {
      const docId = await uploadEntityDocument(
        file,
        'project_expense_voucher',
        entityId,
        dispatch,
        undefined
      );
      setForm((f) => ({ ...f, documentId: docId }));
      showToast('Attachment uploaded.', 'success');
    } catch (e) {
      showAlert(e instanceof Error ? e.message : String(e), 'Upload failed');
    }
  };

  const workflowAction = async (id: string, action: 'submit' | 'approve' | 'post' | 'unpost') => {
    setSubmitting(true);
    try {
      if (action === 'submit') await pevApi.submit(id);
      else if (action === 'approve') await pevApi.approve(id);
      else if (action === 'post') {
        const r = await pevApi.post(id);
        showToast(`Posted to GL (journal ${r.journalEntryId.slice(0, 8)}…).`, 'success');
      } else if (action === 'unpost') await pevApi.unpost(id);
      if (action !== 'post') showToast(`Voucher ${action}ted.`, 'success');
      await loadData();
    } catch (e) {
      showAlert(formatApiErrorMessage(e), 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmReject = async () => {
    if (!rejectTargetId) return;
    setSubmitting(true);
    try {
      await pevApi.reject(rejectTargetId, rejectReason);
      showToast('Voucher rejected.', 'success');
      setShowRejectModal(false);
      setRejectReason('');
      setRejectTargetId(null);
      await loadData();
    } catch (e) {
      showAlert(formatApiErrorMessage(e), 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? id;
  const vendorName = (id?: string) => (id ? vendors.find((v) => v.id === id)?.name ?? id : '—');

  if (!canReadPeV) {
    return (
      <Card className="p-6">
        <p className="text-app-muted">You do not have permission to view project expense vouchers.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-app-text">Project Expense Vouchers</h2>
          <p className="text-sm text-app-muted mt-1">
            Record site expenses without vendor bills — tea, fuel, labor, fees, and misc.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreatePeV && (
            <>
              <Button variant="secondary" onClick={() => setShowCategories(true)}>
                Expense Categories
              </Button>
              <Button onClick={openCreate}>{ICONS.plus} New Voucher</Button>
            </>
          )}
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="min-w-[200px]">
            <label className="text-xs text-app-muted block mb-1">Project</label>
            <ComboBox
              items={projectItems}
              selectedId={filterProjectId}
              onSelect={(id) => setFilterProjectId(id || 'all')}
              placeholder="All projects"
            />
          </div>
          <div className="min-w-[160px]">
            <label className="text-xs text-app-muted block mb-1">Status</label>
            <select
              className="w-full border border-app-border rounded-lg px-3 py-2 text-sm bg-app-card"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All</option>
              {(Object.keys(STATUS_LABELS) as PeVStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button variant="secondary" onClick={loadData}>
              Refresh
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="text-app-muted py-8 text-center">Loading…</p>
        ) : vouchers.length === 0 ? (
          <p className="text-app-muted py-8 text-center">No vouchers found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-app-border text-left text-app-muted">
                  <th className="py-2 pr-3">Voucher #</th>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Project</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Vendor</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vouchers.map((v) => (
                  <tr key={v.id} className="border-b border-app-border/60 hover:bg-app-hover/50">
                    <td className="py-2 pr-3 font-medium">{v.voucherNumber}</td>
                    <td className="py-2 pr-3">{v.voucherDate}</td>
                    <td className="py-2 pr-3">{projectName(v.projectId)}</td>
                    <td className="py-2 pr-3">{categoryName(v.expenseCategoryId)}</td>
                    <td className="py-2 pr-3">{vendorName(v.vendorId)}</td>
                    <td className="py-2 pr-3 text-right">
                      {CURRENCY} {v.amount.toLocaleString()}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[v.status]}`}>
                        {STATUS_LABELS[v.status]}
                      </span>
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {(v.status === 'draft' || v.status === 'rejected') && canCreatePeV && (
                          <Button size="sm" variant="ghost" onClick={() => openEdit(v)}>
                            Edit
                          </Button>
                        )}
                        {v.status === 'draft' && canCreatePeV && (
                          <Button size="sm" variant="secondary" disabled={submitting} onClick={() => workflowAction(v.id, 'submit')}>
                            Submit
                          </Button>
                        )}
                        {v.status === 'submitted' && canApprovePeV && (
                          <>
                            <Button size="sm" variant="secondary" disabled={submitting} onClick={() => workflowAction(v.id, 'approve')}>
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={submitting}
                              onClick={() => {
                                setRejectTargetId(v.id);
                                setShowRejectModal(true);
                              }}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                        {v.status === 'approved' && canPostPeV && (
                          <Button size="sm" variant="primary" disabled={submitting} onClick={() => workflowAction(v.id, 'post')}>
                            Post
                          </Button>
                        )}
                        {v.status === 'posted' && canPostPeV && (
                          <Button size="sm" variant="ghost" disabled={submitting} onClick={() => workflowAction(v.id, 'unpost')}>
                            Unpost
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Voucher' : 'New Expense Voucher'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-app-muted">Date</label>
              <DatePicker
                value={
                  typeof form.voucherDate === 'string' && form.voucherDate
                    ? form.voucherDate
                    : toLocalDateString(new Date())
                }
                onChange={(d) => setForm((f) => ({ ...f, voucherDate: toLocalDateString(d) }))}
              />
            </div>
            <div>
              <label className="text-xs text-app-muted">Amount ({CURRENCY})</label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.amount ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <label className="text-xs text-app-muted">Project *</label>
              <ComboBox
                items={projects}
                selectedId={form.projectId || ''}
                onSelect={(id) => setForm((f) => ({ ...f, projectId: id || undefined }))}
                placeholder="Select project"
              />
            </div>
            <div>
              <label className="text-xs text-app-muted">Expense Category *</label>
              <ComboBox
                items={categories.map((c) => ({ id: c.id, name: c.name }))}
                selectedId={form.expenseCategoryId || ''}
                onSelect={(id) => setForm((f) => ({ ...f, expenseCategoryId: id || undefined }))}
                placeholder="Select category"
              />
            </div>
            <div>
              <label className="text-xs text-app-muted">Payment Source Account *</label>
              <ComboBox
                items={paymentAccounts.map((a) => ({ id: a.id, name: a.name }))}
                selectedId={form.paymentSourceAccountId || ''}
                onSelect={(id) => setForm((f) => ({ ...f, paymentSourceAccountId: id || undefined }))}
                placeholder="Cash / bank account"
              />
            </div>
            <div>
              <label className="text-xs text-app-muted">Vendor (optional)</label>
              <ComboBox
                items={[{ id: '', name: '— None —' }, ...vendors.map((v) => ({ id: v.id, name: v.name }))]}
                selectedId={form.vendorId || ''}
                onSelect={(id) => setForm((f) => ({ ...f, vendorId: id || undefined }))}
                placeholder="Optional vendor"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-app-muted">Description</label>
            <Input
              value={form.description || ''}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Site tea & snacks"
            />
          </div>
          {editing && (
            <div>
              <label className="text-xs text-app-muted block mb-1">Attachment (PDF / image)</label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleAttachment(f);
                }}
                className="text-sm"
              />
              {form.documentId && (
                <p className="text-xs text-app-muted mt-1">Document attached: {form.documentId}</p>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button onClick={saveVoucher} disabled={submitting}>
              {submitting ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showRejectModal} onClose={() => setShowRejectModal(false)} title="Reject Voucher">
        <div className="space-y-4">
          <Input
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection (optional)"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowRejectModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={confirmReject} disabled={submitting}>
              Reject
            </Button>
          </div>
        </div>
      </Modal>

      <ProjectExpenseCategoriesModal
        isOpen={showCategories}
        onClose={() => {
          setShowCategories(false);
          loadData();
        }}
        accounts={paymentAccounts}
      />
    </div>
  );
};

export default ProjectExpenseVouchersPage;
