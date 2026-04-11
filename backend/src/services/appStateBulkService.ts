import type pg from 'pg';
import { listAccounts, rowToAccountApi } from './accountsService.js';
import { listContacts, rowToContactApi } from './contactsService.js';
import { listTransactions, rowToTransactionApi } from './transactionsService.js';
import {
  fetchPlSubTypesForTenant,
  listCategories,
  rowToCategoryApi,
} from './categoriesService.js';
import { listProjects, rowToProjectApi } from './projectsService.js';
import { listBuildings, rowToBuildingApi } from './buildingsService.js';
import { listProperties, rowToPropertyApi } from './propertiesService.js';
import { listUnits, rowToUnitApi } from './unitsService.js';
import { listInvoices, rowToInvoiceApi } from './invoicesService.js';
import { listBills, rowToBillApi } from './billsService.js';
import { listBudgets, rowToBudgetApi } from './budgetsService.js';
import { listPlanAmenities, rowToPlanAmenityApi } from './planAmenitiesService.js';
import { listInstallmentPlans, rowToInstallmentPlanApi } from './installmentPlansService.js';
import { listRentalAgreements, rowToRentalAgreementApi } from './rentalAgreementsService.js';
import {
  listProjectAgreementsWithUnits,
  rowToProjectAgreementApi,
} from './projectAgreementsService.js';
import {
  listProjectReceivedAssets,
  rowToProjectReceivedAssetApi,
} from './projectReceivedAssetsService.js';
import { listContracts, rowToContractApi } from './contractsService.js';
import { listSalesReturns, rowToSalesReturnApi } from './salesReturnsService.js';
import {
  listRecurringInvoiceTemplates,
  rowToRecurringInvoiceTemplateApi,
} from './recurringInvoiceTemplatesService.js';
import {
  listPmCycleAllocations,
  rowToPmCycleAllocationApi,
} from './pmCycleAllocationsService.js';
import { listVendors, rowToVendorApi } from './vendorsService.js';
import {
  listPersonalCategories,
  rowToPersonalCategoryApi,
} from './personalCategoriesService.js';
import {
  listPersonalTransactions,
  rowToPersonalTransactionApi,
} from './personalTransactionsService.js';
import { listAllSettings } from './appSettingsService.js';

type BulkEntityKey =
  | 'accounts'
  | 'contacts'
  | 'transactions'
  | 'categories'
  | 'projects'
  | 'buildings'
  | 'properties'
  | 'units'
  | 'invoices'
  | 'bills'
  | 'budgets'
  | 'planAmenities'
  | 'installmentPlans'
  | 'rentalAgreements'
  | 'projectAgreements'
  | 'projectReceivedAssets'
  | 'contracts'
  | 'salesReturns'
  | 'quotations'
  | 'documents'
  | 'recurringInvoiceTemplates'
  | 'pmCycleAllocations'
  | 'transactionLog'
  | 'vendors'
  | 'personalCategories'
  | 'personalTransactions'
  | 'appSettings';

