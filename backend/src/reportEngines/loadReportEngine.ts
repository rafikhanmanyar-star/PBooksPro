import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** Resolve esbuild bundle next to backend/dist regardless of process.cwd(). */
function resolveBundledEnginePath(fileName: string): string {
  const candidates = [
    path.join(moduleDir, '..', fileName),
    path.join(moduleDir, '..', '..', 'dist', fileName),
    path.join(process.cwd(), 'dist', fileName),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Report engine bundle missing: ${fileName}. Tried:\n${candidates.join('\n')}\nRun npm run build:backend (ensure-*-engine scripts).`
  );
}

/** Bundled report engines (esbuild from shared/report-engines). Central loader for Architecture v2. */
const engineCache = new Map<string, unknown>();

export const REPORT_ENGINE_BUNDLES = {
  balanceSheet: 'balanceSheetEngine.mjs',
  profitLoss: 'profitLossEngine.mjs',
  cashFlow: 'cashFlowEngine.mjs',
  bmAnalysis: 'bmAnalysisReportEngine.mjs',
  clientLedger: 'clientLedgerReportEngine.mjs',
  ownerIncomeSummary: 'ownerIncomeSummaryReportEngine.mjs',
  ownerRentalIncome: 'ownerRentalIncomeLedgerEngine.mjs',
  ownerSecurityDeposit: 'ownerSecurityDepositReportEngine.mjs',
  rentalBillsDashboard: 'rentalBillsDashboardEngine.mjs',
  rentalReceivable: 'rentalReceivableReportEngine.mjs',
  serviceChargesDeduction: 'serviceChargesDeductionReportEngine.mjs',
  tenantLedger: 'tenantLedgerReportEngine.mjs',
  vendorLedger: 'vendorLedgerReportEngine.mjs',
} as const;

export type ReportEngineBundleName = keyof typeof REPORT_ENGINE_BUNDLES;

export async function loadReportEngine<T>(bundleKey: ReportEngineBundleName): Promise<T> {
  const fileName = REPORT_ENGINE_BUNDLES[bundleKey];
  const cached = engineCache.get(fileName);
  if (cached) return cached as T;

  const bundled = resolveBundledEnginePath(fileName);
  const mod = (await import(pathToFileURL(bundled).href)) as T;
  engineCache.set(fileName, mod);
  return mod;
}
