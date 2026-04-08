import path from 'path';
import { pathToFileURL } from 'url';
import fs from 'fs';
import type pg from 'pg';
import { listAccounts, rowToAccountApi } from './accountsService.js';
import { listTransactions, rowToTransactionApi } from './transactionsService.js';
import { listCategories, rowToCategoryApi } from './categoriesService.js';
import { listInvoices, rowToInvoiceApi } from './invoicesService.js';
import { listBills, rowToBillApi } from './billsService.js';
import { listProjectAgreementsWithUnits, rowToProjectAgreementApi } from './projectAgreementsService.js';
import { listUnits, rowToUnitApi } from './unitsService.js';
import { listProjectReceivedAssets, rowToProjectReceivedAssetApi } from './projectReceivedAssetsService.js';

type BalanceSheetEngineModule = {
  computeBalanceSheetReport: (
    state: Record<string, unknown>,
    options: { asOfDate: string; selectedProjectId: string }
  ) => Record<string, unknown>;
};

let cachedEngine: BalanceSheetEngineModule | null = null;

async function loadBalanceSheetEngine(): Promise<BalanceSheetEngineModule> {
  if (cachedEngine) return cachedEngine;
  const bundled = path.join(process.cwd(), 'dist', 'balanceSheetEngine.mjs');
  if (!fs.existsSync(bundled)) {
    throw new Error(
      `Balance sheet engine bundle missing: ${bundled}. Run: node scripts/ensure-balance-sheet-engine.mjs (or npm run build in backend).`
    );
  }
  cachedEngine = (await import(pathToFileURL(bundled).href)) as BalanceSheetEngineModule;
  return cachedEngine;
}

function asRecord<T extends Record<string, unknown>>(x: Record<string, unknown>): T {
  return x as T;
}

/**
 * Loads the minimal app state required by computeBalanceSheetReport (LAN / PostgreSQL).
 */
/** Exported for profit-loss and other reports that share the same minimal state shape. */
export async function loadBalanceSheetStateInput(client: pg.PoolClient, tenantId: string, asOfDate: string) {
  const [accountRows, txRows, catRows, invRows, billRows, praRows, unitRows, paWithUnits] = await Promise.all([
    listAccounts(client, tenantId),
    listTransactions(client, tenantId, { endDate: asOfDate, limit: 500000, offset: 0 }),
    listCategories(client, tenantId),
    listInvoices(client, tenantId),
    listBills(client, tenantId),
    listProjectReceivedAssets(client, tenantId),
    listUnits(client, tenantId),
    listProjectAgreementsWithUnits(client, tenantId),
  ]);

  const accounts = accountRows.map((r) => asRecord(rowToAccountApi(r)));
  const transactions = txRows.map((r) => asRecord(rowToTransactionApi(r)));
  const categories = catRows.map((r) => asRecord(rowToCategoryApi(r)));
  const invoices = invRows.map((r) => asRecord(rowToInvoiceApi(r)));
  const bills = billRows.map((r) => asRecord(rowToBillApi(r)));
  const projectReceivedAssets = praRows.map((r) => asRecord(rowToProjectReceivedAssetApi(r)));
  const units = unitRows.map((r) => asRecord(rowToUnitApi(r)));
  const projectAgreements = paWithUnits.map(({ row, unitIds }) => {
    const api = rowToProjectAgreementApi(row, unitIds) as Record<string, unknown>;
    return asRecord(api);
  });

  return {
    accounts,
    transactions,
    categories,
    invoices,
    bills,
    projectAgreements,
    projectReceivedAssets,
    units,
  };
}

export async function getBalanceSheetReportJson(
  client: pg.PoolClient,
  tenantId: string,
  asOfDate: string,
  selectedProjectId: string,
  options?: { includeDebug?: boolean }
) {
  const state = await loadBalanceSheetStateInput(client, tenantId, asOfDate);
  const { computeBalanceSheetReport } = await loadBalanceSheetEngine();
  const report = computeBalanceSheetReport(state as never, { asOfDate, selectedProjectId }) as {
    assets: { current: unknown[]; non_current: unknown[]; total: number };
    liabilities: { current: unknown[]; non_current: unknown[]; total: number };
    equity: { items: unknown[]; total: number };
    supplemental: { marketInventoryMemo: number };
    totals: { assets: number; liabilities: number; equity: number; difference: number };
    retainedEarningsFromPL: number;
    isBalanced: boolean;
    discrepancy: number;
    validation: unknown[];
    debugLines: unknown[];
  };

  return {
    date: asOfDate,
    projectId: selectedProjectId,
    assets: {
      current: report.assets.current,
      non_current: report.assets.non_current,
      total: report.assets.total,
    },
    liabilities: {
      current: report.liabilities.current,
      non_current: report.liabilities.non_current,
      total: report.liabilities.total,
    },
    equity: {
      items: report.equity.items,
      total: report.equity.total,
    },
    supplemental: report.supplemental,
    totals: report.totals,
    retainedEarningsFromPL: report.retainedEarningsFromPL,
    isBalanced: report.isBalanced,
    discrepancy: report.discrepancy,
    validation: report.validation,
    ...(options?.includeDebug ? { debugLines: report.debugLines } : {}),
  };
}
