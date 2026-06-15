import React, { useMemo, useState } from 'react';
import { useFinancialReportAppState } from '../../hooks/useSelectiveState';
import { TransactionType, type POItem, type TenantPurchaseOrder } from '../../types';
import { usePurchaseOrderMutations, usePurchaseOrders } from '../../hooks/usePurchaseOrders';
import { usePermissions } from '../../hooks/usePermissions';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import ComboBox from '../ui/ComboBox';
import { CURRENCY } from '../../constants';

const STATUSES = ['', 'Draft', 'Submitted', 'Approved', 'Partially Billed', 'Fully Billed', 'Cancelled'];

function formatMoney(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: CURRENCY });
}

function emptyLine(idx: number): POItem {
  return {
    id: `line_${Date.now()}_${idx}`,
    description: '',
    quantity: 1,
    unitPrice: 0,
    total: 0,
    unitRate: 0,
    taxPercent: 0,
    taxAmount: 0,
    lineTotal: 0,
  };
}

function recomputeLine(line: POItem): POItem {
  const qty = Number(line.quantity) || 0;
  const unitRate = Number(line.unitRate ?? line.unitPrice) || 0;
  const taxPercent = Number(line.taxPercent) || 0;
  const subtotal = qty * unitRate;
  const taxAmount = Math.round(subtotal * taxPercent) / 100;
  const lineTotal = subtotal + taxAmount;
  return {
    ...line,
    quantity: qty,
    unitRate,
    unitPrice: unitRate,
    taxAmount,
    lineTotal,
    total: lineTotal,
  };
}

const statusBadge: Record<string, string> = {
  Draft: 'bg-app-toolbar text-app-muted border border-app-border',
  Submitted: 'bg-primary/15 text-primary',
  Approved: 'bg-[color:var(--badge-paid-bg)] text-ds-success',
  'Partially Billed': 'bg-[color:var(--badge-partial-bg)] text-ds-warning',
  'Fully Billed': 'bg-primary/15 text-primary',
  Cancelled: 'bg-[color:var(--badge-unpaid-bg)] text-ds-danger',
};

type PurchaseOrdersPageProps = {
  vendorId?: string;
  onCreateGrn?: (purchaseOrderId: string) => void;
};

