import type pg from 'pg';
import { randomUUID } from 'crypto';
import {
  computeBillableLineQty,
  sumBillPoLineTotals,
  validateBillLineQty,
} from '../../../procurement/purchaseOrderBillingCore.js';
import { computeLineTotal } from '../../../procurement/goodsReceiptCore.js';
import { PurchaseOrderLineRepository } from '../repositories/PurchaseOrderRepository.js';
import {
  BillPoLineRepository,
  type BillPoLineRow,
  type BillPoLineWrite,
} from '../repositories/BillPoLineRepository.js';

export type BillPoLineInput = {
  id?: string;
  purchaseOrderLineId: string;
  goodsReceiptLineId?: string | null;
  billedQty: number;
  unitRate: number;
  lineTotal?: number;
};

export function rowToBillPoLineApi(row: BillPoLineRow) {
  return {
    id: row.id,
    purchaseOrderLineId: row.purchase_order_line_id,
    goodsReceiptLineId: row.goods_receipt_line_id ?? undefined,
    billedQty: Number(row.billed_qty),
    unitRate: Number(row.unit_rate),
    lineTotal: Number(row.line_total),
    sortOrder: row.sort_order,
  };
}

function parseBillPoLines(body: Record<string, unknown>): BillPoLineInput[] | null {
  const raw = body.poBillLines ?? body.po_bill_lines ?? body.purchaseOrderBillLines;
  if (raw == null) return null;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === 'object')
    .map((item, idx) => {
      const o = item as Record<string, unknown>;
      const billedQty = Number(o.billedQty ?? o.billed_qty ?? 0);
      const unitRate = Number(o.unitRate ?? o.unit_rate ?? 0);
      const lineTotalRaw = o.lineTotal ?? o.line_total;
      return {
        id: String(o.id ?? `bpl_${idx}_${randomUUID().slice(0, 8)}`),
        purchaseOrderLineId: String(o.purchaseOrderLineId ?? o.purchase_order_line_id ?? ''),
        goodsReceiptLineId: (o.goodsReceiptLineId ?? o.goods_receipt_line_id) as string | null | undefined,
        billedQty,
        unitRate,
        lineTotal:
          lineTotalRaw != null
            ? Number(lineTotalRaw)
            : computeLineTotal(billedQty, unitRate),
      };
    })
    .filter((l) => l.purchaseOrderLineId && l.billedQty > 0);
}

/** Sum billed qty on PO lines from approved bills only. */
export async function recalculatePoLineBilledQty(
  client: pg.PoolClient,
  tenantId: string,
  purchaseOrderId: string
): Promise<void> {
  await client.query(
    `UPDATE purchase_order_lines pol
     SET billed_qty = COALESCE(sub.qty, 0)
     FROM (
       SELECT bpl.purchase_order_line_id, SUM(bpl.billed_qty)::numeric AS qty
       FROM bill_po_lines bpl
       JOIN bills b ON b.id = bpl.bill_id AND b.tenant_id = bpl.tenant_id
       WHERE bpl.tenant_id = $1
         AND b.purchase_order_id = $2
         AND b.deleted_at IS NULL
         AND COALESCE(b.approval_status, 'Approved') = 'Approved'
       GROUP BY bpl.purchase_order_line_id
     ) sub
     WHERE pol.tenant_id = $1
       AND pol.purchase_order_id = $2
       AND pol.id = sub.purchase_order_line_id`,
    [tenantId, purchaseOrderId]
  );
  await client.query(
    `UPDATE purchase_order_lines
     SET billed_qty = 0
     WHERE tenant_id = $1 AND purchase_order_id = $2
       AND id NOT IN (
         SELECT bpl.purchase_order_line_id
         FROM bill_po_lines bpl
         JOIN bills b ON b.id = bpl.bill_id AND b.tenant_id = bpl.tenant_id
         WHERE bpl.tenant_id = $1 AND b.purchase_order_id = $2
           AND b.deleted_at IS NULL
           AND COALESCE(b.approval_status, 'Approved') = 'Approved'
       )`,
    [tenantId, purchaseOrderId]
  );
}

