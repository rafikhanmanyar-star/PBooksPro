import path from 'path';
import { pathToFileURL } from 'url';
import fs from 'fs';

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

  const bundled = path.join(process.cwd(), 'dist', fileName);
  if (!fs.existsSync(bundled)) {
    throw new Error(
      `Report engine bundle missing: ${bundled}. Run npm run build:backend (ensure-*-engine scripts).`
    );
  }
  const mod = (await import(pathToFileURL(bundled).href)) as T;
  engineCache.set(fileName, mod);
  return mod;
}
