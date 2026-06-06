import path from 'path';
import { pathToFileURL } from 'url';
import fs from 'fs';
import type pg from 'pg';
import { listTransactions, rowToTransactionApi } from './transactionsService.js';
import { listCategories, rowToCategoryApi, fetchPlSubTypesForTenant } from './categoriesService.js';
import { listBills, rowToBillApi } from './billsService.js';
import { listBuildings, rowToBuildingApi } from './buildingsService.js';
import { listProperties, rowToPropertyApi } from './propertiesService.js';
import { listRentalAgreements, rowToRentalAgreementApi } from './rentalAgreementsService.js';
import { listVendors, rowToVendorApi } from './vendorsService.js';

type RentalBillsDashboardEngineModule = {
  computeRentalBillsDashboard: (
    input: Record<string, unknown>,
    filters: Record<string, unknown>
  ) => {
    tree: unknown[];
    summary: Record<string, unknown>;
    rows: unknown[];
    totalRows: number;
  };
};

let cachedEngine: RentalBillsDashboardEngineModule | null = null;

async function loadRentalBillsDashboardEngine(): Promise<RentalBillsDashboardEngineModule> {
  if (cachedEngine) return cachedEngine;
  const bundled = path.join(process.cwd(), 'dist', 'rentalBillsDashboardEngine.mjs');
  if (!fs.existsSync(bundled)) {
    throw new Error(
      `Rental bills dashboard engine bundle missing: ${bundled}. Run: node scripts/ensure-rental-bills-dashboard-engine.mjs`
    );
  }
  cachedEngine = (await import(pathToFileURL(bundled).href)) as RentalBillsDashboardEngineModule;
  return cachedEngine;
}

function asRecord<T extends Record<string, unknown>>(x: Record<string, unknown>): T {
  return x as T;
}

async function loadRentalBillsDashboardStateInput(client: pg.PoolClient, tenantId: string) {
  const [txRows, catRows, billRows, buildingRows, propertyRows, vendorRows, rentalRows, plMap] =
    await Promise.all([
      listTransactions(client, tenantId, { limit: 500_000, offset: 0 }),
      listCategories(client, tenantId),
      listBills(client, tenantId),
      listBuildings(client, tenantId),
      listProperties(client, tenantId),
      listVendors(client, tenantId),
      listRentalAgreements(client, tenantId),
      fetchPlSubTypesForTenant(client, tenantId),
    ]);

  const rentalBills = billRows.filter((r) => r.project_id == null);

  return {
    bills: rentalBills.map((r) => asRecord(rowToBillApi(r))),
    transactions: txRows.map((r) => asRecord(rowToTransactionApi(r))),
    categories: catRows.map((r) => asRecord(rowToCategoryApi(r, plMap.get(r.id)))),
    buildings: buildingRows.map((r) => asRecord(rowToBuildingApi(r))),
    properties: propertyRows.map((r) => asRecord(rowToPropertyApi(r))),
    vendors: vendorRows.map((r) => asRecord(rowToVendorApi(r))),
    rentalAgreements: rentalRows.map((r) => asRecord(rowToRentalAgreementApi(r))),
  };
}

export async function getRentalBillsDashboardJson(
  client: pg.PoolClient,
  tenantId: string,
  filters: {
    viewBy: 'building' | 'property' | 'vendor' | 'bearer';
    status?: string;
    search?: string;
    tab?: 'all' | 'unpaid' | 'overdue';
    typeFilter?: 'All' | 'Bills' | 'Payments';
    nodeId?: string;
    sortKey?: string;
    sortDir?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
  }
) {
  const state = await loadRentalBillsDashboardStateInput(client, tenantId);
  const { computeRentalBillsDashboard } = await loadRentalBillsDashboardEngine();

  const validViewBy = new Set(['building', 'property', 'vendor', 'bearer']);
  const viewBy = validViewBy.has(filters.viewBy) ? filters.viewBy : 'building';
  const statusRaw = filters.status ?? 'all';
  const validStatus = new Set(['all', 'Unpaid', 'Paid', 'Partially Paid', 'Overdue']);
  const statusFilter = validStatus.has(statusRaw) ? statusRaw : 'all';
  const tabRaw = filters.tab ?? 'all';
  const validTab = new Set(['all', 'unpaid', 'overdue']);
  const tabFilter = validTab.has(tabRaw) ? tabRaw : 'all';
  const typeRaw = filters.typeFilter ?? 'Bills';
  const validType = new Set(['All', 'Bills', 'Payments']);
  const typeFilter = validType.has(typeRaw) ? typeRaw : 'Bills';
  const pageSize = Math.min(Math.max(filters.pageSize ?? 20, 1), 200);
  const page = Math.max(filters.page ?? 1, 1);

  const result = computeRentalBillsDashboard(state as never, {
    viewBy,
    statusFilter,
    searchQuery: filters.search ?? '',
    tabFilter,
    typeFilter,
    selectedNodeId: filters.nodeId?.trim() ? filters.nodeId.trim() : null,
    sortConfig: {
      key: filters.sortKey || 'date',
      dir: filters.sortDir === 'asc' ? 'asc' : 'desc',
    },
    page,
    pageSize,
  });

  return {
    tree: result.tree,
    summary: result.summary,
    rows: result.rows,
    totalRows: result.totalRows,
    page,
    pageSize,
  };
}
