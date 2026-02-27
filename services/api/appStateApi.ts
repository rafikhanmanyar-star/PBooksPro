/**
 * App State API Service
 * 
 * Loads application state from the API instead of local database.
 * This is used when the app is in cloud mode (authenticated with tenant).
 */

import { AppState, InvoiceStatus, ProjectAgreementStatus, ContractStatus, SalesReturnStatus, SalesReturnReason, PMCycleAllocation, Quotation, Document, Vendor, RecurringInvoiceTemplate } from '../../types';
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
import { ContractsApiRepository } from './repositories/contractsApi';
import { SalesReturnsApiRepository } from './repositories/salesReturnsApi';
import { QuotationsApiRepository } from './repositories/quotationsApi';
import { DocumentsApiRepository } from './repositories/documentsApi';
import { RecurringInvoiceTemplatesApiRepository } from './repositories/recurringInvoiceTemplatesApi';
import { AppSettingsApiRepository } from './repositories/appSettingsApi';
import { PMCycleAllocationsApiRepository } from './repositories/pmCycleAllocationsApi';
import { TransactionLogApiRepository } from './repositories/transactionLogApi';
import { VendorsApiRepository } from './repositories/vendorsApi';
import { apiClient } from './client';
import { logger } from '../logger';

/** Response from GET /api/state/changes?since=ISO8601 (incremental sync) */
export interface StateChangesResponse {
  since: string;
  updatedAt: string;
  entities: Record<string, unknown[]>;
  has_more?: boolean;
  next_cursor?: string | null;
  limit?: number;
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
  private contractsRepo: ContractsApiRepository;
  private salesReturnsRepo: SalesReturnsApiRepository;
  private quotationsRepo: QuotationsApiRepository;
  private documentsRepo: DocumentsApiRepository;
  private recurringInvoiceTemplatesRepo: RecurringInvoiceTemplatesApiRepository;
  private appSettingsRepo: AppSettingsApiRepository;
  private pmCycleAllocationsRepo: PMCycleAllocationsApiRepository;
  private transactionLogRepo: TransactionLogApiRepository;
  private vendorsRepo: VendorsApiRepository;

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
    this.contractsRepo = new ContractsApiRepository();
    this.salesReturnsRepo = new SalesReturnsApiRepository();
    this.quotationsRepo = new QuotationsApiRepository();
    this.documentsRepo = new DocumentsApiRepository();
    this.recurringInvoiceTemplatesRepo = new RecurringInvoiceTemplatesApiRepository();
    this.appSettingsRepo = new AppSettingsApiRepository();
    this.pmCycleAllocationsRepo = new PMCycleAllocationsApiRepository();
    this.transactionLogRepo = new TransactionLogApiRepository();
    this.vendorsRepo = new VendorsApiRepository();
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
    installment_plans: 'installmentPlans',
    vendors: 'vendors',
  };

  /**
   * Load state via incremental sync when baseline exists and since is recent.
   * Merges API changes into the baseline and returns merged state.
   */
  async loadStateViaIncrementalSync(
    since: string,
    baseline: Partial<AppState>
  ): Promise<Partial<AppState>> {
    logger.logCategory('sync', `📡 Incremental sync since ${since}...`);
    const response = await this.loadStateChanges(since);
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

    const totalChanges = Object.values(response.entities || {}).reduce(
      (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
      0
    );
    logger.logCategory('sync', `✅ Incremental sync merged ${totalChanges} changed record(s)`);
    return merged;
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
        contracts,
        salesReturns,
        quotations,
        documents,
        recurringInvoiceTemplates,
        pmCycleAllocations,
        transactionLog,
        vendors,
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
        contracts: contracts.length,
        salesReturns: salesReturns.length,
        quotations: quotations.length,
        documents: documents.length,
        recurringInvoiceTemplates: recurringInvoiceTemplates.length,
        pmCycleAllocations: pmCycleAllocations.length,
        vendors: vendors.length,
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
        contracts,
        salesReturns,
        quotations,
        documents,
        recurringInvoiceTemplates,
        pmCycleAllocations,
        transactionLog,
        vendors,
      });
    } catch (error) {
      logger.errorCategory('sync', '❌ Error loading state from API:', error);
      throw error;
    }
  }

  /** Shared normalizer for loadState() and loadStateBulk() raw response */
  private normalizeLoadedState(raw: Record<string, any>): Partial<AppState> {
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
    const contracts = raw.contracts || [];
    const salesReturns = raw.salesReturns || [];
    const quotations = raw.quotations || [];
    const documents = raw.documents || [];
    const recurringInvoiceTemplates = raw.recurringInvoiceTemplates || [];
    const pmCycleAllocations = raw.pmCycleAllocations || [];
    const transactionLog = raw.transactionLog || [];
    const vendors = raw.vendors || [];

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
        })()
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

    // Normalize units from API (transform snake_case to camelCase)
    // The server returns snake_case fields, but the client expects camelCase
    const normalizedUnits = units.map((u: any) => ({
      id: u.id,
      name: u.name || '',
      projectId: u.project_id || u.projectId || '',
      contactId: u.contact_id || u.contactId || undefined,
      salePrice: (() => {
        const price = u.sale_price || u.salePrice;
        if (price == null) return undefined;
        return typeof price === 'number' ? price : parseFloat(String(price));
      })(),
      description: u.description || undefined,
      type: u.type || undefined,
      area: (() => {
        const areaValue = u.area;
        if (areaValue == null) return undefined;
        return typeof areaValue === 'number' ? areaValue : parseFloat(String(areaValue));
      })(),
      floor: u.floor || undefined
    }));

    // Normalize plan amenities from API (transform snake_case to camelCase)
    const normalizedPlanAmenities = planAmenities.map((a: any) => ({
      id: a.id,
      name: a.name || '',
      price: typeof a.price === 'number' ? a.price : parseFloat(String(a.price || '0')),
      isPercentage: a.is_percentage ?? a.isPercentage ?? false,
      isActive: a.is_active ?? a.isActive ?? true,
      description: a.description ?? undefined,
      createdAt: a.created_at ?? a.createdAt ?? undefined,
      updatedAt: a.updated_at ?? a.updatedAt ?? undefined
    }));

    // Normalize categories from API (transform snake_case to camelCase)
    // The server returns snake_case fields, but the client expects camelCase
    const normalizedCategories = categories.map((c: any) => ({
      id: c.id,
      name: c.name || '',
      type: c.type,
      description: c.description || undefined,
      isPermanent: c.is_permanent === true || c.is_permanent === 1 || c.isPermanent === true || false,
      isRental: c.is_rental === true || c.is_rental === 1 || c.isRental === true || false,
      parentCategoryId: c.parent_category_id || c.parentCategoryId || undefined
    }));

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
      issueDate: pa.issue_date || pa.issueDate || new Date().toISOString().split('T')[0],
      description: pa.description || undefined,
      status: pa.status || 'Active',
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
      updatedAt: pa.updated_at || pa.updatedAt || undefined
    }));

    // Normalize bills from API (transform snake_case to camelCase)
    // The server returns snake_case fields, but the client expects camelCase
    const normalizedBills = bills.map((b: any) => ({
      id: b.id,
      billNumber: b.bill_number || b.billNumber,
      contactId: b.contact_id || b.contactId,
      amount: typeof b.amount === 'number' ? b.amount : parseFloat(b.amount || '0'),
      paidAmount: typeof b.paid_amount === 'number' ? b.paid_amount : (typeof b.paidAmount === 'number' ? b.paidAmount : parseFloat(b.paid_amount || b.paidAmount || '0')),
      status: b.status || 'Unpaid',
      issueDate: b.issue_date || b.issueDate,
      dueDate: b.due_date || b.dueDate || undefined,
      description: b.description || undefined,
      categoryId: b.category_id || b.categoryId || undefined,
      projectId: b.project_id || b.projectId || undefined,
      buildingId: b.building_id || b.buildingId || undefined,
      propertyId: b.property_id || b.propertyId || undefined,
      projectAgreementId: b.project_agreement_id || b.projectAgreementId || undefined,
      contractId: b.contract_id || b.contractId || undefined,
      staffId: b.staff_id || b.staffId || undefined,
      expenseBearerType: b.expense_bearer_type || b.expenseBearerType || undefined,
      documentPath: b.document_path || b.documentPath || undefined,
      documentId: b.document_id || b.documentId || undefined,
      vendorId: b.vendor_id || b.vendorId || undefined,
      expenseCategoryItems: (() => {
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
      })()
    }));

    // Normalize invoices from API (transform snake_case to camelCase)
    // The server returns snake_case fields, but the client expects camelCase
    const normalizedInvoices = invoices.map((inv: any) => ({
      id: inv.id,
      invoiceNumber: inv.invoice_number || inv.invoiceNumber || `INV-${inv.id}`,
      contactId: inv.contact_id || inv.contactId || '',
      amount: typeof inv.amount === 'number' ? inv.amount : parseFloat(inv.amount || '0'),
      paidAmount: typeof inv.paid_amount === 'number' ? inv.paid_amount : (typeof inv.paidAmount === 'number' ? inv.paidAmount : parseFloat(inv.paid_amount || inv.paidAmount || '0')),
      status: inv.status || 'Unpaid',
      issueDate: inv.issue_date || inv.issueDate || new Date().toISOString().split('T')[0],
      dueDate: inv.due_date || inv.dueDate || undefined,
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
      rentalMonth: inv.rental_month || inv.rentalMonth || undefined
    }));

    // Normalize sales returns from API (transform snake_case to camelCase)
    // The server returns snake_case fields, but the client expects camelCase
    const normalizedSalesReturns = salesReturns.map((sr: any) => ({
      id: sr.id,
      returnNumber: sr.return_number || sr.returnNumber || '',
      agreementId: sr.agreement_id || sr.agreementId || '',
      returnDate: sr.return_date || sr.returnDate || new Date().toISOString().split('T')[0],
      reason: sr.reason || '',
      reasonNotes: sr.reason_notes || sr.reasonNotes || undefined,
      penaltyPercentage: typeof sr.penalty_percentage === 'number' ? sr.penalty_percentage : (typeof sr.penaltyPercentage === 'number' ? sr.penaltyPercentage : parseFloat(sr.penalty_percentage || sr.penaltyPercentage || '0')),
      penaltyAmount: typeof sr.penalty_amount === 'number' ? sr.penalty_amount : (typeof sr.penaltyAmount === 'number' ? sr.penaltyAmount : parseFloat(sr.penalty_amount || sr.penaltyAmount || '0')),
      refundAmount: typeof sr.refund_amount === 'number' ? sr.refund_amount : (typeof sr.refundAmount === 'number' ? sr.refundAmount : parseFloat(sr.refund_amount || sr.refundAmount || '0')),
      status: sr.status || 'Pending',
      processedDate: sr.processed_date || sr.processedDate || undefined,
      refundedDate: sr.refunded_date || sr.refundedDate || undefined,
      refundBillId: sr.refund_bill_id || sr.refundBillId || undefined,
      createdBy: sr.created_by || sr.createdBy || undefined,
      notes: sr.notes || undefined
    }));

    // Normalize contracts from API (transform snake_case to camelCase)
    // The server returns snake_case fields, but the client expects camelCase
    const normalizedContracts = contracts.map((c: any) => ({
      id: c.id,
      contractNumber: c.contract_number || c.contractNumber,
      name: c.name || '',
      projectId: c.project_id || c.projectId || '',
      vendorId: c.vendor_id || c.vendorId || '',
      totalAmount: typeof c.total_amount === 'number' ? c.total_amount : (typeof c.totalAmount === 'number' ? c.totalAmount : parseFloat(c.total_amount || c.totalAmount || '0')),
      area: c.area !== undefined && c.area !== null
        ? (typeof c.area === 'number' ? c.area : parseFloat(c.area || '0'))
        : undefined,
      rate: c.rate !== undefined && c.rate !== null
        ? (typeof c.rate === 'number' ? c.rate : parseFloat(c.rate || '0'))
        : undefined,
      startDate: c.start_date || c.startDate,
      endDate: c.end_date || c.endDate,
      status: c.status || 'Active',
      categoryIds: (() => {
        const ids = c.category_ids || c.categoryIds;
        if (!ids) return [];
        if (typeof ids === 'string' && ids.trim().length > 0) {
          try {
            return JSON.parse(ids);
          } catch {
            return [];
          }
        }
        if (Array.isArray(ids)) return ids;
        return [];
      })(),
      expenseCategoryItems: (() => {
        const items = c.expense_category_items || c.expenseCategoryItems;
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
      })(),
      termsAndConditions: c.terms_and_conditions || c.termsAndConditions || undefined,
      paymentTerms: c.payment_terms || c.paymentTerms || undefined,
      description: c.description || undefined,
      documentPath: c.document_path || c.documentPath || undefined,
      documentId: c.document_id || c.documentId || undefined
    }));

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
      isSystem: t.is_system === true || t.is_system === 1 || t.isSystem === true || false,
      userId: t.user_id || t.userId || undefined,
      payslipId: t.payslip_id || t.payslipId || undefined,
      reference: t.reference || undefined,
      children: t.children || undefined
    }));

    // Normalize accounts from API
    const normalizedAccounts = accounts.map((a: any) => ({
      id: a.id,
      name: a.name || '',
      type: a.type,
      balance: typeof a.balance === 'number' ? a.balance : parseFloat(String(a.balance || '0')),
      isPermanent: a.is_permanent === true || a.is_permanent === 1 || a.isPermanent === true || false,
      description: a.description || undefined,
      parentAccountId: a.parent_account_id || a.parentAccountId || undefined
    }));

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
      createdAt: c.created_at || c.createdAt || undefined,
      updatedAt: c.updated_at || c.updatedAt || undefined
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
      createdAt: v.created_at || v.createdAt || undefined,
      updatedAt: v.updated_at || v.updatedAt || undefined
    }));

    // Normalize projects from API
    const normalizedProjects = projects.map((p: any) => ({
      id: p.id,
      name: p.name || '',
      description: p.description || undefined,
      color: p.color || undefined,
      status: p.status || 'Active',
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
      })()
    }));

    // Normalize buildings from API
    const normalizedBuildings = buildings.map((b: any) => ({
      id: b.id,
      name: b.name || '',
      description: b.description || undefined,
      color: b.color || undefined
    }));

    // Normalize budgets from API
    const normalizedBudgets = budgets.map((b: any) => ({
      id: b.id,
      categoryId: b.category_id || b.categoryId || '',
      amount: typeof b.amount === 'number' ? b.amount : parseFloat(String(b.amount || '0')),
      projectId: b.project_id || b.projectId || undefined
    }));

    // Normalize installment plans from API (transform snake_case to camelCase)
    const normalizedInstallmentPlans = installmentPlans.map((p: any) => ({
      id: p.id,
      projectId: p.project_id || p.projectId || '',
      leadId: p.lead_id || p.leadId || '',
      unitId: p.unit_id || p.unitId || '',
      durationYears: p.duration_years || p.durationYears || 1,
      downPaymentPercentage: typeof p.down_payment_percentage === 'number' ? p.down_payment_percentage : (typeof p.downPaymentPercentage === 'number' ? p.downPaymentPercentage : parseFloat(String(p.down_payment_percentage || p.downPaymentPercentage || '0'))),
      frequency: p.frequency || 'Monthly',
      listPrice: typeof p.list_price === 'number' ? p.list_price : (typeof p.listPrice === 'number' ? p.listPrice : parseFloat(String(p.list_price || p.listPrice || '0'))),
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
      netValue: typeof p.net_value === 'number' ? p.net_value : (typeof p.netValue === 'number' ? p.netValue : parseFloat(String(p.net_value || p.netValue || '0'))),
      downPaymentAmount: typeof p.down_payment_amount === 'number' ? p.down_payment_amount : (typeof p.downPaymentAmount === 'number' ? p.downPaymentAmount : parseFloat(String(p.down_payment_amount || p.downPaymentAmount || '0'))),
      installmentAmount: typeof p.installment_amount === 'number' ? p.installment_amount : (typeof p.installmentAmount === 'number' ? p.installmentAmount : parseFloat(String(p.installment_amount || p.installmentAmount || '0'))),
      totalInstallments: p.total_installments || p.totalInstallments || 0,
      description: p.description || undefined,
      introText: p.intro_text || p.introText || undefined,
      version: p.version || 1,
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
          return Array.isArray(p.selected_amenities) ? p.selected_amenities : (p.selectedAmenities || []);
        }
        return p.selectedAmenities || [];
      })(),
      amenitiesTotal: typeof p.amenities_total === 'number' ? p.amenities_total : (typeof p.amenitiesTotal === 'number' ? p.amenitiesTotal : parseFloat(String(p.amenities_total || p.amenitiesTotal || '0'))),
      createdAt: p.created_at || p.createdAt,
      updatedAt: p.updated_at || p.updatedAt
    }));

    // Normalize rental agreements from API (transform snake_case to camelCase)
    const normalizedRentalAgreements = rentalAgreements.map((ra: any) => this.normalizeRentalAgreement(ra));


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
        nextDueDate: t.next_due_date ?? t.nextDueDate ?? '',
        active: t.active === true || t.active === 1 || t.active === 'true',
        agreementId: t.agreement_id ?? t.agreementId ?? undefined,
        invoiceType: t.invoice_type ?? t.invoiceType ?? 'Rental',
        frequency: t.frequency ?? 'Monthly',
        autoGenerate: t.auto_generate === true || t.auto_generate === 1 || t.autoGenerate === true,
        maxOccurrences: t.max_occurrences ?? t.maxOccurrences ?? undefined,
        generatedCount: typeof t.generated_count === 'number' ? t.generated_count : (typeof t.generatedCount === 'number' ? t.generatedCount : parseInt(String(t.generated_count ?? t.generatedCount ?? '0'))),
        lastGeneratedDate: t.last_generated_date ?? t.lastGeneratedDate ?? undefined,
        deletedAt: t.deleted_at ?? t.deletedAt ?? undefined,
      })).filter((t: any) => !t.deletedAt),
      pmCycleAllocations: pmCycleAllocations || [],
      transactionLog: transactionLog || [],
      vendors: normalizedVendors || [],
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

    // Normalize the response (server returns snake_case, client expects camelCase)
    return {
      id: saved.id,
      name: saved.name || '',
      type: saved.type,
      balance: typeof saved.balance === 'number' ? saved.balance : parseFloat(String(saved.balance || '0')),
      isPermanent: (saved as any).is_permanent === true || (saved as any).is_permanent === 1 || saved.isPermanent === true || false,
      description: saved.description || undefined,
      parentAccountId: (saved as any).parent_account_id || saved.parentAccountId || undefined,
      version: saved.version ?? undefined
    };
  }

  /**
   * Save vendor to API
   */
  /**
   * Save vendor to API
   */
  async saveVendor(vendor: Partial<Vendor>): Promise<Vendor> {
    // Always use POST endpoint - it handles upserts automatically
    try {
      const saved: any = await this.vendorsRepo.create(vendor);

      // Normalize the response (server returns snake_case, client expects camelCase)
      return {
        id: saved.id,
        name: saved.name || '',
        description: saved.description || undefined,
        contactNo: saved.contact_no || saved.contactNo || undefined,
        companyName: saved.company_name || saved.companyName || undefined,
        isActive: saved.is_active ?? saved.isActive ?? true,
        address: saved.address || undefined,
        userId: saved.user_id || saved.userId || undefined,
        createdAt: saved.created_at || saved.createdAt || undefined,
        updatedAt: saved.updated_at || saved.updatedAt || undefined
      };
    } catch (error) {
      console.error('❌ saveVendor failed:', error);
      throw error;
    }
  }

  /**
   * Delete vendor from API
   */
  async deleteVendor(id: string): Promise<void> {
    return this.vendorsRepo.delete(id);
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
    return await this.recurringInvoiceTemplatesRepo.create(templateWithId);
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
    return {
      id: saved.id,
      type: saved.type,
      subtype: (saved as any).subtype || saved.subtype || undefined,
      amount: typeof saved.amount === 'number' ? saved.amount : parseFloat(saved.amount || '0'),
      date: saved.date,
      description: saved.description || undefined,
      accountId: (saved as any).account_id || saved.accountId,
      fromAccountId: (saved as any).from_account_id || saved.fromAccountId || undefined,
      toAccountId: (saved as any).to_account_id || saved.toAccountId || undefined,
      categoryId: (saved as any).category_id || saved.categoryId || undefined,
      contactId: (saved as any).contact_id || saved.contactId || undefined,
      vendorId: (saved as any).vendor_id || saved.vendorId || undefined,
      projectId: (saved as any).project_id || saved.projectId || undefined,
      buildingId: (saved as any).building_id || saved.buildingId || undefined,
      propertyId: (saved as any).property_id || saved.propertyId || undefined,
      unitId: (saved as any).unit_id || saved.unitId || undefined,
      invoiceId: (saved as any).invoice_id || saved.invoiceId || undefined,
      billId: (saved as any).bill_id || saved.billId || undefined,
      contractId: (saved as any).contract_id || saved.contractId || undefined,
      agreementId: (saved as any).agreement_id || saved.agreementId || undefined,
      batchId: (saved as any).batch_id || saved.batchId || undefined,
      isSystem: (saved as any).is_system === true || (saved as any).is_system === 1 || saved.isSystem === true || false,
      payslipId: (saved as any).payslip_id || saved.payslipId || undefined,
      reference: saved.reference || undefined,
      children: saved.children || undefined
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

    // Normalize the response
    return {
      id: saved.id,
      name: saved.name || '',
      type: saved.type,
      description: saved.description || undefined,
      isPermanent: (saved as any).is_permanent === true || (saved as any).is_permanent === 1 || saved.isPermanent === true || false,
      isRental: (saved as any).is_rental === true || (saved as any).is_rental === 1 || saved.isRental === true || false,
      parentCategoryId: (saved as any).parent_category_id || saved.parentCategoryId || undefined
    };
  }

  /**
   * Delete category from API
   */
  async deleteCategory(id: string): Promise<void> {
    return this.categoriesRepo.delete(id);
  }

  /**
   * Save project to API
   */
  async saveProject(project: Partial<AppState['projects'][0]>): Promise<AppState['projects'][0]> {
    // Always use POST endpoint - it handles upserts automatically
    const projectWithId = {
      ...project,
      id: project.id || `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing project (POST upsert): ${projectWithId.id} - ${projectWithId.name}`);
    const saved = await this.projectsRepo.create(projectWithId);

    // Normalize the response
    return {
      id: saved.id,
      name: saved.name || '',
      description: saved.description || undefined,
      color: saved.color || undefined,
      status: (saved as any).status || saved.status || 'Active',
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
      })()
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
  async saveBuilding(building: Partial<AppState['buildings'][0]>): Promise<AppState['buildings'][0]> {
    // Always use POST endpoint - it handles upserts automatically
    const buildingWithId = {
      ...building,
      id: building.id || `building_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing building (POST upsert): ${buildingWithId.id} - ${buildingWithId.name}`);
    const saved = await this.buildingsRepo.create(buildingWithId);

    // Normalize the response
    return {
      id: saved.id,
      name: saved.name || '',
      description: saved.description || undefined,
      color: saved.color || undefined
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
  async saveProperty(property: Partial<AppState['properties'][0]>): Promise<AppState['properties'][0]> {
    // Always use POST endpoint - it handles upserts automatically
    const propertyWithId = {
      ...property,
      id: property.id || `property_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing property (POST upsert): ${propertyWithId.id} - ${propertyWithId.name}`);
    const saved = await this.propertiesRepo.create(propertyWithId);

    // Normalize the response (server returns snake_case, client expects camelCase)
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
      })()
    };
  }

  /**
   * Delete property from API
   */
  async deleteProperty(id: string): Promise<void> {
    return this.propertiesRepo.delete(id);
  }

  /**
   * Save unit to API
   */
  async saveUnit(unit: Partial<AppState['units'][0]>): Promise<AppState['units'][0]> {
    // Always use POST endpoint - it handles upserts automatically
    const unitWithId = {
      ...unit,
      id: unit.id || `unit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing unit (POST upsert): ${unitWithId.id} - ${unitWithId.name}`);
    const saved = await this.unitsRepo.create(unitWithId);

    // Normalize the response (server returns snake_case, client expects camelCase)
    return {
      id: saved.id,
      name: saved.name || '',
      projectId: (saved as any).project_id || saved.projectId || '',
      contactId: (saved as any).contact_id || saved.contactId || undefined,
      salePrice: (() => {
        const price = (saved as any).sale_price ?? saved.salePrice;
        if (price == null) return undefined;
        return typeof price === 'number' ? price : parseFloat(String(price));
      })(),
      description: saved.description || undefined,
      type: (saved as any).type || saved.type || undefined,
      area: (() => {
        const areaValue = (saved as any).area ?? saved.area;
        if (areaValue == null) return undefined;
        return typeof areaValue === 'number' ? areaValue : parseFloat(String(areaValue));
      })(),
      floor: (saved as any).floor || saved.floor || undefined
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
    return this.planAmenitiesRepo.save(amenityWithId);
  }

  /**
   * Delete plan amenity from API
   */
  async deletePlanAmenity(id: string): Promise<void> {
    return this.planAmenitiesRepo.delete(id);
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

    // Normalize the response (server returns snake_case, client expects camelCase)
    return {
      id: saved.id,
      projectId: (saved as any).project_id || saved.projectId || '',
      leadId: (saved as any).lead_id || saved.leadId || '',
      unitId: (saved as any).unit_id || saved.unitId || '',
      durationYears: (saved as any).duration_years || saved.durationYears || 1,
      downPaymentPercentage: typeof (saved as any).down_payment_percentage === 'number' ? (saved as any).down_payment_percentage : (typeof saved.downPaymentPercentage === 'number' ? saved.downPaymentPercentage : parseFloat(String((saved as any).down_payment_percentage || saved.downPaymentPercentage || '0'))),
      frequency: saved.frequency || 'Monthly',
      listPrice: typeof (saved as any).list_price === 'number' ? (saved as any).list_price : (typeof saved.listPrice === 'number' ? saved.listPrice : parseFloat(String((saved as any).list_price || saved.listPrice || '0'))),
      discounts: (() => {
        const discounts = (saved as any).discounts || saved.discounts;
        if (!discounts) return [];
        if (typeof discounts === 'string') {
          try {
            return JSON.parse(discounts);
          } catch {
            return [];
          }
        }
        return Array.isArray(discounts) ? discounts : [];
      })(),
      netValue: typeof (saved as any).net_value === 'number' ? (saved as any).net_value : (typeof saved.netValue === 'number' ? saved.netValue : parseFloat(String((saved as any).net_value || saved.netValue || '0'))),
      downPaymentAmount: typeof (saved as any).down_payment_amount === 'number' ? (saved as any).down_payment_amount : (typeof saved.downPaymentAmount === 'number' ? saved.downPaymentAmount : parseFloat(String((saved as any).down_payment_amount || saved.downPaymentAmount || '0'))),
      installmentAmount: typeof (saved as any).installment_amount === 'number' ? (saved as any).installment_amount : (typeof saved.installmentAmount === 'number' ? saved.installmentAmount : parseFloat(String((saved as any).installment_amount || saved.installmentAmount || '0'))),
      totalInstallments: (saved as any).total_installments || saved.totalInstallments || 0,
      description: saved.description || undefined,
      introText: (saved as any).intro_text || saved.introText || undefined,
      version: (saved as any).version || saved.version || 1,
      rootId: (saved as any).root_id || saved.rootId || undefined,
      status: (saved as any).status || saved.status || 'Draft',
      selectedAmenities: (() => {
        const amenities = (saved as any).selected_amenities || saved.selectedAmenities;
        if (!amenities) return undefined;
        if (typeof amenities === 'string') {
          try {
            return JSON.parse(amenities);
          } catch {
            return undefined;
          }
        }
        return Array.isArray(amenities) ? amenities : undefined;
      })(),
      amenitiesTotal: typeof (saved as any).amenities_total === 'number' ? (saved as any).amenities_total : (typeof saved.amenitiesTotal === 'number' ? saved.amenitiesTotal : parseFloat(String((saved as any).amenities_total || saved.amenitiesTotal || '0'))),
      createdAt: (saved as any).created_at || saved.createdAt,
      updatedAt: (saved as any).updated_at || saved.updatedAt
    };
  }

  /**
   * Delete installment plan from API
   */
  async deleteInstallmentPlan(id: string): Promise<void> {
    return this.installmentPlansRepo.delete(id);
  }

  /**
   * Save invoice to API
   */
  async saveInvoice(invoice: Partial<AppState['invoices'][0]>): Promise<AppState['invoices'][0]> {
    // Always use POST endpoint - it handles upserts automatically
    const invoiceWithId = {
      ...invoice,
      id: invoice.id || `invoice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing invoice (POST upsert): ${invoiceWithId.id} - ${invoiceWithId.invoiceNumber}`);
    const saved = await this.invoicesRepo.create(invoiceWithId);

    // Normalize the response (server returns snake_case, client expects camelCase)
    return {
      id: saved.id,
      invoiceNumber: (saved as any).invoice_number || saved.invoiceNumber || `INV-${saved.id}`,
      contactId: (saved as any).contact_id || saved.contactId || '',
      amount: typeof saved.amount === 'number' ? saved.amount : parseFloat(saved.amount || '0'),
      paidAmount: typeof (saved as any).paid_amount === 'number' ? (saved as any).paid_amount : (typeof saved.paidAmount === 'number' ? saved.paidAmount : parseFloat((saved as any).paid_amount || saved.paidAmount || '0')),
      status: (saved as any).status || saved.status || InvoiceStatus.UNPAID,
      issueDate: (saved as any).issue_date || saved.issueDate || new Date().toISOString().split('T')[0],
      dueDate: (saved as any).due_date || saved.dueDate || undefined,
      invoiceType: (saved as any).invoice_type || saved.invoiceType || 'Rental',
      description: saved.description || undefined,
      projectId: (saved as any).project_id || saved.projectId || undefined,
      buildingId: (saved as any).building_id || saved.buildingId || undefined,
      propertyId: (saved as any).property_id || saved.propertyId || undefined,
      unitId: (saved as any).unit_id || saved.unitId || undefined,
      categoryId: (saved as any).category_id || saved.categoryId || undefined,
      agreementId: (saved as any).agreement_id || saved.agreementId || undefined,
      securityDepositCharge: (saved as any).security_deposit_charge !== undefined && (saved as any).security_deposit_charge !== null
        ? (typeof (saved as any).security_deposit_charge === 'number' ? (saved as any).security_deposit_charge : parseFloat((saved as any).security_deposit_charge || '0'))
        : (saved.securityDepositCharge !== undefined && saved.securityDepositCharge !== null ? saved.securityDepositCharge : undefined),
      serviceCharges: (saved as any).service_charges !== undefined && (saved as any).service_charges !== null
        ? (typeof (saved as any).service_charges === 'number' ? (saved as any).service_charges : parseFloat((saved as any).service_charges || '0'))
        : (saved.serviceCharges !== undefined && saved.serviceCharges !== null ? saved.serviceCharges : undefined),
      rentalMonth: (saved as any).rental_month || saved.rentalMonth || undefined
    };
  }

  /**
   * Delete invoice from API
   */
  async deleteInvoice(id: string): Promise<void> {
    return this.invoicesRepo.delete(id);
  }

  /**
   * Save bill to API
   */
  async saveBill(bill: Partial<AppState['bills'][0]>): Promise<AppState['bills'][0]> {
    // Always use POST endpoint - it handles upserts automatically
    const billWithId = {
      ...bill,
      id: bill.id || `bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing bill (POST upsert): ${billWithId.id} - ${billWithId.billNumber}`);
    const saved = await this.billsRepo.create(billWithId);

    // Normalize the response (server returns snake_case, client expects camelCase)
    return {
      id: saved.id,
      billNumber: (saved as any).bill_number || saved.billNumber,
      contactId: (saved as any).contact_id || saved.contactId,
      amount: typeof saved.amount === 'number' ? saved.amount : parseFloat(saved.amount || '0'),
      paidAmount: typeof (saved as any).paid_amount === 'number' ? (saved as any).paid_amount : (typeof saved.paidAmount === 'number' ? saved.paidAmount : parseFloat((saved as any).paid_amount || saved.paidAmount || '0')),
      status: (saved as any).status || saved.status || InvoiceStatus.UNPAID,
      issueDate: (saved as any).issue_date || saved.issueDate,
      dueDate: (saved as any).due_date || saved.dueDate || undefined,
      description: saved.description || undefined,
      categoryId: (saved as any).category_id || saved.categoryId || undefined,
      projectId: (saved as any).project_id || saved.projectId || undefined,
      buildingId: (saved as any).building_id || saved.buildingId || undefined,
      propertyId: (saved as any).property_id || saved.propertyId || undefined,
      projectAgreementId: (saved as any).project_agreement_id || saved.projectAgreementId || undefined,
      contractId: (saved as any).contract_id || saved.contractId || undefined,
      staffId: (saved as any).staff_id || saved.staffId || undefined,
      documentPath: (saved as any).document_path || saved.documentPath || undefined,
      vendorId: (saved as any).vendor_id || saved.vendorId || undefined,
      expenseCategoryItems: (() => {
        const items = (saved as any).expense_category_items || saved.expenseCategoryItems;
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
      })()
    };
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
    return {
      id: saved.id,
      categoryId: (saved as any).category_id || saved.categoryId || '',
      amount: typeof saved.amount === 'number' ? saved.amount : parseFloat(String(saved.amount || '0')),
      projectId: (saved as any).project_id || saved.projectId || undefined
    };
  }

  /**
   * Delete budget from API
   */
  async deleteBudget(id: string): Promise<void> {
    return this.budgetsRepo.delete(id);
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
      issueDate: (saved as any).issue_date || saved.issueDate || new Date().toISOString().split('T')[0],
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
    // Always use POST endpoint - it handles upserts automatically
    const contractWithId = {
      ...contract,
      id: contract.id || `contract_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing contract (POST upsert): ${contractWithId.id} - ${contractWithId.contractNumber}`);
    const saved = await this.contractsRepo.create(contractWithId);

    // Normalize the response (server returns snake_case, client expects camelCase)
    return {
      id: saved.id,
      contractNumber: (saved as any).contract_number || saved.contractNumber,
      name: saved.name || '',
      projectId: (saved as any).project_id || saved.projectId || '',
      vendorId: (saved as any).vendor_id || saved.vendorId || '',
      totalAmount: typeof saved.totalAmount === 'number' ? saved.totalAmount : parseFloat((saved as any).total_amount || saved.totalAmount || '0'),
      area: (saved as any).area !== undefined && (saved as any).area !== null
        ? (typeof (saved as any).area === 'number' ? (saved as any).area : parseFloat((saved as any).area || '0'))
        : (saved.area !== undefined && saved.area !== null
          ? (typeof saved.area === 'number' ? saved.area : parseFloat(saved.area || '0'))
          : undefined),
      rate: (saved as any).rate !== undefined && (saved as any).rate !== null
        ? (typeof (saved as any).rate === 'number' ? (saved as any).rate : parseFloat((saved as any).rate || '0'))
        : (saved.rate !== undefined && saved.rate !== null
          ? (typeof saved.rate === 'number' ? saved.rate : parseFloat(saved.rate || '0'))
          : undefined),
      startDate: (saved as any).start_date || saved.startDate,
      endDate: (saved as any).end_date || saved.endDate,
      status: (saved as any).status || saved.status || ContractStatus.ACTIVE,
      categoryIds: (() => {
        const ids = (saved as any).category_ids || saved.categoryIds;
        if (!ids) return [];
        if (typeof ids === 'string' && ids.trim().length > 0) {
          try {
            return JSON.parse(ids);
          } catch {
            return [];
          }
        }
        if (Array.isArray(ids)) return ids;
        return [];
      })(),
      expenseCategoryItems: (() => {
        const items = (saved as any).expense_category_items || saved.expenseCategoryItems;
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
      })(),
      termsAndConditions: (saved as any).terms_and_conditions || saved.termsAndConditions || undefined,
      paymentTerms: (saved as any).payment_terms || saved.paymentTerms || undefined,
      description: saved.description || undefined,
      documentPath: (saved as any).document_path || saved.documentPath || undefined
    };
  }

  /**
   * Delete contract from API
   */
  async deleteContract(id: string): Promise<void> {
    return this.contractsRepo.delete(id);
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
    // Always use POST endpoint - it handles upserts automatically
    const salesReturnWithId = {
      ...salesReturn,
      id: salesReturn.id || `sales_return_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
    logger.logCategory('sync', `💾 Syncing sales return (POST upsert): ${salesReturnWithId.id} - ${salesReturnWithId.returnNumber}`);
    const saved = await this.salesReturnsRepo.create(salesReturnWithId);

    // Normalize the response (server returns snake_case, client expects camelCase)
    return {
      id: saved.id,
      returnNumber: (saved as any).return_number || saved.returnNumber || '',
      agreementId: (saved as any).agreement_id || saved.agreementId || '',
      returnDate: (saved as any).return_date || saved.returnDate || new Date().toISOString().split('T')[0],
      reason: (saved as any).reason || saved.reason || SalesReturnReason.CUSTOMER_REQUEST,
      reasonNotes: (saved as any).reason_notes || saved.reasonNotes || undefined,
      penaltyPercentage: typeof saved.penaltyPercentage === 'number' ? saved.penaltyPercentage : parseFloat((saved as any).penalty_percentage || saved.penaltyPercentage || '0'),
      penaltyAmount: typeof saved.penaltyAmount === 'number' ? saved.penaltyAmount : parseFloat((saved as any).penalty_amount || saved.penaltyAmount || '0'),
      refundAmount: typeof saved.refundAmount === 'number' ? saved.refundAmount : parseFloat((saved as any).refund_amount || saved.refundAmount || '0'),
      status: (saved as any).status || saved.status || SalesReturnStatus.PENDING,
      processedDate: (saved as any).processed_date || saved.processedDate || undefined,
      refundedDate: (saved as any).refunded_date || saved.refundedDate || undefined,
      refundBillId: (saved as any).refund_bill_id || saved.refundBillId || undefined,
      createdBy: (saved as any).created_by || saved.createdBy || undefined,
      notes: saved.notes || undefined
    };
  }

  /**
   * Delete sales return from API
   */
  async deleteSalesReturn(id: string): Promise<void> {
    return this.salesReturnsRepo.delete(id);
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
  async deletePMCycleAllocation(id: string): Promise<void> {
    return this.pmCycleAllocationsRepo.delete(id);
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

