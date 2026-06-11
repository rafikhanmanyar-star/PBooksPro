/**
 * Background subscription maintenance: pending downgrades, grace expiry, trial/cancel sweeps.
 */

import type pg from 'pg';
import { logSubscriptionEvent } from './subscriptionEventService.js';
import { expireTrialsAndCanceled } from './subscriptionService.js';
import { retryFailedWebhookDeliveries } from './paddleWebhookProcessor.js';
import {
  getPastDueGraceDays,
  gracePeriodEndsAt,
  isWithinPastDueGrace,
} from './subscriptionGraceUtils.js';

export { getPastDueGraceDays, gracePeriodEndsAt, isWithinPastDueGrace };

export async function applyPendingPlanChanges(client: pg.PoolClient): Promise<number> {
  const { rows } = await client.query<{
    id: string;
    tenant_id: string;
    plan_id: string;
  }>(
    `UPDATE subscriptions
     SET plan_id = pending_plan_id,
         pending_plan_id = NULL,
         updated_at = NOW()
     WHERE pending_plan_id IS NOT NULL
       AND renewal_date IS NOT NULL
       AND renewal_date <= NOW()
       AND status IN ('active', 'past_due')
     RETURNING id, tenant_id, plan_id`
  );

  for (const row of rows) {
    await logSubscriptionEvent(client, {
      tenantId: row.tenant_id,
      eventType: 'pending_plan_applied',
      payload: {
        subscriptionId: row.id,
        planId: row.plan_id,
      },
    });
  }

  return rows.length;
}

export async function expirePastDueAfterGrace(client: pg.PoolClient): Promise<number> {
  const graceDays = getPastDueGraceDays();
  const { rows } = await client.query<{ id: string }>(
    `UPDATE subscriptions
     SET status = 'expired', updated_at = NOW()
     WHERE status = 'past_due'
       AND past_due_at IS NOT NULL
       AND past_due_at + ($1::int * INTERVAL '1 day') < NOW()
     RETURNING id`,
    [graceDays]
  );
  return rows.length;
}

export type SubscriptionMaintenanceResult = {
  lifecycleExpired: number;
  pendingPlansApplied: number;
  pastDueExpired: number;
  webhooksRetried: number;
};

export async function runSubscriptionMaintenance(
  client: pg.PoolClient
): Promise<SubscriptionMaintenanceResult> {
  const lifecycleExpired = await expireTrialsAndCanceled(client);
  const pendingPlansApplied = await applyPendingPlanChanges(client);
  const pastDueExpired = await expirePastDueAfterGrace(client);
  const webhooksRetried = await retryFailedWebhookDeliveries(client);

  return {
    lifecycleExpired,
    pendingPlansApplied,
    pastDueExpired,
    webhooksRetried,
  };
}
