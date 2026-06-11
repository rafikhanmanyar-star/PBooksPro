import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { getPastDueGraceDays, gracePeriodEndsAt } from '../../../services/billing/subscriptionLifecycleService.js';

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

export class SubscriptionUsageRepository {
  async countActiveUsers(client: pg.PoolClient, tenantId: string): Promise<number> {
    const r = await client.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM users WHERE tenant_id = $1 AND is_active = TRUE`,
      [tenantId]
    );
    return r.rows[0]?.c ?? 0;
  }

  async countProjects(client: pg.PoolClient, tenantId: string): Promise<number> {
    const r = await client.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM projects WHERE tenant_id = $1`,
      [tenantId]
    );
    return r.rows[0]?.c ?? 0;
  }

  async sumDocumentStorageBytes(client: pg.PoolClient, tenantId: string): Promise<number> {
    const r = await client.query<{ bytes: string }>(
      `SELECT COALESCE(SUM(
         CASE
           WHEN inline_data IS NOT NULL THEN octet_length(inline_data)
           ELSE COALESCE(file_size, 0)
         END
       ), 0)::bigint AS bytes
       FROM document_metadata
       WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [tenantId]
    );
    return Number(r.rows[0]?.bytes ?? 0);
  }

  async upsertDailySnapshot(
    client: pg.PoolClient,
    input: {
      tenantId: string;
      metricDate: string;
      usersCount: number;
      projectsCount: number;
      storageBytes: number;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO subscription_usage_metrics (id, tenant_id, metric_date, users_count, projects_count, storage_bytes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tenant_id, metric_date) DO UPDATE SET
         users_count = EXCLUDED.users_count,
         projects_count = EXCLUDED.projects_count,
         storage_bytes = EXCLUDED.storage_bytes`,
      [
        randomUUID(),
        input.tenantId,
        input.metricDate,
        input.usersCount,
        input.projectsCount,
        input.storageBytes,
      ]
    );
  }

  async listHistory(
    client: pg.PoolClient,
    tenantId: string,
    limit: number
  ): Promise<
    Array<{
      metric_date: string;
      users_count: number;
      projects_count: number;
      storage_bytes: string;
    }>
  > {
    const r = await client.query(
      `SELECT metric_date, users_count, projects_count, storage_bytes::text
       FROM subscription_usage_metrics
       WHERE tenant_id = $1
       ORDER BY metric_date DESC
       LIMIT $2`,
      [tenantId, limit]
    );
    return r.rows;
  }
}

export class AdminSubscriptionRepository {
  async listSubscriptions(
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

    const r = await client.query(
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

    return r.rows.map((row) => ({
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

  async getStats(client: pg.PoolClient): Promise<AdminSubscriptionStats> {
    const r = await client.query<{
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

    const row = r.rows[0];
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
}

export class PaddleWebhookRepository {
  async listDeliveries(
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

    const r = await client.query(
      `SELECT id, event_type, tenant_id, status, attempt_count, last_error, next_retry_at, created_at
       FROM paddle_webhook_deliveries
       WHERE 1=1 ${statusFilter}
       ORDER BY created_at DESC
       LIMIT $1`,
      params
    );

    return r.rows.map((row) => ({
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

  async getDelivery(
    client: pg.PoolClient,
    eventId: string
  ): Promise<{ id: string; status: string } | null> {
    const r = await client.query(`SELECT id, status FROM paddle_webhook_deliveries WHERE id = $1`, [
      eventId,
    ]);
    return r.rows[0] ?? null;
  }

  async insertPending(
    client: pg.PoolClient,
    input: {
      eventId: string;
      eventType: string;
      tenantId: string | null;
      payload: Record<string, unknown>;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO paddle_webhook_deliveries (id, event_type, tenant_id, payload, status)
       VALUES ($1, $2, $3, $4::jsonb, 'pending')`,
      [input.eventId, input.eventType, input.tenantId, JSON.stringify(input.payload)]
    );
  }

  async markDelivery(
    client: pg.PoolClient,
    deliveryId: string,
    status: 'processing' | 'processed' | 'failed',
    error?: string
  ): Promise<void> {
    const attemptInc = status === 'failed' ? 1 : 0;
    const nextRetry =
      status === 'failed'
        ? new Date(Date.now() + Math.min(3600000, 60000 * Math.pow(2, attemptInc))).toISOString()
        : null;

    await client.query(
      `UPDATE paddle_webhook_deliveries SET
         status = $2,
         attempt_count = attempt_count + $3,
         last_error = $4,
         processed_at = CASE WHEN $2 = 'processed' THEN NOW() ELSE processed_at END,
         next_retry_at = $5,
         updated_at = NOW()
       WHERE id = $1`,
      [deliveryId, status, attemptInc, error ?? null, nextRetry]
    );
  }

  async listRetryable(
    client: pg.PoolClient,
    limit: number
  ): Promise<Array<{ id: string; event_type: string; payload: Record<string, unknown>; attempt_count: number }>> {
    const r = await client.query(
      `SELECT id, event_type, payload, attempt_count
       FROM paddle_webhook_deliveries
       WHERE status = 'failed' AND attempt_count < 5
         AND (next_retry_at IS NULL OR next_retry_at <= NOW())
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit]
    );
    return r.rows.map((row) => ({
      id: row.id,
      event_type: row.event_type,
      payload: row.payload as Record<string, unknown>,
      attempt_count: row.attempt_count,
    }));
  }

  async exists(client: pg.PoolClient, eventId: string): Promise<boolean> {
    const r = await client.query(`SELECT 1 FROM paddle_webhook_deliveries WHERE id = $1`, [eventId]);
    return r.rows.length > 0;
  }

  async insertPendingWithoutTenant(
    client: pg.PoolClient,
    eventId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    await client.query(
      `INSERT INTO paddle_webhook_deliveries (id, event_type, payload, status)
       VALUES ($1, $2, $3::jsonb, 'pending')`,
      [eventId, eventType, JSON.stringify(payload)]
    );
  }
}
