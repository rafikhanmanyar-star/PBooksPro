import type pg from 'pg';
import type { SubscriptionStatus } from '../../../services/billing/subscriptionService.js';

const ACTIVE_STATUSES: SubscriptionStatus[] = [
  'trialing',
  'active',
  'past_due',
  'paused',
  'pending',
];

const WITH_PLAN_SELECT = `SELECT s.*, p.plan_code, p.name AS plan_name
     FROM subscriptions s
     INNER JOIN billing_plans p ON p.id = s.plan_id`;

export class SubscriptionRepository {
  async getActiveWithPlan(
    client: pg.PoolClient,
    tenantId: string
  ): Promise<pg.QueryResultRow | null> {
    const r = await client.query(
      `${WITH_PLAN_SELECT}
       WHERE s.tenant_id = $1 AND s.status = ANY($2::text[])
       ORDER BY s.updated_at DESC
       LIMIT 1`,
      [tenantId, ACTIVE_STATUSES]
    );
    return r.rows[0] ?? null;
  }

  async getByIdWithPlan(
    client: pg.PoolClient,
    subscriptionId: string
  ): Promise<pg.QueryResultRow | null> {
    const r = await client.query(`${WITH_PLAN_SELECT} WHERE s.id = $1`, [subscriptionId]);
    return r.rows[0] ?? null;
  }

  async getByPaddleIdWithPlan(
    client: pg.PoolClient,
    paddleSubscriptionId: string
  ): Promise<pg.QueryResultRow | null> {
    const r = await client.query(`${WITH_PLAN_SELECT} WHERE s.paddle_subscription_id = $1`, [
      paddleSubscriptionId,
    ]);
    return r.rows[0] ?? null;
  }

  async getLatestWithPlan(
    client: pg.PoolClient,
    tenantId: string
  ): Promise<pg.QueryResultRow | null> {
    const r = await client.query(
      `${WITH_PLAN_SELECT}
       WHERE s.tenant_id = $1
       ORDER BY s.updated_at DESC
       LIMIT 1`,
      [tenantId]
    );
    return r.rows[0] ?? null;
  }

  async extendTrial(
    client: pg.PoolClient,
    subscriptionId: string,
    trialEndIso: string
  ): Promise<void> {
    await client.query(
      `UPDATE subscriptions SET trial_end_date = $2, renewal_date = $2, updated_at = NOW()
       WHERE id = $1 AND status IN ('trialing', 'active', 'past_due', 'paused', 'pending')`,
      [subscriptionId, trialEndIso]
    );
  }

  async insertTrial(
    client: pg.PoolClient,
    input: {
      id: string;
      tenantId: string;
      planId: string;
      startDate: string;
      trialEndDate: string;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO subscriptions (
         id, tenant_id, plan_id, status, billing_cycle, start_date, trial_end_date, renewal_date
       ) VALUES ($1, $2, $3, 'trialing', 'trial', $4, $5, $5)`,
      [input.id, input.tenantId, input.planId, input.startDate, input.trialEndDate]
    );
  }

  async updateActivated(
    client: pg.PoolClient,
    subscriptionId: string,
    patch: {
      planId: string;
      billingCycle: string;
      renewalDate: string;
      paddleCustomerId: string | null;
      paddleSubscriptionId: string | null;
    }
  ): Promise<void> {
    await client.query(
      `UPDATE subscriptions SET
         plan_id = $2,
         status = 'active',
         billing_cycle = $3,
         renewal_date = $4,
         trial_end_date = NULL,
         canceled_at = NULL,
         cancel_at_period_end = FALSE,
         pending_plan_id = NULL,
         past_due_at = NULL,
         paddle_customer_id = COALESCE($5, paddle_customer_id),
         paddle_subscription_id = COALESCE($6, paddle_subscription_id),
         updated_at = NOW()
       WHERE id = $1`,
      [
        subscriptionId,
        patch.planId,
        patch.billingCycle,
        patch.renewalDate,
        patch.paddleCustomerId,
        patch.paddleSubscriptionId,
      ]
    );
  }

  async insertActivated(
    client: pg.PoolClient,
    input: {
      id: string;
      tenantId: string;
      planId: string;
      billingCycle: string;
      startDate: string;
      renewalDate: string;
      paddleCustomerId: string | null;
      paddleSubscriptionId: string | null;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO subscriptions (
         id, tenant_id, plan_id, status, billing_cycle, start_date, renewal_date,
         paddle_customer_id, paddle_subscription_id
       ) VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, $8)`,
      [
        input.id,
        input.tenantId,
        input.planId,
        input.billingCycle,
        input.startDate,
        input.renewalDate,
        input.paddleCustomerId,
        input.paddleSubscriptionId,
      ]
    );
  }

