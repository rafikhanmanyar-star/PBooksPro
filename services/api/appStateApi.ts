/**
 * App State API Service
 * 
 * Loads application state from the API instead of local database.
 * This is used when the app is in cloud mode (authenticated with tenant).
 */

import {
  AppState,
  Account,
  AccountType,
  Bill,
  Category,
  ProfitLossSubType,
  InvoiceStatus,
  ProjectAgreementStatus,
  normalizeProjectAgreementStatus,
  PMCycleAllocation,
  Quotation,
  Document,
  Vendor,
  RecurringInvoiceTemplate,
  TransactionType,
  PersonalCategoryEntry,
  PersonalTransactionEntry,
} from '../../types';
import { parseStoredDateToYyyyMmDdInput, toLocalDateString } from '../../utils/dateUtils';

/** PostgreSQL / seed often stores types as UPPERCASE; client enum uses Title Case ('Bank'). */
function normalizeAccountTypeFromApi(raw: unknown): AccountType {
  const s = String(raw ?? '').trim();
  if (!s) return AccountType.ASSET;
  if ((Object.values(AccountType) as string[]).includes(s)) {
    return s as AccountType;
  }
  const upper = s.toUpperCase();
  const map: Record<string, AccountType> = {
    BANK: AccountType.BANK,
    CASH: AccountType.CASH,
    ASSET: AccountType.ASSET,
    LIABILITY: AccountType.LIABILITY,
    EQUITY: AccountType.EQUITY,
  };
  return map[upper] ?? AccountType.ASSET;
}

function normalizeAccountFromApi(a: any): Account {
  return {
    id: a.id,
    name: a.name || '',
    type: normalizeAccountTypeFromApi(a.type),
    balance: typeof a.balance === 'number' ? a.balance : parseFloat(String(a.balance || '0')),
    isPermanent: a.is_permanent === true || a.is_permanent === 1 || a.isPermanent === true || false,
    description: a.description || undefined,
    parentAccountId: a.parent_account_id || a.parentAccountId || undefined,
    version: typeof a.version === 'number' ? a.version : a.version != null ? parseInt(String(a.version), 10) : undefined,
    bsPosition: a.bs_position ?? a.bsPosition ?? undefined,
    bsTerm: a.bs_term ?? a.bsTerm ?? undefined,
    bsGroupKey: a.bs_group_key ?? a.bsGroupKey ?? undefined,
    accountCode: a.account_code ?? a.accountCode ?? undefined,
    accountSubType: a.sub_type ?? a.accountSubType ?? undefined,
    isActive:
      a.is_active === false || a.is_active === 0 || a.isActive === false
        ? false
        : a.is_active === true || a.is_active === 1 || a.isActive === true
          ? true
          : undefined,
  };
}

/** API may send type as uppercase or mixed; UI uses TransactionType enum strings. */
function normalizeCategoryTypeFromApi(raw: unknown): TransactionType {
  const s = String(raw ?? '').trim();
  if (!s) return TransactionType.EXPENSE;
  if ((Object.values(TransactionType) as string[]).includes(s)) {
    return s as TransactionType;
  }
  const upper = s.toUpperCase();
  const map: Record<string, TransactionType> = {
    INCOME: TransactionType.INCOME,
    EXPENSE: TransactionType.EXPENSE,
    TRANSFER: TransactionType.TRANSFER,
    LOAN: TransactionType.LOAN,
  };
  return map[upper] ?? TransactionType.EXPENSE;
}

function normalizeCategoryFromApi(c: any): Category {
  const plRaw = c.plSubType ?? c.pl_sub_type;
  const plSubType: ProfitLossSubType | undefined =
    typeof plRaw === 'string' && String(plRaw).trim() !== ''
      ? (String(plRaw).trim() as ProfitLossSubType)
      : undefined;
  return {
    id: c.id,
    name: c.name || '',
    type: normalizeCategoryTypeFromApi(c.type),
    description: c.description || undefined,
    isPermanent: c.is_permanent === true || c.is_permanent === 1 || c.isPermanent === true || false,
    isRental: c.is_rental === true || c.is_rental === 1 || c.isRental === true || false,
    isHidden: c.is_hidden === true || c.is_hidden === 1 || c.isHidden === true || false,
    parentCategoryId: c.parent_category_id || c.parentCategoryId || undefined,
    ...(plSubType ? { plSubType } : {}),
  };
}

function normalizePMCycleAllocationFromApi(raw: Record<string, unknown>): PMCycleAllocation {
  const p = raw as any;
  const excludedRaw = p.excludedCategoryIds ?? p.excluded_category_ids;
  let excludedCategoryIds: string[] | undefined;
  if (excludedRaw != null) {
    if (typeof excludedRaw === 'string') {
      try {
        const j = JSON.parse(excludedRaw);
        excludedCategoryIds = Array.isArray(j) ? j : undefined;
      } catch {
        excludedCategoryIds = undefined;
      }
    } else if (Array.isArray(excludedRaw)) {
      excludedCategoryIds = excludedRaw as string[];
    }
  }
  const freq = (p.frequency ?? 'Monthly') as PMCycleAllocation['frequency'];
  return {
    id: String(p.id ?? ''),
    projectId: String(p.projectId ?? p.project_id ?? ''),
    cycleId: String(p.cycleId ?? p.cycle_id ?? ''),
    cycleLabel: String(p.cycleLabel ?? p.cycle_label ?? ''),
    frequency: freq === 'Weekly' || freq === 'Yearly' ? freq : 'Monthly',
    startDate: String(p.startDate ?? p.start_date ?? ''),
    endDate: String(p.endDate ?? p.end_date ?? ''),
    allocationDate: String(p.allocationDate ?? p.allocation_date ?? ''),
    amount: typeof p.amount === 'number' ? p.amount : parseFloat(String(p.amount ?? '0')),
    paidAmount:
      typeof p.paidAmount === 'number'
        ? p.paidAmount
        : typeof p.paid_amount === 'number'
          ? p.paid_amount
          : parseFloat(String(p.paidAmount ?? p.paid_amount ?? '0')),
    status: String(p.status ?? 'unpaid'),
    billId: p.billId != null && String(p.billId).trim() ? String(p.billId) : p.bill_id != null && String(p.bill_id).trim() ? String(p.bill_id) : undefined,
    description: p.description != null ? String(p.description) : undefined,
    expenseTotal:
      typeof p.expenseTotal === 'number'
        ? p.expenseTotal
        : typeof p.expense_total === 'number'
          ? p.expense_total
          : parseFloat(String(p.expenseTotal ?? p.expense_total ?? '0')),
    feeRate:
      typeof p.feeRate === 'number'
        ? p.feeRate
        : typeof p.fee_rate === 'number'
          ? p.fee_rate
          : parseFloat(String(p.feeRate ?? p.fee_rate ?? '0')),
    excludedCategoryIds,
    version: typeof p.version === 'number' ? p.version : p.version != null ? parseInt(String(p.version), 10) : undefined,
  };
}

function normalizeInstallmentPlanFromApiRow(p: any): any {
  return {
    id: p.id,
    projectId: p.project_id || p.projectId || '',
    leadId: p.lead_id || p.leadId || '',
    unitId: p.unit_id || p.unitId || '',
    durationYears: p.duration_years ?? p.durationYears ?? 1,
    downPaymentPercentage:
      typeof p.down_payment_percentage === 'number'
        ? p.down_payment_percentage
        : typeof p.downPaymentPercentage === 'number'
          ? p.downPaymentPercentage
          : parseFloat(String(p.down_payment_percentage || p.downPaymentPercentage || '0')),
    frequency: p.frequency || 'Monthly',
    listPrice:
      typeof p.list_price === 'number'
        ? p.list_price
        : typeof p.listPrice === 'number'
          ? p.listPrice
          : parseFloat(String(p.list_price || p.listPrice || '0')),
    discounts: (() => {
      if (p.discounts) {
        if (typeof p.discounts === 'string') {
          try {
            return JSON.parse(p.discounts);
          } catch {
            return [];
          }
        }
        return Array.isArray(p.discounts) ? p.discounts : [];
      }
      return [];
    })(),
    netValue:
      typeof p.net_value === 'number'
        ? p.net_value
        : typeof p.netValue === 'number'
          ? p.netValue
          : parseFloat(String(p.net_value || p.netValue || '0')),
    downPaymentAmount:
      typeof p.down_payment_amount === 'number'
        ? p.down_payment_amount
        : typeof p.downPaymentAmount === 'number'
          ? p.downPaymentAmount
          : parseFloat(String(p.down_payment_amount || p.downPaymentAmount || '0')),
    installmentAmount:
      typeof p.installment_amount === 'number'
        ? p.installment_amount
        : typeof p.installmentAmount === 'number'
          ? p.installmentAmount
          : parseFloat(String(p.installment_amount || p.installmentAmount || '0')),
    totalInstallments: p.total_installments || p.totalInstallments || 0,
    description: p.description || undefined,
    introText: p.intro_text || p.introText || undefined,
    version:
      typeof p.version === 'number' ? p.version : p.version != null ? parseInt(String(p.version), 10) : 1,
    rootId: p.root_id || p.rootId || undefined,
    status: p.status || 'Draft',
    approvalRequestedById: p.approval_requested_by || p.approvalRequestedById || undefined,
    approvalRequestedToId: p.approval_requested_to || p.approvalRequestedToId || undefined,
    approvalRequestedAt: p.approval_requested_at || p.approvalRequestedAt || undefined,
    approvalReviewedById: p.approval_reviewed_by || p.approvalReviewedById || undefined,
    approvalReviewedAt: p.approval_reviewed_at || p.approvalReviewedAt || undefined,
    userId: p.user_id || p.userId || undefined,
    selectedAmenities: (() => {
      if (p.selected_amenities) {
        if (typeof p.selected_amenities === 'string') {
          try {
            return JSON.parse(p.selected_amenities);
          } catch {
            return [];
          }
        }
        return Array.isArray(p.selected_amenities) ? p.selected_amenities : p.selectedAmenities || [];
      }
      return p.selectedAmenities || [];
    })(),
    amenitiesTotal:
      typeof p.amenities_total === 'number'
        ? p.amenities_total
        : typeof p.amenitiesTotal === 'number'
          ? p.amenitiesTotal
          : parseFloat(String(p.amenities_total || p.amenitiesTotal || '0')),
    createdAt: p.created_at || p.createdAt,
    updatedAt: p.updated_at || p.updatedAt,
  };
}

function normalizePlanAmenityFromApiRow(a: any): any {
  return {
    id: a.id,
    name: a.name || '',
    price: typeof a.price === 'number' ? a.price : parseFloat(String(a.price || '0')),
    isPercentage: a.is_percentage ?? a.isPercentage ?? false,
    isActive: a.is_active ?? a.isActive ?? true,
    description: a.description ?? undefined,
    version: typeof a.version === 'number' ? a.version : a.version != null ? parseInt(String(a.version), 10) : undefined,
    createdAt: a.created_at ?? a.createdAt ?? undefined,
    updatedAt: a.updated_at ?? a.updatedAt ?? undefined,
  };
}

function normalizeBillFromApi(b: any): Bill {
  const expenseCategoryItems = (() => {
    const items = b.expense_category_items || b.expenseCategoryItems;
    if (!items) return undefined;
    if (typeof items === 'string' && items.trim().length > 0) {
      try {
        return JSON.parse(items);
      } catch {
        return undefined;
      }
    }
    if (Array.isArray(items)) return items;
    return undefined;
  })();
  return {
    id: b.id,
    billNumber: b.bill_number || b.billNumber || '',
    contactId: b.contact_id || b.contactId || undefined,
    vendorId: b.vendor_id || b.vendorId || undefined,
    amount: typeof b.amount === 'number' ? b.amount : parseFloat(String(b.amount || '0')),
    paidAmount:
      typeof b.paid_amount === 'number'
        ? b.paid_amount
        : typeof b.paidAmount === 'number'
          ? b.paidAmount
          : parseFloat(String(b.paid_amount ?? b.paidAmount ?? '0')),
    status: (b.status as InvoiceStatus) || InvoiceStatus.UNPAID,
    issueDate: parseStoredDateToYyyyMmDdInput(String(b.issue_date || b.issueDate || toLocalDateString(new Date()))),
    dueDate: (() => {
      const v = b.due_date ?? b.dueDate;
      if (v == null || String(v).trim() === '') return undefined;
      return parseStoredDateToYyyyMmDdInput(String(v));
    })(),
    description: b.description || undefined,
    categoryId: b.category_id || b.categoryId || undefined,
    projectId: b.project_id || b.projectId || undefined,
    buildingId: b.building_id || b.buildingId || undefined,
    propertyId: b.property_id || b.propertyId || undefined,
    projectAgreementId: b.project_agreement_id || b.projectAgreementId || undefined,
    contractId: b.contract_id || b.contractId || undefined,
    staffId: b.staff_id || b.staffId || undefined,
    expenseBearerType: b.expense_bearer_type || b.expenseBearerType || undefined,
    expenseCategoryItems,
    documentPath: b.document_path || b.documentPath || undefined,
    documentId: b.document_id || b.documentId || undefined,
    version: typeof b.version === 'number' ? b.version : b.version != null ? parseInt(String(b.version), 10) : undefined,
  };
}

