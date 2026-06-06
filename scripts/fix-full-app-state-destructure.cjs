'use strict';
const fs = require('fs');
const path = require('path');

const KEYS = [
  'accounts', 'contacts', 'vendors', 'categories', 'projects', 'buildings', 'properties', 'units',
  'transactions', 'invoices', 'bills', 'quotations', 'documents', 'budgets', 'rentalAgreements',
  'projectAgreements', 'salesReturns', 'projectReceivedAssets', 'contracts', 'personalCategories',
  'personalTransactions', 'recurringInvoiceTemplates', 'pmCycleAllocations', 'agreementSettings',
  'projectAgreementSettings', 'rentalInvoiceSettings', 'projectInvoiceSettings', 'printSettings',
  'whatsAppTemplates', 'dashboardConfig', 'accountConsistency', 'installmentPlans', 'planAmenities',
  'showSystemTransactions', 'enableColorCoding', 'enableBeepOnSave', 'enableDatePreservation',
  'whatsAppMode', 'pmCostPercentage', 'defaultProjectId', 'transactionLog', 'errorLog', 'currentUser',
  'users', 'currentPage', 'editingEntity', 'initialTransactionType', 'initialTransactionFilter',
  'initialTabs', 'initialImportType', 'contracts', 'salesReturns', 'projectReceivedAssets',
];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      walk(p, out);
    } else if (e.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

function bare(content, key) {
  return new RegExp(`(?<![.\\w])${key}\\b`).test(content);
}

function hasDestructureAfterState(content) {
  const idx = content.indexOf('const state = useFullAppState();');
  if (idx === -1) return false;
  const slice = content.slice(idx, idx + 400);
  return /const\s*\{[^}]+\}\s*=\s*state;/.test(slice);
}

function localConst(content, key) {
  return new RegExp(`\\bconst\\s+${key}\\s*=`).test(content);
}

function usesStateDot(content, key) {
  return content.includes(`state.${key}`);
}

function patch(content) {
  const marker = 'const state = useFullAppState();';
  if (!content.includes(marker) || hasDestructureAfterState(content)) return null;

  const parts = [];
  for (const key of KEYS) {
    if (!bare(content, key)) continue;
    if (usesStateDot(content, key) && !localConst(content, key)) continue;
    if (localConst(content, key)) {
      const alias = `all${key.charAt(0).toUpperCase()}${key.slice(1)}`;
      parts.push(`${alias}: ${key}`);
      content = content.replace(
        new RegExp(`(?<![.\\w])${key}\\.(filter|map|find|forEach|reduce|some|every|sort)`, 'g'),
        `${alias}.$1`
      );
      content = content.replace(new RegExp(`\\[${key},`, 'g'), `[${alias},`);
      content = content.replace(new RegExp(`, ${key}\\]`, 'g'), `, ${alias}]`);
      content = content.replace(new RegExp(`, ${key},`, 'g'), `, ${alias},`);
    } else if (!parts.includes(key) && !parts.some((p) => p.endsWith(`: ${key}`))) {
      parts.push(key);
    }
  }

  if (!parts.length) return null;
  const insert = `const { ${parts.join(', ')} } = state;`;
  return content.replace(marker, `${marker}\n    ${insert}`);
}

let count = 0;
for (const root of ['components', 'modules']) {
  if (!fs.existsSync(root)) continue;
  for (const file of walk(root)) {
    const original = fs.readFileSync(file, 'utf8');
    const next = patch(original);
    if (next && next !== original) {
      fs.writeFileSync(file, next, 'utf8');
      console.log('patched', file);
      count++;
    }
  }
}
console.log('patched files:', count);
