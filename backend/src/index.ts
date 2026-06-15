import './loadEnv.js';
import { createServer } from 'node:http';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { getConnectedClientsSnapshot, initRealtime } from './core/realtime.js';
import { getLanIPv4, startDiscoveryUdpBroadcast } from './discoveryUdp.js';
import { runPendingMigrations } from './migrate.js';
import { isMfaEnforcementEnabled } from './services/auth/mfaService.js';
import { paddleWebhookRouter } from './routes/paddleWebhookRoutes.js';
import { authMiddleware, optionalAuthMiddleware } from './middleware/authMiddleware.js';
import {
  publicIntrospectionLimiter,
  requireConnectedClientsAccess,
  requireDiscoveryToken,
} from './middleware/introspectionGuard.js';
import { seedDevIfEnabled, seedStagingIfEnabled, seedDemoIfEnabled } from './seed.js';
import { sendSuccess, handleRouteError } from './utils/apiResponse.js';
import { applyTrustProxyAndSecurity } from './middleware/trustProxyAndSecurity.js';
import { requestLoggingMiddleware } from './middleware/requestLogging.js';
import type { RequestWithId } from './middleware/requestLogging.js';
import {
  idempotencyBodyMiddleware,
  idempotencyMiddleware,
} from './middleware/idempotencyMiddleware.js';
import { performanceTimingMiddleware } from './middleware/performanceTimingMiddleware.js';
import { assertProductionEnv } from './utils/productionEnvCheck.js';
import { startBackupScheduler } from './modules/backup/services/backupSchedulerService.js';
import { startBillingScheduler } from './services/billing/billingSchedulerService.js';
import { startMarketingEmailScheduler } from './services/marketing/marketingEmailScheduler.js';
import { startEmailAutomationScheduler } from './services/emailAutomation/emailAutomationScheduler.js';
import { startDemoResetScheduler } from './services/demo/demoSchedulerService.js';
import { startMonitoringScheduler } from './services/monitoring/monitoringScheduler.js';
import { initObservabilityProviders } from './services/monitoring/observabilityProvider.js';
import { adminPortalRouter } from './routes/adminPortalRoutes.js';
import { mountVersionedApi } from './routes/mountVersionedApi.js';
import { whatsappWebhookRouter } from './routes/whatsappWebhookRoutes.js';
import { startDashboardSnapshotScheduler } from './modules/dashboard/services/dashboardSnapshotScheduler.js';
import { startReportScheduleScheduler } from './modules/reporting/services/reportScheduleScheduler.js';
import { auditRequestContextMiddleware } from './middleware/auditRequestContext.js';
import { sendLivenessResponse } from './routes/healthLiveness.js';

function getMonorepoPackageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const rootPkg = join(here, '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(rootPkg, 'utf-8')) as { version?: string };
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;

applyTrustProxyAndSecurity(app);
assertProductionEnv();

app.use(
  cors({
    origin: '*',
    credentials: false,
  })
);

app.use('/api/webhooks/paddle', express.raw({ type: 'application/json' }), paddleWebhookRouter);
app.use('/api/whatsapp/webhook', express.json({ limit: '2mb' }), whatsappWebhookRouter);

app.use(express.json({ limit: '2mb' }));
app.use(requestLoggingMiddleware);
app.use(performanceTimingMiddleware);
app.use(idempotencyBodyMiddleware);
app.use(idempotencyMiddleware);

function discoverServerIp(req: express.Request): string {
  const raw = req.socket.localAddress;
  let ip = typeof raw === 'string' ? raw.replace(/^::ffff:/, '') : '';
  if (!ip || ip === '::1' || ip === '127.0.0.1') {
    return getLanIPv4();
  }
  return ip;
}

app.get('/api/discover', publicIntrospectionLimiter, requireDiscoveryToken, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    name: 'PBooksPro Server',
    version: getMonorepoPackageVersion(),
    ip: discoverServerIp(req),
    port: PORT,
    status: 'online',
    apiVersion: 'v1',
  });
});