/** AppState keys stored per tenant in PostgreSQL app_settings (not device-local). */
const TENANT_SETTING_STATE_KEYS: (keyof AppState)[] = [
  'agreementSettings',
  'projectAgreementSettings',
  'rentalInvoiceSettings',
  'projectInvoiceSettings',
  'printSettings',
  'whatsAppTemplates',
  'dashboardConfig',
  'invoiceHtmlTemplate',
  'showSystemTransactions',
  'enableColorCoding',
  'enableBeepOnSave',
  'whatsAppMode',
  'pmCostPercentage',
  'defaultProjectId',
  'lastServiceChargeRun',
  'enableDatePreservation',
];

/** Merge slice used after bidirectional SQLite reload so API-backed settings are not wiped. */
export function pickTenantSettingsPartial(partial: Partial<AppState>): Partial<AppState> {
  const out: Partial<AppState> = {};
  for (const k of TENANT_SETTING_STATE_KEYS) {
    if (partial[k] !== undefined) (out as Record<string, unknown>)[k as string] = partial[k] as unknown;
  }
  return out;
}

export function tenantSettingsPayloadFromState(state: AppState): Record<string, unknown> {
  return {
    agreementSettings: state.agreementSettings,
    projectAgreementSettings: state.projectAgreementSettings,
    rentalInvoiceSettings: state.rentalInvoiceSettings,
    projectInvoiceSettings: state.projectInvoiceSettings,
    printSettings: state.printSettings,
    whatsAppTemplates: state.whatsAppTemplates,
    dashboardConfig: state.dashboardConfig,
    invoiceHtmlTemplate: state.invoiceHtmlTemplate,
    showSystemTransactions: state.showSystemTransactions,
    enableColorCoding: state.enableColorCoding,
    enableBeepOnSave: state.enableBeepOnSave,
    whatsAppMode: state.whatsAppMode,
    pmCostPercentage: state.pmCostPercentage,
    defaultProjectId: state.defaultProjectId,
    lastServiceChargeRun: state.lastServiceChargeRun,
    enableDatePreservation: state.enableDatePreservation,
  };
}

let _tenantSettingsSyncTimer: ReturnType<typeof setTimeout> | null = null;
let _pendingTenantSettingsState: AppState | null = null;
import { AccountsApiRepository } from './repositories/accountsApi';
import { ContactsApiRepository } from './repositories/contactsApi';
import { TransactionsApiRepository } from './repositories/transactionsApi';
import { CategoriesApiRepository } from './repositories/categoriesApi';
import { ProjectsApiRepository } from './repositories/projectsApi';
import { BuildingsApiRepository } from './repositories/buildingsApi';
import { PropertiesApiRepository } from './repositories/propertiesApi';
import { UnitsApiRepository } from './repositories/unitsApi';
import { InvoicesApiRepository } from './repositories/invoicesApi';
import { BillsApiRepository } from './repositories/billsApi';
import { BudgetsApiRepository } from './repositories/budgetsApi';
import { PlanAmenitiesApiRepository } from './repositories/planAmenitiesApi';
import { InstallmentPlansApiRepository } from './repositories/installmentPlansApi';
import { RentalAgreementsApiRepository } from './repositories/rentalAgreementsApi';
import { ProjectAgreementsApiRepository } from './repositories/projectAgreementsApi';
import {
  ProjectReceivedAssetsApiRepository,
  normalizeProjectReceivedAssetFromApi,
} from './repositories/projectReceivedAssetsApi';
import { ContractsApiRepository, normalizeContractFromApi } from './repositories/contractsApi';
import { SalesReturnsApiRepository, normalizeSalesReturnFromApi } from './repositories/salesReturnsApi';
import { QuotationsApiRepository } from './repositories/quotationsApi';
import { DocumentsApiRepository } from './repositories/documentsApi';
import { RecurringInvoiceTemplatesApiRepository } from './repositories/recurringInvoiceTemplatesApi';
import { AppSettingsApiRepository } from './repositories/appSettingsApi';
import { PMCycleAllocationsApiRepository } from './repositories/pmCycleAllocationsApi';
import { TransactionLogApiRepository } from './repositories/transactionLogApi';
import { VendorsApiRepository } from './repositories/vendorsApi';
import {
  PersonalCategoriesApiRepository,
  normalizePersonalCategoryFromApi,
} from './repositories/personalCategoriesApi';
import {
  PersonalTransactionsApiRepository,
  normalizePersonalTransactionFromApi,
} from './repositories/personalTransactionsApi';
import { getApiBaseUrl } from '../../config/apiUrl';
import { apiClient } from './client';
import { logger } from '../logger';
import type { Invoice, ProjectReceivedAsset } from '../../types';

/** Response from GET /api/state/changes?since=ISO8601 (incremental sync); apiClient unwraps { success, data } to this. */
export interface StateChangesResponse {
  since: string;
  updatedAt: string;
  entities: Record<string, unknown[]>;
  /** When any app_settings row changed since `since`, full key→value map for tenant (merge on client). */
  appSettings?: Record<string, unknown>;
  has_more?: boolean;
  next_cursor?: string | null;
  limit?: number;
}

/** Server clock for `pbooks_api_last_sync_at` after full loads (matches DB time; avoids missing incremental rows). */
export async function getServerTimeIso(): Promise<string> {
  try {
    const base = getApiBaseUrl().replace(/\/api\/?$/, '');
    const res = await fetch(`${base}/health`);
    const j = (await res.json()) as { success?: boolean; data?: { serverTime?: string } };
    const t = j?.data?.serverTime;
    if (typeof t === 'string' && !Number.isNaN(Date.parse(t))) return t;
  } catch {
    /* ignore */
  }
  return new Date().toISOString();
}

export class AppStateApiService {
  private accountsRepo: AccountsApiRepository;
  private contactsRepo: ContactsApiRepository;
  private transactionsRepo: TransactionsApiRepository;
  private categoriesRepo: CategoriesApiRepository;
  private projectsRepo: ProjectsApiRepository;
  private buildingsRepo: BuildingsApiRepository;
  private propertiesRepo: PropertiesApiRepository;
  private unitsRepo: UnitsApiRepository;
  private invoicesRepo: InvoicesApiRepository;
  private billsRepo: BillsApiRepository;
  private budgetsRepo: BudgetsApiRepository;
  private planAmenitiesRepo: PlanAmenitiesApiRepository;
  private installmentPlansRepo: InstallmentPlansApiRepository;
  private rentalAgreementsRepo: RentalAgreementsApiRepository;
  private projectAgreementsRepo: ProjectAgreementsApiRepository;
  private projectReceivedAssetsRepo: ProjectReceivedAssetsApiRepository;
  private contractsRepo: ContractsApiRepository;
  private salesReturnsRepo: SalesReturnsApiRepository;
  private quotationsRepo: QuotationsApiRepository;
  private documentsRepo: DocumentsApiRepository;
  private recurringInvoiceTemplatesRepo: RecurringInvoiceTemplatesApiRepository;
  private appSettingsRepo: AppSettingsApiRepository;
  private pmCycleAllocationsRepo: PMCycleAllocationsApiRepository;
  private transactionLogRepo: TransactionLogApiRepository;
  private vendorsRepo: VendorsApiRepository;
  private personalCategoriesRepo: PersonalCategoriesApiRepository;
  private personalTransactionsRepo: PersonalTransactionsApiRepository;

  constructor() {
    this.accountsRepo = new AccountsApiRepository();
    this.contactsRepo = new ContactsApiRepository();
    this.transactionsRepo = new TransactionsApiRepository();
    this.categoriesRepo = new CategoriesApiRepository();
    this.projectsRepo = new ProjectsApiRepository();
    this.buildingsRepo = new BuildingsApiRepository();
    this.propertiesRepo = new PropertiesApiRepository();
    this.unitsRepo = new UnitsApiRepository();
    this.invoicesRepo = new InvoicesApiRepository();
    this.billsRepo = new BillsApiRepository();
    this.budgetsRepo = new BudgetsApiRepository();
    this.planAmenitiesRepo = new PlanAmenitiesApiRepository();
    this.installmentPlansRepo = new InstallmentPlansApiRepository();
    this.rentalAgreementsRepo = new RentalAgreementsApiRepository();
    this.projectAgreementsRepo = new ProjectAgreementsApiRepository();
    this.projectReceivedAssetsRepo = new ProjectReceivedAssetsApiRepository();
    this.contractsRepo = new ContractsApiRepository();
    this.salesReturnsRepo = new SalesReturnsApiRepository();
    this.quotationsRepo = new QuotationsApiRepository();
    this.documentsRepo = new DocumentsApiRepository();
    this.recurringInvoiceTemplatesRepo = new RecurringInvoiceTemplatesApiRepository();
    this.appSettingsRepo = new AppSettingsApiRepository();
    this.pmCycleAllocationsRepo = new PMCycleAllocationsApiRepository();
    this.transactionLogRepo = new TransactionLogApiRepository();
    this.vendorsRepo = new VendorsApiRepository();
    this.personalCategoriesRepo = new PersonalCategoriesApiRepository();
    this.personalTransactionsRepo = new PersonalTransactionsApiRepository();
  }

  /**
   * Load incremental state changes from API (for bi-directional sync).
   * Returns only entities updated after the given timestamp.
   */
  async loadStateChanges(since: string): Promise<StateChangesResponse> {
    const endpoint = `/state/changes?since=${encodeURIComponent(since)}`;
    const data = await apiClient.get<StateChangesResponse>(endpoint);
    return data;
  }

  /**
   * Map stateChanges entity keys (snake_case) to AppState keys (camelCase)
   */
  private static ENTITY_KEY_MAP: Record<string, keyof AppState> = {
    accounts: 'accounts',
    contacts: 'contacts',
    categories: 'categories',
    projects: 'projects',
    buildings: 'buildings',
    properties: 'properties',
    units: 'units',
    transactions: 'transactions',
    invoices: 'invoices',
    bills: 'bills',
    budgets: 'budgets',
    plan_amenities: 'planAmenities',
    contracts: 'contracts',
    sales_returns: 'salesReturns',
    quotations: 'quotations',
    documents: 'documents',
    recurring_invoice_templates: 'recurringInvoiceTemplates',
    pm_cycle_allocations: 'pmCycleAllocations',
    rental_agreements: 'rentalAgreements',
    project_agreements: 'projectAgreements',
    project_received_assets: 'projectReceivedAssets',
    installment_plans: 'installmentPlans',
    vendors: 'vendors',
    personal_categories: 'personalCategories',
    personal_transactions: 'personalTransactions',
  };

