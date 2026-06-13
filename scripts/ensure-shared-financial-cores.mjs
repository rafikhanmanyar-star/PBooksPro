/**
 * Sync shared financial cores into backend/src (single source of truth on client).
 * Run before backend `tsc` / `dev` (see backend/package.json).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

function syncFile(relSrc, relDest, transform = (s) => s) {
  const srcPath = path.join(root, relSrc);
  const destPath = path.join(root, relDest);
  const banner = `/**\n * AUTO-GENERATED — do not edit. Source: ${relSrc}\n * Regenerate: node scripts/ensure-shared-financial-cores.mjs\n */\n\n`;
  const body = fs.readFileSync(srcPath, 'utf8');
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, banner + transform(body));
  console.log(`[ensure-shared-financial-cores] ${relSrc} → ${relDest}`);
}

// Architecture v2: shared/financial-core → backend financial/
syncFile(
  'shared/financial-core/trialBalanceCore.ts',
  'backend/src/financial/trialBalanceCore.ts',
  (s) => s.replace("from './validation'", "from './validation.js'")
);

syncFile(
  'shared/financial-core/journalLedgerCore.ts',
  'backend/src/financial/journalLedgerCore.ts',
  (s) => s.replace("from './validation'", "from './validation.js'").replace("from './trialBalanceCore'", "from './trialBalanceCore.js'")
);

syncFile(
  'shared/financial-core/validation.ts',
  'backend/src/financial/validation.ts',
  (s) =>
    s
      .replaceAll("from './types'", "from './types.js'")
      .replace("export type { JournalLineInput } from './types.js';", "export type { JournalLineInput } from './types.js';")
);

syncFile(
  'shared/financial-core/types.ts',
  'backend/src/financial/types.ts'
);

// payrollLedgerCore: shared → backend services (+ ledger type constants used by DB layer)
syncFile('shared/payrollLedgerCore.ts', 'backend/src/services/payrollLedgerCore.ts', (s) => {
  const header = `export const PAYROLL_LEDGER_TYPES = [
  'PAYSLIP',
  'PAYMENT',
  'ADVANCE',
  'ADVANCE_ADJUSTMENT',
  'MANUAL_ADJUSTMENT',
] as const;

export type PayrollLedgerType = (typeof PAYROLL_LEDGER_TYPES)[number];

`;
  return header + s.replace(/^\/\*\*[\s\S]*?\*\/\s*\n/, '');
});

syncFile('shared/rbac/permissions.ts', 'backend/src/auth/permissions.ts');

syncFile('shared/rbac/mfaPolicy.ts', 'backend/src/auth/mfaPolicy.ts', (s) =>
  s.replace("from './permissions'", "from './permissions.js'")
);

syncFile(
  'shared/financial-core/financialReconciliationEngine.ts',
  'backend/src/financial/financialReconciliationEngine.ts',
  (s) =>
    s
      .replace("from './validation'", "from './validation.js'")
      .replace("from './journalLedgerCore'", "from './journalLedgerCore.js'")
);

syncFile(
  'shared/quotation-validation/types.ts',
  'backend/src/quotationValidation/types.ts',
  (s) => s.replace("from './types.js'", "from './types.js'")
);

syncFile(
  'shared/quotation-validation/QuotationValidationService.ts',
  'backend/src/quotationValidation/QuotationValidationService.ts',
  (s) =>
    s
      .replace("from './types.js'", "from './types.js'")
      .replace("from './types'", "from './types.js'")
);

syncFile(
  'shared/contract-retention/types.ts',
  'backend/src/contractRetention/types.ts'
);

syncFile(
  'shared/contract-retention/contractRetentionCore.ts',
  'backend/src/contractRetention/contractRetentionCore.ts',
  (s) => s.replace("from './types.js'", "from './types.js'")
);

console.log('[ensure-shared-financial-cores] OK');
