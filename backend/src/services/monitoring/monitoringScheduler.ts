import { getPool } from '../../db/pool.js';
import { runHealthChecks } from './monitoringHealthService.js';
import { logger } from '../../utils/logger.js';

let timer: ReturnType<typeof setInterval> | null = null;

export function startMonitoringScheduler(): void {
  if (process.env.MONITORING_ENABLED === 'false') return;
  if (process.env.MONITORING_SCHEDULER === 'false') return;

  const intervalMs = Number(process.env.MONITORING_HEALTH_INTERVAL_MS ?? String(5 * 60 * 1000));

  const tick = async () => {
    const client = await getPool().connect();
    try {
      const checks = await runHealthChecks(client);
      const unhealthy = checks.filter((c) => c.status === 'unhealthy');
      if (unhealthy.length > 0) {
        logger.warn('[monitoring] Health check degraded', { unhealthy: unhealthy.map((c) => c.component) });
      }
    } catch (err) {
      logger.error('[monitoring] Health scheduler tick failed', { err });
    } finally {
      client.release();
    }
  };

  void tick();
  timer = setInterval(() => void tick(), intervalMs);
  logger.info('[monitoring] Health scheduler started', { intervalMs });
}

export function stopMonitoringScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
