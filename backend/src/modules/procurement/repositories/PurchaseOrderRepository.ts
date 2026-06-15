import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';

export type PurchaseOrderRow = {
  id: string;
  tenant_id: string;
  po_number: string;
  vendor_id: string;
  quotation_id: string | null;
  comparison_session_id: string | null;
  project_id: string | null;
  building_id: string | null;
  total_amount: string;
  status: string;
  items: unknown;
  payment_terms: string | null;
  delivery_period: string | null;
  warranty_period: string | null;
  description: string | null;
  target_delivery_date: Date | null;
  currency: string | null;
  created_by: string | null;
  user_id: string | null;
  version: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

const PO_COLUMNS = `id, tenant_id, po_number, vendor_id, quotation_id, comparison_session_id,
  project_id, building_id, total_amount::text, status, items, payment_terms, delivery_period,
  warranty_period, description, target_delivery_date, currency, created_by, user_id, version,
  deleted_at, created_at, updated_at`;

export type PurchaseOrderWriteFields = {
  po_number: string;
  vendor_id: string;
  quotation_id: string | null;
  comparison_session_id: string | null;
  project_id: string | null;
  building_id: string | null;
  total_amount: number;
  status: string;
  items_json: string;
  payment_terms: string | null;
  delivery_period: string | null;
  warranty_period: string | null;
  description: string | null;
  target_delivery_date: string | null;
  currency: string;
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

  async insert(
    client: pg.PoolClient,
    id: string,
    fields: PurchaseOrderWriteFields,
    userId: string | null
  ): Promise<PurchaseOrderRow> {
    const r = await client.query<PurchaseOrderRow>(
      `INSERT INTO purchase_orders (
         id, tenant_id, po_number, vendor_id, quotation_id, comparison_session_id,
         project_id, building_id, total_amount, status, items, payment_terms, delivery_period,
         warranty_period, description, target_delivery_date, currency, created_by, user_id,
         version, deleted_at, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15,
               $16::date, $17, $18, $19, 1, NULL, NOW(), NOW())
       RETURNING ${PO_COLUMNS}`,
      [
        id,
        this.tenantId,
        fields.po_number,
        fields.vendor_id,
        fields.quotation_id,
        fields.comparison_session_id,
        fields.project_id,
        fields.building_id,
        fields.total_amount,
        fields.status,
        fields.items_json,
        fields.payment_terms,
        fields.delivery_period,
        fields.warranty_period,
        fields.description,
        fields.target_delivery_date,
        fields.currency,
        userId,
        userId,
      ]
    );
    return r.rows[0]!;
  }
}
