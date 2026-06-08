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
import { mfaRouter } from './routes/mfaRoutes.js';
import { journalRouter } from './routes/journalRoutes.js';
import { accountingPeriodsRouter } from './routes/accountingPeriodsRoutes.js';
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
import { quotationsRouter } from './routes/quotationsRoutes.js';
import { documentsRouter } from './routes/documentsRoutes.js';
import { transactionAuditRouter } from './routes/transactionAuditRoutes.js';
import { appSettingsRouter } from './routes/appSettingsRoutes.js';
import { stateRouter } from './routes/stateRoutes.js';
import { recurringInvoiceTemplatesRouter } from './routes/recurringInvoiceTemplatesRoutes.js';
import { payrollRouter } from './routes/payrollRoutes.js';
import { contractorRouter } from './routes/contractorRoutes.js';
import { personalFinanceRouter } from './routes/personalFinanceRoutes.js';
import { tasksRouter } from './routes/tasksRoutes.js';
import { databaseBackupRouter } from './routes/databaseBackupRoutes.js';
import { backupSchedulerRouter } from './routes/backupSchedulerRoutes.js';
import { backupStorageRouter } from './routes/backupStorageRoutes.js';
import { backupSecurityRouter } from './routes/backupSecurityRoutes.js';
import { tenantBackupRouter } from './routes/tenantBackupRoutes.js';
import { disasterRecoveryRouter } from './routes/disasterRecoveryRoutes.js';
import { subscriptionBillingRouter } from './routes/subscriptionBillingRoutes.js';
import { paymentsRouter } from './routes/paymentsRoutes.js';
import { legalRouter } from './routes/legalRoutes.js';
import { paddleWebhookRouter } from './routes/paddleWebhookRoutes.js';
import { pmCycleAllocationsRouter } from './routes/pmCycleAllocationsRoutes.js';
import { planAmenitiesRouter } from './routes/planAmenitiesRoutes.js';
import { installmentPlansRouter } from './routes/installmentPlansRoutes.js';
import { locksRouter } from './routes/locksRoutes.js';
import { chatRouter } from './routes/chatRoutes.js';
import { balanceSheetRouter } from './routes/balanceSheetRoutes.js';
import { profitLossRouter } from './routes/profitLossRoutes.js';
import { cashFlowRouter } from './routes/cashFlowRoutes.js';
import { trialBalanceRouter } from './routes/trialBalanceRoutes.js';
import { financialReconciliationRouter } from './routes/financialReconciliationRoutes.js';
import { rentalOwnerSummariesRouter } from './routes/rentalOwnerSummariesRoutes.js';
import { customReportsRouter } from './routes/customReportsRoutes.js';
import { ownerRentalIncomeRouter } from './routes/ownerRentalIncomeRoutes.js';
import { rentalBillsDashboardRouter } from './routes/rentalBillsDashboardRoutes.js';
import { rentalReceivableRouter } from './routes/rentalReceivableRoutes.js';
import { ownerIncomeSummaryRouter } from './routes/ownerIncomeSummaryRoutes.js';
import { ownerSecurityDepositRouter } from './routes/ownerSecurityDepositRoutes.js';
import { serviceChargesDeductionRouter } from './routes/serviceChargesDeductionRoutes.js';
import { bmAnalysisRouter } from './routes/bmAnalysisRoutes.js';
import { tenantLedgerRouter } from './routes/tenantLedgerRoutes.js';
import { clientLedgerRouter } from './routes/clientLedgerRoutes.js';
import { vendorLedgerRouter } from './routes/vendorLedgerRoutes.js';
import { authMiddleware, optionalAuthMiddleware } from './middleware/authMiddleware.js';
import { requireActiveSubscription } from './middleware/licenseEnforcementMiddleware.js';
import { requireFinancialWriteOnMutations, requirePayrollAccess, requirePermission } from './middleware/rbacMiddleware.js';
import { permissionsRouter } from './routes/permissionsRoutes.js';
import { auditTrailRouter } from './routes/auditTrailRoutes.js';
import { privacyRouter } from './routes/privacyRoutes.js';
import {
  publicIntrospectionLimiter,
  requireConnectedClientsAccess,
  requireDiscoveryToken,
} from './middleware/introspectionGuard.js';
import { seedDevIfEnabled, seedStagingIfEnabled, seedDemoIfEnabled } from './seed.js';
import { demoRouter } from './routes/demoRoutes.js';
import { marketingRouter } from './routes/marketingRoutes.js';
import { supportRouter } from './routes/supportRoutes.js';
import { startMarketingEmailScheduler } from './services/marketing/marketingEmailScheduler.js';
import { startEmailAutomationScheduler } from './services/emailAutomation/emailAutomationScheduler.js';
import { emailAutomationPublicRouter } from './routes/emailAutomationPublicRoutes.js';
import { adminEmailAutomationRouter } from './routes/adminEmailAutomationRoutes.js';
import { startDemoResetScheduler } from './services/demo/demoSchedulerService.js';
import { sendFailure, sendSuccess } from './utils/apiResponse.js';
import { applyTrustProxyAndSecurity } from './middleware/trustProxyAndSecurity.js';
import { requestLoggingMiddleware } from './middleware/requestLogging.js';
import type { RequestWithId } from './middleware/requestLogging.js';
import { assertProductionEnv } from './utils/productionEnvCheck.js';
import { handleRouteError } from './utils/apiResponse.js';
import { startBackupScheduler } from './services/backupSchedulerService.js';
import { startBillingScheduler } from './services/billing/billingSchedulerService.js';
import { adminSubscriptionRouter } from './routes/adminSubscriptionRoutes.js';
import { adminReferralRouter } from './routes/adminReferralRoutes.js';
import { referralRouter } from './routes/referralRoutes.js';
import { onboardingRouter } from './routes/onboardingRoutes.js';
import { monitoringPublicRouter, monitoringIngestRouter } from './routes/monitoringRoutes.js';
import { adminMonitoringRouter } from './routes/adminMonitoringRoutes.js';
import { startMonitoringScheduler } from './services/monitoring/monitoringScheduler.js';
import { initObservabilityProviders } from './services/monitoring/observabilityProvider.js';
import { adminPortalRouter } from './routes/adminPortalRoutes.js';

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

