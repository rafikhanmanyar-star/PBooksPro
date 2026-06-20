/**
 * RBAC 2.0 Phase 1 catalog verification (A5.1.1).
 * Validates permission catalog, bundle registry, and SoD pair references.
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

let failures = 0;

function fail(msg) {
  console.error(`[verify-rbac-v2] FAIL: ${msg}`);
  failures += 1;
}

function pass(msg) {
  console.log(`[verify-rbac-v2] OK: ${msg}`);
}

const sharedRbac = path.join(root, 'shared', 'rbac');

const [
  { PERMISSION_CATALOG, CATALOG_KEY_SET, getMissingSodCatalogKeys, getMissingProjectManagerCatalogKeys },
  {
    FINANCIAL_WRITE_BUNDLE,
    PERSONAL_FINANCE_STANDALONE,
    BUNDLE_REGISTRY,
    expandBundleAlias,
    assertBundleIntegrity,
    isInFinancialWriteBundle,
    isPersonalFinanceKey,
  },
  { ALL_SOD_PAIRS },
  { ALL_PERMISSIONS },
] = await Promise.all([
  import(pathToFileURL(path.join(sharedRbac, 'permissionCatalog.ts')).href),
  import(pathToFileURL(path.join(sharedRbac, 'permissionBundles.ts')).href),
  import(pathToFileURL(path.join(sharedRbac, 'sodPairs.ts')).href),
  import(pathToFileURL(path.join(sharedRbac, 'permissions.ts')).href),
]);

// 1. Unique permission keys
const seen = new Set();
for (const entry of PERMISSION_CATALOG) {
  if (seen.has(entry.key)) {
    fail(`duplicate catalog key: ${entry.key}`);
  }
  seen.add(entry.key);
}
if (seen.size === PERMISSION_CATALOG.length) {
  pass(`unique catalog keys (${PERMISSION_CATALOG.length})`);
}

// 2. All v1 runtime permissions cataloged
for (const key of ALL_PERMISSIONS) {
  if (!CATALOG_KEY_SET.has(key)) {
    fail(`v1 permission missing from catalog: ${key}`);
  }
}
pass(`all ${ALL_PERMISSIONS.length} v1 permissions present in catalog`);

// 3. FINANCIAL_WRITE_BUNDLE integrity
const bundleErrors = assertBundleIntegrity();
if (bundleErrors.length > 0) {
  for (const err of bundleErrors) fail(err);
} else {
  pass('FINANCIAL_WRITE_BUNDLE integrity checks passed');
}

// 4. personal.finance excluded from FINANCIAL_WRITE_BUNDLE
for (const key of PERSONAL_FINANCE_STANDALONE) {
  if (isInFinancialWriteBundle(key)) {
    fail(`personal.finance key in FINANCIAL_WRITE_BUNDLE: ${key}`);
  }
  if (!isPersonalFinanceKey(key)) {
    fail(`isPersonalFinanceKey mismatch: ${key}`);
  }
  if (!CATALOG_KEY_SET.has(key)) {
    fail(`personal.finance key missing from catalog: ${key}`);
  }
}
pass(`personal.finance.* excluded from FINANCIAL_WRITE_BUNDLE (${PERSONAL_FINANCE_STANDALONE.length} keys)`);

// 5. Every FINANCIAL_WRITE_BUNDLE key in catalog
for (const key of FINANCIAL_WRITE_BUNDLE) {
  if (!CATALOG_KEY_SET.has(key)) {
    fail(`FINANCIAL_WRITE_BUNDLE key missing from catalog: ${key}`);
  }
}
pass(`all ${FINANCIAL_WRITE_BUNDLE.length} FINANCIAL_WRITE_BUNDLE keys in catalog`);

// 6. No circular bundles (alias must not appear in its own expansion)
for (const def of BUNDLE_REGISTRY) {
  if (def.keys.includes(def.aliasKey)) {
    fail(`bundle ${def.id} contains its alias key ${def.aliasKey}`);
  }
  const expanded = expandBundleAlias(def.aliasKey, def.enterpriseRole);
  if (expanded.includes(def.aliasKey)) {
    fail(`expandBundleAlias(${def.aliasKey}) returns alias key`);
  }
}
pass('no circular bundle definitions');

// 7. SoD references valid catalog permissions
const missingSod = getMissingSodCatalogKeys();
if (missingSod.length > 0) {
  fail(`SoD pairs reference keys missing from catalog: ${missingSod.join(', ')}`);
} else {
  pass(`SoD pairs reference valid permissions (${ALL_SOD_PAIRS.length} pairs)`);
}

// 8. project_manager bundle keys in catalog
const missingPm = getMissingProjectManagerCatalogKeys();
if (missingPm.length > 0) {
  fail(`PROJECT_MANAGER_FINANCIAL_BUNDLE keys missing from catalog: ${missingPm.join(', ')}`);
} else {
  pass('PROJECT_MANAGER_FINANCIAL_BUNDLE keys present in catalog');
}

// 9. Layer metadata present
for (const entry of PERMISSION_CATALOG) {
  if (!entry.layer || !entry.feature) {
    fail(`catalog entry missing layer/feature: ${entry.key}`);
  }
}
pass('catalog entries have layer and feature metadata');

console.log('');
console.log(`[verify-rbac-v2] Summary: permissions=${PERMISSION_CATALOG.length}, bundles=${BUNDLE_REGISTRY.length}, sodPairs=${ALL_SOD_PAIRS.length}`);

// 10. Report SQL paths enforce data scope (A5.1.4.1 / H1)
const fs = await import('node:fs');
const scopePattern = /applyDataScope|mergeReportScopeIntoFilter|appendFinancialRbacScopeSql|departmentScopeRunExistsClause|scopeCtx\?:/;
const reportScopeFiles = [
  'backend/src/modules/reporting/services/rentalReportingService.ts',
  'backend/src/modules/reporting/services/constructionReportingService.ts',
  'backend/src/modules/accounting/services/balanceSheetReportService.ts',
  'backend/src/modules/accounting/services/profitLossReportService.ts',
  'backend/src/modules/accounting/services/cashFlowReportService.ts',
  'backend/src/modules/accounting/services/trialBalanceReportService.ts',
  'backend/src/modules/payroll/services/payroll/payrollConfig.ts',
];
for (const rel of reportScopeFiles) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    fail(`report scope file missing: ${rel}`);
    continue;
  }
  const src = fs.readFileSync(abs, 'utf8');
  if (!scopePattern.test(src)) {
    fail(`report scope enforcement missing in ${rel}`);
  } else {
    pass(`report scope enforcement present in ${rel}`);
  }
}

// 11. Phase 5 approval matrix enforcement artifacts
const approvalArtifacts = [
  'backend/src/auth/approvalCapabilityResolver.ts',
  'backend/src/approval/approvalEngine.ts',
  'backend/src/modules/rbac/services/rbacApprovalMatrixService.ts',
  'backend/src/auth/accessVersionService.ts',
];
for (const rel of approvalArtifacts) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    fail(`missing approval artifact: ${rel}`);
    continue;
  }
  pass(`approval artifact present: ${rel}`);
}
const avSrc = fs.readFileSync(path.join(root, 'backend/src/auth/accessVersionService.ts'), 'utf8');
if (!avSrc.includes('approvalHash')) {
  fail('accessVersionService missing approvalHash in composite hash');
} else {
  pass('accessVersionService includes approvalHash');
}
const eacSrc = fs.readFileSync(path.join(root, 'backend/src/auth/effectiveAccessContext.ts'), 'utf8');
if (!eacSrc.includes('approvalCapabilities')) {
  fail('EffectiveAccessContext missing approvalCapabilities');
} else {
  pass('EffectiveAccessContext includes approvalCapabilities');
}

if (failures > 0) {
  console.error(`[verify-rbac-v2] ${failures} failure(s)`);
  process.exit(1);
}

console.log('[verify-rbac-v2] All checks passed');
process.exit(0);
