import type pg from 'pg';
import { getPool } from '../../db/pool.js';
import { getObservabilityStatus } from './observabilityProvider.js';

export type HealthComponent = {
  component: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  message: string;
  details?: Record<string, unknown>;
  checkedAt: string;
};

async function upsertHealthCheck(
  client: pg.PoolClient,
  component: string,
  status: string,
  message: string,
  details: Record<string, unknown>
): Promise<void> {
  await client.query(
    `INSERT INTO monitoring_health_checks (component, status, message, details, checked_at)
     VALUES ($1, $2, $3, $4::jsonb, NOW())
     ON CONFLICT (component) DO UPDATE SET
       status = EXCLUDED.status,
       message = EXCLUDED.message,
       details = EXCLUDED.details,
       checked_at = NOW()`,
    [component, status, message, JSON.stringify(details)]
  );
}

export async function runHealthChecks(client: pg.PoolClient): Promise<HealthComponent[]> {
  const results: HealthComponent[] = [];
  const now = new Date().toISOString();

  // Database
  try {
    const start = Date.now();
    await client.query('SELECT 1');
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
    await upsertHealthCheck(client, 'database', status, db.message, db.details ?? {});
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Database unreachable';
    results.push({
      component: 'database',
      status: 'unhealthy',
      message,
      checkedAt: now,
    });
    await upsertHealthCheck(client, 'database', 'unhealthy', message, {});
  }

  // Email queue failures (last 24h)
  try {
    const { rows } = await client.query<{ failed: string; pending: string }>(
      `SELECT
         (SELECT COUNT(*)::text FROM email_automation_queue WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '24 hours') AS failed,
         (SELECT COUNT(*)::text FROM email_automation_queue WHERE status = 'pending') AS pending`
    );
    const failed = Number(rows[0]?.failed ?? 0);
    const pending = Number(rows[0]?.pending ?? 0);
    const status = failed >= 10 ? 'degraded' : 'healthy';
    const email: HealthComponent = {
      component: 'email_queue',
      status,
      message: `${failed} failed (24h), ${pending} pending`,
      details: { failed24h: failed, pending },
      checkedAt: now,
    };
    results.push(email);
    await upsertHealthCheck(client, 'email_queue', status, email.message, email.details ?? {});
  } catch {
    results.push({
      component: 'email_queue',
      status: 'unknown',
      message: 'Email automation tables not available',
      checkedAt: now,
    });
  }

  // Payment webhooks
  try {
    const { rows } = await client.query<{ failed: string }>(
      `SELECT COUNT(*)::text AS failed FROM paddle_webhook_deliveries
       WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '24 hours'`
    );
    const failed = Number(rows[0]?.failed ?? 0);
    const status = failed >= 5 ? 'degraded' : 'healthy';
    const payment: HealthComponent = {
      component: 'payment_webhooks',
      status,
      message: `${failed} failed Paddle webhooks (24h)`,
      details: { failedWebhooks24h: failed, paddleConfigured: Boolean(process.env.PADDLE_API_KEY) },
      checkedAt: now,
    };
    results.push(payment);
    await upsertHealthCheck(client, 'payment_webhooks', status, payment.message, payment.details ?? {});
  } catch {
    results.push({
      component: 'payment_webhooks',
      status: 'unknown',
      message: 'Billing tables not available',
      checkedAt: now,
    });
  }

  // Observability integrations
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
  await upsertHealthCheck(client, 'observability', obsStatus, results[results.length - 1]!.message, obs);

  // Recent monitoring errors
  try {
    const { rows } = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM monitoring_events
       WHERE severity IN ('error', 'critical') AND created_at >= NOW() - INTERVAL '1 hour'`
    );
    const count = Number(rows[0]?.count ?? 0);
    const appStatus = count >= 50 ? 'degraded' : 'healthy';
    results.push({
      component: 'application',
      status: appStatus,
      message: `${count} errors in the last hour`,
      details: { errorsLastHour: count },
      checkedAt: now,
    });
    await upsertHealthCheck(client, 'application', appStatus, `${count} errors in the last hour`, {
      errorsLastHour: count,
    });
  } catch {
    /* monitoring tables may not exist yet */
  }

  return results;
}

export async function getStoredHealthChecks(client: pg.PoolClient): Promise<HealthComponent[]> {
  const { rows } = await client.query(
    `SELECT component, status, message, details, checked_at FROM monitoring_health_checks ORDER BY component`
  );
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
