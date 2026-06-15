import type pg from 'pg';
import {
  computePoBillingStatus,
  validateBillAgainstPurchaseOrderWithReceipt,
} from '../../../procurement/purchaseOrderBillingCore.js';
import {
  PurchaseOrderRepository,
} from '../repositories/PurchaseOrderRepository.js';
import { rowToPurchaseOrderApi } from './purchaseOrderService.js';
import { recordDomainMutation } from '../../../core/recordDomainMutation.js';

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