/** LAN + browser clients: allow any origin (JWT in header, not cookies). */
app.use(
  cors({
    origin: '*',
    credentials: false,
  })
);

/** Paddle webhooks require raw body for signature verification */
app.use('/api/webhooks/paddle', express.raw({ type: 'application/json' }), paddleWebhookRouter);

app.use(express.json({ limit: '2mb' }));
app.use(requestLoggingMiddleware);

function discoverServerIp(req: express.Request): string {
  const raw = req.socket.localAddress;
  let ip = typeof raw === 'string' ? raw.replace(/^::ffff:/, '') : '';
  if (!ip || ip === '::1' || ip === '127.0.0.1') {
    return getLanIPv4();
  }
  return ip;
}

/** Public: LAN discovery (optional DISCOVERY_TOKEN); rate-limited. */
app.get('/api/discover', publicIntrospectionLimiter, requireDiscoveryToken, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    name: 'PBooksPro Server',
    version: getMonorepoPackageVersion(),
    ip: discoverServerIp(req),
    port: PORT,
    status: 'online',
  });
});

app.get('/health', publicIntrospectionLimiter, (_req, res) => {
  sendSuccess(res, {
    ok: true,
    service: 'pbooks-backend',
    serverTime: new Date().toISOString(),
    readiness: '/api/health/ready',
  });
});

app.use('/api', monitoringPublicRouter);

/** Public: client update check (VersionService uses raw fetch, no JWT). */
app.get('/api/app-info/version', publicIntrospectionLimiter, (_req, res) => {
  res.json({
    version: getMonorepoPackageVersion(),
    environment: process.env.NODE_ENV || 'development',
  });
});

/** Loopback API Server tray + optional authenticated admins (see requireConnectedClientsAccess). */
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

/** Standalone admin portal (separate admin_users JWT, not tenant-scoped). */
app.use('/api/admin', adminPortalRouter);

app.use('/api', authRouter);
app.use('/api', demoRouter);
app.use('/api', marketingRouter);
app.use('/api', emailAutomationPublicRouter);
app.use('/api', referralRouter);
app.use('/api', supportRouter);
app.use('/api', mfaRouter);

/** Public legal documents (no auth required for GET). */
app.use('/api', legalRouter);

