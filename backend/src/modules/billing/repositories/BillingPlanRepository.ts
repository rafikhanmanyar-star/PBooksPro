import type pg from 'pg';
import type { BillingPlanRow } from '../../../services/billing/billingPlanService.js';

function mapPlan(row: pg.QueryResultRow): BillingPlanRow {
  return {
    id: row.id,
    plan_code: row.plan_code,
    name: row.name,
    description: row.description,
    monthly_price: String(row.monthly_price),
    annual_price: String(row.annual_price),
    max_users: row.max_users,
    max_projects: row.max_projects,
    max_storage_gb: row.max_storage_gb,
    features_json:
      row.features_json && typeof row.features_json === 'object'
        ? (row.features_json as Record<string, unknown>)
        : {},
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export class BillingPlanRepository {
  async listActive(client: pg.PoolClient): Promise<BillingPlanRow[]> {
    const r = await client.query(
      `SELECT * FROM billing_plans WHERE is_active = TRUE ORDER BY monthly_price ASC`
    );
    return r.rows.map(mapPlan);
  }

  async getById(client: pg.PoolClient, planId: string): Promise<BillingPlanRow | null> {
    const r = await client.query(`SELECT * FROM billing_plans WHERE id = $1`, [planId]);
    return r.rows[0] ? mapPlan(r.rows[0]) : null;
  }

  async getByCode(client: pg.PoolClient, planCode: string): Promise<BillingPlanRow | null> {
    const r = await client.query(`SELECT * FROM billing_plans WHERE plan_code = $1`, [planCode]);
    return r.rows[0] ? mapPlan(r.rows[0]) : null;
  }
}