app.get('/api/v1/discover', publicIntrospectionLimiter, requireDiscoveryToken, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    name: 'PBooksPro Server',
    version: getMonorepoPackageVersion(),
    ip: discoverServerIp(req),
    port: PORT,
    status: 'online',
    apiVersion: 'v1',
  });
});

app.get('/health', publicIntrospectionLimiter, (_req, res) => {
  sendLivenessResponse(res);
});

app.get('/api/app-info/version', publicIntrospectionLimiter, (_req, res) => {
  res.json({
    version: getMonorepoPackageVersion(),
    environment: process.env.NODE_ENV || 'development',
    apiVersion: 'v1',
  });
});

app.get('/api/v1/app-info/version', publicIntrospectionLimiter, (_req, res) => {
  res.json({
    version: getMonorepoPackageVersion(),
    environment: process.env.NODE_ENV || 'development',
    apiVersion: 'v1',
  });
});

app.get(
  '/api/server/connected-clients',
  optionalAuthMiddleware,
  requireConnectedClientsAccess,
  async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const data = await getConnectedClientsSnapshot();
      sendSuccess(res, data);
    } catch (e) {
      handleRouteError(res, e, { route: '/api/server/connected-clients' });
    }
  }
);

app.get(
  '/api/v1/server/connected-clients',
  optionalAuthMiddleware,
  requireConnectedClientsAccess,
  async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const data = await getConnectedClientsSnapshot();
      sendSuccess(res, data);
    } catch (e) {
      handleRouteError(res, e, { route: '/api/v1/server/connected-clients' });
    }
  }
);

/** Standalone admin portal — not tenant-scoped, not versioned. */
app.use('/api/admin', adminPortalRouter);

app.use('/api/v1', auditRequestContextMiddleware);

/** Canonical API (Architecture v2). */
mountVersionedApi(app, '/api/v1');

app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  handleRouteError(res, err, {
    route: req.originalUrl,
    payload: { requestId: (req as RequestWithId).requestId },
  });
});

async function start() {
  initObservabilityProviders();
  if (!process.env.DATABASE_URL) {
    console.warn('Warning: DATABASE_URL not set — API will fail on first DB access');
  } else {
    try {
      const applied = await runPendingMigrations({ quiet: true });
      if (applied > 0) {
        console.log(`Applied ${applied} pending database migration(s) on startup.`);
      }
    } catch (e) {
      console.error('Database migration on startup failed:', e);
      process.exit(1);
    }
  }
  console.log(
    `MFA enforcement for privileged roles: ${isMfaEnforcementEnabled() ? 'ON' : 'OFF (DISABLE_MFA_ENFORCEMENT=true)'}`
  );
  const { isEnvFlagEnabled } = await import('./utils/envFlag.js');
  console.log(
    `Website funnels: self-signup=${isEnvFlagEnabled('ALLOW_SELF_SIGNUP') ? 'ON' : 'OFF'} | trial=${isEnvFlagEnabled('ALLOW_TRIAL_SIGNUP') ? 'ON' : 'OFF'}`
  );
  await seedDevIfEnabled();
  await seedStagingIfEnabled();
  await seedDemoIfEnabled();
  const httpServer = createServer(app);
  initRealtime(httpServer);
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(
      `PBooks API listening on http://0.0.0.0:${PORT}/api/v1 (WebSocket: same port)`
    );
    startDiscoveryUdpBroadcast(PORT);
    startBackupScheduler();
    startBillingScheduler();
    startDemoResetScheduler();
    startMarketingEmailScheduler();
    startEmailAutomationScheduler();
    startMonitoringScheduler();
    startDashboardSnapshotScheduler();
    startReportScheduleScheduler();
  });
}

start().catch((e) => {
  console.error(e);
  process.exit(1);
});