  async updatePlanId(client: pg.PoolClient, subscriptionId: string, planId: string): Promise<void> {
    await client.query(
      `UPDATE subscriptions SET plan_id = $2, pending_plan_id = NULL, updated_at = NOW() WHERE id = $1`,
      [subscriptionId, planId]
    );
  }

  async setPendingPlan(
    client: pg.PoolClient,
    subscriptionId: string,
    planId: string
  ): Promise<void> {
    await client.query(
      `UPDATE subscriptions SET pending_plan_id = $2, updated_at = NOW() WHERE id = $1`,
      [subscriptionId, planId]
    );
  }

  async setCancelAtPeriodEnd(client: pg.PoolClient, subscriptionId: string): Promise<void> {
    await client.query(
      `UPDATE subscriptions SET cancel_at_period_end = TRUE, updated_at = NOW() WHERE id = $1`,
      [subscriptionId]
    );
  }

  async cancelImmediately(client: pg.PoolClient, subscriptionId: string): Promise<void> {
    await client.query(
      `UPDATE subscriptions SET
         status = 'canceled',
         canceled_at = NOW(),
         cancel_at_period_end = FALSE,
         renewal_date = NULL,
         updated_at = NOW()
       WHERE id = $1`,
      [subscriptionId]
    );
  }

  async clearCancelAtPeriodEnd(client: pg.PoolClient, subscriptionId: string): Promise<void> {
    await client.query(
      `UPDATE subscriptions SET cancel_at_period_end = FALSE, canceled_at = NULL, updated_at = NOW()
       WHERE id = $1`,
      [subscriptionId]
    );
  }

  async reactivateFromCanceled(
    client: pg.PoolClient,
    subscriptionId: string,
    renewalDate: string
  ): Promise<void> {
    await client.query(
      `UPDATE subscriptions SET
         status = 'active',
         canceled_at = NULL,
         cancel_at_period_end = FALSE,
         renewal_date = $2,
         updated_at = NOW()
       WHERE id = $1`,
      [subscriptionId, renewalDate]
    );
  }

  async syncManualLicenseUpdate(
    client: pg.PoolClient,
    subscriptionId: string,
    patch: { planId: string; billingCycle: string; renewalDate: string }
  ): Promise<void> {
    await client.query(
      `UPDATE subscriptions SET
         plan_id = $2,
         status = 'active',
         billing_cycle = $3,
         renewal_date = $4,
         trial_end_date = NULL,
         canceled_at = NULL,
         cancel_at_period_end = FALSE,
         pending_plan_id = NULL,
         past_due_at = NULL,
         updated_at = NOW()
       WHERE id = $1`,
      [subscriptionId, patch.planId, patch.billingCycle, patch.renewalDate]
    );
  }

