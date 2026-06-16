import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFinancialReportAppState } from '../../hooks/useSelectiveState';
import type { GoodsReceiptLine, TenantGoodsReceipt } from '../../types';
import { useGoodsReceiptMutations, useGoodsReceipts } from '../../hooks/useGoodsReceipts';
import { usePurchaseOrders } from '../../hooks/usePurchaseOrders';
import { usePermissions } from '../../hooks/usePermissions';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { useNotification } from '../../context/NotificationContext';
import { fetchGoodsReceiptById, fetchPoReceiptContext } from '../../services/goodsReceiptsApi';
import { fetchPurchaseOrderById } from '../../services/purchaseOrdersApi';
import { WhatsAppService, sendOrOpenWhatsApp } from '../../services/whatsappService';
import {
  DEFAULT_GRN_WHATSAPP_TEMPLATE,
  buildPoLineCategoryNameMap,
  formatGrnLinesForWhatsApp,
  sumGrnLineTotal,
} from '../../utils/grnWhatsApp';
import { CURRENCY, ICONS } from '../../constants';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import GoodsReceiptReportWidget from './GoodsReceiptReportWidget';

const STATUSES = ['', 'Draft', 'Posted', 'Closed'];

function formatMoney(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: CURRENCY });
}

function mutationErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  return fallback;
}

const statusBadge: Record<string, string> = {
  Draft: 'bg-app-toolbar text-app-muted border border-app-border',
  Posted: 'bg-[color:var(--badge-paid-bg)] text-ds-success',
  Closed: 'bg-primary/15 text-primary',
};

const iconBtnBase =
  'inline-flex items-center justify-center shrink-0 size-8 rounded-md transition-colors';

type GoodsReceiptsPageProps = {
  vendorId?: string;
  initialPurchaseOrderId?: string | null;
  onInitialPoConsumed?: () => void;
};

