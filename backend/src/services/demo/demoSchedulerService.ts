import { resetPublicDemoTenant } from './demoResetService.js';
import { isDemoEnvironmentEnabled } from '../../constants/demoEnvironment.js';
import { logger } from '../../utils/logger.js';

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let lastResetDayKey: string | null = null;

function todayKeyUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function resetHourUtc(): number {
  const h = Number(process.env.DEMO_RESET_HOUR_UTC ?? '3');
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : 3;
}

async function maybeRunDailyReset(): Promise<void> {
  if (!isDemoEnvironmentEnabled()) return;
  if (process.env.DEMO_AUTO_RESET !== 'true') return;

  const now = new Date();
  if (now.getUTCHours() < resetHourUtc()) return;

  const dayKey = todayKeyUtc();
  if (lastResetDayKey === dayKey) return;

  try {
    await resetPublicDemoTenant();
    lastResetDayKey = dayKey;
  } catch (err) {
    logger.error('Scheduled demo reset failed', { err });
  }
}

export function startDemoResetScheduler(): void {
  if (!isDemoEnvironmentEnabled() || process.env.DEMO_AUTO_RESET !== 'true') return;

  const intervalMs = Number(process.env.DEMO_RESET_CHECK_INTERVAL_MS ?? String(15 * 60 * 1000));

  if (process.env.DEMO_RESET_ON_STARTUP === 'true') {
    void maybeRunDailyReset();
  }

  schedulerTimer = setInterval(() => {
    void maybeRunDailyReset();
  }, intervalMs);

  logger.info('Demo reset scheduler started', {
    resetHourUtc: resetHourUtc(),
    intervalMs,
  });
}

export function stopDemoResetScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}
