import path from 'path';
import { pathToFileURL } from 'url';
import fs from 'fs';
import type pg from 'pg';
import { listTransactions, rowToTransactionApi } from './transactionsService.js';
import { listCategories, rowToCategoryApi, fetchPlSubTypesForTenant } from './categoriesService.js';
import { listBills, rowToBillApi } from './billsService.js';
import { listInvoices, rowToInvoiceApi } from './invoicesService.js';
import { listContacts, rowToContactApi } from './contactsService.js';
import { listBuildings, rowToBuildingApi } from './buildingsService.js';
import { listProperties, rowToPropertyApi } from './propertiesService.js';
import { listRentalAgreements, rowToRentalAgreementApi } from './rentalAgreementsService.js';

type OwnerRentalIncomeEngineModule = {
  computeOwnerRentalIncomeReport: (
    state: Record<string, unknown>,
    filters: Record<string, unknown>
  ) => {
    openingBalance: number;
    reportData: unknown[];
    fullLedgerClosingBalance: number;
  };
};

let cachedEngine: OwnerRentalIncomeEngineModule | null = null;

async function loadOwnerRentalIncomeEngine(): Promise<OwnerRentalIncomeEngineModule> {
  if (cachedEngine) return cachedEngine;
  const bundled = path.join(process.cwd(), 'dist', 'ownerRentalIncomeLedgerEngine.mjs');
  if (!fs.existsSync(bundled)) {
    throw new Error(
      `Owner rental income engine bundle missing: ${bundled}. Run: node scripts/ensure-owner-rental-income-engine.mjs`
    );
  }
  cachedEngine = (await import(pathToFileURL(bundled).href)) as OwnerRentalIncomeEngineModule;
  return cachedEngine;
}

function asRecord<T extends Record<string, unknown>>(x: Record<string, unknown>): T {
  return x as T;
}

export async function loadOwnerRentalIncomeStateInput(
  client: pg.PoolClient,
  tenantId: string,
  endDate: string
) {
  const [txRows, catRows, billRows, invRows, contactRows, buildingRows, propertyRows, rentalRows, plMap] =
    await Promise.all([
      listTransactions(client, tenantId, { endDate, limit: 500_000, offset: 0 }),
      listCategories(client, tenantId),
      listBills(client, tenantId),
      listInvoices(client, tenantId),
      listContacts(client, tenantId),
      listBuildings(client, tenantId),
      listProperties(client, tenantId),
      listRentalAgreements(client, tenantId),
      fetchPlSubTypesForTenant(client, tenantId),
    ]);

  return {
    transactions: txRows.map((r) => asRecord(rowToTransactionApi(r))),
    categories: catRows.map((r) => asRecord(rowToCategoryApi(r, plMap.get(r.id)))),
    bills: billRows.map((r) => asRecord(rowToBillApi(r))),
    invoices: invRows.map((r) => asRecord(rowToInvoiceApi(r))),
    contacts: contactRows.map((r) => asRecord(rowToContactApi(r))),
    buildings: buildingRows.map((r) => asRecord(rowToBuildingApi(r))),
    properties: propertyRows.map((r) => asRecord(rowToPropertyApi(r))),
    rentalAgreements: rentalRows.map((r) => asRecord(rowToRentalAgreementApi(r))),
  };
}

export async function getOwnerRentalIncomeReportJson(
  client: pg.PoolClient,
  tenantId: string,
  filters: {
    startDate: string;
    endDate: string;
    buildingId?: string;
    ownerId?: string;
    propertyId?: string;
    search?: string;
    sortKey?: string;
    sortDirection?: 'asc' | 'desc';
  }
) {
  const state = await loadOwnerRentalIncomeStateInput(client, tenantId, filters.endDate);
  const { computeOwnerRentalIncomeReport } = await loadOwnerRentalIncomeEngine();
  const sortKey = filters.sortKey || 'date';
  const validSortKeys = new Set([
    'date',
    'ownerName',
    'propertyName',
    'particulars',
    'rentIn',
    'paidOut',
    'balance',
  ]);
  const result = computeOwnerRentalIncomeReport(state as never, {
    startDate: filters.startDate,
    endDate: filters.endDate,
    selectedBuildingId: filters.buildingId && filters.buildingId !== 'all' ? filters.buildingId : 'all',
    selectedOwnerId: filters.ownerId && filters.ownerId !== 'all' ? filters.ownerId : 'all',
    selectedUnitId: filters.propertyId && filters.propertyId !== 'all' ? filters.propertyId : 'all',
    searchQuery: filters.search ?? '',
    sortConfig: {
      key: validSortKeys.has(sortKey) ? sortKey : 'date',
      direction: filters.sortDirection === 'desc' ? 'desc' : 'asc',
    },
  });

  return {
    startDate: filters.startDate,
    endDate: filters.endDate,
    buildingId: filters.buildingId ?? 'all',
    ownerId: filters.ownerId ?? 'all',
    propertyId: filters.propertyId ?? 'all',
    openingBalance: result.openingBalance,
    fullLedgerClosingBalance: result.fullLedgerClosingBalance,
    rows: result.reportData,
  };
}