const GoodsReceiptsPage: React.FC<GoodsReceiptsPageProps> = ({
  vendorId,
  initialPurchaseOrderId,
  onInitialPoConsumed,
}) => {
  const state = useFinancialReportAppState();
  const { vendors, projects, categories, whatsAppTemplates, whatsAppMode } = state;
  const perms = usePermissions();
  const { openChat } = useWhatsApp();
  const { showConfirm, showAlert } = useNotification();
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState<TenantGoodsReceipt | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [loadingPo, setLoadingPo] = useState(false);

  const filters = useMemo(
    () => ({
      status: statusFilter || undefined,
      vendorId,
    }),
    [statusFilter, vendorId]
  );

  const { data: receipts = [], isFetching, refetch } = useGoodsReceipts(filters);
  const { data: purchaseOrders = [] } = usePurchaseOrders({ vendorId });
  const { save, post, close, remove } = useGoodsReceiptMutations();

  const receiptEligiblePos = useMemo(
    () =>
      purchaseOrders.filter((po) =>
        ['Approved', 'Partially Billed'].includes(po.status)
      ),
    [purchaseOrders]
  );

  const emptyForm = (): TenantGoodsReceipt => ({
    id: '',
    grnNumber: '',
    vendorId: vendorId ?? '',
    projectId: undefined,
    purchaseOrderId: '',
    receivedDate: new Date().toISOString().slice(0, 10),
    status: 'Draft',
    lines: [],
    version: 0,
    tenantId: '',
    createdAt: '',
    updatedAt: '',
  });

  const [form, setForm] = useState<TenantGoodsReceipt>(emptyForm());
  const consumedPoRef = useRef<string | null>(null);

  const poDropdownOptions = useMemo(() => {
    const eligible = receiptEligiblePos;
    if (!form.purchaseOrderId) return eligible;
    if (eligible.some((po) => po.id === form.purchaseOrderId)) return eligible;
    const current = purchaseOrders.find((po) => po.id === form.purchaseOrderId);
    return current ? [current, ...eligible] : eligible;
  }, [receiptEligiblePos, purchaseOrders, form.purchaseOrderId]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEdit = (grn: TenantGoodsReceipt) => {
    setEditing(grn);
    setForm(grn);
    setFormError(null);
    setIsFormOpen(true);
  };

  const loadPoLines = async (poId: string) => {
    if (!poId) return;
    setLoadingPo(true);
    setFormError(null);
    try {
      const ctx = await fetchPoReceiptContext(poId);
      const lines: GoodsReceiptLine[] = ctx.lines
        .filter((l) => l.remainingQty > 0)
        .map((l) => ({
          id: crypto.randomUUID(),
          purchaseOrderLineId: l.id,
          itemName: l.itemName,
          description: l.description,
          orderedQty: l.orderedQty,
          receivedQty: l.remainingQty,
          remainingQty: l.remainingQty,
          unitRate: l.unitRate,
          lineTotal: Math.round(l.remainingQty * l.unitRate * 100) / 100,
        }));
      setForm((f) => ({
        ...f,
        purchaseOrderId: poId,
        vendorId: ctx.vendorId,
        projectId: ctx.projectId,
        lines,
      }));
    } catch (e) {
      setFormError(mutationErrorMessage(e, 'Failed to load PO lines.'));
    } finally {
      setLoadingPo(false);
    }
  };

  useEffect(() => {
    if (!initialPurchaseOrderId || consumedPoRef.current === initialPurchaseOrderId) return;
    consumedPoRef.current = initialPurchaseOrderId;
    setEditing(null);
    setForm(emptyForm());
    setFormError(null);
    setIsFormOpen(true);
    void loadPoLines(initialPurchaseOrderId).finally(() => onInitialPoConsumed?.());
  }, [initialPurchaseOrderId, onInitialPoConsumed]);

  const updateLineQty = (lineId: string, receivedQty: number) => {
    setForm((f) => ({
      ...f,
      lines: f.lines.map((line) => {
        if (line.id !== lineId) return line;
        const max = line.orderedQty - (line.orderedQty - (line.remainingQty ?? line.orderedQty));
        const capped = Math.min(Math.max(0, receivedQty), line.remainingQty ?? line.orderedQty);
        return {
          ...line,
          receivedQty: capped,
          lineTotal: Math.round(capped * line.unitRate * 100) / 100,
        };
      }),
    }));
  };

  const handleSave = async () => {
    setFormError(null);
    try {
      const saved = await save.mutateAsync(form);
      setIsFormOpen(false);
      void refetch();
      if (!editing && saved?.id) {
        setForm((f) => ({ ...f, id: saved.id, grnNumber: saved.grnNumber, version: saved.version }));
      }
    } catch (e) {
      setFormError(mutationErrorMessage(e, 'Failed to save goods receipt.'));
    }
  };

  const resolveGrnWithLines = async (grn: TenantGoodsReceipt): Promise<TenantGoodsReceipt> => {
    if (grn.lines?.length) return grn;
    return fetchGoodsReceiptById(grn.id);
  };

  const sendGrnWhatsAppToVendor = async (grn: TenantGoodsReceipt) => {
    const vendor = vendors.find((v) => v.id === grn.vendorId);
    if (!vendor) {
      await showAlert('Vendor not found for this goods receipt.');
      return;
    }
    if (!vendor.contactNo) {
      await showAlert('This vendor does not have a phone number saved.');
      return;
    }
    try {
      const full = await resolveGrnWithLines(grn);
      const po =
        purchaseOrders.find((p) => p.id === full.purchaseOrderId) ??
        (await fetchPurchaseOrderById(full.purchaseOrderId));
      const project = projects.find((p) => p.id === full.projectId);
      const categoryNameByPoLineId = buildPoLineCategoryNameMap(po?.items, categories);
      const template = whatsAppTemplates.goodsReceiptConfirmation || DEFAULT_GRN_WHATSAPP_TEMPLATE;
      const message = WhatsAppService.generateGoodsReceiptConfirmation(
        template,
        vendor,
        full.grnNumber,
        po?.poNumber ?? full.purchaseOrderId,
        full.receivedDate,
        sumGrnLineTotal(full.lines),
        project?.name ?? '',
        formatGrnLinesForWhatsApp(full.lines, categoryNameByPoLineId)
      );
      sendOrOpenWhatsApp(
        { contact: vendor, message, phoneNumber: vendor.contactNo },
        () => whatsAppMode,
        openChat
      );
    } catch (error) {
      await showAlert(error instanceof Error ? error.message : 'Failed to open WhatsApp');
    }
  };

  const offerGrnWhatsAppToVendor = async (grn: TenantGoodsReceipt) => {
    const vendor = vendors.find((v) => v.id === grn.vendorId);
    if (!vendor?.contactNo) return;
    const ok = await showConfirm(
      `Goods have been received under ${grn.grnNumber}. Send confirmation to ${vendor.name} via WhatsApp?`,
      { title: 'Notify vendor', confirmLabel: 'Send WhatsApp', cancelLabel: 'Not now' }
    );
    if (ok) await sendGrnWhatsAppToVendor(grn);
  };

  const handlePost = async (grn: TenantGoodsReceipt) => {
    setFormError(null);
    try {
      const posted = await post.mutateAsync({ id: grn.id, version: grn.version });
      void refetch();
      await offerGrnWhatsAppToVendor(posted ?? grn);
    } catch (e) {
      setFormError(mutationErrorMessage(e, 'Failed to post goods receipt.'));
    }
  };

  const handleClose = async (grn: TenantGoodsReceipt) => {
    try {
      await close.mutateAsync({ id: grn.id, version: grn.version });
      void refetch();
    } catch (e) {
      setFormError(mutationErrorMessage(e, 'Failed to close goods receipt.'));
    }
  };

  const handleDelete = async (grn: TenantGoodsReceipt) => {
    if (!confirm(`Delete ${grn.grnNumber}?`)) return;
    try {
      await remove.mutateAsync(grn.id);
      void refetch();
    } catch (e) {
      setFormError(mutationErrorMessage(e, 'Failed to delete goods receipt.'));
    }
  };

  const totalReceived = form.lines.reduce((s, l) => s + l.lineTotal, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-app-text">Goods Receipts (GRN)</h2>
          <p className="text-sm text-app-muted">Receive goods against approved purchase orders.</p>
        </div>
        {perms.canCreateGoodsReceipt && (
          <Button type="button" onClick={openCreate}>
            New GRN
          </Button>
        )}
      </div>

      {formError && (
        <div className="rounded-lg border border-ds-danger/40 bg-[color:var(--badge-unpaid-bg)] px-4 py-2 text-sm text-ds-danger">
          {formError}
        </div>
      )}

      <div className="flex gap-3 items-center">
        <Select
          id="grn-status-filter"
          label="Status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={STATUSES.map((s) => ({ value: s, label: s || 'All' }))}
        />
        {isFetching && <span className="text-xs text-app-muted">Refreshing…</span>}
      </div>

      <div className="overflow-x-auto rounded-xl border border-app-border">
        <table className="min-w-full text-sm">
          <thead className="bg-app-bg text-left text-app-muted">
            <tr>
              <th className="px-4 py-2">GRN #</th>
              <th className="px-4 py-2">PO</th>
              <th className="px-4 py-2">Vendor</th>
              <th className="px-4 py-2">Received</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {receipts.map((grn) => {
              const vendor = vendors.find((v) => v.id === grn.vendorId);
              const po = purchaseOrders.find((p) => p.id === grn.purchaseOrderId);
              return (
                <tr key={grn.id} className="border-t border-app-border hover:bg-app-highlight/40">
                  <td className="px-4 py-2 font-medium">{grn.grnNumber}</td>
                  <td className="px-4 py-2">{po?.poNumber ?? grn.purchaseOrderId}</td>
                  <td className="px-4 py-2">{vendor?.name ?? grn.vendorId}</td>
                  <td className="px-4 py-2">{grn.receivedDate}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadge[grn.status] ?? ''}`}>
                      {grn.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex flex-wrap items-center justify-end gap-1">
                      {(grn.status === 'Posted' || grn.status === 'Closed') && (
                        <button
                          type="button"
                          className={`${iconBtnBase} text-ds-success hover:bg-emerald-500/10`}
                          title="Send receipt confirmation via WhatsApp"
                          aria-label="WhatsApp"
                          onClick={() => void sendGrnWhatsAppToVendor(grn)}
                        >
                          <span className="size-4 flex items-center justify-center [&_svg]:size-full">
                            {ICONS.whatsapp}
                          </span>
                        </button>
                      )}
                      {grn.status === 'Draft' && perms.canEditGoodsReceipt && (
                        <Button type="button" variant="secondary" size="sm" onClick={() => openEdit(grn)}>
                          Edit
                        </Button>
                      )}
                      {grn.status === 'Draft' && perms.canPostGoodsReceipt && (
                        <Button type="button" size="sm" onClick={() => void handlePost(grn)} disabled={post.isPending}>
                          Post
                        </Button>
                      )}
                      {grn.status === 'Posted' && perms.canCloseGoodsReceipt && (
                        <Button type="button" variant="secondary" size="sm" onClick={() => void handleClose(grn)}>
                          Close
                        </Button>
                      )}
                      {grn.status === 'Draft' && perms.canEditGoodsReceipt && (
                        <Button type="button" variant="danger" size="sm" onClick={() => void handleDelete(grn)}>
                          Delete
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {receipts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-app-muted">
                  No goods receipts found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-app-card rounded-xl border border-app-border shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <h3 className="text-lg font-bold text-app-text">{editing ? 'Edit GRN' : 'New Goods Receipt'}</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                id="grn-po"
                label="Purchase Order"
                value={form.purchaseOrderId}
                onChange={(e) => void loadPoLines(e.target.value)}
                options={[
                  { value: '', label: 'Select PO…' },
                  ...poDropdownOptions.map((po) => ({
                    value: po.id,
                    label: `${po.poNumber} (${formatMoney(po.totalAmount)})`,
                  })),
                ]}
                disabled={!!editing}
              />
              <Input
                id="grn-received-date"
                name="grn-received-date"
                label="Received Date"
                type="date"
                value={form.receivedDate}
                onChange={(e) => setForm({ ...form, receivedDate: e.target.value })}
              />
              <Input
                id="grn-notes"
                name="grn-notes"
                label="Notes"
                value={form.notes ?? ''}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            {loadingPo && <p className="text-sm text-app-muted">Loading PO lines…</p>}

            {form.lines.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-app-text">Receipt Lines</h4>
                <table className="min-w-full text-sm border border-app-border rounded-lg overflow-hidden">
                  <thead className="bg-app-bg text-app-muted">
                    <tr>
                      <th className="px-3 py-2 text-left">Item</th>
                      <th className="px-3 py-2 text-right">Ordered</th>
                      <th className="px-3 py-2 text-right">Remaining</th>
                      <th className="px-3 py-2 text-right">Receive</th>
                      <th className="px-3 py-2 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.lines.map((line) => (
                      <tr key={line.id} className="border-t border-app-border">
                        <td className="px-3 py-2">{line.itemName ?? line.description ?? '—'}</td>
                        <td className="px-3 py-2 text-right">{line.orderedQty}</td>
                        <td className="px-3 py-2 text-right">{line.remainingQty ?? 0}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            max={line.remainingQty ?? line.orderedQty}
                            step="0.001"
                            value={line.receivedQty}
                            onChange={(e) => updateLineQty(line.id, Number(e.target.value))}
                            className="w-24 rounded border border-app-border px-2 py-1 text-right"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">{formatMoney(line.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="text-right font-semibold text-app-text">
                  Total: {formatMoney(totalReceived)}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setIsFormOpen(false)}>
                Cancel
              </Button>
              {(perms.canCreateGoodsReceipt || perms.canEditGoodsReceipt) && (
                <Button type="button" onClick={handleSave} disabled={save.isPending || !form.purchaseOrderId}>
                  {save.isPending ? 'Saving…' : 'Save Draft'}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <GoodsReceiptReportWidget />
    </div>
  );
};

export default GoodsReceiptsPage;