  async insertManualLicense(
    client: pg.PoolClient,
    input: {
      id: string;
      tenantId: string;
      planId: string;
      billingCycle: string;
      startDate: string;
      renewalDate: string;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO subscriptions (
         id, tenant_id, plan_id, status, billing_cycle, start_date, renewal_date
       ) VALUES ($1, $2, $3, 'active', $4, $5, $6)`,
      [
        input.id,
        input.tenantId,
        input.planId,
        input.billingCycle,
        input.startDate,
        input.renewalDate,
      ]
    );
  }

  async expireTrials(client: pg.PoolClient): Promise<number> {
    const r = await client.query(
      `UPDATE subscriptions SET status = 'expired', updated_at = NOW()
       WHERE status = 'trialing' AND trial_end_date IS NOT NULL AND trial_end_date < NOW()
       RETURNING id`
    );
    return r.rowCount ?? 0;
  }

  async expireCanceledAtPeriodEnd(client: pg.PoolClient): Promise<number> {
    const r = await client.query(
      `UPDATE subscriptions SET status = 'canceled', canceled_at = COALESCE(canceled_at, NOW()), updated_at = NOW()
       WHERE cancel_at_period_end = TRUE AND renewal_date IS NOT NULL AND renewal_date < NOW() AND status IN ('active', 'trialing')
       RETURNING id`
    );
    return r.rowCount ?? 0;
  }

  async getIdByPaddleSubscriptionId(
    client: pg.PoolClient,
    paddleSubscriptionId: string
  ): Promise<string | null> {
    const r = await client.query<{ id: string }>(
      `SELECT id FROM subscriptions WHERE paddle_subscription_id = $1`,
      [paddleSubscriptionId]
    );
    return r.rows[0]?.id ?? null;
  }

  async patchFromPaddle(
    client: pg.PoolClient,
    subscriptionId: string,
    updates: string[],
    params: unknown[]
  ): Promise<void> {
    await client.query(
      `UPDATE subscriptions SET ${updates.join(', ')} WHERE id = $1`,
      params
    );
  }

  async linkPaddleToExisting(
    client: pg.PoolClient,
    subscriptionId: string,
    paddleSubscriptionId: string,
    paddleCustomerId: string | null,
    status: string | null
  ): Promise<void> {
    await client.query(
      `UPDATE subscriptions SET
         paddle_subscription_id = $2,
         paddle_customer_id = COALESCE($3, paddle_customer_id),
         status = COALESCE($4, status),
         updated_at = NOW()
       WHERE id = $1`,
      [subscriptionId, paddleSubscriptionId, paddleCustomerId, status ?? 'active']
    );
  }

  async insertFromPaddle(
    client: pg.PoolClient,
    input: {
      id: string;
      tenantId: string;
      planId: string;
      status: string;
      billingCycle: string;
      paddleCustomerId: string | null;
      paddleSubscriptionId: string;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO subscriptions (
         id, tenant_id, plan_id, status, billing_cycle, start_date, renewal_date,
         paddle_customer_id, paddle_subscription_id
       ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW() + INTERVAL '1 month', $6, $7)`,
      [
        input.id,
        input.tenantId,
        input.planId,
        input.status,
        input.billingCycle,
        input.paddleCustomerId,
        input.paddleSubscriptionId,
      ]
    );
  }

  async markPastDueByPaddleSubId(
    client: pg.PoolClient,
    paddleSubscriptionId: string
  ): Promise<string | null> {
    const r = await client.query<{ tenant_id: string }>(
      `UPDATE subscriptions SET
         status = 'past_due',
         past_due_at = COALESCE(past_due_at, NOW()),
         updated_at = NOW()
       WHERE paddle_subscription_id = $1
       RETURNING tenant_id`,
      [paddleSubscriptionId]
    );
    return r.rows[0]?.tenant_id ?? null;
  }

  async clearPastDueByPaddleSubId(
    client: pg.PoolClient,
    paddleSubscriptionId: string
  ): Promise<void> {
    await client.query(
      `UPDATE subscriptions SET
         status = 'active',
         past_due_at = NULL,
         updated_at = NOW()
       WHERE paddle_subscription_id = $1 AND status = 'past_due'`,
      [paddleSubscriptionId]
    );
  }

  async cancelByPaddleSubId(client: pg.PoolClient, paddleSubscriptionId: string): Promise<void> {
    await client.query(
      `UPDATE subscriptions SET status = 'canceled', canceled_at = NOW(), updated_at = NOW()
       WHERE paddle_subscription_id = $1`,
      [paddleSubscriptionId]
    );
  }

  async resumeByPaddleSubId(client: pg.PoolClient, paddleSubscriptionId: string): Promise<void> {
    await client.query(
      `UPDATE subscriptions SET
         status = 'active',
         past_due_at = NULL,
         cancel_at_period_end = FALSE,
         canceled_at = NULL,
         updated_at = NOW()
       WHERE paddle_subscription_id = $1`,
      [paddleSubscriptionId]
    );
  }
}
