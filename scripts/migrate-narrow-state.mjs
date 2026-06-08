#!/usr/bin/env node
/**
 * Replace useFullAppState() with narrower composite hooks in report components.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REPORTS_DIR = path.join(ROOT, 'components', 'reports');

const PROJECT_NAME = /Project|Investor|Revenue|Material|Broker|Budget|Contract|Unit|Layout|Summary|Category|PMCost|Selling/i;
const RENTAL_NAME = /Rental|Building|Property|Agreement|Owner|Receivable|ServiceCharges|Marketing|UnitStatus|TransferStatistics/i;

const SPECIAL = {
  'TrialBalanceReport.tsx': 'trialBalance',
  'ReportHeader.tsx': 'printSettings',
  'ReportFooter.tsx': 'printSettings',
};

function hookForFile(name) {
  if (SPECIAL[name]) return SPECIAL[name];
  if (PROJECT_NAME.test(name)) return 'project';
  if (RENTAL_NAME.test(name)) return 'rental';
  return 'financial';
}

function patchImport(content, hookKind) {
  const importRe = /import\s*\{([^}]+)\}\s*from\s*['"][^'"]*useSelectiveState['"];/;
  const m = content.match(importRe);
  if (!m) return content;

  let names = m[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => s !== 'useFullAppState');

  const add = (n) => {
    if (!names.includes(n)) names.push(n);
  };

  switch (hookKind) {
    case 'trialBalance':
      add('useProjects');
      add('useAccounts');
      break;
    case 'printSettings':
      add('usePrintSettings');
      break;
    case 'project':
      add('useProjectReportAppState');
      break;
    case 'rental':
      add('useRentalReportAppState');
      break;
    default:
      add('useFinancialReportAppState');
  }

  const newImport = `import { ${names.join(', ')} } from '../../hooks/useSelectiveState';`;
  return content.replace(importRe, newImport);
}

function patchBody(content, hookKind, fileName) {
  if (!content.includes('useFullAppState()')) return content;

  switch (hookKind) {
    case 'trialBalance': {
      let next = content.replace(
        /const state = useFullAppState\(\);/,
        'const projects = useProjects();\n  const accounts = useAccounts();'
      );
      next = next.replace(/\bstate\.projects\b/g, 'projects');
      next = next.replace(/\bstate\.accounts\b/g, 'accounts');
      return next;
    }
    case 'printSettings':
      return content
        .replace(/const state = useFullAppState\(\);\s*\n\s*const \{ printSettings \} = state;/, 'const printSettings = usePrintSettings();')
        .replace(/const state = useFullAppState\(\);\s*\n\s*const \{ printSettings \} = state;/, 'const printSettings = usePrintSettings();');
    case 'project':
      return content.replace(/const state = useFullAppState\(\);/, 'const state = useProjectReportAppState();');
    case 'rental':
      return content.replace(/const state = useFullAppState\(\);/, 'const state = useRentalReportAppState();');
    default:
      return content.replace(/const state = useFullAppState\(\);/, 'const state = useFinancialReportAppState();');
  }
}

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

let count = 0;
for (const file of walk(REPORTS_DIR)) {
  const name = path.basename(file);
  const original = fs.readFileSync(file, 'utf8');
  if (!original.includes('useFullAppState')) continue;

  const hookKind = hookForFile(name);
  let next = patchImport(original, hookKind);
  next = patchBody(next, hookKind, name);
  if (next !== original) {
    fs.writeFileSync(file, next, 'utf8');
    console.log(`[narrow-state] ${path.relative(ROOT, file)} → ${hookKind}`);
    count++;
  }
}
console.log(`Done. Patched ${count} report file(s).`);

const BATCH2 = [
  { dir: 'components/projectManagement', hook: 'useProjectReportAppState' },
  { dir: 'components/investmentManagement', hook: 'useProjectReportAppState' },
  { dir: 'components/rentalAgreements', hook: 'useRentalReportAppState' },
  { dir: 'components/payouts', hook: 'useRentalReportAppState' },
  { dir: 'components/vendors', hook: 'useFinancialReportAppState' },
  { dir: 'components/bills', hook: 'useFinancialReportAppState' },
  { dir: 'components/invoices', hook: 'useFinancialReportAppState' },
  { dir: 'components/loans', hook: 'useFinancialReportAppState' },
  { dir: 'components/dashboard', hook: 'useFinancialReportAppState' },
  { dir: 'modules/investor-fund-availability', hook: 'useFinancialReportAppState' },
  { dir: 'modules/project-profitability', hook: 'useProjectReportAppState' },
];

function patchImportGeneric(content, hookName) {
  const importRe = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]*useSelectiveState)['"];/;
  const m = content.match(importRe);
  if (!m) return content;
  const rel = m[2];
  let names = m[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => s !== 'useFullAppState');
  if (!names.includes(hookName)) names.push(hookName);
  return content.replace(importRe, `import { ${names.join(', ')} } from '${rel}';`);
}

let count2 = 0;
for (const { dir, hook } of BATCH2) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  for (const file of walk(abs)) {
    const original = fs.readFileSync(file, 'utf8');
    if (!original.includes('useFullAppState')) continue;
    let next = patchImportGeneric(original, hook);
    next = next.replace(/const state = useFullAppState\(\);/, `const state = ${hook}();`);
    if (next !== original) {
      fs.writeFileSync(file, next, 'utf8');
      console.log(`[narrow-state] ${path.relative(ROOT, file)} → ${hook}`);
      count2++;
    }
  }
}
console.log(`Batch 2 patched ${count2} file(s).`);
