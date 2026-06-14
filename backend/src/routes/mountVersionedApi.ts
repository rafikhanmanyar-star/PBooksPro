import type { Express } from 'express';
import { authRouter } from './authRoutes.js';
import { mfaRouter } from './mfaRoutes.js';
import { journalRouter } from './journalRoutes.js';
import { accountingPeriodsRouter } from './accountingPeriodsRoutes.js';
import { investorJournalRouter } from './investorJournalRoutes.js';
import { accountsRouter } from './accountsRoutes.js';
import { categoriesRouter } from './categoriesRoutes.js';
import { billsRouter } from './billsRoutes.js';
import { contactsRouter } from './contactsRoutes.js';
import { usersRouter } from './usersRoutes.js';
import { rentalAgreementsRouter } from './rentalAgreementsRoutes.js';
import { projectAgreementsRouter } from './projectAgreementsRoutes.js';
import { projectReceivedAssetsRouter } from './projectReceivedAssetsRoutes.js';
import { salesReturnsRouter } from './salesReturnsRoutes.js';
import { contractsRouter } from './contractsRoutes.js';
import { budgetsRouter } from './budgetsRoutes.js';
import { invoicesRouter } from './invoicesRoutes.js';
import { transactionsRouter } from './transactionsRoutes.js';
import { buildingsRouter } from './buildingsRoutes.js';
import { propertiesRouter } from './propertiesRoutes.js';
import { optionalFeatureRouter } from './optionalFeatureRoutes.js';
import { whatsappRouter } from './whatsappRoutes.js';
import { projectsRouter } from './projectsRoutes.js';
import { unitsRouter } from './unitsRoutes.js';
import { vendorsRouter } from './vendorsRoutes.js';
import { quotationsRouter } from './quotationsRoutes.js';
import { quotationValidationRouter } from '../modules/vendors/routes/quotationValidationRoutes.js';
import { quotationIntelligenceRouter } from '../modules/vendors/routes/quotationIntelligenceRoutes.js';
import { documentsRouter } from './documentsRoutes.js';
import { transactionAuditRouter } from './transactionAuditRoutes.js';
import { appSettingsRouter } from './appSettingsRoutes.js';
import { stateRouter } from './stateRoutes.js';
import { recurringInvoiceTemplatesRouter } from './recurringInvoiceTemplatesRoutes.js';
import { payrollRouter } from './payrollRoutes.js';
import { contractorRouter } from './contractorRoutes.js';
import { projectExpenseVoucherRouter } from './projectExpenseVoucherRoutes.js';
import { personalFinanceRouter } from './personalFinanceRoutes.js';
import { tasksRouter } from './tasksRoutes.js';
import { databaseBackupRouter } from './databaseBackupRoutes.js';
import { backupSchedulerRouter } from './backupSchedulerRoutes.js';
import { backupStorageRouter } from './backupStorageRoutes.js';
import { backupSecurityRouter } from './backupSecurityRoutes.js';
import { tenantBackupRouter } from './tenantBackupRoutes.js';
import { disasterRecoveryRouter } from './disasterRecoveryRoutes.js';
import { subscriptionBillingRouter } from './subscriptionBillingRoutes.js';
import { paymentsRouter } from './paymentsRoutes.js';
import { legalRouter } from '../modules/legal/routes/legalRoutes.js';
import { pmCycleAllocationsRouter } from './pmCycleAllocationsRoutes.js';
import { planAmenitiesRouter } from './planAmenitiesRoutes.js';
import { installmentPlansRouter } from './installmentPlansRoutes.js';
import { locksRouter } from './locksRoutes.js';
import { chatRouter } from './chatRoutes.js';
import { balanceSheetRouter } from './balanceSheetRoutes.js';
import { profitLossRouter } from './profitLossRoutes.js';
import { cashFlowRouter } from './cashFlowRoutes.js';
import { trialBalanceRouter } from './trialBalanceRoutes.js';
import { financialReconciliationRouter } from './financialReconciliationRoutes.js';
import { rentalOwnerSummariesRouter } from './rentalOwnerSummariesRoutes.js';
import { dashboardMetricsRouter } from './dashboardMetricsRoutes.js';
import { dashboardSnapshotsRouter } from '../modules/dashboard/routes/dashboardSnapshotsRoutes.js';
import { rentalAnalyticsRouter } from './rentalAnalyticsRoutes.js';
import { accountingAnalyticsRouter } from './accountingAnalyticsRoutes.js';
import { expenseAnalyticsRouter } from './expenseAnalyticsRoutes.js';
import { collectionsAnalyticsRouter } from './collectionsAnalyticsRoutes.js';
import { sellingAnalyticsRouter } from './sellingAnalyticsRoutes.js';
import { vendorAnalyticsRouter } from './vendorAnalyticsRoutes.js';
import { bankingAnalyticsRouter } from './bankingAnalyticsRoutes.js';
import { customReportsRouter } from './customReportsRoutes.js';
import { reportDesignerRouter } from './reportDesignerRoutes.js';
import { customerReportingRouter } from './customerReportingRoutes.js';
import { rentalReportingRouter } from './rentalReportingRoutes.js';
import { constructionReportingRouter } from './constructionReportingRoutes.js';
import { ownerRentalIncomeRouter } from './ownerRentalIncomeRoutes.js';
import { rentalBillsDashboardRouter } from './rentalBillsDashboardRoutes.js';
import { rentalReceivableRouter } from './rentalReceivableRoutes.js';
import { ownerIncomeSummaryRouter } from './ownerIncomeSummaryRoutes.js';
import { ownerSecurityDepositRouter } from './ownerSecurityDepositRoutes.js';
import { serviceChargesDeductionRouter } from './serviceChargesDeductionRoutes.js';
import { bmAnalysisRouter } from './bmAnalysisRoutes.js';
import { tenantLedgerRouter } from './tenantLedgerRoutes.js';
import { clientLedgerRouter } from './clientLedgerRoutes.js';
import { vendorLedgerRouter } from './vendorLedgerRoutes.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requireActiveSubscription } from '../middleware/licenseEnforcementMiddleware.js';
import {
  requireFinancialWriteOnMutations,
  requirePayrollAccessForPayrollPaths,
  requirePermissionWhenPathStartsWith,
  requireRoleWhenPathStartsWith,
  requireWriteOnMutations,
} from '../middleware/rbacMiddleware.js';
import { permissionsRouter } from './permissionsRoutes.js';
import { auditTrailRouter } from './auditTrailRoutes.js';
import { privacyRouter } from './privacyRoutes.js';
import { demoRouter } from './demoRoutes.js';
import { demoBookingRouter } from './demoBookingRoutes.js';
import { marketingRouter } from './marketingRoutes.js';
import { trialSignupRouter } from '../modules/trial/routes/trialSignupRoutes.js';
import { supportRouter } from './supportRoutes.js';
import { emailAutomationPublicRouter } from '../modules/email-automation/routes/emailAutomationPublicRoutes.js';
import { adminSubscriptionRouter } from './adminSubscriptionRoutes.js';
import { adminReferralRouter } from './adminReferralRoutes.js';
import { adminEmailAutomationRouter } from './adminEmailAutomationRoutes.js';
import { adminMonitoringRouter } from '../modules/monitoring/routes/adminMonitoringRoutes.js';
import { monitoringPublicRouter, monitoringIngestRouter } from '../modules/monitoring/routes/monitoringRoutes.js';
import { referralRouter } from './referralRoutes.js';
import { onboardingRouter } from '../modules/onboarding/routes/onboardingRoutes.js';
import { systemRouter } from './systemRoutes.js';
import { appUpdateRouter } from './appUpdateRoutes.js';
import { dataManagementRouter } from './dataManagementRoutes.js';
import { mobileRouter } from './mobileRoutes.js';
import { notificationsRouter } from '../modules/notifications/routes/notificationsRoutes.js';