async function sumBilledQtyForPoLine(
  client: pg.PoolClient,
  tenantId: string,
  purchaseOrderLineId: string,
  excludeBillId?: string
): Promise<number> {
  const params: unknown[] = [tenantId, purchaseOrderLineId];
  let excludeClause = '';
  if (excludeBillId) {
    params.push(excludeBillId);
    excludeClause = ` AND b.id <> $3`;
  }
  const r = await client.query<{ qty: string }>(
    `SELECT COALESCE(SUM(bpl.billed_qty), 0)::text AS qty
     FROM bill_po_lines bpl
     JOIN bills b ON b.id = bpl.bill_id AND b.tenant_id = bpl.tenant_id
     WHERE bpl.tenant_id = $1 AND bpl.purchase_order_line_id = $2
       AND b.deleted_at IS NULL
       AND COALESCE(b.approval_status, 'Approved') = 'Approved'${excludeClause}`,
    params
  );
  return Number(r.rows[0]?.qty ?? 0);
}

export async function syncBillPoLines(
  client: pg.PoolClient,
  tenantId: string,
  billId: string,
  purchaseOrderId: string,
  body: Record<string, unknown>,
  excludeBillId?: string
): Promise<BillPoLineRow[]> {
  const parsed = parseBillPoLines(body);
  if (parsed === null) {
    return new BillPoLineRepository(tenantId).listForBill(client, billId);
  }

  if (parsed.length === 0) {
    await new BillPoLineRepository(tenantId).replaceForBill(client, billId, []);
    await recalculatePoLineBilledQty(client, tenantId, purchaseOrderId);
    return [];
  }

  const lineRepo = new PurchaseOrderLineRepository(tenantId);
  const writes: BillPoLineWrite[] = [];

  for (const [idx, line] of parsed.entries()) {
    const poLine = await lineRepo.getById(client, line.purchaseOrderLineId);
    if (!poLine || poLine.purchase_order_id !== purchaseOrderId) {
      throw new Error('Invalid purchase order line on bill.');
    }
    const alreadyBilled = await sumBilledQtyForPoLine(
      client,
      tenantId,
      line.purchaseOrderLineId,
      excludeBillId ?? billId
    );
    const validation = validateBillLineQty({
      orderedQty: Number(poLine.quantity),
      receivedQty: Number(poLine.received_qty),
      alreadyBilledQty: alreadyBilled,
      billQty: line.billedQty,
      itemLabel: poLine.item_name ?? poLine.description ?? undefined,
    });
    if (!validation.ok) throw new Error(validation.message);

    const lineTotal = line.lineTotal ?? computeLineTotal(line.billedQty, line.unitRate);
    writes.push({
      id: line.id ?? `bpl_${idx}_${randomUUID().slice(0, 8)}`,
      purchase_order_line_id: line.purchaseOrderLineId,
      goods_receipt_line_id: line.goodsReceiptLineId ?? null,
      billed_qty: line.billedQty,
      unit_rate: line.unitRate,
      line_total: lineTotal,
      sort_order: idx,
    });
  }

  const billAmount = Number(body.amount ?? body.billAmount ?? 0);
  const linesTotal = sumBillPoLineTotals(
    writes.map((w) => ({ lineTotal: w.line_total, billedQty: w.billed_qty, unitRate: w.unit_rate }))
  );
  if (Math.abs(linesTotal - billAmount) > 0.02) {
    throw new Error(
      `Bill amount (${billAmount.toFixed(2)}) must match PO line totals (${linesTotal.toFixed(2)}).`
    );
  }

  await new BillPoLineRepository(tenantId).replaceForBill(client, billId, writes);
  await recalculatePoLineBilledQty(client, tenantId, purchaseOrderId);
  return new BillPoLineRepository(tenantId).listForBill(client, billId);
}

export async function loadBillPoLinesForApi(
  client: pg.PoolClient,
  tenantId: string,
  billId: string
) {
  const rows = await new BillPoLineRepository(tenantId).listForBill(client, billId);
  return rows.map(rowToBillPoLineApi);
}

export async function listPoBillingLines(
  client: pg.PoolClient,
  tenantId: string,
  purchaseOrderId: string,
  excludeBillId?: string
) {
  const lineRepo = new PurchaseOrderLineRepository(tenantId);
  const rows = await lineRepo.listForPo(client, purchaseOrderId);
  const result = [];
  for (const row of rows) {
    const orderedQty = Number(row.quantity);
    const receivedQty = Number(row.received_qty);
    const billedQty = await sumBilledQtyForPoLine(client, tenantId, row.id, excludeBillId);
    const billableQty = computeBillableLineQty(receivedQty, billedQty, orderedQty);
    result.push({
      id: row.id,
      itemName: row.item_name ?? undefined,
      description: row.description ?? undefined,
      categoryId: row.category_id ?? undefined,
      orderedQty,
      receivedQty,
      billedQty,
      billableQty,
      unitRate: Number(row.unit_rate),
      lineTotal: Number(row.line_total),
    });
  }
  return result;
}
