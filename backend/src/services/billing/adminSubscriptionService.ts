/**
 * Cross-tenant subscription administration (super_admin).
 */

import type pg from 'pg';
import { getPastDueGraceDays, gracePeriodEndsAt } from './subscriptionLifecycleService.js';

export type AdminSubscriptionRow = {
  subscriptionId: string;
  tenantId: string;
  tenantName: string;
  tenantActive: boolean;
  planCode: string;
  planName: string;
  status: string;
  billingCycle: string;
  renewalDate: string | null;
  trialEndDate: string | null;
  pastDueAt: string | null;
  graceEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  paddleSubscriptionId: string | null;
  pendingPlanCode: string | null;
  updatedAt: string;
};

export type AdminWebhookDeliveryRow = {
  id: string;
  eventType: string;
  tenantId: string | null;
  status: string;
  attemptCount: number;
  lastError: string | null;
  nextRetryAt: string | null;
  createdAt: string;
};

export type AdminSubscriptionStats = {
  totalTenants: number;
  activeSubscriptions: number;
  trialing: number;
  pastDue: number;
  canceled: number;
  expired: number;
  failedWebhooks: number;
  gracePeriodDays: number;
};

export async function listAdminSubscriptions(
  client: pg.PoolClient,
  options?: { limit?: number; status?: string }
): Promise<AdminSubscriptionRow[]> {
  const limit = Math.min(Math.max(options?.limit ?? 200, 1), 500);
  const params: unknown[] = [limit];
  let statusFilter = '';

  if (options?.status) {
    params.push(options.status);
    statusFilter = `AND s.status = $${params.length}`;
  }

  const { rows } = await client.query(
    `SELECT
       s.id AS subscription_id,
       s.tenant_id,
       t.name AS tenant_name,
       COALESCE(t.is_active, TRUE) AS tenant_active,
       p.plan_code,
       p.name AS plan_name,
       s.status,
       s.billing_cycle,
       s.renewal_date,
       s.trial_end_date,
       s.past_due_at,
       s.cancel_at_period_end,
       s.paddle_subscription_id,
       s.updated_at,
       pp.plan_code AS pending_plan_code
     FROM subscriptions s
     INNER JOIN tenants t ON t.id = s.tenant_id
     INNER JOIN billing_plans p ON p.id = s.plan_id
     LEFT JOIN billing_plans pp ON pp.id = s.pending_plan_id
     WHERE 1=1 ${statusFilter}
     ORDER BY s.updated_at DESC
     LIMIT $1`,
    params
  );

  return rows.map((row) => ({
    subscriptionId: row.subscription_id,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    tenantActive: row.tenant_active,
    planCode: row.plan_code,
    planName: row.plan_name,
    status: row.status,
    billingCycle: row.billing_cycle,
    renewalDate: row.renewal_date,
    trialEndDate: row.trial_end_date,
    pastDueAt: row.past_due_at,
    graceEndsAt: gracePeriodEndsAt(row.past_due_at),
    cancelAtPeriodEnd: row.cancel_at_period_end,
    paddleSubscriptionId: row.paddle_subscription_id,
    pendingPlanCode: row.pending_plan_code,
    updatedAt: row.updated_at,
  }));
}

export async function listAdminWebhookDeliveries(
  client: pg.PoolClient,
  options?: { limit?: number; status?: string }
): Promise<AdminWebhookDeliveryRow[]> {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
  const params: unknown[] = [limit];
  let statusFilter = '';

  if (options?.status) {
    params.push(options.status);
    statusFilter = `AND status = $${params.length}`;
  }

  const { rows } = await client.query(
    `SELECT id, event_type, tenant_id, status, attempt_count, last_error, next_retry_at, created_at
     FROM paddle_webhook_deliveries
     WHERE 1=1 ${statusFilter}
     ORDER BY created_at DESC
     LIMIT $1`,
    params
  );

  return rows.map((row) => ({
    id: row.id,
    eventType: row.event_type,
    tenantId: row.tenant_id,
    status: row.status,
    attemptCount: row.attempt_count,
    lastError: row.last_error,
    nextRetryAt: row.next_retry_at,
    createdAt: row.created_at,
  }));
}

export async function getAdminSubscriptionStats(
  client: pg.PoolClient
): Promise<AdminSubscriptionStats> {
  const { rows } = await client.query<{
    total_tenants: string;
    active_subscriptions: string;
    trialing: string;
    past_due: string;
    canceled: string;
    expired: string;
    failed_webhooks: string;
  }>(
    `SELECT
       (SELECT COUNT(*)::text FROM tenants) AS total_tenants,
       (SELECT COUNT(*)::text FROM subscriptions WHERE status = 'active') AS active_subscriptions,
       (SELECT COUNT(*)::text FROM subscriptions WHERE status = 'trialing') AS trialing,
       (SELECT COUNT(*)::text FROM subscriptions WHERE status = 'past_due') AS past_due,
       (SELECT COUNT(*)::text FROM subscriptions WHERE status = 'canceled') AS canceled,
       (SELECT COUNT(*)::text FROM subscriptions WHERE status = 'expired') AS expired,
       (SELECT COUNT(*)::text FROM paddle_webhook_deliveries WHERE status = 'failed') AS failed_webhooks`
  );

  const row = rows[0];
  return {
    totalTenants: Number(row?.total_tenants ?? 0),
    activeSubscriptions: Number(row?.active_subscriptions ?? 0),
    trialing: Number(row?.trialing ?? 0),
    pastDue: Number(row?.past_due ?? 0),
    canceled: Number(row?.canceled ?? 0),
    expired: Number(row?.expired ?? 0),
    failedWebhooks: Number(row?.failed_webhooks ?? 0),
    gracePeriodDays: getPastDueGraceDays(),
  };
}
