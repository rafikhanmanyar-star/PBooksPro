import type pg from 'pg';
import { randomUUID } from 'crypto';
import { formatPgDateToYyyyMmDd, parseApiDateToYyyyMmDd } from '../../../utils/dateOnly.js';
import { recordDomainMutation } from '../../../core/recordDomainMutation.js';
import { checkEntityLwwConflict } from '../../../core/entityMutation.js';
import {
  GRN_POSTABLE_PO_STATUSES,
  computeLineTotal,
  computeRemainingQty,
  validateReceiptLineQty,
} from '../../../procurement/goodsReceiptCore.js';
import {
  PurchaseOrderLineRepository,
  PurchaseOrderRepository,
} from '../../purchase-orders/repositories/PurchaseOrderRepository.js';
import { rowToPurchaseOrderApi } from '../../purchase-orders/services/purchaseOrderService.js';
import {
  GoodsReceiptLineRepository,
  GoodsReceiptRepository,
  type GoodsReceiptLineRow,
  type GoodsReceiptLineWrite,
  type GoodsReceiptRow,
} from '../repositories/GoodsReceiptRepository.js';

function lineToApi(row: GoodsReceiptLineRow) {
  const ordered = Number(row.ordered_qty);
  const received = Number(row.received_qty);
  return {
    id: row.id,
    purchaseOrderLineId: row.purchase_order_line_id ?? undefined,
    itemId: row.item_id ?? undefined,
    itemName: row.item_name ?? undefined,
    description: row.description ?? undefined,
    orderedQty: ordered,
    receivedQty: received,
    remainingQty: computeRemainingQty(ordered, received),
    unitRate: Number(row.unit_rate),
    lineTotal: Number(row.line_total),
    sortOrder: row.sort_order,
  };
}

