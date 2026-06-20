import type pg from 'pg';
import { listAccounts, rowToAccountApi } from '../../../services/accountsService.js';
import { listContacts, rowToContactApi } from '../../../services/contactsService.js';
import { listTransactions, rowToTransactionApi } from '../../../services/transactionsService.js';
import {
  fetchPlSubTypesForTenant,
  listCategories,
  rowToCategoryApi,
} from '../../../services/categoriesService.js';
import { listProjects, rowToProjectApi } from '../../../services/projectsService.js';
import { listBuildings, rowToBuildingApi } from '../../../services/buildingsService.js';
import { listProperties, rowToPropertyApi } from '../../../services/propertiesService.js';
import { listUnits, rowToUnitApi } from '../../../services/unitsService.js';
import { listInvoices, rowToInvoiceApi } from '../../../services/invoicesService.js';
import { listBills, rowToBillApi } from '../../../services/billsService.js';
import { listBudgets, rowToBudgetApi } from '../../../services/budgetsService.js';
import { listPlanAmenities, rowToPlanAmenityApi } from '../../../services/planAmenitiesService.js';
import { listInstallmentPlans, rowToInstallmentPlanApi } from '../../../services/installmentPlansService.js';
import { listRentalAgreements, rowToRentalAgreementApi } from '../../../services/rentalAgreementsService.js';
import {
  listProjectAgreementsWithUnits,
  rowToProjectAgreementApi,
} from '../../../services/projectAgreementsService.js';
import {
  listProjectReceivedAssets,
  rowToProjectReceivedAssetApi,
} from '../../../services/projectReceivedAssetsService.js';
import { listContracts, rowToContractApi } from '../../../services/contractsService.js';
import { listSalesReturns, rowToSalesReturnApi } from '../../../services/salesReturnsService.js';
import {
  listRecurringInvoiceTemplates,
  rowToRecurringInvoiceTemplateApi,
} from '../../customers/services/recurringInvoiceTemplatesService.js';
import {
  listPmCycleAllocations,
  rowToPmCycleAllocationApi,
} from '../../../services/pmCycleAllocationsService.js';
import { listVendors, rowToVendorApi } from '../../../services/vendorsService.js';
import { listQuotations, rowToQuotationApi } from '../../../services/quotationsService.js';
import { listDocuments, rowToDocumentApi } from '../../documents/services/documentsModuleService.js';
import { listTransactionLogs, rowToTransactionLogApi } from '../../accounting/services/transactionLogService.js';
import {
  listPersonalCategories,
  rowToPersonalCategoryApi,
} from '../../personal-finance/services/personalCategoriesService.js';
import {
  listPersonalTransactions,
  rowToPersonalTransactionApi,
} from '../../personal-finance/services/personalTransactionsService.js';
import { listAllSettings } from '../services/appSettingsService.js';
import { isAdminRole } from '../../../middleware/authMiddleware.js';

/** Max transactions returned by GET /state/bulk (use /state/bulk-chunked for larger tenants). */
export const BULK_TRANSACTION_CAP = 50_000;

/** Loaded on GET /state/bulk-chunked offset=0 (PERF-A6.1 — keep startup payload small). */
export const BULK_BOOTSTRAP_STATIC_ENTITIES =
  'accounts,categories,projects,buildings,properties,units,budgets,planAmenities,installmentPlans,rentalAgreements,projectAgreements,projectReceivedAssets,contracts,salesReturns,recurringInvoiceTemplates,pmCycleAllocations,personalCategories,appSettings';

/** Deferred to on-demand GET /state/bulk?entities=… when a page needs them (not startup). */
export const BULK_DEFERRED_ENTITIES =
  'invoices,bills,contacts,vendors,personalTransactions';

const BULK_STATIC_ENTITIES = BULK_BOOTSTRAP_STATIC_ENTITIES;

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

// ---------------------------------------------------------------------------
// PERF-A6.3 instrumentation helpers
// ---------------------------------------------------------------------------

type EntityPerfRow = {
  entity: string;
  rows: number;
  durationMs: number;
  payloadBytes: number;
};

