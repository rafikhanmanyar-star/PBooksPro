import type pg from 'pg';
import { computeOwnerRentalIncomeReport } from '../../../reportEngines/index.js';
import { listTransactions, rowToTransactionApi } from '../../accounting/services/transactionsService.js';
import { listCategories, rowToCategoryApi, fetchPlSubTypesForTenant } from '../../accounting/services/categoriesService.js';
import { listBills, rowToBillApi } from '../../vendors/services/billsService.js';
import { listInvoices, rowToInvoiceApi } from '../../customers/services/invoicesService.js';
import { listContacts, rowToContactApi } from '../../crm/services/contactsService.js';
import { listBuildings, rowToBuildingApi } from '../../properties/services/buildingsService.js';
import { listProperties, rowToPropertyApi } from '../../properties/services/propertiesService.js';
import { listRentalAgreements, rowToRentalAgreementApi } from './rentalAgreementsService.js';

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
