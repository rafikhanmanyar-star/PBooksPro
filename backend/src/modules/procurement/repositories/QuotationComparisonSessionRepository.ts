import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';

export type ComparisonSessionRow = {
  id: string;
  tenant_id: string;
  title: string | null;
  project_id: string | null;
  building_id: string | null;
  package_name: string | null;
  category_id: string | null;
  item_name: string | null;
  preferred_quotation_id: string | null;
  approved_quotation_id: string | null;
  purchase_order_id: string | null;
  status: string;
  version: number;
  created_by: string | null;
  approved_by: string | null;
  approved_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type ComparisonSessionQuotationRow = {
  id: string;
  tenant_id: string;
  session_id: string;
  quotation_id: string;
  recommendation_score: string | null;
  recommendation_rank: number | null;
  is_recommended: boolean;
};

const SESSION_COLUMNS = `id, tenant_id, title, project_id, building_id, package_name, category_id, item_name,
  preferred_quotation_id, approved_quotation_id, purchase_order_id, status, version,
  created_by, approved_by, approved_at, created_at, updated_at`;

export class QuotationComparisonSessionRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<ComparisonSessionRow | null> {
    const r = await client.query<ComparisonSessionRow>(
      `SELECT ${SESSION_COLUMNS}
       FROM quotation_comparison_sessions
       WHERE id = $1 AND tenant_id = $2`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async insertSession(
    client: pg.PoolClient,
    id: string,
    fields: {
      title: string | null;
      project_id: string | null;
      building_id: string | null;
      package_name: string | null;
      category_id: string | null;
      item_name: string | null;
      created_by: string | null;
    }
  ): Promise<ComparisonSessionRow> {
    const r = await client.query<ComparisonSessionRow>(
      `INSERT INTO quotation_comparison_sessions (
         id, tenant_id, title, project_id, building_id, package_name, category_id, item_name,
         status, version, created_by, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'comparing', 1, $9, NOW(), NOW())
       RETURNING ${SESSION_COLUMNS}`,
      [
        id,
        this.tenantId,
        fields.title,
        fields.project_id,
        fields.building_id,
        fields.package_name,
        fields.category_id,
        fields.item_name,
        fields.created_by,
      ]
    );
    return r.rows[0]!;
  }

  async addQuotation(
    client: pg.PoolClient,
    id: string,
    sessionId: string,
    quotationId: string,
    score: number | null,
    rank: number | null,
    isRecommended: boolean
  ): Promise<void> {
    await client.query(
      `INSERT INTO quotation_comparison_session_quotations (
         id, tenant_id, session_id, quotation_id, recommendation_score, recommendation_rank, is_recommended
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (session_id, quotation_id) DO UPDATE SET
         recommendation_score = EXCLUDED.recommendation_score,
         recommendation_rank = EXCLUDED.recommendation_rank,
         is_recommended = EXCLUDED.is_recommended`,
      [id, this.tenantId, sessionId, quotationId, score, rank, isRecommended]
    );
  }

  async listSessionQuotations(
    client: pg.PoolClient,
    sessionId: string
  ): Promise<ComparisonSessionQuotationRow[]> {
    const r = await client.query<ComparisonSessionQuotationRow>(
      `SELECT id, tenant_id, session_id, quotation_id,
              recommendation_score::text, recommendation_rank, is_recommended
       FROM quotation_comparison_session_quotations
       WHERE tenant_id = $1 AND session_id = $2
       ORDER BY recommendation_rank ASC NULLS LAST, quotation_id ASC`,
      [this.tenantId, sessionId]
    );
    return r.rows;
  }

  async setPreferred(
    client: pg.PoolClient,
    sessionId: string,
    quotationId: string
  ): Promise<ComparisonSessionRow | null> {
    const r = await client.query<ComparisonSessionRow>(
      `UPDATE quotation_comparison_sessions SET
         preferred_quotation_id = $3,
         status = 'preferred',
         version = version + 1,
         updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING ${SESSION_COLUMNS}`,
      [sessionId, this.tenantId, quotationId]
    );
    return r.rows[0] ?? null;
  }

  async setApproved(
    client: pg.PoolClient,
    sessionId: string,
    quotationId: string,
    approvedBy: string | null
  ): Promise<ComparisonSessionRow | null> {
    const r = await client.query<ComparisonSessionRow>(
      `UPDATE quotation_comparison_sessions SET
         approved_quotation_id = $3,
         approved_by = $4,
         approved_at = NOW(),
         status = 'approved',
         version = version + 1,
         updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING ${SESSION_COLUMNS}`,
      [sessionId, this.tenantId, quotationId, approvedBy]
    );
    return r.rows[0] ?? null;
  }

  async setConverted(
    client: pg.PoolClient,
    sessionId: string,
    purchaseOrderId: string
  ): Promise<ComparisonSessionRow | null> {
    const r = await client.query<ComparisonSessionRow>(
      `UPDATE quotation_comparison_sessions SET
         purchase_order_id = $3,
         status = 'converted',
         version = version + 1,
         updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING ${SESSION_COLUMNS}`,
      [sessionId, this.tenantId, purchaseOrderId]
    );
    return r.rows[0] ?? null;
  }
}