function perfLog(label: string, durationMs: number, extra?: Record<string, unknown>): void {
  const threshold = durationMs >= 10_000 ? '🔴' : durationMs >= 5_000 ? '🟠' : durationMs >= 1_000 ? '🟡' : '🟢';
  console.log(
    `[PERF_BULK] ${threshold} ${label} duration=${durationMs}ms`,
    extra ? JSON.stringify(extra) : ''
  );
}

async function timed<T>(entity: string, fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
  const t0 = Date.now();
  const result = await fn();
  return { result, durationMs: Date.now() - t0 };
}

function byteSize(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? '');
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------

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
 * Full tenant state snapshot for GET /state/bulk (same logical content as the client's parallel loadState()).
 * Optional `entities` filter reduces payload when the client only needs a subset.
 */
export async function getBulkAppState(
  client: pg.PoolClient,
  tenantId: string,
  entitiesQuery?: unknown,
  userRole?: string,
  userId?: string | null
): Promise<Record<string, unknown>> {
  const filter = parseEntityFilter(entitiesQuery);
  const canAccessPersonalFinance = isAdminRole(userRole);

  const t0 = Date.now();
  console.log(`[PERF_BULK] getBulkAppState START tenant=${tenantId} filter=${entitiesQuery ?? 'all'}`);

  // Run all entity loaders in parallel with individual timing
  const [
    { result: accountRows,               durationMs: d_accounts },
    { result: contactRows,               durationMs: d_contacts },
    { result: transactionRows,           durationMs: d_transactions_inner },
    { result: categoryRows,              durationMs: d_categories },
    { result: projectRows,               durationMs: d_projects },
    { result: buildingRows,              durationMs: d_buildings },
    { result: propertyRows,              durationMs: d_properties },
    { result: unitRows,                  durationMs: d_units },
    { result: invoiceRows,               durationMs: d_invoices },
    { result: billRows,                  durationMs: d_bills },
    { result: budgetRows,                durationMs: d_budgets },
    { result: planAmenityRows,           durationMs: d_planAmenities },
    { result: installmentPlanRows,       durationMs: d_installmentPlans },
    { result: rentalAgreementRows,       durationMs: d_rentalAgreements },
    { result: projectAgreementPairs,     durationMs: d_projectAgreements },
    { result: projectReceivedAssetRows,  durationMs: d_projectReceivedAssets },
    { result: contractRows,              durationMs: d_contracts },
    { result: salesReturnRows,           durationMs: d_salesReturns },
    { result: recurringTemplateRows,     durationMs: d_recurringInvoiceTemplates },
    { result: pmCycleAllocationRows,     durationMs: d_pmCycleAllocations },
    { result: vendorRows,                durationMs: d_vendors },
    { result: quotationRows,             durationMs: d_quotations },
    { result: documentRows,              durationMs: d_documents },
    { result: transactionLogRows,        durationMs: d_transactionLog },
    { result: personalCategoryRows,      durationMs: d_personalCategories },
    { result: personalTransactionRows,   durationMs: d_personalTransactions },
    { result: appSettingsFlat,           durationMs: d_appSettings },
  ] = await Promise.all([
    timed('accounts',               () => wantEntity('accounts', filter) ? listAccounts(client, tenantId) : Promise.resolve([])),
    timed('contacts',               () => wantEntity('contacts', filter) ? listContacts(client, tenantId) : Promise.resolve([])),
    timed('transactions_inner',     () => wantEntity('transactions', filter) ? listTransactions(client, tenantId, { limit: BULK_TRANSACTION_CAP }) : Promise.resolve([])),
    timed('categories',             () => wantEntity('categories', filter) ? listCategories(client, tenantId) : Promise.resolve([])),
    timed('projects',               () => wantEntity('projects', filter) ? listProjects(client, tenantId) : Promise.resolve([])),
    timed('buildings',              () => wantEntity('buildings', filter) ? listBuildings(client, tenantId) : Promise.resolve([])),
    timed('properties',             () => wantEntity('properties', filter) ? listProperties(client, tenantId) : Promise.resolve([])),
    timed('units',                  () => wantEntity('units', filter) ? listUnits(client, tenantId) : Promise.resolve([])),
    timed('invoices',               () => wantEntity('invoices', filter) ? listInvoices(client, tenantId) : Promise.resolve([])),
    timed('bills',                  () => wantEntity('bills', filter) ? listBills(client, tenantId) : Promise.resolve([])),
    timed('budgets',                () => wantEntity('budgets', filter) ? listBudgets(client, tenantId) : Promise.resolve([])),
    timed('planAmenities',          () => wantEntity('planAmenities', filter) ? listPlanAmenities(client, tenantId) : Promise.resolve([])),
    timed('installmentPlans',       () => wantEntity('installmentPlans', filter) ? listInstallmentPlans(client, tenantId, undefined, { userId, role: userRole }) : Promise.resolve([])),
    timed('rentalAgreements',       () => wantEntity('rentalAgreements', filter) ? listRentalAgreements(client, tenantId) : Promise.resolve([])),
    timed('projectAgreements',      () => wantEntity('projectAgreements', filter) ? listProjectAgreementsWithUnits(client, tenantId) : Promise.resolve([])),
    timed('projectReceivedAssets',  () => wantEntity('projectReceivedAssets', filter) ? listProjectReceivedAssets(client, tenantId) : Promise.resolve([])),
    timed('contracts',              () => wantEntity('contracts', filter) ? listContracts(client, tenantId) : Promise.resolve([])),
    timed('salesReturns',           () => wantEntity('salesReturns', filter) ? listSalesReturns(client, tenantId) : Promise.resolve([])),
    timed('recurringInvoiceTemplates', () => wantEntity('recurringInvoiceTemplates', filter) ? listRecurringInvoiceTemplates(client, tenantId) : Promise.resolve([])),
    timed('pmCycleAllocations',     () => wantEntity('pmCycleAllocations', filter) ? listPmCycleAllocations(client, tenantId) : Promise.resolve([])),
    timed('vendors',                () => wantEntity('vendors', filter) ? listVendors(client, tenantId) : Promise.resolve([])),
    timed('quotations',             () => wantEntity('quotations', filter) ? listQuotations(client, tenantId) : Promise.resolve([])),
    timed('documents',              () => wantEntity('documents', filter) ? listDocuments(client, tenantId) : Promise.resolve([])),
    timed('transactionLog',         () => wantEntity('transactionLog', filter) ? listTransactionLogs(client, tenantId, { limit: 500 }) : Promise.resolve([])),
    timed('personalCategories',     () => wantEntity('personalCategories', filter) && canAccessPersonalFinance ? listPersonalCategories(client, tenantId) : Promise.resolve([])),
    timed('personalTransactions',   () => wantEntity('personalTransactions', filter) && canAccessPersonalFinance ? listPersonalTransactions(client, tenantId) : Promise.resolve([])),
    timed('appSettings',            () => wantEntity('appSettings', filter) ? listAllSettings(client, tenantId) : Promise.resolve({})),
  ]);

  const parallelDone = Date.now() - t0;
  console.log(`[PERF_BULK] Promise.all completed duration=${parallelDone}ms`);

  const t1 = Date.now();
  const plMap = categoryRows.length
    ? await fetchPlSubTypesForTenant(client, tenantId)
    : new Map<string, string | null>();
  const d_plMap = Date.now() - t1;
  if (d_plMap > 0) console.log(`[PERF_BULK] fetchPlSubTypesForTenant duration=${d_plMap}ms`);

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
    out.quotations = quotationRows.map((r) => rowToQuotationApi(r));
  }
  if (wantEntity('documents', filter)) {
    out.documents = documentRows.map((r) => rowToDocumentApi(r));
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
    out.transactionLog = transactionLogRows.map((r) => rowToTransactionLogApi(r));
  }
  if (wantEntity('vendors', filter)) {
    out.vendors = vendorRows.map((r) => rowToVendorApi(r));
  }
  if (wantEntity('personalCategories', filter) && canAccessPersonalFinance) {
    out.personalCategories = personalCategoryRows.map((r) => rowToPersonalCategoryApi(r));
  }
  if (wantEntity('personalTransactions', filter) && canAccessPersonalFinance) {
    out.personalTransactions = personalTransactionRows.map((r) =>
      rowToPersonalTransactionApi(r)
    );
  }
  if (wantEntity('appSettings', filter)) {
    out.appSettings = appSettingsFlat;
  }

  // ---------------------------------------------------------------------------
  // PERF-A6.3: per-entity timing + payload report
  // ---------------------------------------------------------------------------
  const entityPerf: EntityPerfRow[] = [
    { entity: 'accounts',               rows: Array.isArray(accountRows) ? accountRows.length : 0,              durationMs: d_accounts,               payloadBytes: byteSize(out.accounts) },
    { entity: 'contacts',               rows: Array.isArray(contactRows) ? contactRows.length : 0,              durationMs: d_contacts,               payloadBytes: byteSize(out.contacts) },
    { entity: 'transactions_inner',     rows: Array.isArray(transactionRows) ? transactionRows.length : 0,      durationMs: d_transactions_inner,     payloadBytes: byteSize(out.transactions) },
    { entity: 'categories',             rows: Array.isArray(categoryRows) ? categoryRows.length : 0,            durationMs: d_categories,             payloadBytes: byteSize(out.categories) },
    { entity: 'projects',               rows: Array.isArray(projectRows) ? projectRows.length : 0,              durationMs: d_projects,               payloadBytes: byteSize(out.projects) },
    { entity: 'buildings',              rows: Array.isArray(buildingRows) ? buildingRows.length : 0,            durationMs: d_buildings,              payloadBytes: byteSize(out.buildings) },
    { entity: 'properties',             rows: Array.isArray(propertyRows) ? propertyRows.length : 0,            durationMs: d_properties,             payloadBytes: byteSize(out.properties) },
    { entity: 'units',                  rows: Array.isArray(unitRows) ? unitRows.length : 0,                    durationMs: d_units,                  payloadBytes: byteSize(out.units) },
    { entity: 'invoices',               rows: Array.isArray(invoiceRows) ? invoiceRows.length : 0,              durationMs: d_invoices,               payloadBytes: byteSize(out.invoices) },
    { entity: 'bills',                  rows: Array.isArray(billRows) ? billRows.length : 0,                    durationMs: d_bills,                  payloadBytes: byteSize(out.bills) },
    { entity: 'budgets',                rows: Array.isArray(budgetRows) ? budgetRows.length : 0,                durationMs: d_budgets,                payloadBytes: byteSize(out.budgets) },
    { entity: 'planAmenities',          rows: Array.isArray(planAmenityRows) ? planAmenityRows.length : 0,      durationMs: d_planAmenities,          payloadBytes: byteSize(out.planAmenities) },
    { entity: 'installmentPlans',       rows: Array.isArray(installmentPlanRows) ? installmentPlanRows.length : 0, durationMs: d_installmentPlans,   payloadBytes: byteSize(out.installmentPlans) },
    { entity: 'rentalAgreements',       rows: Array.isArray(rentalAgreementRows) ? rentalAgreementRows.length : 0, durationMs: d_rentalAgreements,   payloadBytes: byteSize(out.rentalAgreements) },
    { entity: 'projectAgreements',      rows: Array.isArray(projectAgreementPairs) ? projectAgreementPairs.length : 0, durationMs: d_projectAgreements, payloadBytes: byteSize(out.projectAgreements) },
    { entity: 'projectReceivedAssets',  rows: Array.isArray(projectReceivedAssetRows) ? projectReceivedAssetRows.length : 0, durationMs: d_projectReceivedAssets, payloadBytes: byteSize(out.projectReceivedAssets) },
    { entity: 'contracts',              rows: Array.isArray(contractRows) ? contractRows.length : 0,            durationMs: d_contracts,              payloadBytes: byteSize(out.contracts) },
    { entity: 'salesReturns',           rows: Array.isArray(salesReturnRows) ? salesReturnRows.length : 0,      durationMs: d_salesReturns,           payloadBytes: byteSize(out.salesReturns) },
    { entity: 'recurringInvoiceTemplates', rows: Array.isArray(recurringTemplateRows) ? recurringTemplateRows.length : 0, durationMs: d_recurringInvoiceTemplates, payloadBytes: byteSize(out.recurringInvoiceTemplates) },
    { entity: 'pmCycleAllocations',     rows: Array.isArray(pmCycleAllocationRows) ? pmCycleAllocationRows.length : 0, durationMs: d_pmCycleAllocations, payloadBytes: byteSize(out.pmCycleAllocations) },
    { entity: 'vendors',                rows: Array.isArray(vendorRows) ? vendorRows.length : 0,                durationMs: d_vendors,                payloadBytes: byteSize(out.vendors) },
    { entity: 'quotations',             rows: Array.isArray(quotationRows) ? quotationRows.length : 0,          durationMs: d_quotations,             payloadBytes: byteSize(out.quotations) },
    { entity: 'documents',              rows: Array.isArray(documentRows) ? documentRows.length : 0,            durationMs: d_documents,              payloadBytes: byteSize(out.documents) },
    { entity: 'transactionLog',         rows: Array.isArray(transactionLogRows) ? transactionLogRows.length : 0, durationMs: d_transactionLog,        payloadBytes: byteSize(out.transactionLog) },
    { entity: 'personalCategories',     rows: Array.isArray(personalCategoryRows) ? personalCategoryRows.length : 0, durationMs: d_personalCategories, payloadBytes: byteSize(out.personalCategories) },
    { entity: 'personalTransactions',   rows: Array.isArray(personalTransactionRows) ? personalTransactionRows.length : 0, durationMs: d_personalTransactions, payloadBytes: byteSize(out.personalTransactions) },
    { entity: 'appSettings',            rows: 1,                                                                durationMs: d_appSettings,            payloadBytes: byteSize(out.appSettings) },
  ];

  // Log each entity
  for (const row of entityPerf) {
    const threshold = row.durationMs >= 10_000 ? '🔴' : row.durationMs >= 5_000 ? '🟠' : row.durationMs >= 1_000 ? '🟡' : '🟢';
    console.log(
      `[PERF_ENTITY] ${threshold} entity=${row.entity} rows=${row.rows} duration=${row.durationMs}ms payload=${row.payloadBytes}b`
    );
  }

  // Ranked table — top 5 slowest
  const ranked = [...entityPerf].sort((a, b) => b.durationMs - a.durationMs);
  console.log('[PERF_BULK] --- TOP 5 SLOWEST ENTITIES ---');
  for (const row of ranked.slice(0, 5)) {
    const flag = row.durationMs >= 10_000 ? '🔴 CRITICAL' : row.durationMs >= 5_000 ? '🟠 HIGH' : row.durationMs >= 1_000 ? '🟡 WARN' : '🟢 OK';
    console.log(
      `[PERF_BULK] ${flag} | entity=${row.entity} | rows=${row.rows} | duration=${row.durationMs}ms | payload=${row.payloadBytes}b`
    );
  }

  // Threshold alerts
  for (const row of entityPerf) {
    if (row.durationMs >= 10_000) {
      console.error(`[PERF_ALERT] 🔴 >10s entity=${row.entity} duration=${row.durationMs}ms rows=${row.rows}`);
    } else if (row.durationMs >= 5_000) {
      console.warn(`[PERF_ALERT] 🟠 >5s entity=${row.entity} duration=${row.durationMs}ms rows=${row.rows}`);
    } else if (row.durationMs >= 1_000) {
      console.warn(`[PERF_ALERT] 🟡 >1s entity=${row.entity} duration=${row.durationMs}ms rows=${row.rows}`);
    }
  }

  const totalPayloadBytes = byteSize(out);
  const totalDurationMs = Date.now() - t0;
  console.log(
    `[PERF_BULK] getBulkAppState COMPLETE duration=${totalDurationMs}ms parallelMs=${parallelDone}ms totalPayload=${totalPayloadBytes}b (${(totalPayloadBytes / 1024).toFixed(1)}KB)`
  );

  return out;
}

