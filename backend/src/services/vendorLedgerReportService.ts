import path from 'path';
import { pathToFileURL } from 'url';
import fs from 'fs';
import type pg from 'pg';
import { listTransactions, rowToTransactionApi } from './transactionsService.js';
import { listBills, rowToBillApi } from './billsService.js';
import { listBuildings, rowToBuildingApi } from './buildingsService.js';
import { listProperties, rowToPropertyApi } from './propertiesService.js';
import { listVendors, rowToVendorApi } from './vendorsService.js';

type VendorLedgerEngineModule = {
  computeVendorLedgerReport: (
    state: Record<string, unknown>,
    filters: Record<string, unknown>
  ) => {
    rows: unknown[];
    totals: { bill: number; paid: number };
    closingBalance: number;
  };
};

let cachedEngine: VendorLedgerEngineModule | null = null;

async function loadVendorLedgerEngine(): Promise<VendorLedgerEngineModule> {
  if (cachedEngine) return cachedEngine;
  const bundled = path.join(process.cwd(), 'dist', 'vendorLedgerReportEngine.mjs');
  if (!fs.existsSync(bundled)) {
    throw new Error(
      `Vendor ledger engine bundle missing: ${bundled}. Run: node scripts/ensure-vendor-ledger-engine.mjs`
    );
  }
  cachedEngine = (await import(pathToFileURL(bundled).href)) as VendorLedgerEngineModule;
  return cachedEngine;
}

function asRecord<T extends Record<string, unknown>>(x: Record<string, unknown>): T {
  return x as T;
}

export async function loadVendorLedgerStateInput(
  client: pg.PoolClient,
  tenantId: string,
  endDate: string
) {
  const [txRows, billRows, buildingRows, propertyRows, vendorRows] = await Promise.all([
    listTransactions(client, tenantId, { endDate, limit: 500_000, offset: 0 }),
    listBills(client, tenantId),
    listBuildings(client, tenantId),
    listProperties(client, tenantId),
    listVendors(client, tenantId),
  ]);

  return {
    vendors: vendorRows.map((r) => asRecord(rowToVendorApi(r))),
    buildings: buildingRows.map((r) => asRecord(rowToBuildingApi(r))),
    properties: propertyRows.map((r) => asRecord(rowToPropertyApi(r))),
    bills: billRows.map((r) => asRecord(rowToBillApi(r))),
    transactions: txRows.map((r) => asRecord(rowToTransactionApi(r))),
  };
}

export async function getVendorLedgerReportJson(
  client: pg.PoolClient,
  tenantId: string,
  filters: {
    startDate: string;
    endDate: string;
    vendorId?: string;
    buildingId?: string;
    search?: string;
    context?: string;
    sortDirection?: 'asc' | 'desc';
  }
) {
  const state = await loadVendorLedgerStateInput(client, tenantId, filters.endDate);
  const { computeVendorLedgerReport } = await loadVendorLedgerEngine();

  const context =
    filters.context === 'Rental' || filters.context === 'Project' ? filters.context : undefined;

  const result = computeVendorLedgerReport(state as never, {
    startDate: filters.startDate,
    endDate: filters.endDate,
    selectedVendorId:
      filters.vendorId && filters.vendorId !== 'all' ? filters.vendorId : 'all',
    selectedBuildingId:
      filters.buildingId && filters.buildingId !== 'all' ? filters.buildingId : 'all',
    searchQuery: filters.search ?? '',
    context,
    dateSortDesc: filters.sortDirection === 'desc',
  });

  return {
    startDate: filters.startDate,
    endDate: filters.endDate,
    vendorId: filters.vendorId ?? 'all',
    buildingId: filters.buildingId ?? 'all',
    context: context ?? null,
    rows: result.rows,
    totals: result.totals,
    closingBalance: result.closingBalance,
  };
}