/** Auth + stubs: heartbeat, license, presence, WhatsApp unread (dev parity with cloud API). */
app.use('/api', authMiddleware, requireActiveSubscription(), optionalFeatureRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), chatRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), permissionsRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), auditTrailRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), privacyRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requirePermission('reports.balance_sheet.read'), balanceSheetRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requirePermission('reports.profit_loss.read'), profitLossRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requirePermission('reports.cash_flow.read'), cashFlowRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requirePermission('reports.trial_balance.read'), trialBalanceRouter);
app.use('/api', authMiddleware, requireActiveSubscription(), requirePermission('reports.trial_balance.read'), financialReconciliationRouter);
app.use('/api', authMiddleware, requireActiveSubscription(), rentalOwnerSummariesRouter);
app.use('/api', authMiddleware, requireActiveSubscription(), ownerRentalIncomeRouter);
app.use('/api', authMiddleware, requireActiveSubscription(), rentalBillsDashboardRouter);
app.use('/api', authMiddleware, requireActiveSubscription(), rentalReceivableRouter);
app.use('/api', authMiddleware, requireActiveSubscription(), ownerIncomeSummaryRouter);
app.use('/api', authMiddleware, requireActiveSubscription(), ownerSecurityDepositRouter);
app.use('/api', authMiddleware, requireActiveSubscription(), serviceChargesDeductionRouter);
app.use('/api', authMiddleware, requireActiveSubscription(), bmAnalysisRouter);
app.use('/api', authMiddleware, requireActiveSubscription(), tenantLedgerRouter);
app.use('/api', authMiddleware, requireActiveSubscription(), clientLedgerRouter);
app.use('/api', authMiddleware, requireActiveSubscription(), vendorLedgerRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requireFinancialWriteOnMutations, accountsRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requireFinancialWriteOnMutations, categoriesRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requireFinancialWriteOnMutations, billsRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requireFinancialWriteOnMutations, contactsRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requireFinancialWriteOnMutations, buildingsRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requireFinancialWriteOnMutations, propertiesRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requireFinancialWriteOnMutations, projectsRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requireFinancialWriteOnMutations, unitsRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requireFinancialWriteOnMutations, vendorsRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requireFinancialWriteOnMutations, quotationsRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requireFinancialWriteOnMutations, documentsRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), transactionAuditRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requireFinancialWriteOnMutations, appSettingsRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), stateRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requireFinancialWriteOnMutations, rentalAgreementsRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requireFinancialWriteOnMutations, projectAgreementsRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requireFinancialWriteOnMutations, projectReceivedAssetsRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requireFinancialWriteOnMutations, salesReturnsRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requireFinancialWriteOnMutations, contractsRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requireFinancialWriteOnMutations, budgetsRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requireFinancialWriteOnMutations, invoicesRouter);

/** GL journal routes use /transactions/journal — register before app ledger /transactions/:id */
app.use('/api', authMiddleware, requireActiveSubscription(), requireFinancialWriteOnMutations, journalRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requireFinancialWriteOnMutations, accountingPeriodsRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requireFinancialWriteOnMutations, investorJournalRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requireFinancialWriteOnMutations, transactionsRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), usersRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), databaseBackupRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), backupSchedulerRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), backupStorageRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), backupSecurityRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), tenantBackupRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), disasterRecoveryRouter);

app.use('/api', authMiddleware, adminSubscriptionRouter);
app.use('/api', authMiddleware, adminReferralRouter);
app.use('/api', authMiddleware, adminEmailAutomationRouter);
app.use('/api', authMiddleware, adminMonitoringRouter);
app.use('/api', authMiddleware, monitoringIngestRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), onboardingRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), subscriptionBillingRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), paymentsRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requireFinancialWriteOnMutations, recurringInvoiceTemplatesRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requireFinancialWriteOnMutations, pmCycleAllocationsRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requireFinancialWriteOnMutations, planAmenitiesRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requireFinancialWriteOnMutations, installmentPlansRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requireFinancialWriteOnMutations, locksRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requirePayrollAccess, payrollRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requireFinancialWriteOnMutations, contractorRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), requireFinancialWriteOnMutations, personalFinanceRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), tasksRouter);

app.use('/api', authMiddleware, requireActiveSubscription(), customReportsRouter);

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
  }
  await seedDevIfEnabled();
  await seedStagingIfEnabled();
  await seedDemoIfEnabled();
  const httpServer = createServer(app);
  initRealtime(httpServer);
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`PBooks API listening on http://0.0.0.0:${PORT}/api (WebSocket: same port)`);
    startDiscoveryUdpBroadcast(PORT);
    startBackupScheduler();
    startBillingScheduler();
    startDemoResetScheduler();
    startMarketingEmailScheduler();
    startEmailAutomationScheduler();
    startMonitoringScheduler();
  });
}

start().catch((e) => {
  console.error(e);
  process.exit(1);
});
