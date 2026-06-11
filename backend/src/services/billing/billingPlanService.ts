/**
 * Billing plan catalog.
 */

import type pg from 'pg';
import { BillingPlanRepository } from '../../modules/billing/repositories/BillingPlanRepository.js';

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

const planRepo = new BillingPlanRepository();

export async function listBillingPlans(client: pg.PoolClient): Promise<BillingPlanRow[]> {
  return planRepo.listActive(client);
}

export async function getBillingPlanById(
  client: pg.PoolClient,
  planId: string
): Promise<BillingPlanRow | null> {
  return planRepo.getById(client, planId);
}

export async function getBillingPlanByCode(
  client: pg.PoolClient,
  planCode: string
): Promise<BillingPlanRow | null> {
  return planRepo.getByCode(client, planCode);
}

export function planModules(plan: BillingPlanRow): string[] {
  const mods = plan.features_json.modules;
  return Array.isArray(mods) ? mods.filter((m): m is string => typeof m === 'string') : [];
}

export function isUnlimited(limit: number): boolean {
  return limit < 0;
}