export function rowToGoodsReceiptApi(row: GoodsReceiptRow, lines: GoodsReceiptLineRow[] = []) {
  return {
    id: row.id,
    grnNumber: row.grn_number,
    vendorId: row.vendor_id,
    projectId: row.project_id ?? undefined,
    purchaseOrderId: row.purchase_order_id,
    receivedDate: formatPgDateToYyyyMmDd(row.received_date) ?? '',
    status: row.status,
    notes: row.notes ?? undefined,
    lines: lines.map(lineToApi),
    postedAt: row.posted_at?.toISOString(),
    postedBy: row.posted_by ?? undefined,
    closedAt: row.closed_at?.toISOString(),
    closedBy: row.closed_by ?? undefined,
    version: row.version,
    tenantId: row.tenant_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function newGrnId(): string {
  return `grn_${randomUUID().replace(/-/g, '')}`;
}

function newGrnLineId(): string {
  return `grn_line_${randomUUID().replace(/-/g, '')}`;
}

function resolveGrnId(body: Record<string, unknown>): string {
  const raw = body.id ?? body.goods_receipt_id;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return newGrnId();
}

function parseLines(body: Record<string, unknown>): GoodsReceiptLineWrite[] {
  const raw = body.lines ?? body.items;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === 'object')
    .map((item, idx) => {
      const o = item as Record<string, unknown>;
      const receivedQty = Number(o.receivedQty ?? o.received_qty ?? 0);
      const unitRate = Number(o.unitRate ?? o.unit_rate ?? 0);
      const orderedQty = Number(o.orderedQty ?? o.ordered_qty ?? 0);
      return {
        // Always assign server-side IDs — client placeholders like grn_line_0 collide globally.
        id: newGrnLineId(),
        purchase_order_line_id: (o.purchaseOrderLineId ?? o.purchase_order_line_id) as string | null,
        item_id: (o.itemId ?? o.item_id) as string | null,
        item_name: (o.itemName ?? o.item_name) as string | null,
        description: (o.description as string) ?? null,
        ordered_qty: orderedQty,
        received_qty: receivedQty,
        unit_rate: unitRate,
        line_total: computeLineTotal(receivedQty, unitRate),
        sort_order: idx,
      };
    });
}

async function loadGrnApi(client: pg.PoolClient, tenantId: string, id: string) {
  const repo = new GoodsReceiptRepository(tenantId);
  const row = await repo.getById(client, id);
  if (!row) return null;
  const lines = await new GoodsReceiptLineRepository(tenantId).listForGrn(client, id);
  return rowToGoodsReceiptApi(row, lines);
}

export async function listGoodsReceipts(
  client: pg.PoolClient,
  tenantId: string,
  filters?: {
    status?: string;
    vendorId?: string;
    projectId?: string;
    purchaseOrderId?: string;
  }
) {
  const repo = new GoodsReceiptRepository(tenantId);
  const rows = await repo.list(client, filters);
  const out = [];
  const lineRepo = new GoodsReceiptLineRepository(tenantId);
  for (const row of rows) {
    const lines = await lineRepo.listForGrn(client, row.id);
    out.push(rowToGoodsReceiptApi(row, lines));
  }
  return out;
}

export async function getGoodsReceiptById(client: pg.PoolClient, tenantId: string, id: string) {
  return loadGrnApi(client, tenantId, id);
}

async function validateGrnAgainstPo(
  client: pg.PoolClient,
  tenantId: string,
  poId: string,
  vendorId: string,
  lines: GoodsReceiptLineWrite[],
  excludeGrnId?: string
) {
  const poRepo = new PurchaseOrderRepository(tenantId);
  const po = await poRepo.getByIdForUpdate(client, poId);
  if (!po) throw new Error('Purchase order not found.');
  if (!GRN_POSTABLE_PO_STATUSES.includes(po.status as (typeof GRN_POSTABLE_PO_STATUSES)[number])) {
    throw new Error(`Purchase order must be approved before receiving goods (status: ${po.status}).`);
  }
  if (po.vendor_id !== vendorId) {
    throw new Error('GRN vendor must match the purchase order vendor.');
  }

  const lineRepo = new PurchaseOrderLineRepository(tenantId);
  for (const line of lines) {
    if (line.received_qty <= 0) continue;
    if (!line.purchase_order_line_id) {
      throw new Error('Each receipt line must reference a purchase order line.');
    }
    const poLine = await lineRepo.getById(client, line.purchase_order_line_id);
    if (!poLine || poLine.purchase_order_id !== poId) {
      throw new Error('Invalid purchase order line reference.');
    }

    let alreadyReceived: number;
    if (excludeGrnId) {
      const priorPosted = await client.query<{ qty: string }>(
        `SELECT COALESCE(SUM(gl.received_qty), 0)::text AS qty
         FROM goods_receipt_lines gl
         JOIN goods_receipts gr ON gr.id = gl.goods_receipt_id
         WHERE gl.tenant_id = $1 AND gl.purchase_order_line_id = $2
           AND gr.id <> $3 AND gr.status IN ('Posted', 'Closed') AND gr.deleted_at IS NULL`,
        [tenantId, line.purchase_order_line_id, excludeGrnId]
      );
      alreadyReceived = Number(priorPosted.rows[0]?.qty ?? 0);
    } else {
      alreadyReceived = Number(poLine.received_qty);
    }

    const draftOther = await client.query<{ qty: string }>(
      `SELECT COALESCE(SUM(gl.received_qty), 0)::text AS qty
       FROM goods_receipt_lines gl
       JOIN goods_receipts gr ON gr.id = gl.goods_receipt_id
       WHERE gl.tenant_id = $1 AND gl.purchase_order_line_id = $2
         AND gr.status = 'Draft' AND gr.deleted_at IS NULL
         ${excludeGrnId ? 'AND gr.id <> $3' : ''}`,
      excludeGrnId
        ? [tenantId, line.purchase_order_line_id, excludeGrnId]
        : [tenantId, line.purchase_order_line_id]
    );
    alreadyReceived += Number(draftOther.rows[0]?.qty ?? 0);

    const validation = validateReceiptLineQty({
      orderedQty: Number(poLine.quantity),
      alreadyReceivedQty: alreadyReceived,
      receiptQty: line.received_qty,
      itemLabel: poLine.item_name ?? poLine.description ?? undefined,
    });
    if (!validation.ok) throw new Error(validation.message);
  }
}

export async function upsertGoodsReceipt(
  client: pg.PoolClient,
  tenantId: string,
  body: Record<string, unknown>,
  userId: string | null
) {
  const id = resolveGrnId(body);
  const purchaseOrderId = String(body.purchaseOrderId ?? body.purchase_order_id ?? '');
  const vendorId = String(body.vendorId ?? body.vendor_id ?? '');
  if (!purchaseOrderId) throw new Error('Purchase order is required.');
  if (!vendorId) throw new Error('Vendor is required.');

  const lines = parseLines(body);
  if (lines.length === 0) throw new Error('At least one receipt line is required.');

  const expectedVersion = typeof body.version === 'number' ? body.version : undefined;
  const repo = new GoodsReceiptRepository(tenantId);
  const existing = await repo.getByIdForUpdate(client, id);

  if (existing && existing.status !== 'Draft') {
    throw new Error('Only draft goods receipts can be edited.');
  }

  if (expectedVersion != null && existing) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'goods_receipts',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { conflict: true as const, serverVersion: existing.version };
  }

  await validateGrnAgainstPo(client, tenantId, purchaseOrderId, vendorId, lines, existing?.id);

  const receivedDate = parseApiDateToYyyyMmDd(body.receivedDate ?? body.received_date) ?? new Date().toISOString().slice(0, 10);
  const grnNumber =
    String(body.grnNumber ?? body.grn_number ?? '') ||
    (existing?.grn_number ?? (await repo.getNextGrnNumber(client)));

  const fields = {
    grn_number: grnNumber,
    vendor_id: vendorId,
    project_id: (body.projectId ?? body.project_id) as string | null,
    purchase_order_id: purchaseOrderId,
    received_date: receivedDate,
    status: 'Draft',
    notes: body.notes != null ? String(body.notes) : null,
  };

  const row = existing
    ? await repo.updateActive(client, id, fields, userId)
    : await repo.insertGoodsReceipt(client, id, fields, userId);
  if (!row) throw new Error('Failed to save goods receipt.');

  await new GoodsReceiptLineRepository(tenantId).replaceForGrn(client, id, lines);

  const api = (await loadGrnApi(client, tenantId, id))!;
  await recordDomainMutation(client, {
    tenantId,
    userId,
    module: 'goods_receipts',
    entityType: 'goods_receipt',
    entityId: id,
    action: existing ? 'update' : 'create',
    auditAction: existing ? 'updated' : 'created',
    summary: `Goods receipt ${row.grn_number} ${existing ? 'updated' : 'created'}`,
    oldValue: existing ? rowToGoodsReceiptApi(existing) : undefined,
    newValue: api,
    version: row.version,
  });

  return { conflict: false as const, row, api };
}

