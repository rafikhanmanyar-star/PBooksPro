/**
 * Periodic subscription maintenance (trials, grace period, pending downgrades, webhook retries).
 */

import type { PoolClient } from 'pg';
import { getPool } from '../../db/pool.js';
import { logger } from '../../utils/logger.js';
import { runSubscriptionMaintenance } from './subscriptionLifecycleService.js';

let timer: ReturnType<typeof setInterval> | null = null;

export function isBillingSchedulerEnabled(): boolean {
  if (process.env.DISABLE_BILLING_SCHEDULER === 'true') return false;
  if (process.env.ENABLE_BILLING_SCHEDULER === 'true') return true;
  return process.env.NODE_ENV === 'production';
}

export function startBillingScheduler(): void {
  if (!isBillingSchedulerEnabled()) return;

  const intervalMs = Number(process.env.BILLING_SCHEDULER_INTERVAL_MS ?? String(15 * 60 * 1000));

  const tick = async () => {
    let client: PoolClient | null = null;
    try {
      client = await getPool().connect();
      const result = await runSubscriptionMaintenance(client);
      const total =
        result.lifecycleExpired +
        result.pendingPlansApplied +
        result.pastDueExpired +
        result.webhooksRetried;
      if (total > 0) {
        logger.info('[billing] Maintenance tick completed', result);
      }
    } catch (err) {
      logger.error('[billing] Scheduler tick failed', { err });
    } finally {
      client?.release();
    }
  };

  void tick().catch((err) => logger.error('[billing] Scheduler tick failed', { err }));
  timer = setInterval(() => {
    void tick().catch((err) => logger.error('[billing] Scheduler tick failed', { err }));
  }, intervalMs);
  logger.info('[billing] Subscription scheduler started', { intervalMs });
}

export function stopBillingScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
