/**
 * Billing plan catalog.
 */

import type pg from 'pg';

export type BillingPlanRow = {
  id: string;
  plan_code: string;
  name: string;
  description: string;
  monthly_price: string;
  annual_price: string;
  max_users: number;
  max_projects: number;
  max_storage_gb: number;
  features_json: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

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

export async function listBillingPlans(client: pg.PoolClient): Promise<BillingPlanRow[]> {
  const { rows } = await client.query(
    `SELECT * FROM billing_plans WHERE is_active = TRUE ORDER BY monthly_price ASC`
  );
  return rows.map(mapPlan);
}

export async function getBillingPlanById(
  client: pg.PoolClient,
  planId: string
): Promise<BillingPlanRow | null> {
  const { rows } = await client.query(`SELECT * FROM billing_plans WHERE id = $1`, [planId]);
  return rows.length ? mapPlan(rows[0]) : null;
}

export async function getBillingPlanByCode(
  client: pg.PoolClient,
  planCode: string
): Promise<BillingPlanRow | null> {
  const { rows } = await client.query(`SELECT * FROM billing_plans WHERE plan_code = $1`, [
    planCode,
  ]);
  return rows.length ? mapPlan(rows[0]) : null;
}

export function planModules(plan: BillingPlanRow): string[] {
  const mods = plan.features_json.modules;
  return Array.isArray(mods) ? mods.filter((m): m is string => typeof m === 'string') : [];
}

export function isUnlimited(limit: number): boolean {
  return limit < 0;
}
