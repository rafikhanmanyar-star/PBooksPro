import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import { buildIlikeSearchClause, resolveSortExpression } from '../../../services/search/index.js';
import type { SortDirection } from '../../../services/search/index.js';

export type PurchaseOrderRow = {
  id: string;
  tenant_id: string;
  po_number: string;
  vendor_id: string;
  quotation_id: string | null;
  comparison_session_id: string | null;
  project_id: string | null;
  building_id: string | null;
  department_id: string | null;
  total_amount: string;
  billed_amount: string;
  tax_amount: string;
  received_amount: string;
  status: string;
  items: unknown;
  payment_terms: string | null;
  delivery_period: string | null;
  warranty_period: string | null;
  description: string | null;
  issue_date: Date | null;
  required_date: Date | null;
  target_delivery_date: Date | null;
  currency: string | null;
  created_by: string | null;
  user_id: string | null;
  submitted_at: Date | null;
  submitted_by: string | null;
  approved_at: Date | null;
  approved_by: string | null;
  cancelled_at: Date | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  closed_at: Date | null;
  version: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

const PO_COLUMNS = `id, tenant_id, po_number, vendor_id, quotation_id, comparison_session_id,
  project_id, building_id, department_id, total_amount::text, billed_amount::text, tax_amount::text,
  received_amount::text, status, items, payment_terms, delivery_period, warranty_period, description,
  issue_date, required_date, target_delivery_date, currency, created_by, user_id,
  submitted_at, submitted_by, approved_at, approved_by, cancelled_at, cancelled_by, cancel_reason,
  closed_at, version, deleted_at, created_at, updated_at`;

export type PurchaseOrderWriteFields = {
  po_number: string;
  vendor_id: string;
  quotation_id: string | null;
  comparison_session_id: string | null;
  project_id: string | null;
  building_id: string | null;
  department_id: string | null;
  total_amount: number;
  tax_amount: number;
  status: string;
  items_json: string;
  payment_terms: string | null;
  delivery_period: string | null;
  warranty_period: string | null;
  description: string | null;
  issue_date: string;
  required_date: string | null;
  target_delivery_date: string | null;
  currency: string;
};

function poFieldParams(fields: PurchaseOrderWriteFields): unknown[] {
  return [
    fields.po_number,
    fields.vendor_id,
    fields.quotation_id,
    fields.comparison_session_id,
    fields.project_id,
    fields.building_id,
    fields.department_id,
    fields.total_amount,
    fields.tax_amount,
    fields.status,
    fields.items_json,
    fields.payment_terms,
    fields.delivery_period,
    fields.warranty_period,
    fields.description,
    fields.issue_date,
    fields.required_date,
    fields.target_delivery_date,
    fields.currency,
  ];
}

export type PurchaseOrderListFilters = {
  status?: string;
  vendorId?: string;
  projectId?: string;
};

export class PurchaseOrderRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<PurchaseOrderRow | null> {
    const r = await client.query<PurchaseOrderRow>(
      `SELECT ${PO_COLUMNS}
       FROM purchase_orders
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async getByIdForUpdate(client: pg.PoolClient, id: string): Promise<PurchaseOrderRow | null> {
    const r = await client.query<PurchaseOrderRow>(
      `SELECT ${PO_COLUMNS}
       FROM purchase_orders
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       FOR UPDATE`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async list(client: pg.PoolClient, filters?: PurchaseOrderListFilters): Promise<PurchaseOrderRow[]> {
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
    const r = await client.query<PurchaseOrderRow>(
      `SELECT ${PO_COLUMNS}
       FROM purchase_orders
       WHERE ${clauses.join(' AND ')}
       ORDER BY issue_date DESC, created_at DESC`,
      params
    );
    return r.rows;
  }

  async listPage(
    client: pg.PoolClient,
    opts: {
      limit: number;
      offset: number;
      filters?: PurchaseOrderListFilters;
      search?: string;
      sortBy?: string;
      sortDir?: SortDirection;
    }
  ): Promise<{ rows: PurchaseOrderRow[]; total: number }> {
    const conditions: string[] = ['po.tenant_id = $1', 'po.deleted_at IS NULL'];
    const params: unknown[] = [this.tenantId];
    let paramIndex = 2;

    if (opts.filters?.status) {
      conditions.push(`po.status = $${paramIndex++}`);
      params.push(opts.filters.status);
    }
    if (opts.filters?.vendorId) {
      conditions.push(`po.vendor_id = $${paramIndex++}`);
      params.push(opts.filters.vendorId);
    }
    if (opts.filters?.projectId) {
      conditions.push(`po.project_id = $${paramIndex++}`);
      params.push(opts.filters.projectId);
    }

    const searchTerm = opts.search?.trim();
    if (searchTerm) {
      const pattern = `%${searchTerm}%`;
      params.push(pattern);
      const p = `$${paramIndex++}`;
      conditions.push(`(
        po.po_number ILIKE ${p} OR po.description ILIKE ${p}
        OR v.name ILIKE ${p} OR v.company_name ILIKE ${p}
        OR EXISTS (
          SELECT 1 FROM purchase_order_lines pol
          WHERE pol.purchase_order_id = po.id AND pol.tenant_id = po.tenant_id
            AND (pol.item_name ILIKE ${p} OR pol.description ILIKE ${p})
        )
      )`);
    }

    const whereClause = conditions.join(' AND ');
    const fromJoin = `FROM purchase_orders po
      LEFT JOIN vendors v ON v.id = po.vendor_id AND v.tenant_id = po.tenant_id`;
    const sortWhitelist: Record<string, string> = {
      poNumber: 'po.po_number',
      issueDate: 'po.issue_date',
      totalAmount: 'po.total_amount',
      status: 'po.status',
      vendorName: 'v.name',
    };
    const { orderClause } = resolveSortExpression(
      opts.sortBy,
      opts.sortDir ?? 'desc',
      sortWhitelist,
      'issueDate'
    );

    const countR = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count ${fromJoin} WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countR.rows[0]?.count ?? '0', 10);

    params.push(opts.limit, opts.offset);
    const limitIdx = paramIndex;
    const offsetIdx = paramIndex + 1;
    const selectCols = PO_COLUMNS.split(',').map((c) => `po.${c.trim()}`).join(', ');
    const r = await client.query<PurchaseOrderRow>(
      `SELECT ${selectCols} ${fromJoin} WHERE ${whereClause} ${orderClause}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );
    return { rows: r.rows, total };
  }

  async getNextPoNumber(client: pg.PoolClient): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PO-${year}-`;
    const r = await client.query<{ po_number: string }>(
      `SELECT po_number FROM purchase_orders
       WHERE tenant_id = $1 AND po_number LIKE $2
       ORDER BY po_number DESC LIMIT 1`,
      [this.tenantId, `${prefix}%`]
    );
    const last = r.rows[0]?.po_number;
    if (!last) return `${prefix}0001`;
    const seq = Number(last.slice(prefix.length));
    const next = Number.isFinite(seq) ? seq + 1 : 1;
    return `${prefix}${String(next).padStart(4, '0')}`;
  }

  async insertPurchaseOrder(
    client: pg.PoolClient,
    id: string,
    fields: PurchaseOrderWriteFields,
    userId: string | null
  ): Promise<PurchaseOrderRow> {
    const r = await client.query<PurchaseOrderRow>(
      `INSERT INTO purchase_orders (
         id, tenant_id, po_number, vendor_id, quotation_id, comparison_session_id,
         project_id, building_id, department_id, total_amount, billed_amount, tax_amount,
         status, items, payment_terms, delivery_period, warranty_period, description,
         issue_date, required_date, target_delivery_date, currency, created_by, user_id,
         version, deleted_at, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $11, $12, $13::jsonb,
               $14, $15, $16, $17, $18::date, $19::date, $20::date, $21, $22, $23,
               1, NULL, NOW(), NOW())
       RETURNING ${PO_COLUMNS}`,
      [id, this.tenantId, ...poFieldParams(fields), userId, userId]
    );
    return r.rows[0]!;
  }

  async updateActive(
    client: pg.PoolClient,
    id: string,
    fields: PurchaseOrderWriteFields,
    userId: string | null
  ): Promise<PurchaseOrderRow | null> {
    const r = await client.query<PurchaseOrderRow>(
      `UPDATE purchase_orders SET
         po_number = $3, vendor_id = $4, quotation_id = $5, comparison_session_id = $6,
         project_id = $7, building_id = $8, department_id = $9, total_amount = $10,
         tax_amount = $11, status = $12, items = $13::jsonb, payment_terms = $14,
         delivery_period = $15, warranty_period = $16, description = $17,
         issue_date = $18::date, required_date = $19::date, target_delivery_date = $20::date,
         currency = $21, user_id = COALESCE($22, user_id), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING ${PO_COLUMNS}`,
      [id, this.tenantId, ...poFieldParams(fields), userId]
    );
    return r.rows[0] ?? null;
  }

  async markDeleted(client: pg.PoolClient, id: string): Promise<boolean> {
    const r = await client.query(
      `UPDATE purchase_orders SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async sumBilledAmount(client: pg.PoolClient, poId: string, excludeBillId?: string): Promise<number> {
    const params: unknown[] = [this.tenantId, poId];
    let excludeClause = '';
    if (excludeBillId) {
      params.push(excludeBillId);
      excludeClause = ` AND id <> $3`;
    }
    const r = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total
       FROM bills
       WHERE tenant_id = $1 AND purchase_order_id = $2 AND deleted_at IS NULL
         AND COALESCE(approval_status, 'Approved') = 'Approved'${excludeClause}`,
      params
    );
    return Number(r.rows[0]?.total ?? 0);
  }

  async updateBillingAggregate(
    client: pg.PoolClient,
    id: string,
    billedAmount: number,
    status: string
  ): Promise<PurchaseOrderRow | null> {
    const r = await client.query<PurchaseOrderRow>(
      `UPDATE purchase_orders SET
         billed_amount = $3,
         status = $4::text,
         closed_at = CASE WHEN $4::text = 'Fully Billed' THEN NOW() ELSE closed_at END,
         version = version + 1,
         updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING ${PO_COLUMNS}`,
      [id, this.tenantId, billedAmount, status]
    );
    return r.rows[0] ?? null;
  }

  async setStatus(
    client: pg.PoolClient,
    id: string,
    patch: {
      status: string;
      submitted_at?: Date | null;
      submitted_by?: string | null;
      approved_at?: Date | null;
      approved_by?: string | null;
      cancelled_at?: Date | null;
      cancelled_by?: string | null;
      cancel_reason?: string | null;
      closed_at?: Date | null;
    }
  ): Promise<PurchaseOrderRow | null> {
    const r = await client.query<PurchaseOrderRow>(
      `UPDATE purchase_orders SET
         status = $3,
         submitted_at = COALESCE($4, submitted_at),
         submitted_by = COALESCE($5, submitted_by),
         approved_at = COALESCE($6, approved_at),
         approved_by = COALESCE($7, approved_by),
         cancelled_at = COALESCE($8, cancelled_at),
         cancelled_by = COALESCE($9, cancelled_by),
         cancel_reason = COALESCE($10, cancel_reason),
         closed_at = COALESCE($11, closed_at),
         version = version + 1,
         updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING ${PO_COLUMNS}`,
      [
        id,
        this.tenantId,
        patch.status,
        patch.submitted_at ?? null,
        patch.submitted_by ?? null,
        patch.approved_at ?? null,
        patch.approved_by ?? null,
        patch.cancelled_at ?? null,
        patch.cancelled_by ?? null,
        patch.cancel_reason ?? null,
        patch.closed_at ?? null,
      ]
    );
    return r.rows[0] ?? null;
  }

  async updateReceivedAmount(
    client: pg.PoolClient,
    id: string,
    receivedAmount: number
  ): Promise<PurchaseOrderRow | null> {
    const r = await client.query<PurchaseOrderRow>(
      `UPDATE purchase_orders SET
         received_amount = $3,
         version = version + 1,
         updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING ${PO_COLUMNS}`,
      [id, this.tenantId, receivedAmount]
    );
    return r.rows[0] ?? null;
  }
}

export type PurchaseOrderLineWrite = {
  id: string;
  item_id: string | null;
  item_name: string | null;
  description: string | null;
  category_id: string | null;
  quantity: number;
  unit_rate: number;
  tax_percent: number;
  tax_amount: number;
  line_total: number;
  sort_order: number;
};

export class PurchaseOrderLineRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async listForPo(client: pg.PoolClient, poId: string) {
    const r = await client.query<{
      id: string;
      purchase_order_id: string;
      item_id: string | null;
      item_name: string | null;
      description: string | null;
      category_id: string | null;
      quantity: string;
      received_qty: string;
      billed_qty: string;
      unit_rate: string;
      line_total: string;
      sort_order: number;
    }>(
      `SELECT id, purchase_order_id, item_id, item_name, description, category_id,
              quantity::text, received_qty::text, billed_qty::text,
              unit_rate::text, line_total::text, sort_order
       FROM purchase_order_lines
       WHERE tenant_id = $1 AND purchase_order_id = $2
       ORDER BY sort_order ASC`,
      [this.tenantId, poId]
    );
    return r.rows;
  }

  async getById(client: pg.PoolClient, lineId: string) {
    const r = await client.query<{
      id: string;
      purchase_order_id: string;
      item_id: string | null;
      item_name: string | null;
      description: string | null;
      quantity: string;
      received_qty: string;
      billed_qty: string;
      unit_rate: string;
    }>(
      `SELECT id, purchase_order_id, item_id, item_name, description,
              quantity::text, received_qty::text, billed_qty::text, unit_rate::text
       FROM purchase_order_lines
       WHERE tenant_id = $1 AND id = $2`,
      [this.tenantId, lineId]
    );
    return r.rows[0] ?? null;
  }

  async addReceivedQty(client: pg.PoolClient, lineId: string, deltaQty: number): Promise<void> {
    await client.query(
      `UPDATE purchase_order_lines SET received_qty = received_qty + $3
       WHERE tenant_id = $1 AND id = $2`,
      [this.tenantId, lineId, deltaQty]
    );
  }

  async replaceForPo(client: pg.PoolClient, poId: string, lines: PurchaseOrderLineWrite[]): Promise<void> {
    await client.query(
      `DELETE FROM purchase_order_lines WHERE tenant_id = $1 AND purchase_order_id = $2`,
      [this.tenantId, poId]
    );
    for (const line of lines) {
      await client.query(
        `INSERT INTO purchase_order_lines (
           id, tenant_id, purchase_order_id, item_id, item_name, description, category_id,
           quantity, unit_rate, tax_percent, tax_amount, line_total, sort_order
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          line.id,
          this.tenantId,
          poId,
          line.item_id,
          line.item_name,
          line.description,
          line.category_id,
          line.quantity,
          line.unit_rate,
          line.tax_percent,
          line.tax_amount,
          line.line_total,
          line.sort_order,
        ]
      );
    }
  }
}
