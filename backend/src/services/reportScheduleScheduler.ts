import type { PoolClient } from 'pg';
import { getPool } from '../db/pool.js';
import { processDueReportSchedules } from '../modules/reporting/services/reportScheduleService.js';
import { logger } from '../utils/logger.js';

let timer: ReturnType<typeof setInterval> | null = null;

export function startReportScheduleScheduler(): void {
  if (process.env.REPORT_SCHEDULER !== 'true') return;

  const intervalMs = Number(process.env.REPORT_SCHEDULER_INTERVAL_MS ?? String(10 * 60 * 1000));

  const tick = async () => {
    let client: PoolClient | null = null;
    try {
      client = await getPool().connect();
      await client.query('BEGIN');
      const processed = await processDueReportSchedules(client);
      await client.query('COMMIT');
      if (processed > 0) {
        logger.info('[report-schedule] Processed due schedules', { processed });
      }
    } catch (err) {
      if (client) await client.query('ROLLBACK').catch(() => undefined);
      logger.error('[report-schedule] Scheduler tick failed', { err });
    } finally {
      client?.release();
    }
  };

  void tick().catch((err) => logger.error('[report-schedule] Scheduler tick failed', { err }));
  timer = setInterval(() => {
    void tick().catch((err) => logger.error('[report-schedule] Scheduler tick failed', { err }));
  }, intervalMs);
  logger.info('[report-schedule] Scheduler started', { intervalMs });
}

export function stopReportScheduleScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
