#!/usr/bin/env node
/**
 * Bulk strangler migration: move backend/src/routes/*.ts implementations
 * into backend/src/modules/<domain>/routes/ and leave thin re-exports.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const routesDir = path.join(root, 'backend', 'src', 'routes');
const modulesDir = path.join(root, 'backend', 'src', 'modules');

const SKIP_FILES = new Set([
  'mountVersionedApi.ts',
  'healthLiveness.ts',
  'adminPortalRoutes.ts',
]);

/** Already migrated manually — do not overwrite module copies. */
const ALREADY_MIGRATED = new Set([
  'legalRoutes.ts',
  'trialSignupRoutes.ts',
  'onboardingRoutes.ts',
  'emailAutomationPublicRoutes.ts',
  'monitoringRoutes.ts',
  'adminMonitoringRoutes.ts',
  'databaseBackupRoutes.ts',
  'backupSchedulerRoutes.ts',
  'backupStorageRoutes.ts',
  'tenantBackupRoutes.ts',
]);

const ROUTE_MODULE_MAP = {
  'authRoutes.ts': 'auth',
  'mfaRoutes.ts': 'auth',
  'usersRoutes.ts': 'auth',
  'permissionsRoutes.ts': 'auth',
  'referralRoutes.ts': 'referrals',
  'adminReferralRoutes.ts': 'referrals',
  'privacyRoutes.ts': 'privacy',
  'marketingRoutes.ts': 'marketing',
  'demoRoutes.ts': 'demo',
  'demoBookingRoutes.ts': 'demo',
  'subscriptionBillingRoutes.ts': 'billing',
  'paymentsRoutes.ts': 'billing',
  'adminSubscriptionRoutes.ts': 'billing',
  'paddleWebhookRoutes.ts': 'billing',
  'backupSecurityRoutes.ts': 'backup',
  'disasterRecoveryRoutes.ts': 'dr',
  'adminEmailAutomationRoutes.ts': 'email-automation',
  'journalRoutes.ts': 'accounting',
  'accountingPeriodsRoutes.ts': 'accounting',
  'investorJournalRoutes.ts': 'accounting',
  'accountsRoutes.ts': 'accounting',
  'categoriesRoutes.ts': 'accounting',
  'transactionsRoutes.ts': 'accounting',
  'balanceSheetRoutes.ts': 'accounting',
  'profitLossRoutes.ts': 'accounting',
  'cashFlowRoutes.ts': 'accounting',
  'trialBalanceRoutes.ts': 'accounting',
  'financialReconciliationRoutes.ts': 'accounting',
  'transactionAuditRoutes.ts': 'accounting',
  'locksRoutes.ts': 'accounting',
  'billsRoutes.ts': 'vendors',
  'vendorsRoutes.ts': 'vendors',
  'contractorRoutes.ts': 'vendors',
  'quotationsRoutes.ts': 'vendors',
  'vendorLedgerRoutes.ts': 'vendors',
  'invoicesRoutes.ts': 'customers',
  'recurringInvoiceTemplatesRoutes.ts': 'customers',
  'salesReturnsRoutes.ts': 'project-selling',
  'clientLedgerRoutes.ts': 'customers',
  'contactsRoutes.ts': 'crm',
  'rentalAgreementsRoutes.ts': 'leases',
  'rentalOwnerSummariesRoutes.ts': 'leases',
  'ownerRentalIncomeRoutes.ts': 'leases',
  'rentalBillsDashboardRoutes.ts': 'leases',
  'rentalReceivableRoutes.ts': 'leases',
  'ownerIncomeSummaryRoutes.ts': 'leases',
  'ownerSecurityDepositRoutes.ts': 'leases',
  'serviceChargesDeductionRoutes.ts': 'leases',
  'tenantLedgerRoutes.ts': 'leases',
  'bmAnalysisRoutes.ts': 'leases',
  'rentalAnalyticsRoutes.ts': 'leases',
  'propertiesRoutes.ts': 'properties',
  'buildingsRoutes.ts': 'properties',
  'unitsRoutes.ts': 'properties',
  'projectsRoutes.ts': 'project-selling',
  'projectAgreementsRoutes.ts': 'project-selling',
  'projectReceivedAssetsRoutes.ts': 'project-selling',
  'contractsRoutes.ts': 'project-selling',
  'budgetsRoutes.ts': 'project-selling',
  'installmentPlansRoutes.ts': 'project-selling',
  'pmCycleAllocationsRoutes.ts': 'project-selling',
  'planAmenitiesRoutes.ts': 'project-selling',
  'projectExpenseVoucherRoutes.ts': 'project-expense',
  'payrollRoutes.ts': 'payroll',
  'personalFinanceRoutes.ts': 'personal-finance',
  'tasksRoutes.ts': 'personal-finance',
  'documentsRoutes.ts': 'documents',
  'appSettingsRoutes.ts': 'app-settings',
  'stateRoutes.ts': 'app-settings',
  'dashboardMetricsRoutes.ts': 'dashboard',
  'accountingAnalyticsRoutes.ts': 'dashboard',
  'expenseAnalyticsRoutes.ts': 'dashboard',
  'collectionsAnalyticsRoutes.ts': 'dashboard',
  'vendorAnalyticsRoutes.ts': 'dashboard',
  'bankingAnalyticsRoutes.ts': 'dashboard',
  'customReportsRoutes.ts': 'reporting',
  'auditTrailRoutes.ts': 'organization',
  'chatRoutes.ts': 'organization',
  'supportRoutes.ts': 'organization',
  'optionalFeatureRoutes.ts': 'organization',
  'systemRoutes.ts': 'organization',
  'appUpdateRoutes.ts': 'organization',
  'dataManagementRoutes.ts': 'organization',
};

