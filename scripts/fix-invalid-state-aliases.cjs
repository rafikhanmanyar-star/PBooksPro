'use strict';
const fs = require('fs');
const path = require('path');

const REPLACEMENTS = [
  [/allProjects:\s*projects/g, 'projects: appProjects'],
  [/allTransactions:\s*transactions/g, 'transactions: appTransactions'],
  [/allAccounts:\s*accounts/g, 'accounts: appAccounts'],
  [/allCategories:\s*categories/g, 'categories'],
  [/allInvoices:\s*invoices/g, 'invoices: appInvoices'],
  [/allBills:\s*bills/g, 'bills'],
  [/allBuildings:\s*buildings/g, 'buildings'],
  [/allVendors:\s*vendors/g, 'vendors'],
  [/allUnits:\s*units/g, 'units'],
  [/allQuotations:\s*quotations/g, 'quotations'],
  [/allContracts:\s*contracts(?:,\s*allContracts:\s*contracts)?/g, 'contracts'],
  [/allSalesReturns:\s*salesReturns(?:,\s*allSalesReturns:\s*salesReturns)?/g, 'salesReturns'],
  [/allCurrentUser:\s*currentUser/g, 'currentUser'],
  [/allAgreementSettings:\s*agreementSettings/g, 'agreementSettings'],
  [/allPrintSettings:\s*printSettings/g, 'printSettings'],
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

for (const root of ['components', 'modules']) {
  if (!fs.existsSync(root)) continue;
  for (const file of walk(root)) {
    let c = fs.readFileSync(file, 'utf8');
    const orig = c;
    for (const [re, rep] of REPLACEMENTS) c = c.replace(re, rep);
    if (c !== orig) {
      fs.writeFileSync(file, c, 'utf8');
      console.log('fixed aliases', file);
    }
  }
}