const requireSuperAdminForAdminPaths = requireRoleWhenPathStartsWith('/admin', 'super_admin');

/**
 * Mount tenant API routers at `prefix` (e.g. /api/v1 or deprecated /api).
 * Exempt from versioning: /health, /api/webhooks/*, /api/admin.
 */
export function mountVersionedApi(app: Express, prefix: string): void {
  app.use(prefix, monitoringPublicRouter);
  app.use(prefix, legalRouter);
  app.use(prefix, mfaRouter);

  app.use(prefix, authRouter);
  app.use(prefix, demoRouter);
  app.use(prefix, demoBookingRouter);
  app.use(prefix, marketingRouter);
  app.use(prefix, trialSignupRouter);
  app.use(prefix, emailAutomationPublicRouter);
  app.use(prefix, referralRouter);
  app.use(prefix, supportRouter);

  app.use(prefix, authMiddleware, requireActiveSubscription(), systemRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), appUpdateRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), optionalFeatureRouter);
  app.use(`${prefix}/whatsapp`, authMiddleware, requireActiveSubscription(), whatsappRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), chatRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), permissionsRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), auditTrailRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), privacyRouter);

  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requirePermissionWhenPathStartsWith('/reports/balance-sheet', 'reports.balance_sheet.read'),
    balanceSheetRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requirePermissionWhenPathStartsWith('/reports/profit-loss', 'reports.profit_loss.read'),
    profitLossRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requirePermissionWhenPathStartsWith('/reports/cash-flow', 'reports.cash_flow.read'),
    cashFlowRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requirePermissionWhenPathStartsWith('/reports/trial-balance', 'reports.trial_balance.read'),
    trialBalanceRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requirePermissionWhenPathStartsWith('/reports/reconciliation', 'reports.trial_balance.read'),
    financialReconciliationRouter
  );
  app.use(prefix, authMiddleware, requireActiveSubscription(), mobileRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), notificationsRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), dashboardMetricsRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), dashboardSnapshotsRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), rentalAnalyticsRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), accountingAnalyticsRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), expenseAnalyticsRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), collectionsAnalyticsRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), sellingAnalyticsRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), vendorAnalyticsRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), bankingAnalyticsRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), rentalOwnerSummariesRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), ownerRentalIncomeRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), rentalBillsDashboardRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), rentalReceivableRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), ownerIncomeSummaryRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), ownerSecurityDepositRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), serviceChargesDeductionRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), bmAnalysisRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), tenantLedgerRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), clientLedgerRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), vendorLedgerRouter);

  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requireFinancialWriteOnMutations,
    accountsRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requireFinancialWriteOnMutations,
    categoriesRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requireFinancialWriteOnMutations,
    billsRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requireWriteOnMutations(
      'project_selling.marketing_plans.write',
      'project_selling.agreements.write'
    ),
    contactsRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requireFinancialWriteOnMutations,
    buildingsRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requireFinancialWriteOnMutations,
    propertiesRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requireFinancialWriteOnMutations,
    projectsRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requireWriteOnMutations('project_selling.agreements.write'),
    unitsRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requireFinancialWriteOnMutations,
    vendorsRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requireFinancialWriteOnMutations,
    quotationsRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requireFinancialWriteOnMutations,
    quotationValidationRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    quotationIntelligenceRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requireWriteOnMutations(
      'project_selling.marketing_plans.write',
      'project_selling.invoices.write',
      'project_selling.agreements.write'
    ),
    documentsRouter
  );
  app.use(prefix, authMiddleware, requireActiveSubscription(), transactionAuditRouter);
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requireFinancialWriteOnMutations,
    appSettingsRouter
  );
  app.use(prefix, authMiddleware, requireActiveSubscription(), stateRouter);
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requireFinancialWriteOnMutations,
    rentalAgreementsRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requireWriteOnMutations('project_selling.agreements.write'),
    projectAgreementsRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requireWriteOnMutations('project_selling.payments.receive'),
    projectReceivedAssetsRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requireWriteOnMutations('project_selling.agreements.write'),
    salesReturnsRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requireFinancialWriteOnMutations,
    contractsRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requireFinancialWriteOnMutations,
    budgetsRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requireWriteOnMutations(
      'project_selling.invoices.write',
      'project_selling.payments.receive'
    ),
    invoicesRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requireFinancialWriteOnMutations,
    journalRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requireFinancialWriteOnMutations,
    accountingPeriodsRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requireFinancialWriteOnMutations,
    investorJournalRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requireWriteOnMutations('project_selling.payments.receive'),
    transactionsRouter
  );
  app.use(prefix, authMiddleware, requireActiveSubscription(), usersRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), databaseBackupRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), backupSchedulerRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), backupStorageRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), backupSecurityRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), tenantBackupRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), disasterRecoveryRouter);

  app.use(prefix, authMiddleware, requireSuperAdminForAdminPaths, adminSubscriptionRouter);
  app.use(prefix, authMiddleware, requireSuperAdminForAdminPaths, adminReferralRouter);
  app.use(prefix, authMiddleware, requireSuperAdminForAdminPaths, adminEmailAutomationRouter);
  app.use(prefix, authMiddleware, requireSuperAdminForAdminPaths, adminMonitoringRouter);
  app.use(prefix, authMiddleware, monitoringIngestRouter);

  app.use(prefix, authMiddleware, requireActiveSubscription(), onboardingRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), subscriptionBillingRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), paymentsRouter);
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requireFinancialWriteOnMutations,
    recurringInvoiceTemplatesRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requireFinancialWriteOnMutations,
    pmCycleAllocationsRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requireWriteOnMutations('project_selling.marketing_plans.write'),
    planAmenitiesRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requireWriteOnMutations('project_selling.marketing_plans.write'),
    installmentPlansRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requireFinancialWriteOnMutations,
    locksRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requirePayrollAccessForPayrollPaths(),
    payrollRouter
  );
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requireFinancialWriteOnMutations,
    contractorRouter
  );
  app.use(prefix, authMiddleware, requireActiveSubscription(), projectExpenseVoucherRouter);
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    requireFinancialWriteOnMutations,
    personalFinanceRouter
  );
  app.use(prefix, authMiddleware, requireActiveSubscription(), tasksRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), customReportsRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), reportDesignerRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), customerReportingRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), rentalReportingRouter);
  app.use(prefix, authMiddleware, requireActiveSubscription(), constructionReportingRouter);
  app.use(
    prefix,
    authMiddleware,
    requireActiveSubscription(),
    dataManagementRouter
  );
}
