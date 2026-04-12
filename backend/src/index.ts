import './loadEnv.js';
import { createServer } from 'node:http';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { getConnectedClientsSnapshot, initRealtime } from './core/realtime.js';
import { getLanIPv4, startDiscoveryUdpBroadcast } from './discoveryUdp.js';
import { authRouter } from './routes/authRoutes.js';
import { journalRouter } from './routes/journalRoutes.js';
import { investorJournalRouter } from './routes/investorJournalRoutes.js';
import { accountsRouter } from './routes/accountsRoutes.js';
import { categoriesRouter } from './routes/categoriesRoutes.js';
import { billsRouter } from './routes/billsRoutes.js';
import { contactsRouter } from './routes/contactsRoutes.js';
import { usersRouter } from './routes/usersRoutes.js';
import { rentalAgreementsRouter } from './routes/rentalAgreementsRoutes.js';
import { projectAgreementsRouter } from './routes/projectAgreementsRoutes.js';
import { projectReceivedAssetsRouter } from './routes/projectReceivedAssetsRoutes.js';
import { salesReturnsRouter } from './routes/salesReturnsRoutes.js';
import { contractsRouter } from './routes/contractsRoutes.js';
import { budgetsRouter } from './routes/budgetsRoutes.js';
import { invoicesRouter } from './routes/invoicesRoutes.js';
import { transactionsRouter } from './routes/transactionsRoutes.js';
import { buildingsRouter } from './routes/buildingsRoutes.js';
import { propertiesRouter } from './routes/propertiesRoutes.js';
import { optionalFeatureRouter } from './routes/optionalFeatureRoutes.js';
import { projectsRouter } from './routes/projectsRoutes.js';
import { unitsRouter } from './routes/unitsRoutes.js';
import { vendorsRouter } from './routes/vendorsRoutes.js';
import { appSettingsRouter } from './routes/appSettingsRoutes.js';
import { stateRouter } from './routes/stateRoutes.js';
import { entityListStubsRouter } from './routes/entityListStubsRoutes.js';
import { recurringInvoiceTemplatesRouter } from './routes/recurringInvoiceTemplatesRoutes.js';
import { payrollRouter } from './routes/payrollRoutes.js';
import { personalFinanceRouter } from './routes/personalFinanceRoutes.js';
import { tasksRouter } from './routes/tasksRoutes.js';
import { databaseBackupRouter } from './routes/databaseBackupRoutes.js';
import { pmCycleAllocationsRouter } from './routes/pmCycleAllocationsRoutes.js';
import { planAmenitiesRouter } from './routes/planAmenitiesRoutes.js';
import { installmentPlansRouter } from './routes/installmentPlansRoutes.js';
import { locksRouter } from './routes/locksRoutes.js';
import { chatRouter } from './routes/chatRoutes.js';
import { balanceSheetRouter } from './routes/balanceSheetRoutes.js';
import { profitLossRouter } from './routes/profitLossRoutes.js';
import { cashFlowRouter } from './routes/cashFlowRoutes.js';
import { trialBalanceRouter } from './routes/trialBalanceRoutes.js';
import { authMiddleware } from './middleware/authMiddleware.js';
import { seedDevIfEnabled } from './seed.js';
import { sendFailure, sendSuccess } from './utils/apiResponse.js';

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

/** LAN + browser clients: allow any origin (JWT in header, not cookies). */
app.use(
  cors({
    origin: '*',
    credentials: false,
  })
);
app.use(express.json({ limit: '2mb' }));

function discoverServerIp(req: express.Request): string {
  const raw = req.socket.localAddress;
  let ip = typeof raw === 'string' ? raw.replace(/^::ffff:/, '') : '';
  if (!ip || ip === '::1' || ip === '127.0.0.1') {
    return getLanIPv4();
  }
  return ip;
}

/** Public: no auth; used for LAN discovery and manual connection checks. */
app.get('/api/discover', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    name: 'PBooksPro Server',
    version: getMonorepoPackageVersion(),
    ip: discoverServerIp(req),
    port: PORT,
    status: 'online',
  });
});

