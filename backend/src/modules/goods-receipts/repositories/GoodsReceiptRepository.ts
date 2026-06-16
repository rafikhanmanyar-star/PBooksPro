import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';

export type GoodsReceiptRow = {
  id: string;
  tenant_id: string;
  grn_number: string;
  vendor_id: string;
  project_id: string | null;
  purchase_order_id: string;
  received_date: Date;
  status: string;
  notes: string | null;
  posted_at: Date | null;
  posted_by: string | null;
  closed_at: Date | null;
  closed_by: string | null;
  created_by: string | null;
  user_id: string | null;
  version: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type GoodsReceiptLineRow = {
  id: string;
  tenant_id: string;
  goods_receipt_id: string;
  purchase_order_line_id: string | null;
  item_id: string | null;
  item_name: string | null;
  description: string | null;
  ordered_qty: string;
  received_qty: string;
  unit_rate: string;
  line_total: string;
  sort_order: number;
};

const GRN_COLUMNS = `id, tenant_id, grn_number, vendor_id, project_id, purchase_order_id,
  received_date, status, notes, posted_at, posted_by, closed_at, closed_by,
  created_by, user_id, version, deleted_at, created_at, updated_at`;

export type GoodsReceiptWriteFields = {
  grn_number: string;
  vendor_id: string;
  project_id: string | null;
  purchase_order_id: string;
  received_date: string;
  status: string;
  notes: string | null;
};

export type GoodsReceiptLineWrite = {
  id: string;
  purchase_order_line_id: string | null;
  item_id: string | null;
  item_name: string | null;
  description: string | null;
  ordered_qty: number;
  received_qty: number;
  unit_rate: number;
  line_total: number;
  sort_order: number;
};

export type GoodsReceiptListFilters = {
  status?: string;
  vendorId?: string;
  projectId?: string;
  purchaseOrderId?: string;
};

export class GoodsReceiptRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<GoodsReceiptRow | null> {
    const r = await client.query<GoodsReceiptRow>(
      `SELECT ${GRN_COLUMNS} FROM goods_receipts
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async getByIdForUpdate(client: pg.PoolClient, id: string): Promise<GoodsReceiptRow | null> {
    const r = await client.query<GoodsReceiptRow>(
      `SELECT ${GRN_COLUMNS} FROM goods_receipts
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       FOR UPDATE`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async list(client: pg.PoolClient, filters?: GoodsReceiptListFilters): Promise<GoodsReceiptRow[]> {
    const clauses = ['tenant_id = $1', 'deleted_at IS NULL'];
    const params: unknown[] = [this.tenantId];
    let idx = 2;
    if (filters?.status) {
      clauses.push(`status = $${idx++}`);
      params.push(filters.status);
    }
    if (filters?.vendorId) {
      clauses.push(`vendor_id = $${idx++}`);
      params.push(filters.vendorId);
    }
    if (filters?.projectId) {
      clauses.push(`project_id = $${idx++}`);
      params.push(filters.projectId);
    }
    if (filters?.purchaseOrderId) {
      clauses.push(`purchase_order_id = $${idx++}`);
      params.push(filters.purchaseOrderId);
    }
    const r = await client.query<GoodsReceiptRow>(
      `SELECT ${GRN_COLUMNS} FROM goods_receipts
       WHERE ${clauses.join(' AND ')}
       ORDER BY received_date DESC, created_at DESC`,
      params
    );
    return r.rows;
  }

  async getNextGrnNumber(client: pg.PoolClient): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `GRN-${year}-`;
    const r = await client.query<{ grn_number: string }>(
      `SELECT grn_number FROM goods_receipts
       WHERE tenant_id = $1 AND grn_number LIKE $2
       ORDER BY grn_number DESC LIMIT 1`,
      [this.tenantId, `${prefix}%`]
    );
    const last = r.rows[0]?.grn_number;
    if (!last) return `${prefix}0001`;
    const seq = Number(last.slice(prefix.length));
    const next = Number.isFinite(seq) ? seq + 1 : 1;
    return `${prefix}${String(next).padStart(4, '0')}`;
  }

  async insertGoodsReceipt(
    client: pg.PoolClient,
    id: string,
    fields: GoodsReceiptWriteFields,
    userId: string | null
  ): Promise<GoodsReceiptRow> {
    const r = await client.query<GoodsReceiptRow>(
      `INSERT INTO goods_receipts (
         id, tenant_id, grn_number, vendor_id, project_id, purchase_order_id,
         received_date, status, notes, created_by, user_id, version, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, $11, 1, NOW(), NOW())
       RETURNING ${GRN_COLUMNS}`,
      [
        id,
        this.tenantId,
        fields.grn_number,
        fields.vendor_id,
        fields.project_id,
        fields.purchase_order_id,
        fields.received_date,
        fields.status,
        fields.notes,
        userId,
        userId,
      ]
    );
    return r.rows[0]!;
  }

  async updateActive(
    client: pg.PoolClient,
    id: string,
    fields: GoodsReceiptWriteFields,
    userId: string | null
  ): Promise<GoodsReceiptRow | null> {
    const r = await client.query<GoodsReceiptRow>(
      `UPDATE goods_receipts SET
         grn_number = $3, vendor_id = $4, project_id = $5, purchase_order_id = $6,
         received_date = $7::date, status = $8, notes = $9,
         user_id = COALESCE($10, user_id), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND status = 'Draft'
       RETURNING ${GRN_COLUMNS}`,
      [
        id,
        this.tenantId,
        fields.grn_number,
        fields.vendor_id,
        fields.project_id,
        fields.purchase_order_id,
        fields.received_date,
        fields.status,
        fields.notes,
        userId,
      ]
    );
    return r.rows[0] ?? null;
  }

  async markPosted(
    client: pg.PoolClient,
    id: string,
    userId: string | null
  ): Promise<GoodsReceiptRow | null> {
    const r = await client.query<GoodsReceiptRow>(
      `UPDATE goods_receipts SET
         status = 'Posted', posted_at = NOW(), posted_by = $3,
         version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND status = 'Draft'
       RETURNING ${GRN_COLUMNS}`,
      [id, this.tenantId, userId]
    );
    return r.rows[0] ?? null;
  }

  async markClosed(
    client: pg.PoolClient,
    id: string,
    userId: string | null
  ): Promise<GoodsReceiptRow | null> {
    const r = await client.query<GoodsReceiptRow>(
      `UPDATE goods_receipts SET
         status = 'Closed', closed_at = NOW(), closed_by = $3,
         version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND status = 'Posted'
       RETURNING ${GRN_COLUMNS}`,
      [id, this.tenantId, userId]
    );
    return r.rows[0] ?? null;
  }

  async markDeleted(client: pg.PoolClient, id: string): Promise<boolean> {
    const r = await client.query(
      `UPDATE goods_receipts SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async sumPostedReceivedAmountForPo(client: pg.PoolClient, poId: string): Promise<number> {
    const r = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(gl.line_total), 0)::text AS total
       FROM goods_receipt_lines gl
       JOIN goods_receipts gr ON gr.id = gl.goods_receipt_id AND gr.tenant_id = gl.tenant_id
       WHERE gl.tenant_id = $1 AND gr.purchase_order_id = $2
         AND gr.deleted_at IS NULL AND gr.status IN ('Posted', 'Closed')`,
      [this.tenantId, poId]
    );
    return Number(r.rows[0]?.total ?? 0);
  }
}

export class GoodsReceiptLineRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async listForGrn(client: pg.PoolClient, grnId: string): Promise<GoodsReceiptLineRow[]> {
    const r = await client.query<GoodsReceiptLineRow>(
      `SELECT id, tenant_id, goods_receipt_id, purchase_order_line_id, item_id, item_name,
              description, ordered_qty::text, received_qty::text, unit_rate::text,
              line_total::text, sort_order
       FROM goods_receipt_lines
       WHERE tenant_id = $1 AND goods_receipt_id = $2
       ORDER BY sort_order ASC`,
      [this.tenantId, grnId]
    );
    return r.rows;
  }

  async replaceForGrn(client: pg.PoolClient, grnId: string, lines: GoodsReceiptLineWrite[]): Promise<void> {
    await client.query(
      `DELETE FROM goods_receipt_lines WHERE tenant_id = $1 AND goods_receipt_id = $2`,
      [this.tenantId, grnId]
    );
    for (const line of lines) {
      await client.query(
        `INSERT INTO goods_receipt_lines (
           id, tenant_id, goods_receipt_id, purchase_order_line_id, item_id, item_name,
           description, ordered_qty, received_qty, unit_rate, line_total, sort_order
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          line.id,
          this.tenantId,
          grnId,
          line.purchase_order_line_id,
          line.item_id,
          line.item_name,
          line.description,
          line.ordered_qty,
          line.received_qty,
          line.unit_rate,
          line.line_total,
          line.sort_order,
        ]
      );
    }
  }
}
