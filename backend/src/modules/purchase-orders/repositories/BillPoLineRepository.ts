import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';

export type BillPoLineRow = {
  id: string;
  tenant_id: string;
  bill_id: string;
  purchase_order_line_id: string;
  goods_receipt_line_id: string | null;
  billed_qty: string;
  unit_rate: string;
  line_total: string;
  sort_order: number;
  created_at: Date;
};

export type BillPoLineWrite = {
  id: string;
  purchase_order_line_id: string;
  goods_receipt_line_id?: string | null;
  billed_qty: number;
  unit_rate: number;
  line_total: number;
  sort_order: number;
};

const COLUMNS = `id, tenant_id, bill_id, purchase_order_line_id, goods_receipt_line_id,
  billed_qty::text, unit_rate::text, line_total::text, sort_order, created_at`;

export class BillPoLineRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async listForBill(client: pg.PoolClient, billId: string): Promise<BillPoLineRow[]> {
    const r = await client.query<BillPoLineRow>(
      `SELECT ${COLUMNS}
       FROM bill_po_lines
       WHERE tenant_id = $1 AND bill_id = $2
       ORDER BY sort_order ASC, created_at ASC`,
      [this.tenantId, billId]
    );
    return r.rows;
  }

  async replaceForBill(client: pg.PoolClient, billId: string, lines: BillPoLineWrite[]): Promise<void> {
    await client.query(`DELETE FROM bill_po_lines WHERE tenant_id = $1 AND bill_id = $2`, [
      this.tenantId,
      billId,
    ]);
    for (const line of lines) {
      await client.query(
        `INSERT INTO bill_po_lines (
           id, tenant_id, bill_id, purchase_order_line_id, goods_receipt_line_id,
           billed_qty, unit_rate, line_total, sort_order
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          line.id,
          this.tenantId,
          billId,
          line.purchase_order_line_id,
          line.goods_receipt_line_id ?? null,
          line.billed_qty,
          line.unit_rate,
          line.line_total,
          line.sort_order,
        ]
      );
    }
  }
}