app.get('/health', (_req, res) => {
  sendSuccess(res, {
    ok: true,
    service: 'pbooks-backend',
    serverTime: new Date().toISOString(),
  });
});

/** Public: client update check (VersionService uses raw fetch, no JWT). */
app.get('/api/app-info/version', (_req, res) => {
  res.json({
    version: getMonorepoPackageVersion(),
    environment: process.env.NODE_ENV || 'development',
  });
});

/** Public: WebSocket client count + user names (for API Server Electron tray UI; LAN introspection). */
app.get('/api/server/connected-clients', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const data = await getConnectedClientsSnapshot();
    sendSuccess(res, data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sendFailure(res, 500, 'SERVER_ERROR', msg);
  }
});

app.use('/api', authRouter);

/** Auth + stubs: heartbeat, license, presence, WhatsApp unread (dev parity with cloud API). */
app.use('/api', authMiddleware, optionalFeatureRouter);

app.use('/api', authMiddleware, chatRouter);

app.use('/api', authMiddleware, balanceSheetRouter);

app.use('/api', authMiddleware, profitLossRouter);

app.use('/api', authMiddleware, cashFlowRouter);

app.use('/api', authMiddleware, trialBalanceRouter);

app.use('/api', authMiddleware, accountsRouter);

app.use('/api', authMiddleware, categoriesRouter);

app.use('/api', authMiddleware, billsRouter);

app.use('/api', authMiddleware, contactsRouter);

app.use('/api', authMiddleware, buildingsRouter);

app.use('/api', authMiddleware, propertiesRouter);

app.use('/api', authMiddleware, projectsRouter);

app.use('/api', authMiddleware, unitsRouter);

app.use('/api', authMiddleware, vendorsRouter);

app.use('/api', authMiddleware, appSettingsRouter);

app.use('/api', authMiddleware, stateRouter);

app.use('/api', authMiddleware, rentalAgreementsRouter);

app.use('/api', authMiddleware, projectAgreementsRouter);

app.use('/api', authMiddleware, projectReceivedAssetsRouter);

app.use('/api', authMiddleware, salesReturnsRouter);

app.use('/api', authMiddleware, contractsRouter);

app.use('/api', authMiddleware, budgetsRouter);

app.use('/api', authMiddleware, invoicesRouter);

/** GL journal routes use /transactions/journal — register before app ledger /transactions/:id */
app.use('/api', authMiddleware, journalRouter);

app.use('/api', authMiddleware, investorJournalRouter);

app.use('/api', authMiddleware, transactionsRouter);

app.use('/api', authMiddleware, usersRouter);

app.use('/api', authMiddleware, databaseBackupRouter);

app.use('/api', authMiddleware, recurringInvoiceTemplatesRouter);

app.use('/api', authMiddleware, pmCycleAllocationsRouter);

app.use('/api', authMiddleware, planAmenitiesRouter);

app.use('/api', authMiddleware, installmentPlansRouter);

app.use('/api', authMiddleware, locksRouter);

app.use('/api', authMiddleware, payrollRouter);

app.use('/api', authMiddleware, personalFinanceRouter);

app.use('/api', authMiddleware, tasksRouter);

/** Empty list stubs for entities not yet ported to this API (avoids HTML 404 on loadState). */
app.use('/api', authMiddleware, entityListStubsRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  sendFailure(
    res,
    500,
    'SERVER_ERROR',
    err instanceof Error ? err.message : 'Internal error'
  );
});

async function start() {
  if (!process.env.DATABASE_URL) {
    console.warn('Warning: DATABASE_URL not set — API will fail on first DB access');
  }
  await seedDevIfEnabled();
  const httpServer = createServer(app);
  initRealtime(httpServer);
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`PBooks API listening on http://0.0.0.0:${PORT}/api (WebSocket: same port)`);
    startDiscoveryUdpBroadcast(PORT);
  });
}

start().catch((e) => {
  console.error(e);
  process.exit(1);
});
