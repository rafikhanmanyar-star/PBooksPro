import type pg from 'pg';
import { getPool } from '../../db/pool.js';
import { getObservabilityStatus } from './observabilityProvider.js';
import { MonitoringEventRepository, MonitoringHealthRepository } from '../../modules/monitoring/repositories/MonitoringRepository.js';

export type HealthComponent = {
  component: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  message: string;
  details?: Record<string, unknown>;
  checkedAt: string;
};

const healthRepo = new MonitoringHealthRepository();
const eventRepo = new MonitoringEventRepository();

export async function runHealthChecks(client: pg.PoolClient): Promise<HealthComponent[]> {
  const results: HealthComponent[] = [];
  const now = new Date().toISOString();

  try {
    const start = Date.now();
    await healthRepo.ping(client);
    const latencyMs = Date.now() - start;
    const status = latencyMs > 500 ? 'degraded' : 'healthy';
    const db: HealthComponent = {
      component: 'database',
      status,
      message: status === 'healthy' ? 'PostgreSQL reachable' : `PostgreSQL slow (${latencyMs}ms)`,
      details: { latencyMs },
      checkedAt: now,
    };
    results.push(db);
    await healthRepo.upsert(client, 'database', status, db.message, JSON.stringify(db.details ?? {}));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database unreachable';
    results.push({
      component: 'database',
      status: 'unhealthy',
      message,
      checkedAt: now,
    });
    await healthRepo.upsert(client, 'database', 'unhealthy', message, '{}');
  }

  try {
    const stats = await healthRepo.getEmailQueueStats(client);
    const failed = Number(stats?.failed ?? 0);
    const pending = Number(stats?.pending ?? 0);
    const status = failed >= 10 ? 'degraded' : 'healthy';
    const email: HealthComponent = {
      component: 'email_queue',
      status,
      message: `${failed} failed (24h), ${pending} pending`,
      details: { failed24h: failed, pending },
      checkedAt: now,
    };
    results.push(email);
    await healthRepo.upsert(client, 'email_queue', status, email.message, JSON.stringify(email.details ?? {}));
  } catch {
    results.push({
      component: 'email_queue',
      status: 'unknown',
      message: 'Email automation tables not available',
      checkedAt: now,
    });
  }

  try {
    const failed = await healthRepo.getFailedPaddleWebhooks24h(client);
    const status = failed >= 5 ? 'degraded' : 'healthy';
    const payment: HealthComponent = {
      component: 'payment_webhooks',
      status,
      message: `${failed} failed Paddle webhooks (24h)`,
      details: { failedWebhooks24h: failed, paddleConfigured: Boolean(process.env.PADDLE_API_KEY) },
      checkedAt: now,
    };
    results.push(payment);
    await healthRepo.upsert(
      client,
      'payment_webhooks',
      status,
      payment.message,
      JSON.stringify(payment.details ?? {})
    );
  } catch {
    results.push({
      component: 'payment_webhooks',
      status: 'unknown',
      message: 'Billing tables not available',
      checkedAt: now,
    });
  }

  const obs = getObservabilityStatus();
  const obsStatus = obs.registeredProviders.length > 0 ? 'healthy' : 'degraded';
  results.push({
    component: 'observability',
    status: obsStatus,
    message:
      obs.registeredProviders.length > 0
        ? `Providers: ${obs.registeredProviders.join(', ')}`
        : 'No external APM configured',
    details: obs,
    checkedAt: now,
  });
  await healthRepo.upsert(client, 'observability', obsStatus, results[results.length - 1]!.message, JSON.stringify(obs));

  try {
    const count = await eventRepo.countRecentErrors(client);
    const appStatus = count >= 50 ? 'degraded' : 'healthy';
    results.push({
      component: 'application',
      status: appStatus,
      message: `${count} errors in the last hour`,
      details: { errorsLastHour: count },
      checkedAt: now,
    });
    await healthRepo.upsert(client, 'application', appStatus, `${count} errors in the last hour`, JSON.stringify({
      errorsLastHour: count,
    }));
  } catch {
    /* monitoring tables may not exist yet */
  }

  try {
    const syncCounts = await client.query<{ status: string; c: string }>(
      `SELECT status, COUNT(*)::text AS c FROM sync_queue GROUP BY status`
    );
    const pending = Number(syncCounts.rows.find((r) => r.status === 'pending')?.c ?? 0);
    const failed = Number(syncCounts.rows.find((r) => r.status === 'failed')?.c ?? 0);
    const syncStatus = failed > 0 ? 'degraded' : pending > 50 ? 'degraded' : 'healthy';
    const syncMsg = `pending=${pending}, failed=${failed}`;
    results.push({
      component: 'sync_queue',
      status: syncStatus,
      message: syncMsg,
      details: { pending, failed },
      checkedAt: now,
    });
    await healthRepo.upsert(client, 'sync_queue', syncStatus, syncMsg, JSON.stringify({ pending, failed }));
  } catch {
    results.push({
      component: 'sync_queue',
      status: 'unknown',
      message: 'sync_queue table not available',
      checkedAt: now,
    });
  }

  try {
    const pool = getPool();
    const poolStatus =
      pool.waitingCount > 0 ? 'degraded' : pool.totalCount >= ((pool as { options?: { max?: number } }).options?.max ?? 20) ? 'degraded' : 'healthy';
    const poolMsg = `active=${pool.totalCount - pool.idleCount}, idle=${pool.idleCount}, waiting=${pool.waitingCount}`;
    results.push({
      component: 'connection_pool',
      status: poolStatus,
      message: poolMsg,
      details: {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
      },
      checkedAt: now,
    });
    await healthRepo.upsert(client, 'connection_pool', poolStatus, poolMsg, JSON.stringify({
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    }));
  } catch {
    /* pool unavailable */
  }

  return results;
}

export async function getStoredHealthChecks(client: pg.PoolClient): Promise<HealthComponent[]> {
  const rows = await healthRepo.listStored(client);
  return rows.map((row) => ({
    component: row.component,
    status: row.status,
    message: row.message ?? '',
    details: row.details as Record<string, unknown>,
    checkedAt: row.checked_at,
  }));
}

export function aggregateHealth(components: HealthComponent[]): {
  status: 'healthy' | 'degraded' | 'unhealthy';
  components: HealthComponent[];
} {
  if (components.some((c) => c.status === 'unhealthy')) {
    return { status: 'unhealthy', components };
  }
  if (components.some((c) => c.status === 'degraded')) {
    return { status: 'degraded', components };
  }
  return { status: 'healthy', components };
}

export async function runReadinessCheck(): Promise<ReturnType<typeof aggregateHealth>> {
  const client = await getPool().connect();
  try {
    const components = await runHealthChecks(client);
    return aggregateHealth(components);
  } finally {
    client.release();
  }
}