function parseEntityFilter(entitiesQuery: unknown): Set<string> | null {
  if (typeof entitiesQuery !== 'string' || !entitiesQuery.trim()) return null;
  return new Set(
    entitiesQuery
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

/** Match `entities` query tokens to a canonical camelCase key (case-insensitive; snake_case ok). */
function wantEntity(canonical: BulkEntityKey, filter: Set<string> | null): boolean {
  if (!filter || filter.size === 0) return true;
  const lower = canonical.toLowerCase();
  if (filter.has(lower)) return true;
  const snake = canonical.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
  if (filter.has(snake)) return true;
  return false;
}

/**
 * Full tenant state snapshot for GET /state/bulk (same logical content as the client’s parallel loadState()).
 * Optional `entities` filter reduces payload when the client only needs a subset.
 */
export async function getBulkAppState(
  client: pg.PoolClient,
  tenantId: string,
  entitiesQuery?: unknown
): Promise<Record<string, unknown>> {
  const filter = parseEntityFilter(entitiesQuery);

  const [
    accountRows,
    contactRows,
    transactionRows,
    categoryRows,
    projectRows,
    buildingRows,
    propertyRows,
    unitRows,
    invoiceRows,
    billRows,
    budgetRows,
    planAmenityRows,
    installmentPlanRows,
    rentalAgreementRows,
    projectAgreementPairs,
    projectReceivedAssetRows,
    contractRows,
    salesReturnRows,
    recurringTemplateRows,
    pmCycleAllocationRows,
    vendorRows,
    personalCategoryRows,
    personalTransactionRows,
    appSettingsFlat,
  ] = await Promise.all([
    wantEntity('accounts', filter) ? listAccounts(client, tenantId) : Promise.resolve([]),
    wantEntity('contacts', filter) ? listContacts(client, tenantId) : Promise.resolve([]),
    wantEntity('transactions', filter) ? listTransactions(client, tenantId) : Promise.resolve([]),
    wantEntity('categories', filter) ? listCategories(client, tenantId) : Promise.resolve([]),
    wantEntity('projects', filter) ? listProjects(client, tenantId) : Promise.resolve([]),
    wantEntity('buildings', filter) ? listBuildings(client, tenantId) : Promise.resolve([]),
    wantEntity('properties', filter) ? listProperties(client, tenantId) : Promise.resolve([]),
    wantEntity('units', filter) ? listUnits(client, tenantId) : Promise.resolve([]),
    wantEntity('invoices', filter) ? listInvoices(client, tenantId) : Promise.resolve([]),
    wantEntity('bills', filter) ? listBills(client, tenantId) : Promise.resolve([]),
    wantEntity('budgets', filter) ? listBudgets(client, tenantId) : Promise.resolve([]),
    wantEntity('planAmenities', filter) ? listPlanAmenities(client, tenantId) : Promise.resolve([]),
    wantEntity('installmentPlans', filter)
      ? listInstallmentPlans(client, tenantId)
      : Promise.resolve([]),
    wantEntity('rentalAgreements', filter)
      ? listRentalAgreements(client, tenantId)
      : Promise.resolve([]),
    wantEntity('projectAgreements', filter)
      ? listProjectAgreementsWithUnits(client, tenantId)
      : Promise.resolve([]),
    wantEntity('projectReceivedAssets', filter)
      ? listProjectReceivedAssets(client, tenantId)
      : Promise.resolve([]),
    wantEntity('contracts', filter) ? listContracts(client, tenantId) : Promise.resolve([]),
    wantEntity('salesReturns', filter) ? listSalesReturns(client, tenantId) : Promise.resolve([]),
    wantEntity('recurringInvoiceTemplates', filter)
      ? listRecurringInvoiceTemplates(client, tenantId)
      : Promise.resolve([]),
    wantEntity('pmCycleAllocations', filter)
      ? listPmCycleAllocations(client, tenantId)
      : Promise.resolve([]),
    wantEntity('vendors', filter) ? listVendors(client, tenantId) : Promise.resolve([]),
    wantEntity('personalCategories', filter)
      ? listPersonalCategories(client, tenantId)
      : Promise.resolve([]),
    wantEntity('personalTransactions', filter)
      ? listPersonalTransactions(client, tenantId)
      : Promise.resolve([]),
    wantEntity('appSettings', filter) ? listAllSettings(client, tenantId) : Promise.resolve({}),
  ]);

  const plMap = categoryRows.length
    ? await fetchPlSubTypesForTenant(client, tenantId)
    : new Map<string, string | null>();

  const out: Record<string, unknown> = {};

  if (wantEntity('accounts', filter)) {
    out.accounts = accountRows.map((r) => rowToAccountApi(r));
  }
  if (wantEntity('contacts', filter)) {
    out.contacts = contactRows.map((r) => rowToContactApi(r));
  }
  if (wantEntity('transactions', filter)) {
    out.transactions = transactionRows.map((r) => rowToTransactionApi(r));
  }
  if (wantEntity('categories', filter)) {
    out.categories = categoryRows.map((r) => rowToCategoryApi(r, plMap.get(r.id)));
  }
  if (wantEntity('projects', filter)) {
    out.projects = projectRows.map((r) => rowToProjectApi(r));
  }
  if (wantEntity('buildings', filter)) {
    out.buildings = buildingRows.map((r) => rowToBuildingApi(r));
  }
  if (wantEntity('properties', filter)) {
    out.properties = propertyRows.map((r) => rowToPropertyApi(r));
  }
  if (wantEntity('units', filter)) {
    out.units = unitRows.map((r) => rowToUnitApi(r));
  }
  if (wantEntity('invoices', filter)) {
    out.invoices = invoiceRows.map((r) => rowToInvoiceApi(r));
  }
  if (wantEntity('bills', filter)) {
    out.bills = billRows.map((r) => rowToBillApi(r));
  }
  if (wantEntity('budgets', filter)) {
    out.budgets = budgetRows.map((r) => rowToBudgetApi(r));
  }
  if (wantEntity('planAmenities', filter)) {
    out.planAmenities = planAmenityRows.map((r) => rowToPlanAmenityApi(r));
  }
  if (wantEntity('installmentPlans', filter)) {
    out.installmentPlans = installmentPlanRows.map((r) => rowToInstallmentPlanApi(r));
  }
  if (wantEntity('rentalAgreements', filter)) {
    out.rentalAgreements = rentalAgreementRows.map((r) => rowToRentalAgreementApi(r));
  }
  if (wantEntity('projectAgreements', filter)) {
    out.projectAgreements = projectAgreementPairs.map(({ row, unitIds }) =>
      rowToProjectAgreementApi(row, unitIds)
    );
  }
  if (wantEntity('projectReceivedAssets', filter)) {
    out.projectReceivedAssets = projectReceivedAssetRows.map((r) =>
      rowToProjectReceivedAssetApi(r)
    );
  }
  if (wantEntity('contracts', filter)) {
    out.contracts = contractRows.map((r) => rowToContractApi(r));
  }
  if (wantEntity('salesReturns', filter)) {
    out.salesReturns = salesReturnRows.map((r) => rowToSalesReturnApi(r));
  }
  if (wantEntity('quotations', filter)) {
    out.quotations = [];
  }
  if (wantEntity('documents', filter)) {
    out.documents = [];
  }
  if (wantEntity('recurringInvoiceTemplates', filter)) {
    out.recurringInvoiceTemplates = recurringTemplateRows.map((r) =>
      rowToRecurringInvoiceTemplateApi(r)
    );
  }
  if (wantEntity('pmCycleAllocations', filter)) {
    out.pmCycleAllocations = pmCycleAllocationRows.map((r) => rowToPmCycleAllocationApi(r));
  }
  if (wantEntity('transactionLog', filter)) {
    out.transactionLog = [];
  }
  if (wantEntity('vendors', filter)) {
    out.vendors = vendorRows.map((r) => rowToVendorApi(r));
  }
  if (wantEntity('personalCategories', filter)) {
    out.personalCategories = personalCategoryRows.map((r) => rowToPersonalCategoryApi(r));
  }
  if (wantEntity('personalTransactions', filter)) {
    out.personalTransactions = personalTransactionRows.map((r) =>
      rowToPersonalTransactionApi(r)
    );
  }
  if (wantEntity('appSettings', filter)) {
    out.appSettings = appSettingsFlat;
  }

  return out;
}
