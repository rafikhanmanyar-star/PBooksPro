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

// trialBalanceCore: client financialEngine → backend financial/
syncFile(
  'services/financialEngine/trialBalanceCore.ts',
  'backend/src/financial/trialBalanceCore.ts',
  (s) => s.replace("from './validation'", "from './validation.js'")
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

console.log('[ensure-shared-financial-cores] OK');
