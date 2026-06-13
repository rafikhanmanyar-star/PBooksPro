import type pg from 'pg';
import { loadReportEngine } from '../reportEngines/loadReportEngine.js';
import { listAccounts, rowToAccountApi } from './accountsService.js';
import { listTransactions, rowToTransactionApi } from './transactionsService.js';
import { listCategories, rowToCategoryApi, fetchPlSubTypesForTenant } from './categoriesService.js';
import { listInvoices, rowToInvoiceApi } from './invoicesService.js';
import { listBills, rowToBillApi } from './billsService.js';
import { listProjectAgreementsWithUnits, rowToProjectAgreementApi } from './projectAgreementsService.js';
import { listUnits, rowToUnitApi } from './unitsService.js';
import { listProjectReceivedAssets, rowToProjectReceivedAssetApi } from './projectReceivedAssetsService.js';
import { listProjects, rowToProjectApi } from './projectsService.js';
import { listBuildings, rowToBuildingApi } from './buildingsService.js';
import { listProperties, rowToPropertyApi } from './propertiesService.js';
import { loadJournalLedgerInput } from './journalLedgerLoadService.js';

type BalanceSheetEngineModule = {
  computeBalanceSheetReport: (
    state: Record<string, unknown>,
    options: {
      asOfDate: string;
      selectedProjectId: string;
      selectedBuildingId?: string;
      useJournalLedger?: boolean;
    }
  ) => Record<string, unknown>;
};

async function loadBalanceSheetEngine(): Promise<BalanceSheetEngineModule> {
  return loadReportEngine<BalanceSheetEngineModule>('balanceSheet');
}

function asRecord<T extends Record<string, unknown>>(x: Record<string, unknown>): T {
  return x as T;
}

/**
 * Loads the minimal app state required by computeBalanceSheetReport (LAN / PostgreSQL).
 */
/** Exported for profit-loss and other reports that share the same minimal state shape. */
export async function loadBalanceSheetStateInput(client: pg.PoolClient, tenantId: string, asOfDate: string) {
  const [accountRows, txRows, catRows, invRows, billRows, praRows, unitRows, paWithUnits, plMap, projectRows, buildingRows, propertyRows, journalData] =
    await Promise.all([
      listAccounts(client, tenantId),
      listTransactions(client, tenantId, {
        endDate: asOfDate,
        limit: 500_000,
        offset: 0,
      }),
      listCategories(client, tenantId),
      listInvoices(client, tenantId),
      listBills(client, tenantId),
      listProjectReceivedAssets(client, tenantId),
      listUnits(client, tenantId),
      listProjectAgreementsWithUnits(client, tenantId),
      fetchPlSubTypesForTenant(client, tenantId),
      listProjects(client, tenantId),
      listBuildings(client, tenantId),
      listProperties(client, tenantId),
      loadJournalLedgerInput(client, tenantId, { asOfDate }),
    ]);

  const accounts = accountRows.map((r) => asRecord(rowToAccountApi(r)));
  const transactions = txRows.map((r) => asRecord(rowToTransactionApi(r)));
  const categories = catRows.map((r) => asRecord(rowToCategoryApi(r, plMap.get(r.id))));
  const invoices = invRows.map((r) => asRecord(rowToInvoiceApi(r)));
  const bills = billRows.map((r) => asRecord(rowToBillApi(r)));
  const projectReceivedAssets = praRows.map((r) => asRecord(rowToProjectReceivedAssetApi(r)));
  const units = unitRows.map((r) => asRecord(rowToUnitApi(r)));
  const projects = projectRows.map((r) => asRecord(rowToProjectApi(r)));
  const buildings = buildingRows.map((r) => asRecord(rowToBuildingApi(r)));
  const properties = propertyRows.map((r) => asRecord(rowToPropertyApi(r)));
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
    projects,
    buildings,
    properties,
    journalLedger: {
      ...journalData,
      accounts,
      transactions,
    },
  };
}

export async function getBalanceSheetReportJson(
  client: pg.PoolClient,
  tenantId: string,
  asOfDate: string,
  selectedProjectId: string,
  options?: { includeDebug?: boolean; selectedBuildingId?: string }
) {
  const state = await loadBalanceSheetStateInput(client, tenantId, asOfDate);
  const { computeBalanceSheetReport } = await loadBalanceSheetEngine();
  const selectedBuildingId = options?.selectedBuildingId ?? 'all';
  const report = computeBalanceSheetReport(state as never, {
    asOfDate,
    selectedProjectId,
    selectedBuildingId,
    useJournalLedger: true,
  }) as {
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
