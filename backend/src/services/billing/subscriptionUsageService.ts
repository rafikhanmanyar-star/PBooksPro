/**
 * Tenant usage metrics vs plan limits.
 */

import type pg from 'pg';
import { getBillingPlanById, isUnlimited, type BillingPlanRow } from './billingPlanService.js';
import { getActiveSubscription } from './subscriptionService.js';
import { SubscriptionUsageRepository } from '../../modules/billing/repositories/BillingSupportRepository.js';

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

const usageRepo = new SubscriptionUsageRepository();

export async function computeCurrentUsage(
  client: pg.PoolClient,
  tenantId: string
): Promise<UsageSnapshot> {
  const [usersCount, projectsCount] = await Promise.all([
    usageRepo.countActiveUsers(client, tenantId),
    usageRepo.countProjects(client, tenantId),
  ]);

  let storageBytes = 0;
  try {
    storageBytes = await usageRepo.sumDocumentStorageBytes(client, tenantId);
  } catch {
    storageBytes = 0;
  }

  return {
    usersCount,
    projectsCount,
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
  await usageRepo.upsertDailySnapshot(client, {
    tenantId,
    metricDate: today,
    usersCount: usage.usersCount,
    projectsCount: usage.projectsCount,
    storageBytes: usage.storageBytes,
  });
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
  return usageRepo.listHistory(client, tenantId, limit);
}