export async function postGoodsReceipt(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion: number | undefined,
  userId: string | null
) {
  const repo = new GoodsReceiptRepository(tenantId);
  const row = await repo.getByIdForUpdate(client, id);
  if (!row) throw new Error('Goods receipt not found.');
  if (row.status !== 'Draft') throw new Error('Only draft goods receipts can be posted.');

  if (expectedVersion != null) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'goods_receipts',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { conflict: true as const, serverVersion: row.version };
  }

  const lineRepo = new GoodsReceiptLineRepository(tenantId);
  const lines = await lineRepo.listForGrn(client, id);
  const lineWrites: GoodsReceiptLineWrite[] = lines.map((l, idx) => ({
    id: l.id,
    purchase_order_line_id: l.purchase_order_line_id,
    item_id: l.item_id,
    item_name: l.item_name,
    description: l.description,
    ordered_qty: Number(l.ordered_qty),
    received_qty: Number(l.received_qty),
    unit_rate: Number(l.unit_rate),
    line_total: Number(l.line_total),
    sort_order: idx,
  }));

  await validateGrnAgainstPo(
    client,
    tenantId,
    row.purchase_order_id,
    row.vendor_id,
    lineWrites,
    id
  );

  const poLineRepo = new PurchaseOrderLineRepository(tenantId);
  for (const line of lineWrites) {
    if (!line.purchase_order_line_id || line.received_qty <= 0) continue;
    await poLineRepo.addReceivedQty(client, line.purchase_order_line_id, line.received_qty);
  }

  const poRepo = new PurchaseOrderRepository(tenantId);
  const receivedAmount = await repo.sumPostedReceivedAmountForPo(client, row.purchase_order_id);
  const draftTotal = lineWrites.reduce((s, l) => s + l.line_total, 0);
  await poRepo.updateReceivedAmount(client, row.purchase_order_id, receivedAmount + draftTotal);

  const posted = await repo.markPosted(client, id, userId);
  if (!posted) throw new Error('Failed to post goods receipt.');

  const api = (await loadGrnApi(client, tenantId, id))!;
  const po = await poRepo.getById(client, row.purchase_order_id);

  await recordDomainMutation(client, {
    tenantId,
    userId,
    module: 'goods_receipts',
    entityType: 'goods_receipt',
    entityId: id,
    action: 'update',
    auditAction: 'posted',
    summary: `Goods receipt ${row.grn_number} posted`,
    oldValue: rowToGoodsReceiptApi(row, lines),
    newValue: api,
    version: posted.version,
  });

  if (po) {
    await recordDomainMutation(client, {
      tenantId,
      userId,
      module: 'purchase_orders',
      entityType: 'purchase_order',
      entityId: po.id,
      action: 'update',
      auditAction: 'updated',
      summary: `PO ${po.po_number} received amount updated`,
      newValue: rowToPurchaseOrderApi(po),
      version: po.version,
    });
  }

  return { conflict: false as const, row: posted, api, purchaseOrder: po };
}

