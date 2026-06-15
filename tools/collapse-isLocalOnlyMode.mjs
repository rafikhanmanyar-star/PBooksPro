/**
 * One-off: collapse isLocalOnlyMode() branches (always false) in listed files.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');

const FILES = [
  'components/bills/BillBulkPaymentModal.tsx',
  'components/payouts/BrokerPayoutModal.tsx',
  'components/payroll/EmployeeProfile.tsx',
  'components/payroll/modals/EditPayslipModal.tsx',
  'components/payroll/modals/PayslipModal.tsx',
  'components/procurement/VendorPriceHistoryPage.tsx',
  'components/projectManagement/CancelAgreementModal.tsx',
  'components/projectManagement/ProjectAgreementForm.tsx',
  'components/projectManagement/ProjectOwnerPayoutModal.tsx',
  'components/projectManagement/ProjectPMPaymentModal.tsx',
  'components/rentalAgreements/RentalAgreementForm.tsx',
  'components/reports/customReportBuilder/CustomReportBuilderPage.tsx',
  'components/settings/ContactsManagement.tsx',
  'components/vendors/VendorBillPaymentModal.tsx',
  'modules/customer-reporting/CustomerReportingPage.tsx',
  'services/financialEngine/ledgerReports.ts',
  'shared/financial-core/ledgerReports.ts',
];

function findMatchingBrace(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function removeIfBlock(src, pattern) {
  let out = src;
  let idx = 0;
  while ((idx = out.indexOf(pattern, idx)) !== -1) {
    const braceStart = out.indexOf('{', idx);
    if (braceStart === -1) break;
    const braceEnd = findMatchingBrace(out, braceStart);
    if (braceEnd === -1) break;
    out = out.slice(0, idx) + out.slice(braceEnd + 1);
  }
  return out;
}

function unwrapIfNotLocal(src) {
  const re = /if\s*\(\s*!isLocalOnlyMode\(\)\s*\)\s*\{/g;
  let m;
  let out = src;
  const replacements = [];
  while ((m = re.exec(src)) !== null) {
    const braceStart = m.index + m[0].length - 1;
    const braceEnd = findMatchingBrace(src, braceStart);
    if (braceEnd === -1) continue;
    const body = src.slice(braceStart + 1, braceEnd).trim();
    replacements.push({ start: m.index, end: braceEnd + 1, body });
  }
  for (let i = replacements.length - 1; i >= 0; i--) {
    const { start, end, body } = replacements[i];
    out = out.slice(0, start) + body + out.slice(end);
  }
  return out;
}

function collapseElseAfterRemovedIf(src) {
  // if (isLocalOnlyMode()) { ... } else { API } -> API body
  const re = /if\s*\(\s*isLocalOnlyMode\(\)\s*\)\s*\{/g;
  let out = src;
  const replacements = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    const ifBraceStart = m.index + m[0].length - 1;
    const ifBraceEnd = findMatchingBrace(src, ifBraceStart);
    if (ifBraceEnd === -1) continue;
    let pos = ifBraceEnd + 1;
    while (pos < src.length && /\s/.test(src[pos])) pos++;
    if (src.slice(pos, pos + 4) !== 'else') continue;
    pos += 4;
    while (pos < src.length && /\s/.test(src[pos])) pos++;
    if (src[pos] !== '{') continue;
    const elseBraceEnd = findMatchingBrace(src, pos);
    if (elseBraceEnd === -1) continue;
    const elseBody = src.slice(pos + 1, elseBraceEnd).trim();
    replacements.push({ start: m.index, end: elseBraceEnd + 1, body: elseBody });
  }
  for (let i = replacements.length - 1; i >= 0; i--) {
    const { start, end, body } = replacements[i];
    out = out.slice(0, start) + body + out.slice(end);
  }
  return out;
}

function processFile(relPath) {
  const full = path.join(ROOT, relPath);
  let src = fs.readFileSync(full, 'utf8');
  if (!src.includes('isLocalOnlyMode')) return false;

  src = src.replace(/^import\s+\{[^}]*\bisLocalOnlyMode\b[^}]*\}\s+from\s+['"][^'"]+['"];\s*\n?/gm, '');
  src = src.replace(/\bconst\s+localOnly\s*=\s*isLocalOnlyMode\(\)\s*;/g, 'const localOnly = false;');
  src = src.replace(/\b!isLocalOnlyMode\(\)\s*&&\s*/g, '');
  src = src.replace(/\s*&&\s*!isLocalOnlyMode\(\)/g, '');
  src = src.replace(/\|\|\s*isLocalOnlyMode\(\)/g, '');
  src = src.replace(/\bisLocalOnlyMode\(\)\s*\|\|/g, '');
  src = src.replace(/\bisLocalOnlyMode\(\)\s*&&\s*/g, '');

  // else-if chains: if (isLocalOnlyMode()) { local } else { api }
  src = collapseElseAfterRemovedIf(src);
  // standalone if (isLocalOnlyMode()) { ... }
  src = removeIfBlock(src, 'if (isLocalOnlyMode())');
  src = removeIfBlock(src, 'if(isLocalOnlyMode())');
  // unwrap if (!isLocalOnlyMode()) { api }
  src = unwrapIfNotLocal(src);

  fs.writeFileSync(full, src);
  return true;
}

let n = 0;
for (const f of FILES) {
  if (processFile(f)) {
    console.log('updated', f);
    n++;
  }
}
console.log('done', n);