function isDeprecatedReexport(content) {
  return content.includes('@deprecated Use modules/');
}

function transformImports(content, targetModule) {
  let result = content.replace(/from '\.\.\//g, "from '../../../");
  result = result.replace(/from "\.\.\//g, 'from "../../../');
  // ../../../modules/foo/bar → ../../foo/bar
  result = result.replace(
    /from '\.\.\/\.\.\/\.\.\/modules\/([^']+)'/g,
    "from '../../$1'"
  );
  result = result.replace(
    /from "\.\.\/\.\.\/\.\.\/modules\/([^"]+)"/g,
    'from "../../$1"'
  );
  // Same-module sibling: ../../targetModule/ → ../
  const sameMod = targetModule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  result = result.replace(
    new RegExp(`from '\\.\\.\\/\\.\\.\\/${sameMod}\\/`, 'g'),
    "from '../"
  );
  result = result.replace(
    new RegExp(`from "\\.\\.\\/\\.\\.\\/${sameMod}\\/`, 'g'),
    'from "../'
  );
  return result;
}

function extractExports(content) {
  const names = [];
  for (const m of content.matchAll(/export const (\w+)/g)) names.push(m[1]);
  for (const m of content.matchAll(/export \{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const n = part.trim().split(/\s+as\s+/)[0].trim();
      if (n) names.push(n);
    }
  }
  if (content.includes('export default')) names.push('default');
  return [...new Set(names)];
}

function buildReexportStub(basename, moduleName, exports) {
  const rel = `../modules/${moduleName}/routes/${basename.replace(/\.ts$/, '.js')}`;
  const lines = [`/** @deprecated Use modules/${moduleName}/routes/${basename.replace(/\.ts$/, '')}.js */`];
  if (exports.includes('default') && exports.length === 1) {
    lines.push(`export { default } from '${rel}';`);
  } else if (exports.includes('default')) {
    const named = exports.filter((e) => e !== 'default');
    lines.push(`export { ${named.join(', ')} } from '${rel}';`);
    lines.push(`export { default } from '${rel}';`);
  } else if (exports.length) {
    lines.push(`export { ${exports.join(', ')} } from '${rel}';`);
  } else {
    lines.push(`export * from '${rel}';`);
  }
  return lines.join('\n') + '\n';
}

let migrated = 0;
let skipped = 0;

for (const [basename, moduleName] of Object.entries(ROUTE_MODULE_MAP)) {
  const srcPath = path.join(routesDir, basename);
  if (!fs.existsSync(srcPath)) {
    console.warn(`[skip] missing ${basename}`);
    skipped++;
    continue;
  }
  if (SKIP_FILES.has(basename) || ALREADY_MIGRATED.has(basename)) {
    skipped++;
    continue;
  }

  const original = fs.readFileSync(srcPath, 'utf8');
  if (isDeprecatedReexport(original)) {
    skipped++;
    continue;
  }

  const exports = extractExports(original);
  const destDir = path.join(modulesDir, moduleName, 'routes');
  fs.mkdirSync(destDir, { recursive: true });
  const destPath = path.join(destDir, basename);

  const transformed = transformImports(original, moduleName);
  fs.writeFileSync(destPath, transformed, 'utf8');
  fs.writeFileSync(srcPath, buildReexportStub(basename, moduleName, exports), 'utf8');
  console.log(`[migrated] ${basename} → modules/${moduleName}/routes/`);
  migrated++;
}

// Admin portal legacy route stubs
const adminLegacyDir = path.join(root, 'backend', 'src', 'adminPortal', 'routes');
const adminSkip = new Set(['index.ts']);
if (fs.existsSync(adminLegacyDir)) {
  for (const f of fs.readdirSync(adminLegacyDir)) {
    if (!f.endsWith('.ts') || adminSkip.has(f)) continue;
    const p = path.join(adminLegacyDir, f);
    const content = fs.readFileSync(p, 'utf8');
    if (isDeprecatedReexport(content)) continue;
    const base = f.replace(/\.ts$/, '');
    const stub = `/** @deprecated Import from modules/admin-portal/routes/${base}.js */\nexport { default } from '../../modules/admin-portal/routes/${base}.js';\n`;
    fs.writeFileSync(p, stub, 'utf8');
    console.log(`[admin stub] adminPortal/routes/${f}`);
  }
}

console.log(`\nDone: ${migrated} migrated, ${skipped} skipped.`);
