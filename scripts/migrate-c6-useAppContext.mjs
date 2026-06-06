/**
 * C6 bulk migration: replace useAppContext() with selective hooks where possible.
 * Run: node scripts/migrate-c6-useAppContext.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const SLICE_MAP = {
  accounts: 'useAccounts',
  transactions: 'useTransactions',
  contacts: 'useContacts',
  invoices: 'useInvoices',
  bills: 'useBills',
  categories: 'useCategories',
  projects: 'useProjects',
  buildings: 'useBuildings',
  properties: 'useProperties',
  units: 'useUnits',
  rentalAgreements: 'useRentalAgreements',
  vendors: 'useVendors',
  projectAgreements: 'useProjectAgreements',
  salesReturns: 'useSalesReturns',
  projectReceivedAssets: 'useProjectReceivedAssets',
  contracts: 'useContracts',
  quotations: 'useQuotations',
  budgets: 'useBudgets',
  documents: 'useDocuments',
  currentUser: 'useCurrentUser',
  personalTransactions: 'usePersonalTransactions',
  personalCategories: 'usePersonalCategories',
  installmentPlans: 'useInstallmentPlans',
  planAmenities: 'usePlanAmenities',
  pmCycleAllocations: 'usePmCycleAllocations',
};

const SELECTOR_SLICES = [
  'agreementSettings',
  'projectAgreementSettings',
  'rentalInvoiceSettings',
  'projectInvoiceSettings',
  'printSettings',
  'whatsAppTemplates',
  'whatsAppMode',
  'dashboardConfig',
  'accountConsistency',
  'recurringInvoiceTemplates',
  'cashFlowCategoryMappings',
  'enableColorCoding',
  'enableBeepOnSave',
  'enableDatePreservation',
  'lastPreservedDate',
  'showSystemTransactions',
  'pmCostPercentage',
  'defaultProjectId',
  'lastServiceChargeRun',
  'transactionLog',
  'errorLog',
  'currentPage',
  'editingEntity',
  'initialTransactionType',
  'initialTransactionFilter',
  'initialTabs',
  'initialImportType',
  'invoiceHtmlTemplate',
  'users',
  'version',
];

const COMPOSITE_BY_DIR = {
  'components/reports': 'useFinancialReportAppState',
  'components/projectManagement': 'useProjectReportAppState',
  'components/investmentManagement': 'useProjectReportAppState',
  'components/dashboard': 'useFinancialReportAppState',
};

function relPosix(p) {
  return p.split(path.sep).join('/');
}

function depthToHooks(filePath) {
  const rel = relPosix(path.relative(root, filePath));
  const depth = rel.split('/').length - 1;
  return '../'.repeat(depth) + 'hooks/useSelectiveState';
}

function collectFiles(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === 'dist') continue;
      collectFiles(full, out);
    } else if (ent.name.endsWith('.tsx') || ent.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

function compositeHookFor(filePath) {
  const rel = relPosix(path.relative(root, filePath));
  for (const [prefix, hook] of Object.entries(COMPOSITE_BY_DIR)) {
    if (rel.startsWith(prefix)) return hook;
  }
  return null;
}

function migrateFile(filePath) {
  let src = fs.readFileSync(filePath, 'utf8');
  if (!src.includes('useAppContext')) return false;
  if (filePath.includes('AppContext.tsx')) return false;

  const usesDispatch = /\bdispatch\b/.test(src);
  const stateDotMatches = [...src.matchAll(/\bstate\.([a-zA-Z_][a-zA-Z0-9_]*)/g)].map((m) => m[1]);
  const destructMatches = [...src.matchAll(/\{\s*state\s*,\s*([^}]+)\}\s*=\s*useAppContext\(\)/g)];
  for (const m of destructMatches) {
    m[1].split(',').forEach((p) => {
      const k = p.trim().split(':')[0].trim();
      if (k && k !== 'state') stateDotMatches.push(k);
    });
  }

  const slices = new Set(stateDotMatches.filter((k) => SLICE_MAP[k] || SELECTOR_SLICES.includes(k)));
  const composite = compositeHookFor(filePath);
  const wholeStateRefs =
    /\bstate\b/.test(src.replace(/state\.[a-zA-Z_][a-zA-Z0-9_]*/g, '')) ||
    /\[state[\],]/.test(src) ||
    /,\s*state\s*[\],]/.test(src);

  const hooks = new Set();
  if (usesDispatch) hooks.add('useDispatchOnly');

  let useComposite = false;
  if (composite && (wholeStateRefs || slices.size >= 6)) {
    useComposite = true;
    hooks.add(composite);
  } else {
    for (const s of slices) {
      if (SLICE_MAP[s]) hooks.add(SLICE_MAP[s]);
    }
    if (wholeStateRefs && slices.size > 0) {
      // keep slice hooks; may still need composite — add if many slices
      if (slices.size >= 5 && composite) {
        useComposite = true;
        hooks.add(composite);
      }
    } else if (wholeStateRefs && composite) {
      useComposite = true;
      hooks.add(composite);
    }
  }

  // Selector slices not covered by composite-only path
  if (!useComposite) {
    for (const s of slices) {
      if (SELECTOR_SLICES.includes(s)) hooks.add('useStateSelector');
    }
  }

  if (hooks.size === 0 && usesDispatch) hooks.add('useDispatchOnly');
  if (hooks.size === 0) return false;

  const hookPath = depthToHooks(filePath);
  const hookList = [...hooks].sort();

  // Remove useAppContext import
  src = src.replace(
    /import\s*\{\s*([^}]*)\}\s*from\s*['"][^'"]*context\/AppContext['"];?\s*\n/g,
    (match, imports) => {
      const parts = imports.split(',').map((p) => p.trim()).filter(Boolean);
      const keep = parts.filter((p) => p !== 'useAppContext' && p !== '_getAppState');
      if (keep.length === 0) return '';
      return `import { ${keep.join(', ')} } from '../../context/AppContext';\n`;
    }
  );

  // Add selective hooks import if missing
  const importLine = `import { ${hookList.join(', ')} } from '${hookPath}';\n`;
  if (!src.includes("from '" + hookPath + "'") && !src.includes('from "' + hookPath + '"')) {
    const firstImport = src.search(/^import/m);
    if (firstImport >= 0) {
      src = src.slice(0, firstImport) + importLine + src.slice(firstImport);
    }
  }

  const hookDecls = [];
  if (useComposite) {
    hookDecls.push(`const state = ${composite}();`);
  } else {
    for (const s of [...slices].sort()) {
      if (SLICE_MAP[s]) hookDecls.push(`const ${s} = ${SLICE_MAP[s]}();`);
      else if (SELECTOR_SLICES.includes(s))
        hookDecls.push(`const ${s} = useStateSelector((s) => s.${s});`);
    }
  }
  if (usesDispatch) hookDecls.push('const dispatch = useDispatchOnly();');

  const replacement = hookDecls.join('\n    ');

  src = src.replace(
    /const\s*\{\s*state\s*(?:,\s*dispatch)?\s*\}\s*=\s*useAppContext\(\);?/g,
    replacement
  );
  src = src.replace(
    /const\s*\{\s*dispatch\s*,\s*state\s*\}\s*=\s*useAppContext\(\);?/g,
    replacement
  );
  src = src.replace(/const\s*\{\s*dispatch\s*\}\s*=\s*useAppContext\(\);?/g, 'const dispatch = useDispatchOnly();');

  if (!useComposite) {
    for (const [slice, hook] of Object.entries(SLICE_MAP)) {
      if (slices.has(slice)) {
        src = src.replace(new RegExp(`\\bstate\\.${slice}\\b`, 'g'), slice);
        src = src.replace(new RegExp(`\\[state\\.${slice}\\]`, 'g'), `[${slice}]`);
        src = src.replace(new RegExp(`state\\.${slice},`, 'g'), `${slice},`);
        src = src.replace(new RegExp(`, state\\.${slice}\\]`, 'g'), `, ${slice}]`);
      }
    }
    for (const s of SELECTOR_SLICES) {
      if (slices.has(s)) {
        src = src.replace(new RegExp(`\\bstate\\.${s}\\b`, 'g'), s);
      }
    }
  }

  // Fix deps [state, -> individual or remove if composite
  if (useComposite) {
    // state variable still valid
  } else {
    src = src.replace(/,\s*state\s*\]/g, (m) => {
      const deps = [...slices].join(', ');
      return deps ? `, ${deps}]` : ']';
    });
    src = src.replace(/\[\s*state\s*,/g, `[${[...slices].join(', ')},`);
    src = src.replace(/\[\s*state\s*\]/g, `[${[...slices].join(', ')}]`);
  }

  if (src.includes('useAppContext()')) return false;

  fs.writeFileSync(filePath, src);
  return true;
}

const targets = [
  path.join(root, 'components'),
  path.join(root, 'modules'),
  path.join(root, 'hooks', 'useEntityFormModal.tsx'),
  path.join(root, 'hooks', 'useGenerateDueInvoices.ts'),
  path.join(root, 'hooks', 'usePrint.ts'),
  path.join(root, 'hooks', 'usePrintForm.ts'),
].flatMap((t) => {
  if (!fs.existsSync(t)) return [];
  return fs.statSync(t).isDirectory() ? collectFiles(t) : [t];
});

let n = 0;
for (const f of targets) {
  if (migrateFile(f)) {
    n++;
    console.log('migrated', relPosix(path.relative(root, f)));
  }
}
console.log(`Done: ${n} files migrated`);
