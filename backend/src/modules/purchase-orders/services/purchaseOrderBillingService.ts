import type pg from 'pg';
import {
  computePoBillingStatus,
  validateBillAgainstPurchaseOrderWithReceipt,
} from '../../../procurement/purchaseOrderBillingCore.js';
import { PurchaseOrderRepository } from '../repositories/PurchaseOrderRepository.js';
import { rowToPurchaseOrderApi } from './purchaseOrderService.js';
import { recordDomainMutation } from '../../../core/recordDomainMutation.js';
import { listPoBillingLines } from './purchaseOrderLineBillingService.js';

export async function getPurchaseOrderBillingContext(
  client: pg.PoolClient,
  tenantId: string,
  purchaseOrderId: string,
  excludeBillId?: string
) {
  const repo = new PurchaseOrderRepository(tenantId);
  const po = await repo.getById(client, purchaseOrderId);
  if (!po) return null;

  const billedAmount = await repo.sumBilledAmount(client, purchaseOrderId, excludeBillId);
  const receivedAmount = Number(po.received_amount ?? 0);
  const totalAmount = Number(po.total_amount);
  const billableRemaining = Math.max(0, receivedAmount - billedAmount);
  const poRemaining = Math.max(0, totalAmount - billedAmount);

  const grnRows = await client.query<{
    id: string;
    grn_number: string;
    status: string;
    received_date: Date;
    line_total: string;
  }>(
    `SELECT gr.id, gr.grn_number, gr.status, gr.received_date,
            COALESCE(SUM(gl.line_total), 0)::text AS line_total
     FROM goods_receipts gr
     LEFT JOIN goods_receipt_lines gl ON gl.goods_receipt_id = gr.id AND gl.tenant_id = gr.tenant_id
     WHERE gr.tenant_id = $1 AND gr.purchase_order_id = $2
       AND gr.deleted_at IS NULL AND gr.status IN ('Posted', 'Closed')
     GROUP BY gr.id, gr.grn_number, gr.status, gr.received_date
     ORDER BY gr.received_date DESC`,
    [tenantId, purchaseOrderId]
  );

  const lines = await listPoBillingLines(client, tenantId, purchaseOrderId, excludeBillId);

  return {
    purchaseOrderId: po.id,
    poNumber: po.po_number,
    vendorId: po.vendor_id,
    projectId: po.project_id ?? undefined,
    status: po.status,
    totalAmount,
    receivedAmount,
    billedAmount,
    billableRemaining,
    poRemainingAmount: poRemaining,
    postedGoodsReceipts: grnRows.rows.map((r) => ({
      id: r.id,
      grnNumber: r.grn_number,
      status: r.status,
      receivedDate: r.received_date,
      lineTotal: Number(r.line_total),
    })),
    lines,
  };
}

export async function assertBillAllowedAgainstPurchaseOrder(
  client: pg.PoolClient,
  tenantId: string,
  input: {
    purchaseOrderId: string | null | undefined;
    billAmount: number;
    billVendorId: string | null | undefined;
    excludeBillId?: string;
  }
): Promise<void> {
  const poId = input.purchaseOrderId?.trim();
  if (!poId) return;

  const repo = new PurchaseOrderRepository(tenantId);
  const po = await repo.getByIdForUpdate(client, poId);
  if (!po) throw new Error('Linked purchase order not found.');

  const billedAmount = await repo.sumBilledAmount(client, poId, input.excludeBillId);
  const validation = validateBillAgainstPurchaseOrderWithReceipt({
    poStatus: po.status,
    poTotalAmount: Number(po.total_amount),
    poBilledAmount: billedAmount,
    poReceivedAmount: Number(po.received_amount ?? 0),
    billAmount: input.billAmount,
    poVendorId: po.vendor_id,
    billVendorId: String(input.billVendorId ?? ''),
    excludeBillAmount: input.excludeBillId ? input.billAmount : undefined,
    requireReceipt: true,
  });
  if (!validation.ok) throw new Error(validation.message);
}

export async function recalculatePurchaseOrderBilling(
  client: pg.PoolClient,
  tenantId: string,
  purchaseOrderId: string,
  actorUserId?: string | null
): Promise<void> {
  const repo = new PurchaseOrderRepository(tenantId);
  const po = await repo.getByIdForUpdate(client, purchaseOrderId);
  if (!po) return;
  if (po.status === 'Cancelled' || po.status === 'Draft' || po.status === 'Submitted') return;

  const billedAmount = await repo.sumBilledAmount(client, purchaseOrderId);
  const totalAmount = Number(po.total_amount);
  const nextStatus = computePoBillingStatus(totalAmount, billedAmount);

  if (nextStatus === po.status && billedAmount === Number(po.billed_amount)) return;

  const updated = await repo.updateBillingAggregate(client, purchaseOrderId, billedAmount, nextStatus);
  if (!updated) return;

  await recordDomainMutation(client, {
    tenantId,
    userId: actorUserId ?? null,
    module: 'purchase_orders',
    entityType: 'purchase_order',
    entityId: purchaseOrderId,
    action: 'update',
    auditAction: nextStatus === 'Fully Billed' ? 'closed' : 'updated',
    summary: `Purchase order ${po.po_number} billing updated (${nextStatus})`,
    oldValue: rowToPurchaseOrderApi(po),
    newValue: rowToPurchaseOrderApi(updated),
    version: updated.version,
  });
}
