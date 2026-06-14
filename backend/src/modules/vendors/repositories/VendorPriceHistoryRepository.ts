import type pg from 'pg';
import { randomUUID } from 'crypto';
import { TenantRepository } from '../../../core/TenantRepository.js';

export type VendorPriceHistoryRow = {
  id: string;
  tenant_id: string;
  vendor_id: string;
  category_id: string | null;
  item_id: string | null;
  item_name: string | null;
  quotation_id: string | null;
  quoted_rate: string;
  quotation_date: Date;
  project_id: string | null;
  building_id: string | null;
  is_approved_rate: boolean;
  created_at: Date;
};

export type VendorPriceHistoryWrite = {
  vendor_id: string;
  category_id: string | null;
  item_id: string | null;
  item_name: string | null;
  quotation_id: string;
  quoted_rate: number;
  quotation_date: string;
  project_id: string | null;
  building_id: string | null;
  is_approved_rate: boolean;
};

const HISTORY_COLUMNS = `id, tenant_id, vendor_id, category_id, item_id, item_name, quotation_id,
  quoted_rate::text, quotation_date, project_id, building_id, is_approved_rate, created_at`;

export class VendorPriceHistoryRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async insertEntries(client: pg.PoolClient, entries: VendorPriceHistoryWrite[]): Promise<void> {
    for (const e of entries) {
      await client.query(
        `INSERT INTO vendor_price_history (
           id, tenant_id, vendor_id, category_id, item_id, item_name, quotation_id,
           quoted_rate, quotation_date, project_id, building_id, is_approved_rate
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10,$11,$12)`,
        [
          `vph_${randomUUID().replace(/-/g, '')}`,
          this.tenantId,
          e.vendor_id,
          e.category_id,
          e.item_id,
          e.item_name,
          e.quotation_id,
          e.quoted_rate,
          e.quotation_date,
          e.project_id,
          e.building_id,
          e.is_approved_rate,
        ]
      );
    }
  }

  async listHistory(
    client: pg.PoolClient,
    filters: {
      vendorId?: string;
      categoryId?: string;
      itemName?: string;
      projectId?: string;
      limit?: number;
    }
  ): Promise<VendorPriceHistoryRow[]> {
    const clauses = ['tenant_id = $1'];
    const params: unknown[] = [this.tenantId];
    let idx = 2;
    if (filters.vendorId) {
      clauses.push(`vendor_id = $${idx++}`);
      params.push(filters.vendorId);
    }
    if (filters.categoryId) {
      clauses.push(`category_id = $${idx++}`);
      params.push(filters.categoryId);
    }
    if (filters.itemName) {
      clauses.push(`LOWER(item_name) = LOWER($${idx++})`);
      params.push(filters.itemName);
    }
    if (filters.projectId) {
      clauses.push(`project_id = $${idx++}`);
      params.push(filters.projectId);
    }
    const limit = Math.min(filters.limit ?? 200, 500);
    const r = await client.query<VendorPriceHistoryRow>(
      `SELECT ${HISTORY_COLUMNS}
       FROM vendor_price_history
       WHERE ${clauses.join(' AND ')}
       ORDER BY quotation_date DESC, created_at DESC
       LIMIT ${limit}`,
      params
    );
    return r.rows;
  }

  async getLastRate(
    client: pg.PoolClient,
    vendorId: string,
    categoryId: string,
    itemName?: string
  ): Promise<number | null> {
    const clauses = ['tenant_id = $1', 'vendor_id = $2', 'category_id = $3'];
    const params: unknown[] = [this.tenantId, vendorId, categoryId];
    if (itemName) {
      clauses.push('LOWER(item_name) = LOWER($4)');
      params.push(itemName);
    }
    const r = await client.query<{ quoted_rate: string }>(
      `SELECT quoted_rate::text
       FROM vendor_price_history
       WHERE ${clauses.join(' AND ')}
       ORDER BY quotation_date DESC, created_at DESC
       LIMIT 1`,
      params
    );
    const val = Number(r.rows[0]?.quoted_rate);
    return Number.isFinite(val) ? val : null;
  }

  async getAverageMarketRate(
    client: pg.PoolClient,
    categoryId: string,
    itemName?: string
  ): Promise<number | null> {
    const clauses = ['tenant_id = $1', 'category_id = $2'];
    const params: unknown[] = [this.tenantId, categoryId];
    if (itemName) {
      clauses.push('LOWER(item_name) = LOWER($3)');
      params.push(itemName);
    }
    const r = await client.query<{ avg_rate: string }>(
      `SELECT AVG(quoted_rate)::text AS avg_rate
       FROM vendor_price_history
       WHERE ${clauses.join(' AND ')}`,
      params
    );
    const val = Number(r.rows[0]?.avg_rate);
    return Number.isFinite(val) ? Math.round(val * 100) / 100 : null;
  }
}