const PurchaseOrdersPage: React.FC<PurchaseOrdersPageProps> = ({ vendorId, onCreateGrn }) => {
  const state = useFinancialReportAppState();
  const { vendors, projects, categories } = state;
  const perms = usePermissions();
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState<TenantPurchaseOrder | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const filters = useMemo(
    () => ({
      status: statusFilter || undefined,
      vendorId,
    }),
    [statusFilter, vendorId]
  );

  const { data: orders = [], isFetching, refetch } = usePurchaseOrders(filters);
  const { save, submit, approve, cancel, remove } = usePurchaseOrderMutations();

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === TransactionType.EXPENSE),
    [categories]
  );

  const [form, setForm] = useState<Partial<TenantPurchaseOrder>>({
    status: 'Draft',
    currency: 'PKR',
    issueDate: new Date().toISOString().slice(0, 10),
    items: [emptyLine(0)],
  });

  const openCreate = () => {
    setEditing(null);
    setForm({
      vendorId: vendorId ?? '',
      status: 'Draft',
      currency: 'PKR',
      issueDate: new Date().toISOString().slice(0, 10),
      items: [emptyLine(0)],
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEdit = (po: TenantPurchaseOrder) => {
    setEditing(po);
    setForm({ ...po, items: po.items?.length ? po.items.map(recomputeLine) : [emptyLine(0)] });
    setFormError(null);
    setIsFormOpen(true);
  };

  const updateLine = (idx: number, patch: Partial<POItem>) => {
    setForm((prev) => {
      const items = [...(prev.items ?? [])];
      items[idx] = recomputeLine({ ...items[idx], ...patch });
      return { ...prev, items };
    });
  };

  const addLine = () => {
    setForm((prev) => ({
      ...prev,
      items: [...(prev.items ?? []), emptyLine((prev.items ?? []).length)],
    }));
  };

  const handleSave = async () => {
    setFormError(null);
    if (!form.vendorId) {
      setFormError('Vendor is required.');
      return;
    }
    try {
      await save.mutateAsync({
        ...form,
        id: editing?.id,
        version: editing?.version,
        totalAmount: (form.items ?? []).reduce((s, l) => s + (l.lineTotal ?? l.total ?? 0), 0),
      });
      setIsFormOpen(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save purchase order.');
    }
  };

  const busy = isFetching || save.isPending || submit.isPending || approve.isPending || cancel.isPending;

  if (!perms.canViewPurchaseOrders) {
    return <p className="p-6 text-sm text-app-muted">You do not have permission to view purchase orders.</p>;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-app-text">Purchase Orders</h2>
          <p className="text-sm text-app-muted">Quotation → PO → Bill → Payment</p>
        </div>
        <div className="flex gap-2">
          {perms.canCreatePurchaseOrder && (
            <Button onClick={openCreate} disabled={busy}>
              New PO
            </Button>
          )}
          <Button variant="secondary" onClick={() => void refetch()} disabled={busy}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex gap-3 items-end">
        <Select label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s || 'all'} value={s}>
              {s || 'All statuses'}
            </option>
          ))}
        </Select>
      </div>

      <div className="overflow-x-auto border border-app-border rounded-lg bg-app-card">
        <table className="min-w-full text-sm">
          <thead className="bg-app-table-header text-app-muted">
            <tr>
              <th className="px-3 py-2 text-left">PO #</th>
              <th className="px-3 py-2 text-left">Vendor</th>
              <th className="px-3 py-2 text-left">Issue Date</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Received</th>
              <th className="px-3 py-2 text-right">Billed</th>
              <th className="px-3 py-2 text-center">Status</th>
              <th className="px-3 py-2 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-app-muted">
                  {isFetching ? 'Loading…' : 'No purchase orders found.'}
                </td>
              </tr>
            ) : (
              orders.map((po) => {
                const vendor = vendors.find((v) => v.id === po.vendorId);
                return (
                  <tr key={po.id} className="border-t border-app-border hover:bg-app-table-hover">
                    <td className="px-3 py-2 font-medium">{po.poNumber}</td>
                    <td className="px-3 py-2">{vendor?.name ?? po.vendorId}</td>
                    <td className="px-3 py-2">{po.issueDate}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(po.totalAmount)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(po.receivedAmount ?? 0)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(po.billedAmount ?? 0)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-xs font-semibold px-2 py-1 rounded ${statusBadge[po.status] ?? 'bg-app-toolbar text-app-muted'}`}>
                        {po.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1 justify-center">
                        {po.status === 'Draft' && perms.canEditPurchaseOrder && (
                          <Button size="sm" variant="secondary" onClick={() => openEdit(po)}>
                            Edit
                          </Button>
                        )}
                        {po.status === 'Draft' && perms.canEditPurchaseOrder && (
                          <Button
                            size="sm"
                            onClick={() => void submit.mutateAsync({ id: po.id, version: po.version })}
                            disabled={busy}
                          >
                            Submit
                          </Button>
                        )}
                        {po.status === 'Submitted' && perms.canApprovePurchaseOrder && (
                          <Button
                            size="sm"
                            onClick={() => void approve.mutateAsync({ id: po.id, version: po.version })}
                            disabled={busy}
                          >
                            Approve
                          </Button>
                        )}
                        {['Approved', 'Partially Billed'].includes(po.status) && perms.canCreateGoodsReceipt && onCreateGrn && (
                          <Button size="sm" variant="secondary" onClick={() => onCreateGrn(po.id)}>
                            Create GRN
                          </Button>
                        )}
                        {['Draft', 'Submitted', 'Approved'].includes(po.status) && perms.canCancelPurchaseOrder && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void cancel.mutateAsync({ id: po.id, version: po.version })}
                            disabled={busy}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-app-card rounded-xl border border-app-border shadow-ds-card w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <h3 className="text-lg font-bold text-app-text">{editing ? 'Edit Purchase Order' : 'New Purchase Order'}</h3>
            {formError && <p className="text-sm text-ds-danger">{formError}</p>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ComboBox
                label="Vendor"
                items={vendors}
                selectedId={form.vendorId ?? ''}
                onSelect={(v) => setForm((p) => ({ ...p, vendorId: v?.id ?? '' }))}
                placeholder="Select vendor"
                entityType="vendor"
              />
              <ComboBox
                label="Project"
                items={projects}
                selectedId={form.projectId ?? ''}
                onSelect={(p) => setForm((prev) => ({ ...prev, projectId: p?.id }))}
                placeholder="Optional"
                entityType="project"
              />
              <Input
                label="Issue Date"
                type="date"
                value={form.issueDate ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, issueDate: e.target.value }))}
              />
              <Input
                label="Required Date"
                type="date"
                value={form.requiredDate ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, requiredDate: e.target.value }))}
              />
              <Input
                label="Currency"
                value={form.currency ?? 'PKR'}
                onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
              />
              <Input
                label="Description"
                value={form.description ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-semibold text-sm">Line Items</h4>
                <Button size="sm" variant="secondary" onClick={addLine}>
                  Add Line
                </Button>
              </div>
              <div className="space-y-2">
                {(form.items ?? []).map((line, idx) => (
                  <div key={line.id} className="grid grid-cols-12 gap-2 items-end border border-slate-100 p-2 rounded">
                    <div className="col-span-4">
                      <Input
                        label="Description"
                        value={line.description}
                        onChange={(e) => updateLine(idx, { description: e.target.value })}
                      />
                    </div>
                    <div className="col-span-2">
                      <ComboBox
                        label="Category"
                        items={expenseCategories}
                        selectedId={line.categoryId ?? ''}
                        onSelect={(c) => updateLine(idx, { categoryId: c?.id })}
                        placeholder="Category"
                        entityType="category"
                      />
                    </div>
                    <div className="col-span-1">
                      <Input
                        label="Qty"
                        type="number"
                        value={String(line.quantity)}
                        onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })}
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        label="Unit Rate"
                        type="number"
                        value={String(line.unitRate ?? line.unitPrice)}
                        onChange={(e) => updateLine(idx, { unitRate: Number(e.target.value) })}
                      />
                    </div>
                    <div className="col-span-1">
                      <Input
                        label="Tax %"
                        type="number"
                        value={String(line.taxPercent ?? 0)}
                        onChange={(e) => updateLine(idx, { taxPercent: Number(e.target.value) })}
                      />
                    </div>
                    <div className="col-span-2 text-right text-sm font-semibold pb-2">
                      {formatMoney(line.lineTotal ?? line.total ?? 0)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-right font-bold mt-2">
                Total: {formatMoney((form.items ?? []).reduce((s, l) => s + (l.lineTotal ?? l.total ?? 0), 0))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setIsFormOpen(false)}>
                Close
              </Button>
              {perms.canCreatePurchaseOrder && (
                <Button onClick={() => void handleSave()} disabled={busy}>
                  Save Draft
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseOrdersPage;
