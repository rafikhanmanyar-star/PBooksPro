import type { PoolClient } from 'pg';
import { getPool } from '../../db/pool.js';
import { processDueAutomationEmails } from './emailAutomationQueueService.js';
import { processScheduledCampaigns } from './emailAutomationCampaignService.js';
import { logger } from '../../utils/logger.js';

let timer: ReturnType<typeof setInterval> | null = null;

export function startEmailAutomationScheduler(): void {
  if (process.env.EMAIL_AUTOMATION_ENABLED !== 'true') return;
  if (process.env.EMAIL_AUTOMATION_SCHEDULER === 'false') return;

  const intervalMs = Number(process.env.EMAIL_AUTOMATION_INTERVAL_MS ?? String(5 * 60 * 1000));

  const tick = async () => {
    let client: PoolClient | null = null;
    try {
      client = await getPool().connect();
      const campaigns = await processScheduledCampaigns(client);
      const result = await processDueAutomationEmails(client);
      if (result.sent > 0 || result.failed > 0 || campaigns > 0) {
        logger.info('[email-automation] Scheduler tick', { ...result, campaigns });
      }
    } catch (err) {
      logger.error('[email-automation] Scheduler tick failed', { err });
    } finally {
      client?.release();
    }
  };

  void tick().catch((err) => logger.error('[email-automation] Scheduler tick failed', { err }));
  timer = setInterval(() => {
    void tick().catch((err) => logger.error('[email-automation] Scheduler tick failed', { err }));
  }, intervalMs);
  logger.info('[email-automation] Scheduler started', { intervalMs });
}

export function stopEmailAutomationScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
