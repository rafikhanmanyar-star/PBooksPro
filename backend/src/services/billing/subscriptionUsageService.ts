/**
 * Tenant usage metrics vs plan limits.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { getBillingPlanById, isUnlimited, type BillingPlanRow } from './billingPlanService.js';
import { getActiveSubscription } from './subscriptionService.js';

export type UsageSnapshot = {
  usersCount: number;
  projectsCount: number;
  storageBytes: number;
  storageGb: number;
};

export type UsageLimits = {
  maxUsers: number;
  maxProjects: number;
  maxStorageGb: number;
};

export type UsageStatus = {
  current: UsageSnapshot;
  limits: UsageLimits;
  withinLimits: boolean;
  violations: string[];
};

export async function computeCurrentUsage(
  client: pg.PoolClient,
  tenantId: string
): Promise<UsageSnapshot> {
  const [users, projects] = await Promise.all([
    client.query(`SELECT COUNT(*)::int AS c FROM users WHERE tenant_id = $1 AND is_active = TRUE`, [
      tenantId,
    ]),
    client.query(`SELECT COUNT(*)::int AS c FROM projects WHERE tenant_id = $1`, [tenantId]),
  ]);

  // Storage: sum document sizes if table exists, else 0
  let storageBytes = 0;
  try {
    const storage = await client.query(
      `SELECT COALESCE(SUM(octet_length(content)), 0)::bigint AS bytes
       FROM documents WHERE tenant_id = $1`,
      [tenantId]
    );
    storageBytes = Number(storage.rows[0]?.bytes ?? 0);
  } catch {
    storageBytes = 0;
  }

  return {
    usersCount: users.rows[0]?.c ?? 0,
    projectsCount: projects.rows[0]?.c ?? 0,
    storageBytes,
    storageGb: storageBytes / (1024 * 1024 * 1024),
  };
}

export function evaluateUsageAgainstPlan(
  usage: UsageSnapshot,
  plan: BillingPlanRow
): UsageStatus {
  const limits: UsageLimits = {
    maxUsers: plan.max_users,
    maxProjects: plan.max_projects,
    maxStorageGb: plan.max_storage_gb,
  };
  const violations: string[] = [];

  if (!isUnlimited(plan.max_users) && usage.usersCount > plan.max_users) {
    violations.push(`Users (${usage.usersCount}) exceed plan limit (${plan.max_users}).`);
  }
  if (!isUnlimited(plan.max_projects) && usage.projectsCount > plan.max_projects) {
    violations.push(`Projects (${usage.projectsCount}) exceed plan limit (${plan.max_projects}).`);
  }
  if (!isUnlimited(plan.max_storage_gb) && usage.storageGb > plan.max_storage_gb) {
    violations.push(`Storage exceeds plan limit (${plan.max_storage_gb} GB).`);
  }

  return {
    current: usage,
    limits,
    withinLimits: violations.length === 0,
    violations,
  };
}

export async function getTenantUsageStatus(
  client: pg.PoolClient,
  tenantId: string
): Promise<UsageStatus | null> {
  const sub = await getActiveSubscription(client, tenantId);
  if (!sub) return null;
  const plan = await getBillingPlanById(client, sub.plan_id);
  if (!plan) return null;
  const usage = await computeCurrentUsage(client, tenantId);
  return evaluateUsageAgainstPlan(usage, plan);
}

export async function recordUsageSnapshot(
  client: pg.PoolClient,
  tenantId: string
): Promise<void> {
  const usage = await computeCurrentUsage(client, tenantId);
  const today = new Date().toISOString().slice(0, 10);
  await client.query(
    `INSERT INTO subscription_usage_metrics (id, tenant_id, metric_date, users_count, projects_count, storage_bytes)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tenant_id, metric_date) DO UPDATE SET
       users_count = EXCLUDED.users_count,
       projects_count = EXCLUDED.projects_count,
       storage_bytes = EXCLUDED.storage_bytes`,
    [
      randomUUID(),
      tenantId,
      today,
      usage.usersCount,
      usage.projectsCount,
      usage.storageBytes,
    ]
  );
}

export async function listUsageHistory(
  client: pg.PoolClient,
  tenantId: string,
  limit = 30
): Promise<
  Array<{
    metric_date: string;
    users_count: number;
    projects_count: number;
    storage_bytes: string;
  }>
> {
  const { rows } = await client.query(
    `SELECT metric_date, users_count, projects_count, storage_bytes::text
     FROM subscription_usage_metrics
     WHERE tenant_id = $1
     ORDER BY metric_date DESC
     LIMIT $2`,
    [tenantId, limit]
  );
  return rows;
}
