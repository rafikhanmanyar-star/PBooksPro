import type pg from 'pg';
import { getPool } from '../../../db/pool.js';
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

/**
 * Max concurrent pool connections held by a single bulk-bootstrap entity load.
 * Limits peak pool usage from N_ENTITIES (18–27) to this value so concurrent users
 * do not exhaust the 20-connection pool. Tunable via BULK_BOOTSTRAP_CONCURRENCY env var.
 */
const BOOTSTRAP_CONCURRENCY = Math.min(
  Math.max(parseInt(process.env.BULK_BOOTSTRAP_CONCURRENCY || '6', 10) || 6, 1),
  27
);

/**
 * Process-level semaphore: caps total concurrent bootstrap pool-client acquisitions
 * across ALL simultaneous /state/bulk-chunked offset=0 requests.
 * With N users × BOOTSTRAP_CONCURRENCY per-request slots, total demand can be
 * N×6 = 120 for 20 users — far above pool.max=20. This semaphore limits the
 * aggregate to BOOTSTRAP_GLOBAL_POOL_SLOTS regardless of concurrent user count,
 * leaving the remaining connections free for auth, transaction chunks, and other
 * API endpoints.
 * Default: 8 (leaves ≥ 12 connections for non-bootstrap requests).
 * Tunable via BULK_BOOTSTRAP_GLOBAL_SLOTS env var.
 */
const BOOTSTRAP_GLOBAL_POOL_SLOTS = Math.min(
  Math.max(parseInt(process.env.BULK_BOOTSTRAP_GLOBAL_SLOTS || '8', 10) || 8, 1),
  50
);

let _bsgCount = BOOTSTRAP_GLOBAL_POOL_SLOTS;
const _bsgQueue: Array<() => void> = [];

function _bsgAcquire(): Promise<void> {
  if (_bsgCount > 0) { _bsgCount--; return Promise.resolve(); }
  return new Promise<void>((resolve) => _bsgQueue.push(resolve));
}

function _bsgRelease(): void {
  const next = _bsgQueue.shift();
  if (next) { next(); } else { _bsgCount++; }
}

/**
 * Loaded on GET /state/bulk-chunked offset=0.
 * contacts, invoices, bills are included here so the dashboard deferred bootstrap
 * (usePageGroupDeferredBootstrap DASHBOARD) finds them already populated and never
 * fires a separate GET /state/bulk?entities=invoices,bills,contacts during startup.
 * That separate request collided with the offset=0 chunk, hit shedIfPoolSaturated,
 * returned 503, opened the bulk breaker, and triggered the 27-request loadState() fallback.
 */
export const BULK_BOOTSTRAP_STATIC_ENTITIES =
  'accounts,categories,contacts,projects,buildings,properties,units,invoices,bills,budgets,planAmenities,installmentPlans,rentalAgreements,projectAgreements,projectReceivedAssets,contracts,salesReturns,recurringInvoiceTemplates,pmCycleAllocations,personalCategories,appSettings';

/** Deferred to on-demand GET /state/bulk?entities=… when a page needs them (not startup). */
export const BULK_DEFERRED_ENTITIES =
  'vendors,personalTransactions';

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

/**
 * Runs `tasks` in sequential batches of at most `batchSize`, each batch in parallel.
 * The next batch starts only after every task in the current batch has completed.
 * This caps the number of concurrent `withPoolClient` calls — and therefore pool
 * connections — held by a single bulk-bootstrap request at any one moment.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runBatched<T = any>(tasks: Array<() => Promise<T>>, batchSize: number): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    const batchStart = Date.now();
    const batchResults = await Promise.all(batch.map((fn) => fn()));
    console.log(`[PERF_BULK] bootstrapBatch duration=${Date.now() - batchStart}ms count=${batch.length}`);
    results.push(...batchResults);
  }
  return results;
}

// PERF-A6.6: give each loader its own connection so Promise.all is truly parallel.
// A shared pg.PoolClient serialises concurrent .query() calls on one TCP connection;
// withPoolClient acquires and releases a connection around a single loader, letting
// node-postgres schedule up to pool.max loaders simultaneously.
async function withPoolClient<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await getPool().connect();
  try {
    return await fn(c);
  } finally {
    c.release();
  }
}

/**
 * Like withPoolClient but first acquires a slot from the process-level bootstrap
 * semaphore. Used exclusively for entity loaders inside getBulkAppState so that
 * concurrent logins cannot collectively exhaust the connection pool.
 * Non-bootstrap callers (transaction chunks, fetchPlSubTypes) use withPoolClient
 * directly so they are never blocked by the semaphore queue.
 */
