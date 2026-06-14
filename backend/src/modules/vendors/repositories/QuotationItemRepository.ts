import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';

export type QuotationItemRow = {
  id: string;
  tenant_id: string;
  quotation_id: string;
  category_id: string | null;
  item_id: string | null;
  item_name: string | null;
  brand: string | null;
  specification: string | null;
  unit: string | null;
  quantity: string;
  unit_rate: string;
  total_amount: string;
  market_rate: string | null;
  previous_rate: string | null;
  variance_percent: string | null;
  approval_threshold_percent: string | null;
  sort_order: number;
  created_at: Date;
};

export type QuotationItemWrite = {
  id: string;
  category_id: string | null;
  item_id: string | null;
  item_name: string | null;
  brand: string | null;
  specification: string | null;
  unit: string | null;
  quantity: number;
  unit_rate: number;
  total_amount: number;
  market_rate: number | null;
  previous_rate: number | null;
  variance_percent: number | null;
  approval_threshold_percent: number;
  sort_order: number;
};

const ITEM_COLUMNS = `id, tenant_id, quotation_id, category_id, item_id, item_name, brand, specification, unit,
  quantity::text, unit_rate::text, total_amount::text, market_rate::text, previous_rate::text,
  variance_percent::text, approval_threshold_percent::text, sort_order, created_at`;

export class QuotationItemRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async listByQuotation(client: pg.PoolClient, quotationId: string): Promise<QuotationItemRow[]> {
    const r = await client.query<QuotationItemRow>(
      `SELECT ${ITEM_COLUMNS}
       FROM quotation_items
       WHERE tenant_id = $1 AND quotation_id = $2
       ORDER BY sort_order ASC, id ASC`,
      [this.tenantId, quotationId]
    );
    return r.rows;
  }

  async replaceForQuotation(
    client: pg.PoolClient,
    quotationId: string,
    items: QuotationItemWrite[]
  ): Promise<void> {
    await client.query(
      `DELETE FROM quotation_items WHERE tenant_id = $1 AND quotation_id = $2`,
      [this.tenantId, quotationId]
    );
    for (const item of items) {
      await client.query(
        `INSERT INTO quotation_items (
           id, tenant_id, quotation_id, category_id, item_id, item_name, brand, specification, unit,
           quantity, unit_rate, total_amount, market_rate, previous_rate, variance_percent,
           approval_threshold_percent, sort_order
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          item.id,
          this.tenantId,
          quotationId,
          item.category_id,
          item.item_id,
          item.item_name,
          item.brand,
          item.specification,
          item.unit,
          item.quantity,
          item.unit_rate,
          item.total_amount,
          item.market_rate,
          item.previous_rate,
          item.variance_percent,
          item.approval_threshold_percent,
          item.sort_order,
        ]
      );
    }
  }
}