  /**
   * Load state via incremental sync when baseline exists and since is recent.
   * Merges API changes into the baseline and returns merged state plus a server-issued
   * cursor for the next sync (avoids client clock skew missing rows vs PostgreSQL `updated_at`).
   */
  async loadStateViaIncrementalSync(
    since: string,
    baseline: Partial<AppState>
  ): Promise<{ merged: Partial<AppState>; serverCursor: string }> {
    logger.logCategory('sync', `📡 Incremental sync since ${since}...`);
    const response = await this.loadStateChanges(since);
    const serverCursor =
      typeof response.updatedAt === 'string' && response.updatedAt
        ? response.updatedAt
        : new Date().toISOString();
    const merged = { ...baseline } as Partial<AppState>;

    for (const [apiKey, rows] of Object.entries(response.entities || {})) {
      const stateKey = AppStateApiService.ENTITY_KEY_MAP[apiKey];
      if (!stateKey || !Array.isArray(rows)) continue;

      const baselineArr = (merged[stateKey] as unknown[]) || [];
      const map = new Map<string, unknown>();
      for (const item of baselineArr) {
        const id = (item as { id?: string })?.id;
        if (id) map.set(id, item);
      }
      for (const row of rows) {
        const id = (row as { id?: string })?.id;
        if (!id) continue;
        const deletedAt = (row as any).deletedAt ?? (row as any).deleted_at;
        if (deletedAt) {
          map.delete(id);
        } else {
          map.set(id, row);
        }
      }
      (merged as Record<string, unknown>)[stateKey] = Array.from(map.values());
    }

    if (response.appSettings && typeof response.appSettings === 'object') {
      Object.assign(merged, this.buildSettingsPartialFromFlat(response.appSettings as Record<string, any>));
    }

    if (merged.accounts && Array.isArray(merged.accounts)) {
      merged.accounts = merged.accounts.map((a: any) => normalizeAccountFromApi(a));
    }

    if (merged.categories && Array.isArray(merged.categories)) {
      merged.categories = merged.categories.map((c: any) => normalizeCategoryFromApi(c));
    }

    if (merged.bills && Array.isArray(merged.bills)) {
      merged.bills = merged.bills.map((b: any) => normalizeBillFromApi(b));
    }

    if (merged.projectReceivedAssets && Array.isArray(merged.projectReceivedAssets)) {
      merged.projectReceivedAssets = merged.projectReceivedAssets.map((a: Record<string, unknown>) =>
        normalizeProjectReceivedAssetFromApi(a)
      );
    }

    if (merged.salesReturns && Array.isArray(merged.salesReturns)) {
      merged.salesReturns = merged.salesReturns.map((sr: Record<string, unknown>) =>
        normalizeSalesReturnFromApi(sr)
      );
    }

    if (merged.contracts && Array.isArray(merged.contracts)) {
      merged.contracts = merged.contracts.map((c: Record<string, unknown>) => normalizeContractFromApi(c));
    }

    if (merged.budgets && Array.isArray(merged.budgets)) {
      merged.budgets = merged.budgets.map((b: any) => ({
        id: b.id,
        categoryId: b.category_id || b.categoryId || '',
        amount: typeof b.amount === 'number' ? b.amount : parseFloat(String(b.amount || '0')),
        projectId: b.project_id || b.projectId || undefined,
        version: typeof b.version === 'number' ? b.version : undefined,
      }));
    }

    if (merged.personalCategories && Array.isArray(merged.personalCategories)) {
      merged.personalCategories = merged.personalCategories.map((c: any) =>
        normalizePersonalCategoryFromApi(c as Record<string, unknown>)
      );
    }
    if (merged.personalTransactions && Array.isArray(merged.personalTransactions)) {
      merged.personalTransactions = merged.personalTransactions.map((t: any) =>
        normalizePersonalTransactionFromApi(t as Record<string, unknown>)
      );
    }

    if (merged.pmCycleAllocations && Array.isArray(merged.pmCycleAllocations)) {
      merged.pmCycleAllocations = merged.pmCycleAllocations.map((p: any) =>
        normalizePMCycleAllocationFromApi(p as Record<string, unknown>)
      );
    }

    if (merged.installmentPlans && Array.isArray(merged.installmentPlans)) {
      merged.installmentPlans = merged.installmentPlans.map((p: any) => normalizeInstallmentPlanFromApiRow(p));
    }
    if (merged.planAmenities && Array.isArray(merged.planAmenities)) {
      merged.planAmenities = merged.planAmenities.map((a: any) => normalizePlanAmenityFromApiRow(a));
    }

    try {
      const { isLocalOnlyMode } = await import('../../config/apiUrl');
      const { getCurrentTenantId } = await import('../database/tenantUtils');
      const { storageService } = await import('../../components/payroll/services/storageService');
      if (!isLocalOnlyMode()) {
        const tid = getCurrentTenantId();
        const ent = response.entities as Record<string, unknown[]> | undefined;
        if (tid && ent) {
          const hasPayroll = Object.entries(ent).some(
            ([k, v]) => (k.startsWith('payroll_') || k === 'payslips') && Array.isArray(v) && v.length > 0
          );
          if (hasPayroll) {
            storageService.init(tid);
            storageService.applyPayrollIncrementalEntities(tid, ent);
          }
        }
      }
    } catch (e) {
      logger.warnCategory('sync', 'payroll incremental merge skipped', e);
    }

    const totalChanges =
      Object.values(response.entities || {}).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0) +
      (response.appSettings && Object.keys(response.appSettings).length > 0 ? 1 : 0);
    logger.logCategory('sync', `✅ Incremental sync merged ${totalChanges} change(s) (incl. app settings when present)`);
    return { merged, serverCursor };
  }

  /**
   * Load critical state only (accounts, contacts, categories, projects, buildings, properties, units)
   * for first paint; then load full state in background.
   */
  async loadStateCritical(): Promise<Partial<AppState>> {
    try {
      const raw = await apiClient.get<Record<string, any[]>>('/state/critical');
      return this.normalizeLoadedState(raw);
    } catch (error) {
      logger.errorCategory('sync', '❌ Error loading critical state:', error);
      throw error;
    }
  }

  /**
   * Load complete application state from API in one request (fewer round-trips, better LCP/INP).
   * Prefer over loadState() for initial load when the backend supports GET /state/bulk.
   * @param entities Optional comma-separated list of entities to load (e.g., 'accounts,contacts,categories')
   */
  async loadStateBulk(entities?: string): Promise<Partial<AppState>> {
    try {
      logger.logCategory('sync', '📡 Loading state from API (bulk)...');
      const endpoint = entities ? `/state/bulk?entities=${encodeURIComponent(entities)}` : '/state/bulk';
      console.log('[DIAG] loadStateBulk: baseUrl=', apiClient.getBaseUrl(), 'tenantId=', apiClient.getTenantId(), 'hasToken=', !!apiClient.getToken(), 'endpoint=', endpoint);
      const raw = await apiClient.get<Record<string, any[]>>(endpoint);
      console.log('[DIAG] loadStateBulk: response keys=', Object.keys(raw || {}), 'contacts=', (raw?.contacts || []).length, 'accounts=', (raw?.accounts || []).length, 'transactions=', (raw?.transactions || []).length);
      const state = this.normalizeLoadedState(raw);
      logger.logCategory('sync', '✅ Loaded from API (bulk):', {
        accounts: (raw.accounts || []).length,
        contacts: (raw.contacts || []).length,
        transactions: (raw.transactions || []).length,
      });
      return state;
    } catch (error) {
      console.error('[DIAG] loadStateBulk FAILED:', error);
      logger.errorCategory('sync', '❌ Error loading state from API (bulk):', error);
      throw error;
    }
  }

  /**
   * Load state progressively in chunks with progress tracking.
   * This enables loading large datasets without blocking the UI.
   * @param onProgress Callback for progress updates (loaded, total)
   * @param chunkSize Number of records per chunk (default 200, max 500)
   */
  async loadStateBulkChunked(
    onProgress?: (loaded: number, total: number) => void,
    chunkSize: number = 200
  ): Promise<Partial<AppState>> {
    try {
      logger.logCategory('sync', '📡 Loading state from API (chunked)...');

      const CHUNK_SIZE = Math.min(chunkSize, 500);
      let offset = 0;
      let hasMore = true;
      const accumulated: Record<string, any[]> = {};
      let totalRecordCount = 0;

      while (hasMore) {
        const endpoint = `/state/bulk-chunked?limit=${CHUNK_SIZE}&offset=${offset}`;
        const chunk = await apiClient.get<{
          entities: Record<string, any[]>;
          totals: Record<string, number>;
          has_more: boolean;
          next_offset: number | null;
        }>(endpoint);

        // Merge chunk into accumulated state
        for (const [key, records] of Object.entries(chunk.entities)) {
          if (!accumulated[key]) {
            accumulated[key] = [];
          }
          accumulated[key].push(...records);
        }

        hasMore = chunk.has_more;
        offset = chunk.next_offset || offset + CHUNK_SIZE;

        // Calculate total from first chunk
        if (totalRecordCount === 0 && chunk.totals) {
          totalRecordCount = Object.values(chunk.totals).reduce((sum, count) => sum + count, 0);
        }

        // Report progress
        if (onProgress) {
          const loaded = Object.values(accumulated).reduce((sum, arr) => sum + arr.length, 0);
          onProgress(loaded, totalRecordCount);
        }

        // Yield to main thread every chunk to keep UI responsive
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      logger.logCategory('sync', `✅ Loaded ${Object.values(accumulated).reduce((sum, arr) => sum + arr.length, 0)} records in chunks`);

      // Normalize data (potentially offloading to background)
      return this.normalizeLoadedStateOffThread(accumulated);
    } catch (error) {
      logger.errorCategory('sync', '❌ Error loading state (chunked):', error);
      throw error;
    }
  }

  /**
   * Normalize loaded state with background processing to avoid blocking UI.
   * Uses requestIdleCallback when available for better performance.
   */
  private async normalizeLoadedStateOffThread(raw: Record<string, any>): Promise<Partial<AppState>> {
    return new Promise((resolve) => {
      const run = () => resolve(this.normalizeLoadedState(raw));
      if ('requestIdleCallback' in window) {
        requestIdleCallback(run, { timeout: 5000 });
      } else {
        setTimeout(run, 0);
      }
    });
  }

  /**
   * Load complete application state from API
   * Loads all entities that have API endpoints
   */
  async loadState(): Promise<Partial<AppState>> {
    try {
      logger.logCategory('sync', '📡 Loading state from API...');

      // Load entities in parallel for better performance
      const [
        accounts,
        contacts,
        transactions,
        categories,
        projects,
        buildings,
        properties,
        units,
        invoices,
        bills,
        budgets,
        planAmenities,
        installmentPlans,
        rentalAgreements,
        projectAgreements,
        projectReceivedAssets,
        contracts,
        salesReturns,
        quotations,
        documents,
        recurringInvoiceTemplates,
        pmCycleAllocations,
        transactionLog,
        vendors,
        personalCategories,
        personalTransactions,
        appSettingsFlat,
      ] = await Promise.all([
        this.accountsRepo.findAll().catch(err => {
          logger.errorCategory('sync', 'Error loading accounts from API:', err);
          return [];
        }),
        this.contactsRepo.findAll().catch(err => {
          console.error('Error loading contacts from API:', err);
          return [];
        }),
        this.transactionsRepo.findAll().catch(err => {
          console.error('Error loading transactions from API:', err);
          return [];
        }),
        this.categoriesRepo.findAll().catch(err => {
          console.error('Error loading categories from API:', err);
          return [];
        }),
        this.projectsRepo.findAll().catch(err => {
          console.error('Error loading projects from API:', err);
          return [];
        }),
        this.buildingsRepo.findAll().catch(err => {
          console.error('Error loading buildings from API:', err);
          return [];
        }),
        this.propertiesRepo.findAll().catch(err => {
          console.error('Error loading properties from API:', err);
          return [];
        }),
        this.unitsRepo.findAll().catch(err => {
          console.error('Error loading units from API:', err);
          return [];
        }),
        this.invoicesRepo.findAll().catch(err => {
          console.error('Error loading invoices from API:', err);
          return [];
        }),
        this.billsRepo.findAll().catch(err => {
          console.error('Error loading bills from API:', err);
          return [];
        }),
        this.budgetsRepo.findAll().catch(err => {
          console.error('Error loading budgets from API:', err);
          return [];
        }),
        this.planAmenitiesRepo.findAll().catch(err => {
          console.error('Error loading plan amenities from API:', err);
          return [];
        }),
        this.installmentPlansRepo.findAll().catch(err => {
          console.error('Error loading installment plans from API:', err);
          return [];
        }),
        this.rentalAgreementsRepo.findAll().catch(err => {
          console.error('Error loading rental agreements from API:', err);
          return [];
        }),
        this.projectAgreementsRepo.findAll().catch(err => {
          console.error('Error loading project agreements from API:', err);
          return [];
        }),
        this.projectReceivedAssetsRepo.findAll().catch(err => {
          console.error('Error loading project received assets from API:', err);
          return [];
        }),
        this.contractsRepo.findAll().catch(err => {
          console.error('Error loading contracts from API:', err);
          return [];
        }),
        this.salesReturnsRepo.findAll().catch(err => {
          console.error('Error loading sales returns from API:', err);
          return [];
        }),
        this.quotationsRepo.findAll().catch(err => {
          console.error('Error loading quotations from API:', err);
          return [];
        }),
        this.documentsRepo.findAll().catch(err => {
          console.error('Error loading documents from API:', err);
          return [];
        }),
        this.recurringInvoiceTemplatesRepo.findAll().catch(err => {
          console.error('Error loading recurring invoice templates from API:', err);
          return [];
        }),
        this.pmCycleAllocationsRepo.findAll().catch(err => {
          console.error('Error loading PM cycle allocations from API:', err);
          return [];
        }),
        this.transactionLogRepo.findAll().catch(err => {
          console.error('Error loading transaction logs from API:', err);
          return [];
        }),
        this.vendorsRepo.findAll().catch(err => {
          console.error('Error loading vendors from API:', err);
          return [];
        }),
        this.personalCategoriesRepo.findAll().catch(err => {
          console.error('Error loading personal categories from API:', err);
          return [] as PersonalCategoryEntry[];
        }),
        this.personalTransactionsRepo.findAll().catch(err => {
          console.error('Error loading personal transactions from API:', err);
          return [] as PersonalTransactionEntry[];
        }),
        this.appSettingsRepo.findAll().catch(err => {
          console.error('Error loading app settings from API:', err);
          return {} as Record<string, unknown>;
        }),
      ]);

      // Enhanced vendor logging for debugging
      if (vendors.length > 0) {
        logger.logCategory('sync', '📋 Vendors loaded from API:', vendors.map(v => ({ id: v.id, name: v.name })));
      } else {
        logger.warnCategory('sync', '⚠️ No vendors returned from API');
      }

      logger.logCategory('sync', '✅ Loaded from API:', {
        accounts: accounts.length,
        contacts: contacts.length,
        transactions: transactions.length,
        categories: categories.length,
        projects: projects.length,
        buildings: buildings.length,
        properties: properties.length,
        units: units.length,
        invoices: invoices.length,
        bills: bills.length,
        budgets: budgets.length,
        planAmenities: planAmenities.length,
        installmentPlans: installmentPlans.length,
        rentalAgreements: rentalAgreements.length,
        projectAgreements: projectAgreements.length,
        projectReceivedAssets: projectReceivedAssets.length,
        contracts: contracts.length,
        salesReturns: salesReturns.length,
        quotations: quotations.length,
        documents: documents.length,
        recurringInvoiceTemplates: recurringInvoiceTemplates.length,
        pmCycleAllocations: pmCycleAllocations.length,
        vendors: vendors.length,
        personalCategories: personalCategories.length,
        personalTransactions: personalTransactions.length,
        appSettingsKeys: Object.keys(appSettingsFlat || {}).length,
      });

      return this.normalizeLoadedState({
        accounts,
        contacts,
        transactions,
        categories,
        projects,
        buildings,
        properties,
        units,
        invoices,
        bills,
        budgets,
        planAmenities,
        installmentPlans,
        rentalAgreements,
        projectAgreements,
        projectReceivedAssets,
        contracts,
        salesReturns,
        quotations,
        documents,
        recurringInvoiceTemplates,
        pmCycleAllocations,
        transactionLog,
        vendors,
        personalCategories,
        personalTransactions,
        appSettings: appSettingsFlat,
      });
    } catch (error) {
      logger.errorCategory('sync', '❌ Error loading state from API:', error);
      throw error;
    }
  }

  /** Map flat API app_settings keys to AppState fields (only keys present in API response). */
  private buildSettingsPartialFromFlat(flat: Record<string, any>): Partial<AppState> {
    const out: Partial<AppState> = {};
    if (flat.agreementSettings != null) out.agreementSettings = flat.agreementSettings;
    if (flat.projectAgreementSettings != null) out.projectAgreementSettings = flat.projectAgreementSettings;
    if (flat.rentalInvoiceSettings != null) out.rentalInvoiceSettings = flat.rentalInvoiceSettings;
    if (flat.projectInvoiceSettings != null) out.projectInvoiceSettings = flat.projectInvoiceSettings;
    if (flat.printSettings != null) out.printSettings = flat.printSettings;
    if (flat.whatsAppTemplates != null) out.whatsAppTemplates = flat.whatsAppTemplates;
    if (flat.dashboardConfig != null) out.dashboardConfig = flat.dashboardConfig;
    if (flat.invoiceHtmlTemplate !== undefined) out.invoiceHtmlTemplate = flat.invoiceHtmlTemplate;
    if (flat.showSystemTransactions !== undefined) out.showSystemTransactions = flat.showSystemTransactions;
    if (flat.enableColorCoding !== undefined) out.enableColorCoding = flat.enableColorCoding;
    if (flat.enableBeepOnSave !== undefined) out.enableBeepOnSave = flat.enableBeepOnSave;
    if (flat.whatsAppMode !== undefined) out.whatsAppMode = flat.whatsAppMode;
    if (flat.pmCostPercentage !== undefined) out.pmCostPercentage = flat.pmCostPercentage;
    if (flat.defaultProjectId !== undefined) out.defaultProjectId = flat.defaultProjectId;
    if (flat.lastServiceChargeRun !== undefined) out.lastServiceChargeRun = flat.lastServiceChargeRun;
    if (flat.enableDatePreservation !== undefined) out.enableDatePreservation = flat.enableDatePreservation;
    return out;
  }

  /**
   * Debounced push of tenant-scoped settings to PostgreSQL (called after local SQLite save in API mode).
   */
  syncTenantSettingsToApi(state: AppState): void {
    _pendingTenantSettingsState = state;
    if (_tenantSettingsSyncTimer) clearTimeout(_tenantSettingsSyncTimer);
    _tenantSettingsSyncTimer = setTimeout(() => {
      _tenantSettingsSyncTimer = null;
      const s = _pendingTenantSettingsState;
      _pendingTenantSettingsState = null;
      if (!s) return;
      void this.flushTenantSettingsToApi(s);
    }, 2000);
  }

  /** No debounce — use after lastServiceChargeRun (monthly service charges) so PostgreSQL + realtime update immediately. */
  async flushTenantSettingsNow(state: AppState): Promise<void> {
    return this.flushTenantSettingsToApi(state);
  }

  private async flushTenantSettingsToApi(state: AppState): Promise<void> {
    try {
      const payload = tenantSettingsPayloadFromState(state);
      await this.appSettingsRepo.bulkUpsert(payload);
      logger.logCategory('sync', '📌 Tenant application settings synced to API');
    } catch (e) {
      logger.warnCategory('sync', '⚠️ Tenant settings sync to API failed:', e);
    }
  }

  /** Shared normalizer for loadState() and loadStateBulk() raw response */
  private normalizeLoadedState(raw: Record<string, any>): Partial<AppState> {
    const appSettingsFlat = raw.appSettings || raw.app_settings || {};
    const accounts = raw.accounts || [];
    const contacts = raw.contacts || [];
    const transactions = raw.transactions || [];
    const categories = raw.categories || [];
    const projects = raw.projects || [];
    const buildings = raw.buildings || [];
    const properties = raw.properties || [];
    const units = raw.units || [];
    const invoices = raw.invoices || [];
    const bills = raw.bills || [];
    const budgets = raw.budgets || [];
    const planAmenities = raw.planAmenities || [];
    const installmentPlans = raw.installmentPlans || [];
    const rentalAgreements = raw.rentalAgreements || [];
    const projectAgreements = raw.projectAgreements || [];
    const projectReceivedAssetsRaw = raw.projectReceivedAssets || raw.project_received_assets || [];
    const contracts = raw.contracts || [];
    const salesReturns = raw.salesReturns || [];
    const quotations = raw.quotations || [];
    const documents = raw.documents || [];
    const recurringInvoiceTemplates = raw.recurringInvoiceTemplates || [];
    const pmCycleAllocations = raw.pmCycleAllocations || [];
    const transactionLog = raw.transactionLog || [];
    const vendors = raw.vendors || [];
    const personalCategoriesRaw = raw.personalCategories || raw.personal_categories || [];
    const personalTransactionsRaw = raw.personalTransactions || raw.personal_transactions || [];

    const parseJsonSafe = <T,>(value: any, fallback: T): T => {
      if (value == null) return fallback;
      if (typeof value === 'string') {
        try {
          return JSON.parse(value) as T;
        } catch {
          return fallback;
        }
      }
      return value as T;
    };

    // Normalize properties from API (transform snake_case to camelCase)
    // The server returns snake_case fields, but the client expects camelCase
    const normalizedProperties = properties.map((p: any) => {
      // Normalize property to ensure all fields are properly mapped
      // Handle both camelCase and snake_case field names for backward compatibility
      // Preserve null/undefined values explicitly to prevent data loss
      const normalizedProperty = {
        id: p.id || '',
        name: p.name ?? p.name ?? '',
        ownerId: p.ownerId ?? p.owner_id ?? '',
        buildingId: p.buildingId ?? p.building_id ?? '',
        description: (p.description) || undefined,
        monthlyServiceCharge: (() => {
          const charge = p.monthlyServiceCharge ?? p.monthly_service_charge;
          if (charge == null) return undefined;
          return typeof charge === 'number' ? charge : parseFloat(String(charge));
        })(),
        version: typeof p.version === 'number' ? p.version : undefined,
      };

      // Debug: Log properties that seem to be missing critical data
      if (!normalizedProperty.name || !normalizedProperty.ownerId || !normalizedProperty.buildingId) {
        console.warn('⚠️ Property normalization warning - missing critical fields:', {
          id: normalizedProperty.id,
          name: normalizedProperty.name,
          ownerId: normalizedProperty.ownerId,
          buildingId: normalizedProperty.buildingId,
          rawProperty: p
        });
      }

      return normalizedProperty;
    });

    // Normalize units from API (PostgreSQL: unit_number, owner_contact_id, status)
    const normalizedUnits = units.map((u: any) => {
      const label = String(u.unitNumber ?? u.unit_number ?? u.name ?? '').trim() || u.id;
      return {
        id: u.id,
        name: label,
        unitNumber: (u.unitNumber ?? u.unit_number ?? label) || undefined,
        projectId: u.project_id || u.projectId || '',
        contactId: (u.contact_id ?? u.contactId ?? u.owner_contact_id ?? u.ownerContactId) || undefined,
        ownerContactId: (u.ownerContactId ?? u.owner_contact_id) || undefined,
        salePrice: (() => {
          const price = u.sale_price || u.salePrice;
          if (price == null) return undefined;
          return typeof price === 'number' ? price : parseFloat(String(price));
        })(),
        description: u.description || undefined,
        type: u.unit_type ?? u.type ?? u.unitType ?? undefined,
        size: u.size != null && u.size !== '' ? String(u.size) : undefined,
        area: (() => {
          const areaValue = u.area;
          if (areaValue == null) return undefined;
          return typeof areaValue === 'number' ? areaValue : parseFloat(String(areaValue));
        })(),
        floor: u.floor || undefined,
        status: (u.status as AppState['units'][0]['status']) || 'available',
        version: typeof u.version === 'number' ? u.version : undefined,
      };
    });

    // Normalize plan amenities from API (transform snake_case to camelCase)
    const normalizedPlanAmenities = planAmenities.map((a: any) => normalizePlanAmenityFromApiRow(a));

    // Normalize categories from API (snake_case + type casing — see normalizeCategoryFromApi)
    const normalizedCategories = categories.map((c: any) => normalizeCategoryFromApi(c));

    // Normalize project agreements from API (transform snake_case to camelCase)
    // The server returns snake_case fields, but the client expects camelCase
    const normalizedProjectAgreements = projectAgreements.map((pa: any) => ({
      id: pa.id,
      agreementNumber: pa.agreement_number || pa.agreementNumber || '',
      clientId: pa.client_id || pa.clientId || '',
      projectId: pa.project_id || pa.projectId || '',
      unitIds: (() => {
        const ids = pa.unit_ids || pa.unitIds;
        if (!ids) return [];
        if (Array.isArray(ids)) return ids;
        if (typeof ids === 'string') {
          try {
            return JSON.parse(ids);
          } catch {
            return [];
          }
        }
        return [];
      })(),
      listPrice: typeof pa.list_price === 'number' ? pa.list_price : (typeof pa.listPrice === 'number' ? pa.listPrice : parseFloat(pa.list_price || pa.listPrice || '0')),
      customerDiscount: typeof pa.customer_discount === 'number' ? pa.customer_discount : (typeof pa.customerDiscount === 'number' ? pa.customerDiscount : parseFloat(pa.customer_discount || pa.customerDiscount || '0')),
      floorDiscount: typeof pa.floor_discount === 'number' ? pa.floor_discount : (typeof pa.floorDiscount === 'number' ? pa.floorDiscount : parseFloat(pa.floor_discount || pa.floorDiscount || '0')),
      lumpSumDiscount: typeof pa.lump_sum_discount === 'number' ? pa.lump_sum_discount : (typeof pa.lumpSumDiscount === 'number' ? pa.lumpSumDiscount : parseFloat(pa.lump_sum_discount || pa.lumpSumDiscount || '0')),
      miscDiscount: typeof pa.misc_discount === 'number' ? pa.misc_discount : (typeof pa.miscDiscount === 'number' ? pa.miscDiscount : parseFloat(pa.misc_discount || pa.miscDiscount || '0')),
      sellingPrice: typeof pa.selling_price === 'number' ? pa.selling_price : (typeof pa.sellingPrice === 'number' ? pa.sellingPrice : parseFloat(pa.selling_price || pa.sellingPrice || '0')),
      rebateAmount: (() => {
        const amount = pa.rebate_amount || pa.rebateAmount;
        if (amount == null) return undefined;
        return typeof amount === 'number' ? amount : parseFloat(String(amount));
      })(),
      rebateBrokerId: pa.rebate_broker_id || pa.rebateBrokerId || undefined,
      issueDate: pa.issue_date || pa.issueDate || toLocalDateString(new Date()),
      description: pa.description || undefined,
      status: normalizeProjectAgreementStatus(pa.status),
      cancellationDetails: (() => {
        const details = pa.cancellation_details || pa.cancellationDetails;
        if (!details) return undefined;
        if (typeof details === 'string') {
          try {
            return JSON.parse(details);
          } catch {
            return undefined;
          }
        }
        if (typeof details === 'object') return details;
        return undefined;
      })(),
      listPriceCategoryId: pa.list_price_category_id || pa.listPriceCategoryId || undefined,
      customerDiscountCategoryId: pa.customer_discount_category_id || pa.customerDiscountCategoryId || undefined,
      floorDiscountCategoryId: pa.floor_discount_category_id || pa.floorDiscountCategoryId || undefined,
      lumpSumDiscountCategoryId: pa.lump_sum_discount_category_id || pa.lumpSumDiscountCategoryId || undefined,
      miscDiscountCategoryId: pa.misc_discount_category_id || pa.miscDiscountCategoryId || undefined,
      sellingPriceCategoryId: pa.selling_price_category_id || pa.sellingPriceCategoryId || undefined,
      rebateCategoryId: pa.rebate_category_id || pa.rebateCategoryId || undefined,
      userId: pa.user_id || pa.userId || undefined,
      createdAt: pa.created_at || pa.createdAt || undefined,
      updatedAt: pa.updated_at || pa.updatedAt || undefined,
      version: typeof pa.version === 'number' ? pa.version : undefined,
      installmentPlan: (() => {
        const ip = pa.installment_plan ?? pa.installmentPlan;
        if (ip == null) return undefined;
        if (typeof ip === 'object') return ip;
        if (typeof ip === 'string' && ip.trim()) {
          try {
            return JSON.parse(ip);
          } catch {
            return undefined;
          }
        }
        return undefined;
      })()
    }));

    const normalizedProjectReceivedAssets = (Array.isArray(projectReceivedAssetsRaw) ? projectReceivedAssetsRaw : []).map(
      (a: Record<string, unknown>) => normalizeProjectReceivedAssetFromApi(a)
    );

    const normalizedBills = bills.map((b: any) => normalizeBillFromApi(b));

    // Normalize invoices from API (transform snake_case to camelCase)
    // The server returns snake_case fields, but the client expects camelCase
    const normalizedInvoices = invoices.map((inv: any) => ({
      id: inv.id,
      invoiceNumber: inv.invoice_number || inv.invoiceNumber || `INV-${inv.id}`,
      contactId: inv.contact_id || inv.contactId || '',
      amount: typeof inv.amount === 'number' ? inv.amount : parseFloat(inv.amount || '0'),
      paidAmount: typeof inv.paid_amount === 'number' ? inv.paid_amount : (typeof inv.paidAmount === 'number' ? inv.paidAmount : parseFloat(inv.paid_amount || inv.paidAmount || '0')),
      status: inv.status || 'Unpaid',
      issueDate: parseStoredDateToYyyyMmDdInput(String(inv.issue_date || inv.issueDate || toLocalDateString(new Date()))),
      dueDate: (() => {
        const v = inv.due_date ?? inv.dueDate;
        if (v == null || String(v).trim() === '') return undefined;
        return parseStoredDateToYyyyMmDdInput(String(v));
      })(),
      invoiceType: inv.invoice_type || inv.invoiceType || 'Rental',
      description: inv.description || undefined,
      projectId: inv.project_id || inv.projectId || undefined,
      buildingId: inv.building_id || inv.buildingId || undefined,
      propertyId: inv.property_id || inv.propertyId || undefined,
      unitId: inv.unit_id || inv.unitId || undefined,
      categoryId: inv.category_id || inv.categoryId || undefined,
      agreementId: inv.agreement_id || inv.agreementId || undefined,
      securityDepositCharge: inv.security_deposit_charge !== undefined && inv.security_deposit_charge !== null
        ? (typeof inv.security_deposit_charge === 'number' ? inv.security_deposit_charge : (typeof inv.securityDepositCharge === 'number' ? inv.securityDepositCharge : parseFloat(inv.security_deposit_charge || inv.securityDepositCharge || '0')))
        : undefined,
      serviceCharges: inv.service_charges !== undefined && inv.service_charges !== null
        ? (typeof inv.service_charges === 'number' ? inv.service_charges : (typeof inv.serviceCharges === 'number' ? inv.serviceCharges : parseFloat(inv.service_charges || inv.serviceCharges || '0')))
        : undefined,
      rentalMonth: inv.rental_month || inv.rentalMonth || undefined,
      userId: inv.user_id || inv.userId || undefined,
      version: typeof inv.version === 'number' ? inv.version : undefined,
      deletedAt:
        inv.deletedAt != null || inv.deleted_at != null
          ? String(inv.deletedAt ?? inv.deleted_at)
          : undefined
    }));

    const normalizedSalesReturns = (Array.isArray(salesReturns) ? salesReturns : []).map((sr: Record<string, unknown>) =>
      normalizeSalesReturnFromApi(sr)
    );

    const normalizedContracts = (Array.isArray(contracts) ? contracts : []).map((c: Record<string, unknown>) =>
      normalizeContractFromApi(c)
    );

    // Normalize transactions from API (transform snake_case to camelCase)
    // The server returns snake_case fields, but the client expects camelCase
    const normalizedTransactions = transactions.map((t: any) => ({
      id: t.id,
      type: t.type,
      subtype: t.subtype || undefined,
      amount: typeof t.amount === 'number' ? t.amount : parseFloat(t.amount || '0'),
      date: t.date,
      description: t.description || undefined,
      accountId: t.account_id || t.accountId,
      fromAccountId: t.from_account_id || t.fromAccountId || undefined,
      toAccountId: t.to_account_id || t.toAccountId || undefined,
      categoryId: t.category_id || t.categoryId || undefined,
      contactId: t.contact_id || t.contactId || undefined,
      vendorId: t.vendor_id || t.vendorId || undefined,
      projectId: t.project_id || t.projectId || undefined,
      buildingId: t.building_id || t.buildingId || undefined,
      propertyId: t.property_id || t.propertyId || undefined,
      unitId: t.unit_id || t.unitId || undefined,
      invoiceId: t.invoice_id || t.invoiceId || undefined,
      billId: t.bill_id || t.billId || undefined,
      contractId: t.contract_id || t.contractId || undefined,
      agreementId: t.agreement_id || t.agreementId || undefined,
      batchId: t.batch_id || t.batchId || undefined,
      projectAssetId: t.project_asset_id || t.projectAssetId || undefined,
      ownerId: t.owner_id || t.ownerId || undefined,
      isSystem: t.is_system === true || t.is_system === 1 || t.isSystem === true || false,
      userId: t.user_id || t.userId || undefined,
      payslipId: t.payslip_id || t.payslipId || undefined,
      reference: t.reference || undefined,
      children: t.children || undefined,
      version: typeof t.version === 'number' ? t.version : t.version != null ? parseInt(String(t.version), 10) : undefined,
    }));

    // Normalize accounts from API (types: BANK vs Bank — see normalizeAccountTypeFromApi)
    const normalizedAccounts = accounts.map((a: any) => normalizeAccountFromApi(a));

    // Normalize contacts from API
    const normalizedContacts = contacts.map((c: any) => ({
      id: c.id,
      name: c.name || '',
      type: c.type,
      description: c.description || undefined,
      contactNo: c.contact_no || c.contactNo || undefined,
      companyName: c.company_name || c.companyName || undefined,
      address: c.address || undefined,
      userId: c.user_id || c.userId || undefined,
      version: typeof c.version === 'number' ? c.version : c.version != null ? parseInt(String(c.version), 10) : undefined,
      createdAt: c.created_at || c.createdAt || undefined,
      updatedAt: c.updated_at || c.updatedAt || undefined,
      isActive: c.isActive !== false && c.is_active !== false
    }));

    // Normalize vendors from API (transform snake_case to camelCase)
    const normalizedVendors = vendors.map((v: any) => ({
      id: v.id,
      name: v.name || '',
      description: v.description || undefined,
      contactNo: v.contact_no || v.contactNo || undefined,
      companyName: v.company_name || v.companyName || undefined,
      isActive: v.is_active ?? v.isActive ?? true,
      address: v.address || undefined,
      tenantId: v.tenant_id || v.tenantId || undefined,
      userId: v.user_id || v.userId || undefined,
      version: typeof v.version === 'number' ? v.version : v.version != null ? parseInt(String(v.version), 10) : undefined,
      createdAt: v.created_at || v.createdAt || undefined,
      updatedAt: v.updated_at || v.updatedAt || undefined
    }));

    // Normalize projects from API (PostgreSQL: location, project_type)
    const normalizedProjects = projects.map((p: any) => ({
      id: p.id,
      name: p.name || '',
      location: p.location ?? undefined,
      projectType: p.projectType ?? p.project_type ?? undefined,
      description: p.description || undefined,
      color: p.color || undefined,
      status: p.status || 'Active',
      version: typeof p.version === 'number' ? p.version : undefined,
      installmentConfig: (() => {
        const config = p.installment_config || p.installmentConfig;
        if (!config) return undefined;
        if (typeof config === 'string') {
          try {
            return JSON.parse(config);
          } catch {
            return undefined;
          }
        }
        return config;
      })(),
      pmConfig: (() => {
        const config = p.pm_config || p.pmConfig;
        if (!config) return undefined;
        if (typeof config === 'string') {
          try {
            return JSON.parse(config);
          } catch {
            return undefined;
          }
        }
        return config;
      })(),
    }));

    // Normalize buildings from API
    const normalizedBuildings = buildings.map((b: any) => ({
      id: b.id,
      name: b.name || '',
      description: b.description || undefined,
      color: b.color || undefined,
      version: typeof b.version === 'number' ? b.version : undefined,
    }));

    // Normalize budgets from API
    const normalizedBudgets = budgets.map((b: any) => ({
      id: b.id,
      categoryId: b.category_id || b.categoryId || '',
      amount: typeof b.amount === 'number' ? b.amount : parseFloat(String(b.amount || '0')),
      projectId: b.project_id || b.projectId || undefined,
      version: typeof b.version === 'number' ? b.version : undefined,
    }));

    // Normalize installment plans from API (transform snake_case to camelCase)
    const normalizedInstallmentPlans = installmentPlans.map((p: any) => normalizeInstallmentPlanFromApiRow(p));

    // Normalize rental agreements from API (transform snake_case to camelCase)
    const normalizedRentalAgreements = rentalAgreements.map((ra: any) => this.normalizeRentalAgreement(ra));

    const normalizedPersonalCategories = (Array.isArray(personalCategoriesRaw) ? personalCategoriesRaw : []).map(
      (c: Record<string, unknown>) => normalizePersonalCategoryFromApi(c)
    );
    const normalizedPersonalTransactions = (Array.isArray(personalTransactionsRaw) ? personalTransactionsRaw : []).map(
      (t: Record<string, unknown>) => normalizePersonalTransactionFromApi(t)
    );

    // Return partial state with API-loaded data
    // Other entities will remain from initial state or be loaded separately
    return {
      accounts: normalizedAccounts,
      contacts: normalizedContacts,
      transactions: normalizedTransactions,
      categories: normalizedCategories,
      projects: normalizedProjects,
      buildings: normalizedBuildings,
      properties: normalizedProperties,
      units: normalizedUnits,
      invoices: normalizedInvoices,
      bills: normalizedBills,
      budgets: normalizedBudgets,
      planAmenities: normalizedPlanAmenities || [],
      installmentPlans: normalizedInstallmentPlans,
      rentalAgreements: normalizedRentalAgreements,
      projectAgreements: normalizedProjectAgreements,
      projectReceivedAssets: normalizedProjectReceivedAssets,
      contracts: normalizedContracts,
      salesReturns: normalizedSalesReturns,
      quotations: quotations || [],
      documents: (documents || []).map((d: any) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        entityId: d.entity_id ?? d.entityId,
        entityType: d.entity_type ?? d.entityType,
        fileData: d.file_data ?? d.fileData,
        fileName: d.file_name ?? d.fileName,
        fileSize: d.file_size ?? d.fileSize,
        mimeType: d.mime_type ?? d.mimeType,
        uploadedAt: d.uploaded_at ?? d.uploadedAt,
        uploadedBy: d.uploaded_by ?? d.uploadedBy ?? d.user_id ?? d.userId,
      })),
      // Normalize recurring invoice templates from API (transform snake_case to camelCase)
      // The server returns snake_case fields, but the client expects camelCase
      // Ensure we always have an array (API may return [] or wrapped format)
      recurringInvoiceTemplates: (Array.isArray(recurringInvoiceTemplates) ? recurringInvoiceTemplates : []).map((t: any) => ({
        id: t.id,
        contactId: t.contact_id ?? t.contactId ?? '',
        propertyId: t.property_id ?? t.propertyId ?? '',
        buildingId: t.building_id ?? t.buildingId ?? '',
        amount: typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount ?? '0')),
        descriptionTemplate: t.description_template ?? t.descriptionTemplate ?? '',
        dayOfMonth: typeof t.day_of_month === 'number' ? t.day_of_month : parseInt(String(t.day_of_month ?? t.dayOfMonth ?? '1')),
        nextDueDate: (() => {
          const nd = t.next_due_date ?? t.nextDueDate;
          return nd ? parseStoredDateToYyyyMmDdInput(String(nd)) : '';
        })(),
        active: t.active === true || t.active === 1 || t.active === 'true',
        agreementId: t.agreement_id ?? t.agreementId ?? undefined,
        invoiceType: t.invoice_type ?? t.invoiceType ?? 'Rental',
        frequency: t.frequency ?? 'Monthly',
        autoGenerate: t.auto_generate === true || t.auto_generate === 1 || t.autoGenerate === true,
        maxOccurrences: t.max_occurrences ?? t.maxOccurrences ?? undefined,
        generatedCount: typeof t.generated_count === 'number' ? t.generated_count : (typeof t.generatedCount === 'number' ? t.generatedCount : parseInt(String(t.generated_count ?? t.generatedCount ?? '0'))),
        lastGeneratedDate: t.last_generated_date ?? t.lastGeneratedDate ?? undefined,
        deletedAt: t.deleted_at ?? t.deletedAt ?? undefined,
        version: typeof t.version === 'number' ? t.version : undefined,
      })).filter((t: any) => !t.deletedAt),
      pmCycleAllocations: (Array.isArray(pmCycleAllocations) ? pmCycleAllocations : []).map((p: any) =>
        normalizePMCycleAllocationFromApi(p)
      ),
      transactionLog: transactionLog || [],
      vendors: normalizedVendors || [],
      personalCategories: normalizedPersonalCategories.filter((c) => !c.deletedAt),
      personalTransactions: normalizedPersonalTransactions.filter((t) => !t.deletedAt),
      ...this.buildSettingsPartialFromFlat(appSettingsFlat),
    };
  }

  /**
   * Load contacts only (useful for targeted sync tests)
   */
  async loadContacts() {
    return this.contactsRepo.findAll();
  }

  /**
   * Load transactions only (targeted sync)
   */
  async loadTransactions() {
    return this.transactionsRepo.findAll();
  }

  /**
   * Save account to API
   */
  async saveAccount(account: Partial<AppState['accounts'][0]>): Promise<AppState['accounts'][0]> {
    // Always use POST endpoint - it handles upserts automatically
    const accountWithId = {
      ...account,
      id: account.id || `account_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing account (POST upsert): ${accountWithId.id} - ${accountWithId.name}`);
    const saved = await this.accountsRepo.create(accountWithId);

    // Normalize the response (server returns snake_case; account type may be UPPERCASE)
    return normalizeAccountFromApi(saved);
  }

  private normalizeVendorResponse(saved: any): Vendor {
    return {
      id: saved.id,
      name: saved.name || '',
      description: saved.description || undefined,
      contactNo: saved.contact_no || saved.contactNo || undefined,
      companyName: saved.company_name || saved.companyName || undefined,
      isActive: saved.is_active ?? saved.isActive ?? true,
      address: saved.address || undefined,
      userId: saved.user_id || saved.userId || undefined,
      version: typeof saved.version === 'number' ? saved.version : saved.version != null ? parseInt(String(saved.version), 10) : undefined,
      createdAt: saved.created_at || saved.createdAt || undefined,
      updatedAt: saved.updated_at || saved.updatedAt || undefined
    };
  }

  /** Create vendor (POST /vendors). */
  async saveVendor(vendor: Partial<Vendor>): Promise<Vendor> {
    try {
      const saved: any = await this.vendorsRepo.create(vendor);
      return this.normalizeVendorResponse(saved);
    } catch (error) {
      console.error('❌ saveVendor failed:', error);
      throw error;
    }
  }

  /** Update vendor (PUT /vendors/:id). */
  async updateVendor(id: string, vendor: Partial<Vendor>): Promise<Vendor> {
    try {
      const saved: any = await this.vendorsRepo.update(id, vendor);
      return this.normalizeVendorResponse(saved);
    } catch (error) {
      console.error('❌ updateVendor failed:', error);
      throw error;
    }
  }

  /** Soft-delete vendor (DELETE /vendors/:id). */
  async deleteVendor(id: string, version?: number): Promise<void> {
    return this.vendorsRepo.delete(id, version);
  }

  /**
   * Save recurring invoice template to API
   */
  async saveRecurringTemplate(template: Partial<RecurringInvoiceTemplate>): Promise<RecurringInvoiceTemplate> {
    const templateWithId = {
      ...template,
      id: template.id || `recurring_template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing recurring template (POST upsert): ${templateWithId.id}`);
    const saved: any = await this.recurringInvoiceTemplatesRepo.create(templateWithId);
    return {
      id: saved.id,
      contactId: saved.contactId ?? saved.contact_id ?? '',
      propertyId: saved.propertyId ?? saved.property_id ?? '',
      buildingId: saved.buildingId ?? saved.building_id ?? '',
      amount: typeof saved.amount === 'number' ? saved.amount : parseFloat(String(saved.amount ?? '0')),
      descriptionTemplate: saved.descriptionTemplate ?? saved.description_template ?? '',
      dayOfMonth: typeof saved.dayOfMonth === 'number' ? saved.dayOfMonth : parseInt(String(saved.dayOfMonth ?? saved.day_of_month ?? '1'), 10),
      nextDueDate: saved.nextDueDate ?? saved.next_due_date
        ? parseStoredDateToYyyyMmDdInput(String(saved.nextDueDate ?? saved.next_due_date))
        : '',
      active: saved.active === true || saved.active === 1,
      agreementId: saved.agreementId ?? saved.agreement_id ?? undefined,
      invoiceType: saved.invoiceType ?? saved.invoice_type ?? 'Rental',
      frequency: saved.frequency ?? 'Monthly',
      autoGenerate: saved.autoGenerate === true || saved.auto_generate === true,
      maxOccurrences: saved.maxOccurrences ?? saved.max_occurrences ?? undefined,
      generatedCount: typeof saved.generatedCount === 'number' ? saved.generatedCount : parseInt(String(saved.generated_count ?? saved.generatedCount ?? '0'), 10),
      lastGeneratedDate: saved.lastGeneratedDate ?? saved.last_generated_date ?? undefined,
      deletedAt: saved.deletedAt ?? saved.deleted_at ?? undefined,
      version: typeof saved.version === 'number' ? saved.version : undefined,
    };
  }

  /**
   * Delete recurring invoice template from API
   */
  async deleteRecurringTemplate(id: string): Promise<void> {
    return this.recurringInvoiceTemplatesRepo.delete(id);
  }

  /**
   * Delete account from API
   */
  async deleteAccount(id: string): Promise<void> {
    return this.accountsRepo.delete(id);
  }

  /**
   * Save contact to API
   */
  async saveContact(contact: Partial<AppState['contacts'][0]>): Promise<AppState['contacts'][0]> {
    logger.logCategory('sync', '💾 AppStateApiService.saveContact called:', {
      id: contact.id,
      name: contact.name,
      type: contact.type,
      isUpdate: !!contact.id
    });

    // Validate required fields
    if (!contact.name) {
      const error = new Error('Contact name is required');
      logger.errorCategory('sync', '❌ AppStateApiService.saveContact validation failed: name missing');
      throw error;
    }
    if (!contact.type) {
      const error = new Error('Contact type is required');
      logger.errorCategory('sync', '❌ AppStateApiService.saveContact validation failed: type missing');
      throw error;
    }

    try {
      let saved: any;

      if (contact.id) {
        // Use PUT endpoint for updates
        logger.logCategory('sync', `💾 Updating contact (PUT): ${contact.id} - ${contact.name}`);
        saved = await this.contactsRepo.update(contact.id, contact);
        logger.logCategory('sync', `✅ Contact updated successfully: ${saved.name} (${saved.id})`);
      } else {
        // Use POST endpoint for new contacts
        const contactWithId = {
          ...contact,
          id: `contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };
        logger.logCategory('sync', `💾 Creating contact (POST): ${contactWithId.id} - ${contactWithId.name}`);
        saved = await this.contactsRepo.create(contactWithId);
        logger.logCategory('sync', `✅ Contact created successfully: ${saved.name} (${saved.id})`);
      }

      // Normalize the response
      const normalized = {
        id: saved.id,
        name: saved.name || '',
        type: saved.type,
        description: saved.description || undefined,
        contactNo: (saved as any).contact_no || saved.contactNo || undefined,
        companyName: (saved as any).company_name || saved.companyName || undefined,
        address: saved.address || undefined,
        userId: (saved as any).user_id || saved.userId || undefined,
        createdAt: (saved as any).created_at || saved.createdAt || undefined,
        updatedAt: (saved as any).updated_at || saved.updatedAt || undefined
      };

      return normalized;
    } catch (error: any) {
      logger.errorCategory('sync', '❌ AppStateApiService.saveContact failed:', {
        error: error,
        errorMessage: error?.message || error?.error || 'Unknown error',
        status: error?.status,
        contact: {
          id: contact.id,
          name: contact.name,
          type: contact.type
        }
      });
      throw error;
    }
  }

  /**
   * Delete contact from API
   */
  async deleteContact(id: string): Promise<void> {
    return this.contactsRepo.delete(id);
  }

  /**
   * Save transaction to API
   */
  async saveTransaction(transaction: Partial<AppState['transactions'][0]>): Promise<AppState['transactions'][0]> {
    // Always use POST endpoint - it handles upserts automatically
    const transactionWithId = {
      ...transaction,
      id: transaction.id || `transaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing transaction (POST upsert): ${transactionWithId.id}`);
    const saved = await this.transactionsRepo.create(transactionWithId);

    // Normalize the response (server returns snake_case, client expects camelCase)
    const sv = saved as any;
    return {
      id: saved.id,
      type: saved.type,
      subtype: sv.subtype || saved.subtype || undefined,
      amount: typeof saved.amount === 'number' ? saved.amount : parseFloat(saved.amount || '0'),
      date: saved.date,
      description: saved.description || undefined,
      accountId: sv.account_id || saved.accountId,
      fromAccountId: sv.from_account_id || saved.fromAccountId || undefined,
      toAccountId: sv.to_account_id || saved.toAccountId || undefined,
      categoryId: sv.category_id || saved.categoryId || undefined,
      contactId: sv.contact_id || saved.contactId || undefined,
      vendorId: sv.vendor_id || saved.vendorId || undefined,
      projectId: sv.project_id || saved.projectId || undefined,
      buildingId: sv.building_id || saved.buildingId || undefined,
      propertyId: sv.property_id || saved.propertyId || undefined,
      unitId: sv.unit_id || saved.unitId || undefined,
      invoiceId: sv.invoice_id || saved.invoiceId || undefined,
      billId: sv.bill_id || saved.billId || undefined,
      contractId: sv.contract_id || saved.contractId || undefined,
      agreementId: sv.agreement_id || saved.agreementId || undefined,
      batchId: sv.batch_id || saved.batchId || undefined,
      projectAssetId: sv.project_asset_id || saved.projectAssetId || undefined,
      ownerId: sv.owner_id || saved.ownerId || undefined,
      isSystem: sv.is_system === true || sv.is_system === 1 || saved.isSystem === true || false,
      payslipId: sv.payslip_id || saved.payslipId || undefined,
      reference: saved.reference || undefined,
      children: saved.children || undefined,
      version: typeof sv.version === 'number' ? sv.version : sv.version != null ? parseInt(String(sv.version), 10) : undefined,
    };
  }

  /**
   * Delete transaction from API
   */
  async deleteTransaction(id: string): Promise<void> {
    return this.transactionsRepo.delete(id);
  }

  /**
   * Save category to API
   */
  async saveCategory(category: Partial<AppState['categories'][0]>): Promise<AppState['categories'][0]> {
    // Always use POST endpoint - it handles upserts automatically
    const categoryWithId = {
      ...category,
      id: category.id || `category_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing category (POST upsert): ${categoryWithId.id} - ${categoryWithId.name}`);
    const saved = await this.categoriesRepo.create(categoryWithId);

    return normalizeCategoryFromApi(saved);
  }

  /**
   * Delete category from API
   */
  async deleteCategory(id: string): Promise<void> {
    return this.categoriesRepo.delete(id);
  }

  /**
   * Save project to API (POST — create)
   */
  async saveProject(project: Partial<AppState['projects'][0]>): Promise<AppState['projects'][0]> {
    const projectWithId = {
      ...project,
      id: project.id || `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing project (POST): ${projectWithId.id} - ${projectWithId.name}`);
    const saved = await this.projectsRepo.create(projectWithId);
    return this.normalizeProjectApiResponse(saved);
  }

  /**
   * Update project on API (PUT)
   */
  async updateProject(id: string, project: Partial<AppState['projects'][0]>): Promise<AppState['projects'][0]> {
    logger.logCategory('sync', `💾 Syncing project (PUT): ${id}`);
    const saved = await this.projectsRepo.update(id, { ...project, id });
    return this.normalizeProjectApiResponse(saved);
  }

  private normalizeProjectApiResponse(saved: any): AppState['projects'][0] {
    return {
      id: saved.id,
      name: saved.name || '',
      location: saved.location ?? (saved as any).location,
      projectType: saved.projectType ?? (saved as any).project_type,
      description: saved.description || undefined,
      color: saved.color || undefined,
      status: (saved as any).status || saved.status || 'Active',
      version: typeof (saved as any).version === 'number' ? (saved as any).version : typeof saved.version === 'number' ? saved.version : undefined,
      installmentConfig: (() => {
        const config = (saved as any).installment_config || saved.installmentConfig;
        if (!config) return undefined;
        if (typeof config === 'string') {
          try {
            return JSON.parse(config);
          } catch {
            return undefined;
          }
        }
        return config;
      })(),
      pmConfig: (() => {
        const config = (saved as any).pm_config || saved.pmConfig;
        if (!config) return undefined;
        if (typeof config === 'string') {
          try {
            return JSON.parse(config);
          } catch {
            return undefined;
          }
        }
        return config;
      })(),
    };
  }

  /**
   * Delete project from API
   */
  async deleteProject(id: string): Promise<void> {
    return this.projectsRepo.delete(id);
  }

  /**
   * Save building to API
   */
  async saveBuilding(
    building: Partial<AppState['buildings'][0]> & { version?: number }
  ): Promise<AppState['buildings'][0] & { version?: number }> {
    const buildingWithId = {
      ...building,
      id: building.id || `building_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing building (POST): ${buildingWithId.id} - ${buildingWithId.name}`);
    const saved = await this.buildingsRepo.create(buildingWithId);

    return {
      id: saved.id,
      name: saved.name || '',
      description: saved.description || undefined,
      color: saved.color || undefined,
      version: typeof (saved as any).version === 'number' ? (saved as any).version : undefined,
    };
  }

  /**
   * Update building on API (PUT). Required for LAN/PostgreSQL after create.
   */
  async updateBuilding(
    id: string,
    building: Partial<AppState['buildings'][0]> & { version?: number }
  ): Promise<AppState['buildings'][0] & { version?: number }> {
    logger.logCategory('sync', `💾 Syncing building (PUT): ${id}`);
    const saved = await this.buildingsRepo.update(id, { ...building, id });
    return {
      id: saved.id,
      name: saved.name || '',
      description: saved.description || undefined,
      color: saved.color || undefined,
      version: typeof (saved as any).version === 'number' ? (saved as any).version : undefined,
    };
  }

  /**
   * Delete building from API
   */
  async deleteBuilding(id: string): Promise<void> {
    return this.buildingsRepo.delete(id);
  }

  /**
   * Save property to API
   */
  async saveProperty(
    property: Partial<AppState['properties'][0]> & { version?: number }
  ): Promise<AppState['properties'][0] & { version?: number }> {
    const propertyWithId = {
      ...property,
      id: property.id || `property_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing property (POST): ${propertyWithId.id} - ${propertyWithId.name}`);
    const saved = await this.propertiesRepo.create(propertyWithId);

    return {
      id: saved.id,
      name: saved.name || '',
      ownerId: (saved as any).owner_id || saved.ownerId || '',
      buildingId: (saved as any).building_id || saved.buildingId || '',
      description: saved.description || undefined,
      monthlyServiceCharge: (() => {
        const charge = (saved as any).monthly_service_charge ?? saved.monthlyServiceCharge;
        if (charge == null) return undefined;
        return typeof charge === 'number' ? charge : parseFloat(String(charge));
      })(),
      version: typeof (saved as any).version === 'number' ? (saved as any).version : undefined,
    };
  }

  /**
   * Update property on API (PUT).
   */
  async updateProperty(
    id: string,
    property: Partial<AppState['properties'][0]> & { version?: number }
  ): Promise<AppState['properties'][0] & { version?: number }> {
    logger.logCategory('sync', `💾 Syncing property (PUT): ${id}`);
    const saved = await this.propertiesRepo.update(id, { ...property, id });
    return {
      id: saved.id,
      name: saved.name || '',
      ownerId: (saved as any).owner_id || saved.ownerId || '',
      buildingId: (saved as any).building_id || saved.buildingId || '',
      description: saved.description || undefined,
      monthlyServiceCharge: (() => {
        const charge = (saved as any).monthly_service_charge ?? saved.monthlyServiceCharge;
        if (charge == null) return undefined;
        return typeof charge === 'number' ? charge : parseFloat(String(charge));
      })(),
      version: typeof (saved as any).version === 'number' ? (saved as any).version : undefined,
    };
  }

  /**
   * Delete property from API
   */
  async deleteProperty(id: string): Promise<void> {
    return this.propertiesRepo.delete(id);
  }

  /**
   * Save unit to API (POST — create)
   */
  async saveUnit(unit: Partial<AppState['units'][0]>): Promise<AppState['units'][0]> {
    const label = String(unit.name ?? '').trim();
    const unitWithId = {
      ...unit,
      id: unit.id || `unit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      // API pickBody prefers unitNumber over name; keep both aligned for unit_number column.
      ...(label ? { name: label, unitNumber: label } : {}),
    };
    logger.logCategory('sync', `💾 Syncing unit (POST): ${unitWithId.id} - ${unitWithId.name}`);
    const saved = await this.unitsRepo.create(unitWithId);
    return this.normalizeUnitApiResponse(saved);
  }

  /**
   * Update unit on API (PUT)
   */
  async updateUnit(id: string, unit: Partial<AppState['units'][0]>): Promise<AppState['units'][0]> {
    logger.logCategory('sync', `💾 Syncing unit (PUT): ${id}`);
    const label = String(unit.name ?? '').trim();
    const body = {
      ...unit,
      id,
      ...(label ? { name: label, unitNumber: label } : {}),
    };
    const saved = await this.unitsRepo.update(id, body);
    return this.normalizeUnitApiResponse(saved);
  }

  private normalizeUnitApiResponse(saved: any): AppState['units'][0] {
    const label = String(saved.unitNumber ?? saved.unit_number ?? saved.name ?? '').trim() || saved.id;
    return {
      id: saved.id,
      name: label,
      unitNumber: saved.unitNumber ?? saved.unit_number ?? label,
      projectId: (saved as any).project_id || saved.projectId || '',
      contactId: (saved as any).contact_id ?? saved.contactId ?? saved.ownerContactId ?? saved.owner_contact_id ?? undefined,
      ownerContactId: saved.ownerContactId ?? saved.owner_contact_id ?? undefined,
      salePrice: (() => {
        const price = (saved as any).sale_price ?? saved.salePrice;
        if (price == null) return undefined;
        return typeof price === 'number' ? price : parseFloat(String(price));
      })(),
      description: saved.description || undefined,
      type: (saved as any).unit_type ?? saved.type ?? saved.unitType ?? undefined,
      size: saved.size != null && saved.size !== '' ? String(saved.size) : undefined,
      area: (() => {
        const areaValue = (saved as any).area ?? saved.area;
        if (areaValue == null) return undefined;
        return typeof areaValue === 'number' ? areaValue : parseFloat(String(areaValue));
      })(),
      floor: (saved as any).floor || saved.floor || undefined,
      status: (saved.status as AppState['units'][0]['status']) || 'available',
      version: typeof (saved as any).version === 'number' ? (saved as any).version : typeof saved.version === 'number' ? saved.version : undefined,
    };
  }

  /**
   * Delete unit from API
   */
  async deleteUnit(id: string): Promise<void> {
    return this.unitsRepo.delete(id);
  }

  /**
   * Save plan amenity to API
   */
  async savePlanAmenity(amenity: Partial<AppState['planAmenities'][0]>): Promise<AppState['planAmenities'][0]> {
    const amenityWithId = {
      ...amenity,
      id: amenity.id || `amenity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing plan amenity (POST upsert): ${amenityWithId.id} - ${amenityWithId.name}`);
    const saved = await this.planAmenitiesRepo.save(amenityWithId);
    return normalizePlanAmenityFromApiRow(saved) as AppState['planAmenities'][0];
  }

  /**
   * Delete plan amenity from API
   */
  async deletePlanAmenity(id: string, version?: number): Promise<void> {
    return this.planAmenitiesRepo.delete(id, version);
  }


  /**
   * Save installment plan to API
   */
  async saveInstallmentPlan(plan: Partial<AppState['installmentPlans'][0]>): Promise<AppState['installmentPlans'][0]> {
    // Always use POST endpoint - it handles upserts automatically
    const planWithId = {
      ...plan,
      id: plan.id || `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing installment plan (POST upsert): ${planWithId.id}`);
    const saved = await this.installmentPlansRepo.create(planWithId);
    return normalizeInstallmentPlanFromApiRow(saved) as AppState['installmentPlans'][0];
  }

  /**
   * Delete installment plan from API
   */
  async deleteInstallmentPlan(id: string, version?: number): Promise<void> {
    return this.installmentPlansRepo.delete(id, version);
  }

  /**
   * Map API invoice row to app state shape (POST response or GET after conflict).
   */
  private invoiceUpsertResponseToAppShape(saved: Invoice): AppState['invoices'][0] {
    return {
      id: saved.id,
      invoiceNumber: (saved as any).invoice_number || saved.invoiceNumber || `INV-${saved.id}`,
      contactId: (saved as any).contact_id || saved.contactId || '',
      amount: typeof saved.amount === 'number' ? saved.amount : parseFloat(String(saved.amount || '0')),
      paidAmount:
        typeof (saved as any).paid_amount === 'number'
          ? (saved as any).paid_amount
          : typeof saved.paidAmount === 'number'
            ? saved.paidAmount
            : parseFloat(String((saved as any).paid_amount ?? saved.paidAmount ?? '0')),
      status: (saved as any).status || saved.status || InvoiceStatus.UNPAID,
      issueDate: parseStoredDateToYyyyMmDdInput(
        String((saved as any).issue_date || saved.issueDate || toLocalDateString(new Date()))
      ),
      dueDate: (() => {
        const v = (saved as any).due_date ?? saved.dueDate;
        if (v == null || String(v).trim() === '') return undefined;
        return parseStoredDateToYyyyMmDdInput(String(v));
      })(),
      invoiceType: (saved as any).invoice_type || saved.invoiceType || 'Rental',
      description: saved.description || undefined,
      projectId: (saved as any).project_id || saved.projectId || undefined,
      buildingId: (saved as any).building_id || saved.buildingId || undefined,
      propertyId: (saved as any).property_id || saved.propertyId || undefined,
      unitId: (saved as any).unit_id || saved.unitId || undefined,
      categoryId: (saved as any).category_id || saved.categoryId || undefined,
      agreementId: (saved as any).agreement_id || saved.agreementId || undefined,
      securityDepositCharge:
        (saved as any).security_deposit_charge !== undefined && (saved as any).security_deposit_charge !== null
          ? typeof (saved as any).security_deposit_charge === 'number'
            ? (saved as any).security_deposit_charge
            : parseFloat(String((saved as any).security_deposit_charge || '0'))
          : saved.securityDepositCharge !== undefined && saved.securityDepositCharge !== null
            ? saved.securityDepositCharge
            : undefined,
      serviceCharges:
        (saved as any).service_charges !== undefined && (saved as any).service_charges !== null
          ? typeof (saved as any).service_charges === 'number'
            ? (saved as any).service_charges
            : parseFloat(String((saved as any).service_charges || '0'))
          : saved.serviceCharges !== undefined && saved.serviceCharges !== null
            ? saved.serviceCharges
            : undefined,
      rentalMonth: (saved as any).rental_month || saved.rentalMonth || undefined,
      userId: (saved as any).user_id || saved.userId || undefined,
      version: typeof (saved as any).version === 'number' ? (saved as any).version : undefined,
    };
  }

  /**
   * Save invoice to API
   */
  async saveInvoice(invoice: Partial<AppState['invoices'][0]>): Promise<AppState['invoices'][0]> {
    // Always use POST endpoint - it handles upserts automatically
    const invoiceWithId = {
      ...invoice,
      id: invoice.id || `invoice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
    logger.logCategory('sync', `💾 Syncing invoice (POST upsert): ${invoiceWithId.id} - ${invoiceWithId.invoiceNumber}`);
    try {
      const saved = await this.invoicesRepo.create(invoiceWithId);
      return this.invoiceUpsertResponseToAppShape(saved as Invoice);
    } catch (err: unknown) {
      const e = err as { status?: number; code?: string };
      const id = invoiceWithId.id;
      if (
        id &&
        e?.status === 409 &&
        (e?.code === 'CONFLICT' || e?.code === 'VERSION_CONFLICT' || e?.code === 'LOCK_HELD')
      ) {
        logger.logCategory(
          'sync',
          `↩️ Invoice ${id} conflict/lock after payment/sync — refetching server row (paid_amount reconciled from ledger)`
        );
        const fresh = await this.invoicesRepo.findById(id);
        if (fresh) return this.invoiceUpsertResponseToAppShape(fresh);
      }
      throw err;
    }
  }

  /**
   * Load invoice from API (GET). Use after saving/deleting a linked transaction: the server
   * recalculates paid_amount and bumps version, so POSTing a client-built row would 409 and
   * trigger a spurious conflict modal via the HTTP client.
   */
  async fetchInvoice(id: string): Promise<AppState['invoices'][0] | null> {
    const fresh = await this.invoicesRepo.findById(id);
    return fresh ? this.invoiceUpsertResponseToAppShape(fresh as Invoice) : null;
  }

  /**
   * Load bill from API (GET). Same rationale as fetchInvoice for bill-linked transactions.
   */
  async fetchBill(id: string): Promise<AppState['bills'][0] | null> {
    const fresh = await this.billsRepo.findById(id);
    return fresh ? normalizeBillFromApi(fresh) : null;
  }

  /**
   * Delete invoice from API
   */
  async deleteInvoice(id: string, version?: number): Promise<void> {
    return this.invoicesRepo.delete(id, version);
  }

  /** Upsert project received asset (POST). */
  async saveProjectReceivedAsset(asset: Partial<ProjectReceivedAsset>): Promise<ProjectReceivedAsset> {
    const withId = {
      ...asset,
      id: asset.id || `pra_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    };
    logger.logCategory('sync', `💾 Syncing project received asset (POST upsert): ${withId.id}`);
    const saved = await this.projectReceivedAssetsRepo.create(withId);
    return saved;
  }

  async deleteProjectReceivedAsset(id: string, version?: number): Promise<void> {
    return this.projectReceivedAssetsRepo.delete(id, version);
  }

  /**
   * Save bill to API
   */
  async saveBill(bill: Partial<AppState['bills'][0]>): Promise<AppState['bills'][0]> {
    // Always use POST endpoint - it handles upserts automatically
    const billWithId = {
      ...bill,
      id: bill.id || `bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
    logger.logCategory('sync', `💾 Syncing bill (POST upsert): ${billWithId.id} - ${billWithId.billNumber}`);
    try {
      const saved = await this.billsRepo.create(billWithId);
      return normalizeBillFromApi(saved);
    } catch (err: unknown) {
      const e = err as { status?: number; code?: string };
      const id = billWithId.id;
      if (
        id &&
        e?.status === 409 &&
        (e?.code === 'CONFLICT' || e?.code === 'VERSION_CONFLICT')
      ) {
        logger.logCategory(
          'sync',
          `↩️ Bill ${id} version conflict — refetching server row`
        );
        const fresh = await this.billsRepo.findById(id);
        if (fresh) return normalizeBillFromApi(fresh);
      }
      throw err;
    }
  }

  /**
   * Delete bill from API
   */
  async deleteBill(id: string): Promise<void> {
    return this.billsRepo.delete(id);
  }

  /**
   * Save budget to API
   */
  async saveBudget(budget: Partial<AppState['budgets'][0]>): Promise<AppState['budgets'][0]> {
    // Always use POST endpoint - it handles upserts automatically
    const budgetWithId = {
      ...budget,
      id: budget.id || `budget_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing budget (POST upsert): ${budgetWithId.id} - Category: ${budgetWithId.categoryId}`);
    const saved = await this.budgetsRepo.create(budgetWithId);

    // Normalize the response
    const sv = saved as Record<string, unknown>;
    return {
      id: saved.id,
      categoryId: (sv.category_id as string) || (saved as { categoryId?: string }).categoryId || '',
      amount: typeof saved.amount === 'number' ? saved.amount : parseFloat(String(saved.amount || '0')),
      projectId: (sv.project_id as string) || (saved as { projectId?: string }).projectId || undefined,
      version: typeof sv.version === 'number' ? sv.version : undefined,
    };
  }

  /**
   * Delete budget from API
   */
  async deleteBudget(id: string, version?: number): Promise<void> {
    return this.budgetsRepo.delete(id, version);
  }

  /**
   * Save rental agreement to API
   */
  async saveRentalAgreement(agreement: Partial<AppState['rentalAgreements'][0]>): Promise<AppState['rentalAgreements'][0]> {
    // Always use POST endpoint - it handles upserts automatically
    const agreementWithId = {
      ...agreement,
      id: agreement.id || `rental_agreement_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing rental agreement (POST upsert): ${agreementWithId.id} - ${agreementWithId.agreementNumber}`);
    const saved = await this.rentalAgreementsRepo.create(agreementWithId);
    return this.normalizeRentalAgreement(saved);
  }

  /**
   * Helper to normalize rental agreement data from API
   */
  private normalizeRentalAgreement(ra: any): AppState['rentalAgreements'][0] {
    return {
      id: ra.id,
      agreementNumber: ra.agreement_number || ra.agreementNumber || '',
      // Contact ID (the tenant contact person in rental management)
      // Backward compatibility: also check tenantId for old API responses
      contactId: ra.contactId || ra.contact_id || ra.tenantId || '',
      propertyId: ra.property_id || ra.propertyId || '',
      startDate: ra.start_date || ra.startDate || '',
      endDate: ra.end_date || ra.endDate || '',
      monthlyRent: typeof ra.monthly_rent === 'number' ? ra.monthly_rent : (typeof ra.monthlyRent === 'number' ? ra.monthlyRent : parseFloat(ra.monthly_rent || ra.monthlyRent || '0')),
      rentDueDate: typeof ra.rent_due_date === 'number' ? ra.rent_due_date : (typeof ra.rentDueDate === 'number' ? ra.rentDueDate : parseInt(ra.rent_due_date || ra.rentDueDate || '1')),
      status: ra.status || 'Active',
      description: ra.description || undefined,
      securityDeposit: (() => {
        const deposit = ra.security_deposit ?? ra.securityDeposit;
        if (deposit == null) return undefined;
        return typeof deposit === 'number' ? deposit : parseFloat(String(deposit));
      })(),
      brokerId: ra.broker_id || ra.brokerId || undefined,
      brokerFee: (() => {
        const fee = ra.broker_fee ?? ra.brokerFee;
        if (fee == null) return undefined;
        return typeof fee === 'number' ? fee : parseFloat(String(fee));
      })(),
      ownerId: ra.owner_id || ra.ownerId || undefined
    };
  }

  /**
   * Delete rental agreement from API
   */
  async deleteRentalAgreement(id: string): Promise<void> {
    return this.rentalAgreementsRepo.delete(id);
  }

  /**
   * Save project agreement to API
   */
  async saveProjectAgreement(agreement: Partial<AppState['projectAgreements'][0]>): Promise<AppState['projectAgreements'][0]> {
    // Always use POST endpoint - it handles upserts automatically
    const agreementWithId = {
      ...agreement,
      id: agreement.id || `project_agreement_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing project agreement (POST upsert): ${agreementWithId.id} - ${agreementWithId.agreementNumber}`);
    const saved = await this.projectAgreementsRepo.create(agreementWithId);

    // Normalize the response (server returns snake_case, client expects camelCase)
    return {
      id: saved.id,
      agreementNumber: (saved as any).agreement_number || saved.agreementNumber || '',
      clientId: (saved as any).client_id || saved.clientId || '',
      projectId: (saved as any).project_id || saved.projectId || '',
      unitIds: (() => {
        const ids = (saved as any).unit_ids || saved.unitIds;
        if (!ids) return [];
        if (Array.isArray(ids)) return ids;
        if (typeof ids === 'string') {
          try {
            return JSON.parse(ids);
          } catch {
            return [];
          }
        }
        return [];
      })(),
      listPrice: typeof (saved as any).list_price === 'number' ? (saved as any).list_price : (typeof saved.listPrice === 'number' ? saved.listPrice : parseFloat((saved as any).list_price || saved.listPrice || '0')),
      customerDiscount: typeof (saved as any).customer_discount === 'number' ? (saved as any).customer_discount : (typeof saved.customerDiscount === 'number' ? saved.customerDiscount : parseFloat((saved as any).customer_discount || saved.customerDiscount || '0')),
      floorDiscount: typeof (saved as any).floor_discount === 'number' ? (saved as any).floor_discount : (typeof saved.floorDiscount === 'number' ? saved.floorDiscount : parseFloat((saved as any).floor_discount || saved.floorDiscount || '0')),
      lumpSumDiscount: typeof (saved as any).lump_sum_discount === 'number' ? (saved as any).lump_sum_discount : (typeof saved.lumpSumDiscount === 'number' ? saved.lumpSumDiscount : parseFloat((saved as any).lump_sum_discount || saved.lumpSumDiscount || '0')),
      miscDiscount: typeof (saved as any).misc_discount === 'number' ? (saved as any).misc_discount : (typeof saved.miscDiscount === 'number' ? saved.miscDiscount : parseFloat((saved as any).misc_discount || saved.miscDiscount || '0')),
      sellingPrice: typeof (saved as any).selling_price === 'number' ? (saved as any).selling_price : (typeof saved.sellingPrice === 'number' ? saved.sellingPrice : parseFloat((saved as any).selling_price || saved.sellingPrice || '0')),
      rebateAmount: (() => {
        const amount = (saved as any).rebate_amount ?? saved.rebateAmount;
        if (amount == null) return undefined;
        return typeof amount === 'number' ? amount : parseFloat(String(amount));
      })(),
      rebateBrokerId: (saved as any).rebate_broker_id || saved.rebateBrokerId || undefined,
      issueDate: (saved as any).issue_date || saved.issueDate || toLocalDateString(new Date()),
      description: saved.description || undefined,
      status: (saved as any).status || saved.status || ProjectAgreementStatus.ACTIVE,
      cancellationDetails: (() => {
        const details = (saved as any).cancellation_details || saved.cancellationDetails;
        if (!details) return undefined;
        if (typeof details === 'string') {
          try {
            return JSON.parse(details);
          } catch {
            return undefined;
          }
        }
        if (typeof details === 'object') return details;
        return undefined;
      })(),
      listPriceCategoryId: (saved as any).list_price_category_id || saved.listPriceCategoryId || undefined,
      customerDiscountCategoryId: (saved as any).customer_discount_category_id || saved.customerDiscountCategoryId || undefined,
      floorDiscountCategoryId: (saved as any).floor_discount_category_id || saved.floorDiscountCategoryId || undefined,
      lumpSumDiscountCategoryId: (saved as any).lump_sum_discount_category_id || saved.lumpSumDiscountCategoryId || undefined,
      miscDiscountCategoryId: (saved as any).misc_discount_category_id || saved.miscDiscountCategoryId || undefined,
      sellingPriceCategoryId: (saved as any).selling_price_category_id || saved.sellingPriceCategoryId || undefined,
      rebateCategoryId: (saved as any).rebate_category_id || saved.rebateCategoryId || undefined
    };
  }

  /**
   * Delete project agreement from API
   */
  async deleteProjectAgreement(id: string): Promise<void> {
    return this.projectAgreementsRepo.delete(id);
  }

  /**
   * Save contract to API
   */
  async saveContract(contract: Partial<AppState['contracts'][0]>): Promise<AppState['contracts'][0]> {
    const contractWithId = {
      ...contract,
      id: contract.id || `contract_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing contract (POST upsert): ${contractWithId.id} - ${contractWithId.contractNumber}`);
    return this.contractsRepo.create(contractWithId);
  }

  /**
   * Delete contract from API
   */
  async deleteContract(id: string, version?: number): Promise<void> {
    return this.contractsRepo.delete(id, version);
  }

  /**
   * Save quotation to API
   */
  async saveQuotation(quotation: Partial<Quotation>): Promise<Quotation> {
    // Always use POST endpoint - it handles upserts automatically
    const quotationWithId = {
      ...quotation,
      id: quotation.id || `quotation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    } as Quotation;
    logger.logCategory('sync', `💾 Syncing quotation (POST upsert): ${quotationWithId.id} - ${quotationWithId.name}`);
    return this.quotationsRepo.create(quotationWithId);
  }

  /**
   * Delete quotation from API
   */
  async deleteQuotation(id: string): Promise<void> {
    return this.quotationsRepo.delete(id);
  }

  /**
   * Save document to API
   */
  async saveDocument(document: Partial<Document>): Promise<Document> {
    // Always use POST endpoint - it handles upserts automatically
    const documentWithId = {
      ...document,
      id: document.id || `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    } as Document;
    logger.logCategory('sync', `💾 Syncing document (POST upsert): ${documentWithId.id} - ${documentWithId.name}`);
    return this.documentsRepo.create(documentWithId);
  }

  /**
   * Delete document from API
   */
  async deleteDocument(id: string): Promise<void> {
    return this.documentsRepo.delete(id);
  }

  /**
   * Save sales return to API
   */
  async saveSalesReturn(salesReturn: Partial<AppState['salesReturns'][0]>): Promise<AppState['salesReturns'][0]> {
    const salesReturnWithId = {
      ...salesReturn,
      id: salesReturn.id || `sales_return_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
    logger.logCategory('sync', `💾 Syncing sales return (POST upsert): ${salesReturnWithId.id} - ${salesReturnWithId.returnNumber}`);
    return this.salesReturnsRepo.create(salesReturnWithId);
  }

  /**
   * Delete sales return from API
   */
  async deleteSalesReturn(id: string, version?: number): Promise<void> {
    return this.salesReturnsRepo.delete(id, version);
  }

  /**
   * Save PM cycle allocation to API
   */
  async savePMCycleAllocation(allocation: Partial<PMCycleAllocation>): Promise<PMCycleAllocation> {
    // Always use POST endpoint - it handles upserts automatically
    const allocationWithId = {
      ...allocation,
      id: allocation.id || `pm_alloc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    } as PMCycleAllocation;
    logger.logCategory('sync', `💾 Syncing PM cycle allocation (POST upsert): ${allocationWithId.id} - Project: ${allocationWithId.projectId}, Cycle: ${allocationWithId.cycleId}`);
    return this.pmCycleAllocationsRepo.create(allocationWithId);
  }

  /**
   * Delete PM cycle allocation from API
   */
  async deletePMCycleAllocation(id: string, version?: number): Promise<void> {
    return this.pmCycleAllocationsRepo.delete(id, version);
  }
}

// Singleton instance
let appStateApiInstance: AppStateApiService | null = null;

export function getAppStateApiService(): AppStateApiService {
  if (!appStateApiInstance) {
    appStateApiInstance = new AppStateApiService();
  }
  return appStateApiInstance;
}