export type BulkChunkResult = {
  entities: Record<string, unknown>;
  totals: Record<string, number>;
  has_more: boolean;
  next_offset: number | null;
};

export async function countTenantTransactions(
  client: pg.PoolClient,
  tenantId: string
): Promise<number> {
  const r = await client.query<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM transactions WHERE tenant_id = $1 AND deleted_at IS NULL`,
    [tenantId]
  );
  return r.rows[0]?.c ?? 0;
}

/**
 * Paginated bulk load: offset 0 returns all static entities plus the first transaction page;
 * subsequent requests return transaction pages only.
 */
export async function getBulkAppStateChunked(
  client: pg.PoolClient,
  tenantId: string,
  limitRaw: unknown,
  offsetRaw: unknown,
  userRole?: string,
  userId?: string | null
): Promise<BulkChunkResult> {
  const limit = Math.min(Math.max(Number(limitRaw) || 200, 1), 500);
  const offset = Math.max(Number(offsetRaw) || 0, 0);
  const handlerStart = Date.now();

  // PERF-A6.5A: stderr probe — confirms function body was entered.
  // If POOL_ACQUIRED appears in logs but this line does NOT, the function
  // was called but threw synchronously before reaching this line (impossible
  // given the code above) — or the deploy did not include the instrumented build.
  // If neither POOL_ACQUIRED nor this line appears, requests are stalling at
  // pool.connect() and never reaching the route handler body.
  console.error(`[PERF_TEST] ENTER getBulkAppStateChunked offset=${offset} limit=${limit} tenant=${tenantId}`);

  console.log(`[PERF_BULK] getBulkAppStateChunked START offset=${offset} limit=${limit} tenant=${tenantId}`);

  // --- countTenantTransactions ---
  const t_count = Date.now();
  const txTotal = await countTenantTransactions(client, tenantId);
  const d_count = Date.now() - t_count;
  perfLog('countTenantTransactions', d_count, { txTotal });

  const entities: Record<string, unknown> = {};
  const totals: Record<string, number> = { transactions: txTotal };

  if (offset === 0) {
    // --- getBulkAppState (static entities) ---
    const t_static = Date.now();
    const staticState = await getBulkAppState(client, tenantId, BULK_STATIC_ENTITIES, userRole, userId);
    const d_static = Date.now() - t_static;
    perfLog('getBulkAppState (static)', d_static, { keys: Object.keys(staticState) });

    Object.assign(entities, staticState);
    for (const [key, val] of Object.entries(staticState)) {
      if (Array.isArray(val)) totals[key] = val.length;
    }
  }

  // --- listTransactions (chunked page) ---
  const t_tx = Date.now();
  const txRows = await listTransactions(client, tenantId, { limit, offset });
  const d_tx = Date.now() - t_tx;
  const txPayload = JSON.stringify(txRows.map((r) => rowToTransactionApi(r)));
  const txPayloadBytes = Buffer.byteLength(txPayload);
  perfLog(`listTransactions offset=${offset}`, d_tx, { rows: txRows.length, payloadBytes: txPayloadBytes });
  console.log(
    `[PERF_ENTITY] ${d_tx >= 10_000 ? '🔴' : d_tx >= 5_000 ? '🟠' : d_tx >= 1_000 ? '🟡' : '🟢'} entity=transactions offset=${offset} rows=${txRows.length} duration=${d_tx}ms payload=${txPayloadBytes}b`
  );

  entities.transactions = JSON.parse(txPayload);

  const loadedTx = offset + txRows.length;
  const has_more = loadedTx < txTotal;

  const totalPayloadBytes = byteSize(entities);
  const handlerDuration = Date.now() - handlerStart;
  console.log(
    `[PERF_BULK] getBulkAppStateChunked COMPLETE offset=${offset} duration=${handlerDuration}ms totalPayload=${totalPayloadBytes}b (${(totalPayloadBytes / 1024).toFixed(1)}KB) has_more=${has_more}`
  );

  return {
    entities,
    totals,
    has_more,
    next_offset: has_more ? loadedTx : null,
  };
}
