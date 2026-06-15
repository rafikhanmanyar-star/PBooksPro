import type pg from 'pg';
import { loadReportEngine } from '../../../reportEngines/loadReportEngine.js';
import { listTransactions, rowToTransactionApi } from '../../accounting/services/transactionsService.js';
import { listBills, rowToBillApi } from '../../vendors/services/billsService.js';
import { listBuildings, rowToBuildingApi } from '../../properties/services/buildingsService.js';
import { listProperties, rowToPropertyApi } from '../../properties/services/propertiesService.js';
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

async function loadVendorLedgerEngine(): Promise<VendorLedgerEngineModule> {
  return loadReportEngine<VendorLedgerEngineModule>('vendorLedger');
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
