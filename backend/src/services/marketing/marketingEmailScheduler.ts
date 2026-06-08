import { getPool } from '../../db/pool.js';
import { processDueMarketingEmails } from './emailSequenceService.js';
import { logger } from '../../utils/logger.js';

let timer: ReturnType<typeof setInterval> | null = null;

export function startMarketingEmailScheduler(): void {
  if (process.env.MARKETING_LEADS_ENABLED !== 'true') return;
  if (process.env.MARKETING_EMAIL_SCHEDULER !== 'true') return;

  const intervalMs = Number(process.env.MARKETING_EMAIL_INTERVAL_MS ?? String(5 * 60 * 1000));

  const tick = async () => {
    const client = await getPool().connect();
    try {
      const sent = await processDueMarketingEmails(client);
      if (sent > 0) logger.info('[marketing] Processed email queue', { sent });
    } catch (err) {
      logger.error('[marketing] Email scheduler tick failed', { err });
    } finally {
      client.release();
    }
  };

  void tick();
  timer = setInterval(() => void tick(), intervalMs);
  logger.info('[marketing] Email scheduler started', { intervalMs });
}

export function stopMarketingEmailScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
