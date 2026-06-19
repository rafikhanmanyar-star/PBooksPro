import type { Server as HttpServer } from 'node:http';
import { shutdownRealtime } from './core/realtime.js';
import { closePool } from './db/pool.js';
import { stopDiscoveryUdpBroadcast } from './discoveryUdp.js';
import { stopBackupScheduler } from './modules/backup/services/backupSchedulerService.js';
import { stopDashboardSnapshotScheduler } from './modules/dashboard/services/dashboardSnapshotScheduler.js';
import { stopReportScheduleScheduler } from './modules/reporting/services/reportScheduleScheduler.js';
import { stopBillingScheduler } from './services/billing/billingSchedulerService.js';
import { stopDemoResetScheduler } from './services/demo/demoSchedulerService.js';
import { stopEmailAutomationScheduler } from './services/emailAutomation/emailAutomationScheduler.js';
import { stopMarketingEmailScheduler } from './services/marketing/marketingEmailScheduler.js';
import { stopMonitoringScheduler } from './services/monitoring/monitoringScheduler.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

let shuttingDown = false;

function stopBackgroundWork(): void {
  stopDiscoveryUdpBroadcast();
  stopBackupScheduler();
  stopBillingScheduler();
  stopDemoResetScheduler();
  stopMarketingEmailScheduler();
  stopEmailAutomationScheduler();
  stopMonitoringScheduler();
  stopDashboardSnapshotScheduler();
  stopReportScheduleScheduler();
}

async function closeHttpServer(httpServer: HttpServer): Promise<void> {
  const closeAll =
    typeof (httpServer as HttpServer & { closeAllConnections?: () => void }).closeAllConnections ===
    'function'
      ? () => (httpServer as HttpServer & { closeAllConnections: () => void }).closeAllConnections()
      : null;
  if (closeAll) {
    try {
      closeAll();
    } catch {
      /* ignore */
    }
  }

  await new Promise<void>((resolve, reject) => {
    httpServer.close((err) => (err ? reject(err) : resolve()));
  });
}

export function registerGracefulShutdown(httpServer: HttpServer): void {
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] Received ${signal}, releasing port and closing connections…`);

    const forceExit = setTimeout(() => {
      console.error('[shutdown] Timed out — forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    try {
      stopBackgroundWork();
      await shutdownRealtime();
      await closeHttpServer(httpServer);
      await closePool();
      clearTimeout(forceExit);
      console.log('[shutdown] Clean exit');
      process.exit(0);
    } catch (e) {
      console.error('[shutdown] Error during shutdown:', e);
      process.exit(1);
    }
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
  if (process.platform === 'win32') {
    process.once('SIGBREAK', () => void shutdown('SIGBREAK'));
  }
}
