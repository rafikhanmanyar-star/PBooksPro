import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';

export type VendorPerformanceRatingRow = {
  id: string;
  tenant_id: string;
  vendor_id: string;
  project_id: string | null;
  price_rating: string | null;
  delivery_rating: string | null;
  quality_rating: string | null;
  service_rating: string | null;
  overall_rating: string | null;
  notes: string | null;
  rated_by: string | null;
  rated_at: Date;
  created_at: Date;
};

export class VendorPerformanceRatingRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getVendorAverageRating(client: pg.PoolClient, vendorId: string): Promise<number | null> {
    const r = await client.query<{ avg_rating: string }>(
      `SELECT AVG(overall_rating)::text AS avg_rating
       FROM vendor_performance_ratings
       WHERE tenant_id = $1 AND vendor_id = $2 AND overall_rating IS NOT NULL`,
      [this.tenantId, vendorId]
    );
    const val = Number(r.rows[0]?.avg_rating);
    return Number.isFinite(val) ? Math.round(val * 10) / 10 : null;
  }

  async listByVendor(client: pg.PoolClient, vendorId: string): Promise<VendorPerformanceRatingRow[]> {
    const r = await client.query<VendorPerformanceRatingRow>(
      `SELECT id, tenant_id, vendor_id, project_id,
              price_rating::text, delivery_rating::text, quality_rating::text,
              service_rating::text, overall_rating::text, notes, rated_by, rated_at, created_at
       FROM vendor_performance_ratings
       WHERE tenant_id = $1 AND vendor_id = $2
       ORDER BY rated_at DESC`,
      [this.tenantId, vendorId]
    );
    return r.rows;
  }
}
