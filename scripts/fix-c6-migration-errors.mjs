/**
 * Fix common C6 codemod issues: missing state, hook/local name collisions.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const ADD_STATE = {
  'components/bills/BillBulkPaymentModal.tsx': 'useFinancialReportAppState',
  'components/invoices/BulkPaymentModal.tsx': 'useFinancialReportAppState',
  'components/invoices/RentalPaymentModal.tsx': 'useFinancialReportAppState',
  'components/kpi/KPIPanel.tsx': 'useFinancialReportAppState',
  'components/settings/ImportExportWizard.tsx': 'useFinancialReportAppState',
  'components/settings/SettingsDetailPage.tsx': 'useFinancialReportAppState',
  'components/settings/TransactionLogViewer.tsx': 'useFinancialReportAppState',
  'components/ui/ProjectForm.tsx': 'useFinancialReportAppState',
  'components/vendors/VendorBillPaymentModal.tsx': 'useFinancialReportAppState',
  'hooks/useGenerateDueInvoices.ts': 'useFinancialReportAppState',
  'modules/investor-fund-availability/components/FundAvailabilityPage.tsx': 'useProjectReportAppState',
  'modules/project-profitability/ProjectProfitabilityAnalytics.tsx': 'useProjectReportAppState',
};

const RENAME_HOOK = {
  'components/vendors/VendorBills.tsx': [['const bills = useBills()', 'const allBills = useBills()'], ['return bills.filter', 'return allBills.filter'], ['[bills, vendorId]', '[allBills, vendorId]']],
  'components/vendors/AllQuotationsTable.tsx': [['const quotations = useQuotations()', 'const allQuotations = useQuotations()']],
  'components/vendors/VendorQuotations.tsx': [['const quotations = useQuotations()', 'const allQuotations = useQuotations()']],
  'components/vendors/VendorQuotationsTable.tsx': [['const quotations = useQuotations()', 'const allQuotations = useQuotations()']],
  'components/vendors/VendorDirectoryPage.tsx': [['const vendors = useVendors()', 'const allVendors = useVendors()']],
  'components/settings/SettingsLedgerModal.tsx': [['const transactions = useTransactions()', 'const allTransactions = useTransactions()']],
  'components/print/PrintController.tsx': [['const printSettings = useStateSelector', 'const appPrintSettings = useStateSelector']],
  'hooks/usePrint.ts': [['const printSettings = useStateSelector', 'const appPrintSettings = useStateSelector']],
  'components/mobile/MobilePaymentsPage.tsx': [['const projects = useProjects()', 'const allProjects = useProjects()']],
  'components/payroll/modals/PayslipModal.tsx': [['const projects = useProjects()', 'const allProjects = useProjects()']],
  'components/marketing/MarketingPage.tsx': [
    ['const units = useUnits()', 'const allUnits = useUnits()'],
    ['const currentUser = useCurrentUser()', 'const appCurrentUser = useCurrentUser()'],
    ['const invoices = useInvoices()', 'const allInvoices = useInvoices()'],
  ],
  'components/chat/ChatModal.tsx': [['const currentUser = useCurrentUser()', 'const appCurrentUser = useCurrentUser()']],
  'components/kpi/KPIDrilldown.tsx': [['const transactions = useTransactions()', 'const allTransactions = useTransactions()']],
  'components/vendors/VendorBillPaymentModal.tsx': [['const bills = useBills()', 'const allBills = useBills()']],
};

function ensureImport(src, hookPath, hookName) {
  if (src.includes(hookName)) return src;
  const importRe = new RegExp(`from ['"]${hookPath.replace(/\//g, '[/\\\\]')}['"]`);
  const m = src.match(/import \{([^}]+)\} from ['"][^'"]*useSelectiveState['"];/);
  if (m) {
    const hooks = m[1].split(',').map((h) => h.trim()).filter(Boolean);
    if (!hooks.includes(hookName)) hooks.push(hookName);
    hooks.sort();
    return src.replace(m[0], `import { ${hooks.join(', ')} } from '${hookPath}';`);
  }
  const depth = (hookPath.match(/\.\./g) || []).length;
  // fallback: insert after first import
  const line = `import { ${hookName} } from '${hookPath}';\n`;
  const idx = src.search(/^import/m);
  return idx >= 0 ? src.slice(0, idx) + line + src.slice(idx) : line + src;
}

function hookPathFor(rel) {
  const depth = rel.split('/').length - 1;
  return '../'.repeat(depth) + 'hooks/useSelectiveState';
}

for (const [rel, hook] of Object.entries(ADD_STATE)) {
  const fp = path.join(root, rel);
  if (!fs.existsSync(fp)) continue;
  let src = fs.readFileSync(fp, 'utf8');
  if (src.includes(`const state = ${hook}()`)) continue;
  const hp = hookPathFor(rel);
  src = ensureImport(src, hp, hook);
  // insert state after first hook block / after imports
  if (!src.includes(`const state = ${hook}()`)) {
    src = src.replace(
      /(const dispatch = useDispatchOnly\(\);?\n)/,
      `$1    const state = ${hook}();\n`
    );
    if (!src.includes(`const state = ${hook}()`)) {
      src = src.replace(
        /(export (?:default )?function \w+[^{]*\{)\n/,
        `$1\n    const state = ${hook}();\n`
      );
    }
    if (!src.includes(`const state = ${hook}()`)) {
      src = src.replace(
        /(const \w+.*?= \(\) => \{\n)/,
        `$1    const state = ${hook}();\n`
      );
    }
  }
  fs.writeFileSync(fp, src);
  console.log('add state', rel);
}

for (const [rel, pairs] of Object.entries(RENAME_HOOK)) {
  const fp = path.join(root, rel);
  if (!fs.existsSync(fp)) continue;
  let src = fs.readFileSync(fp, 'utf8');
  for (const [from, to] of pairs) {
    src = src.split(from).join(to);
  }
  // replace state.X -> appX for renamed hooks where codemod left state.quotations etc
  const renames = {
    allQuotations: 'quotations',
    allVendors: 'vendors',
    allBills: 'bills',
    allTransactions: 'transactions',
    allProjects: 'projects',
    allUnits: 'units',
    allInvoices: 'invoices',
    appCurrentUser: 'currentUser',
    appPrintSettings: 'printSettings',
  };
  for (const [newName, oldSlice] of Object.entries(renames)) {
    if (src.includes(`const ${newName} =`)) {
      src = src.replace(new RegExp(`\\bstate\\.${oldSlice}\\b`, 'g'), newName);
    }
  }
  fs.writeFileSync(fp, src);
  console.log('rename hooks', rel);
}

// LedgerFilters: state?.accounts -> accounts
{
  const fp = path.join(root, 'components/transactions/LedgerFilters.tsx');
  let src = fs.readFileSync(fp, 'utf8');
  src = src.replace(/state\?\.accounts/g, 'accounts');
  src = src.replace(/state\?\.categories/g, 'categories');
  src = src.replace(/\bstate\b/g, (m, off, s) => {
    // leave words like "estate"
    return m;
  });
  // fix remaining bare state refs
  src = src.replace(/\bstate\./g, '');
  fs.writeFileSync(fp, src);
  console.log('fix LedgerFilters');
}

// ProjectOwnerPayoutModal _getAppState
{
  const fp = path.join(root, 'components/projectManagement/ProjectOwnerPayoutModal.tsx');
  let src = fs.readFileSync(fp, 'utf8');
  if (!src.includes('_getAppState')) {
    src = src.replace(
      "import { useDispatchOnly, useProjectReportAppState } from '../../hooks/useSelectiveState';",
      "import { useDispatchOnly, useProjectReportAppState } from '../../hooks/useSelectiveState';\nimport { _getAppState } from '../../context/appStateStore';"
    );
    fs.writeFileSync(fp, src);
    console.log('fix ProjectOwnerPayoutModal _getAppState');
  }
}

console.log('fix script done');