async function withPoolClientGuarded<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const t0 = Date.now();
  await _bsgAcquire();
  const waitMs = Date.now() - t0;
  if (waitMs >= 100) console.log(`[PERF_BULK] bootstrapSemaphoreWait=${waitMs}ms`);
  try {
    return await withPoolClient(fn);
  } finally {
    _bsgRelease();
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
  tenantId: string,
  entitiesQuery?: unknown,
  userRole?: string,
  userId?: string | null
): Promise<Record<string, unknown>> {
  const filter = parseEntityFilter(entitiesQuery);
  const canAccessPersonalFinance = isAdminRole(userRole);

  const t0 = Date.now();
  console.log(`[PERF_BULK] getBulkAppState START tenant=${tenantId} filter=${entitiesQuery ?? 'all'} bootstrapConcurrency=${BOOTSTRAP_CONCURRENCY} globalSlots=${BOOTSTRAP_GLOBAL_POOL_SLOTS}`);

  // Build loaders as thunks so each acquires its pool connection only when its
  // batch executes — not all at once. runBatched fires BOOTSTRAP_CONCURRENCY
  // thunks in parallel, then waits for all to complete before starting the next
  // batch, keeping peak pool usage at BOOTSTRAP_CONCURRENCY connections.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loaderThunks: Array<() => Promise<{ result: any; durationMs: number }>> = [
    () => timed('accounts',               () => wantEntity('accounts', filter) ? withPoolClientGuarded(c => listAccounts(c, tenantId)) : Promise.resolve([])),
    () => timed('contacts',               () => wantEntity('contacts', filter) ? withPoolClientGuarded(c => listContacts(c, tenantId)) : Promise.resolve([])),
    () => timed('transactions_inner',     () => wantEntity('transactions', filter) ? withPoolClientGuarded(c => listTransactions(c, tenantId, { limit: BULK_TRANSACTION_CAP })) : Promise.resolve([])),
    () => timed('categories',             () => wantEntity('categories', filter) ? withPoolClientGuarded(c => listCategories(c, tenantId)) : Promise.resolve([])),
    () => timed('projects',               () => wantEntity('projects', filter) ? withPoolClientGuarded(c => listProjects(c, tenantId)) : Promise.resolve([])),
    () => timed('buildings',              () => wantEntity('buildings', filter) ? withPoolClientGuarded(c => listBuildings(c, tenantId)) : Promise.resolve([])),
    () => timed('properties',             () => wantEntity('properties', filter) ? withPoolClientGuarded(c => listProperties(c, tenantId)) : Promise.resolve([])),
    () => timed('units',                  () => wantEntity('units', filter) ? withPoolClientGuarded(c => listUnits(c, tenantId)) : Promise.resolve([])),
    () => timed('invoices',               () => wantEntity('invoices', filter) ? withPoolClientGuarded(c => listInvoices(c, tenantId)) : Promise.resolve([])),
    () => timed('bills',                  () => wantEntity('bills', filter) ? withPoolClientGuarded(c => listBills(c, tenantId)) : Promise.resolve([])),
    () => timed('budgets',                () => wantEntity('budgets', filter) ? withPoolClientGuarded(c => listBudgets(c, tenantId)) : Promise.resolve([])),
    () => timed('planAmenities',          () => wantEntity('planAmenities', filter) ? withPoolClientGuarded(c => listPlanAmenities(c, tenantId)) : Promise.resolve([])),
    () => timed('installmentPlans',       () => wantEntity('installmentPlans', filter) ? withPoolClientGuarded(c => listInstallmentPlans(c, tenantId, undefined, { userId, role: userRole })) : Promise.resolve([])),
    () => timed('rentalAgreements',       () => wantEntity('rentalAgreements', filter) ? withPoolClientGuarded(c => listRentalAgreements(c, tenantId)) : Promise.resolve([])),
    () => timed('projectAgreements',      () => wantEntity('projectAgreements', filter) ? withPoolClientGuarded(c => listProjectAgreementsWithUnits(c, tenantId)) : Promise.resolve([])),
    () => timed('projectReceivedAssets',  () => wantEntity('projectReceivedAssets', filter) ? withPoolClientGuarded(c => listProjectReceivedAssets(c, tenantId)) : Promise.resolve([])),
    () => timed('contracts',              () => wantEntity('contracts', filter) ? withPoolClientGuarded(c => listContracts(c, tenantId)) : Promise.resolve([])),
    () => timed('salesReturns',           () => wantEntity('salesReturns', filter) ? withPoolClientGuarded(c => listSalesReturns(c, tenantId)) : Promise.resolve([])),
    () => timed('recurringInvoiceTemplates', () => wantEntity('recurringInvoiceTemplates', filter) ? withPoolClientGuarded(c => listRecurringInvoiceTemplates(c, tenantId)) : Promise.resolve([])),
    () => timed('pmCycleAllocations',     () => wantEntity('pmCycleAllocations', filter) ? withPoolClientGuarded(c => listPmCycleAllocations(c, tenantId)) : Promise.resolve([])),
    () => timed('vendors',                () => wantEntity('vendors', filter) ? withPoolClientGuarded(c => listVendors(c, tenantId)) : Promise.resolve([])),
    () => timed('quotations',             () => wantEntity('quotations', filter) ? withPoolClientGuarded(c => listQuotations(c, tenantId)) : Promise.resolve([])),
    () => timed('documents',              () => wantEntity('documents', filter) ? withPoolClientGuarded(c => listDocuments(c, tenantId)) : Promise.resolve([])),
    () => timed('transactionLog',         () => wantEntity('transactionLog', filter) ? withPoolClientGuarded(c => listTransactionLogs(c, tenantId, { limit: 500 })) : Promise.resolve([])),
    () => timed('personalCategories',     () => wantEntity('personalCategories', filter) && canAccessPersonalFinance ? withPoolClientGuarded(c => listPersonalCategories(c, tenantId)) : Promise.resolve([])),
    () => timed('personalTransactions',   () => wantEntity('personalTransactions', filter) && canAccessPersonalFinance ? withPoolClientGuarded(c => listPersonalTransactions(c, tenantId)) : Promise.resolve([])),
    () => timed('appSettings',            () => wantEntity('appSettings', filter) ? withPoolClientGuarded(c => listAllSettings(c, tenantId)) : Promise.resolve({})),
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loaderResults = await runBatched(loaderThunks, BOOTSTRAP_CONCURRENCY) as any[];

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
  ] = loaderResults;

  const batchedDone = Date.now() - t0;
  console.log(`[PERF_BULK] batched loaders completed duration=${batchedDone}ms`);

  const t1 = Date.now();
  const plMap = categoryRows.length
    ? await withPoolClient(c => fetchPlSubTypesForTenant(c, tenantId))
    : new Map<string, string | null>();
  const d_plMap = Date.now() - t1;
  if (d_plMap > 0) console.log(`[PERF_BULK] fetchPlSubTypesForTenant duration=${d_plMap}ms`);

  const out: Record<string, unknown> = {};

  if (wantEntity('accounts', filter)) {
    out.accounts = accountRows.map(rowToAccountApi);
  }
  if (wantEntity('contacts', filter)) {
    out.contacts = contactRows.map(rowToContactApi);
  }
  if (wantEntity('transactions', filter)) {
    out.transactions = transactionRows.map(rowToTransactionApi);
  }
  if (wantEntity('categories', filter)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    out.categories = categoryRows.map((r: any) => rowToCategoryApi(r, plMap.get(r.id)));
  }
  if (wantEntity('projects', filter)) {
    out.projects = projectRows.map(rowToProjectApi);
  }
  if (wantEntity('buildings', filter)) {
    out.buildings = buildingRows.map(rowToBuildingApi);
  }
  if (wantEntity('properties', filter)) {
    out.properties = propertyRows.map(rowToPropertyApi);
  }
  if (wantEntity('units', filter)) {
    out.units = unitRows.map(rowToUnitApi);
  }
  if (wantEntity('invoices', filter)) {
    out.invoices = invoiceRows.map(rowToInvoiceApi);
  }
  if (wantEntity('bills', filter)) {
    out.bills = billRows.map(rowToBillApi);
  }
  if (wantEntity('budgets', filter)) {
    out.budgets = budgetRows.map(rowToBudgetApi);
  }
  if (wantEntity('planAmenities', filter)) {
    out.planAmenities = planAmenityRows.map(rowToPlanAmenityApi);
  }
  if (wantEntity('installmentPlans', filter)) {
    out.installmentPlans = installmentPlanRows.map(rowToInstallmentPlanApi);
  }
  if (wantEntity('rentalAgreements', filter)) {
    out.rentalAgreements = rentalAgreementRows.map(rowToRentalAgreementApi);
  }
  if (wantEntity('projectAgreements', filter)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    out.projectAgreements = projectAgreementPairs.map(({ row, unitIds }: any) =>
      rowToProjectAgreementApi(row, unitIds)
    );
  }
  if (wantEntity('projectReceivedAssets', filter)) {
    out.projectReceivedAssets = projectReceivedAssetRows.map(rowToProjectReceivedAssetApi);
  }
  if (wantEntity('contracts', filter)) {
    out.contracts = contractRows.map(rowToContractApi);
  }
  if (wantEntity('salesReturns', filter)) {
    out.salesReturns = salesReturnRows.map(rowToSalesReturnApi);
  }
  if (wantEntity('quotations', filter)) {
    out.quotations = quotationRows.map(rowToQuotationApi);
  }
  if (wantEntity('documents', filter)) {
    out.documents = documentRows.map(rowToDocumentApi);
  }
  if (wantEntity('recurringInvoiceTemplates', filter)) {
    out.recurringInvoiceTemplates = recurringTemplateRows.map(rowToRecurringInvoiceTemplateApi);
  }
  if (wantEntity('pmCycleAllocations', filter)) {
    out.pmCycleAllocations = pmCycleAllocationRows.map(rowToPmCycleAllocationApi);
  }
  if (wantEntity('transactionLog', filter)) {
    out.transactionLog = transactionLogRows.map(rowToTransactionLogApi);
  }
  if (wantEntity('vendors', filter)) {
    out.vendors = vendorRows.map(rowToVendorApi);
  }
  if (wantEntity('personalCategories', filter) && canAccessPersonalFinance) {
    out.personalCategories = personalCategoryRows.map(rowToPersonalCategoryApi);
  }
  if (wantEntity('personalTransactions', filter) && canAccessPersonalFinance) {
    out.personalTransactions = personalTransactionRows.map(rowToPersonalTransactionApi);
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
    `[PERF_BULK] getBulkAppState COMPLETE duration=${totalDurationMs}ms batchedMs=${batchedDone}ms totalPayload=${totalPayloadBytes}b (${(totalPayloadBytes / 1024).toFixed(1)}KB)`
  );

  return out;
}

export type BulkChunkResult = {
  entities: Record<string, unknown>;
  totals: Record<string, number>;
  has_more: boolean;
  next_offset: number | null;
};

export async function countTenantTransactions(tenantId: string): Promise<number> {
  const r = await getPool().query<{ c: number }>(
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
  const txTotal = await countTenantTransactions(tenantId);
  const d_count = Date.now() - t_count;
  perfLog('countTenantTransactions', d_count, { txTotal });

  const entities: Record<string, unknown> = {};
  const totals: Record<string, number> = { transactions: txTotal };

  if (offset === 0) {
    // --- getBulkAppState (static entities) ---
    const t_static = Date.now();
    const staticState = await getBulkAppState(tenantId, BULK_STATIC_ENTITIES, userRole, userId);
    const d_static = Date.now() - t_static;
    perfLog('getBulkAppState (static)', d_static, { keys: Object.keys(staticState) });

    Object.assign(entities, staticState);
    for (const [key, val] of Object.entries(staticState)) {
      if (Array.isArray(val)) totals[key] = val.length;
    }
  }

  // --- listTransactions (chunked page) ---
  const t_tx = Date.now();
  const txRows = await withPoolClient(c => listTransactions(c, tenantId, { limit, offset }));
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