export async function closeGoodsReceipt(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  expectedVersion: number | undefined,
  userId: string | null
) {
  const repo = new GoodsReceiptRepository(tenantId);
  const row = await repo.getByIdForUpdate(client, id);
  if (!row) throw new Error('Goods receipt not found.');
  if (row.status !== 'Posted') throw new Error('Only posted goods receipts can be closed.');

  if (expectedVersion != null) {
    const lww = await checkEntityLwwConflict(client, {
      tenantId,
      table: 'goods_receipts',
      entityId: id,
      clientVersion: expectedVersion,
    });
    if (lww.conflict) return { conflict: true as const, serverVersion: row.version };
  }

  const closed = await repo.markClosed(client, id, userId);
  if (!closed) throw new Error('Failed to close goods receipt.');

  const lines = await new GoodsReceiptLineRepository(tenantId).listForGrn(client, id);
  const api = rowToGoodsReceiptApi(closed, lines);

  await recordDomainMutation(client, {
    tenantId,
    userId,
    module: 'goods_receipts',
    entityType: 'goods_receipt',
    entityId: id,
    action: 'update',
    auditAction: 'closed',
    summary: `Goods receipt ${row.grn_number} closed`,
    oldValue: rowToGoodsReceiptApi(row, lines),
    newValue: api,
    version: closed.version,
  });

  return { conflict: false as const, row: closed, api };
}

export async function softDeleteGoodsReceipt(
  client: pg.PoolClient,
  tenantId: string,
  id: string,
  userId: string | null
) {
  const repo = new GoodsReceiptRepository(tenantId);
  const row = await repo.getById(client, id);
  if (!row) return false;
  if (row.status !== 'Draft') throw new Error('Only draft goods receipts can be deleted.');
  const ok = await repo.markDeleted(client, id);
  if (!ok) return false;

  await recordDomainMutation(client, {
    tenantId,
    userId,
    module: 'goods_receipts',
    entityType: 'goods_receipt',
    entityId: id,
    action: 'delete',
    auditAction: 'deleted',
    summary: `Goods receipt ${row.grn_number} deleted`,
    oldValue: rowToGoodsReceiptApi(row),
  });
  return true;
}

export async function getPoReceiptContext(
  client: pg.PoolClient,
  tenantId: string,
  purchaseOrderId: string
) {
  const poRepo = new PurchaseOrderRepository(tenantId);
  const po = await poRepo.getById(client, purchaseOrderId);
  if (!po) return null;

  const lineRepo = new PurchaseOrderLineRepository(tenantId);
  const lines = await lineRepo.listForPo(client, purchaseOrderId);

  return {
    purchaseOrderId: po.id,
    poNumber: po.po_number,
    vendorId: po.vendor_id,
    projectId: po.project_id,
    status: po.status,
    lines: lines.map((l) => {
      const ordered = Number(l.quantity);
      const received = Number(l.received_qty);
      return {
        id: l.id,
        itemId: l.item_id ?? undefined,
        itemName: l.item_name ?? undefined,
        description: l.description ?? undefined,
        orderedQty: ordered,
        receivedQty: received,
        remainingQty: computeRemainingQty(ordered, received),
        unitRate: Number(l.unit_rate),
      };
    }),
  };
}
