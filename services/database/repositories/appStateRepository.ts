/**
 * App State Repository
 * 
 * Handles loading and saving the complete application state from/to the database.
 * This is the main entry point for state persistence.
 */

import { AppState, Bill, Unit, Building, Property, RentalAgreement, ProjectAgreement, ProjectAgreementStatus, InstallmentPlan } from '../../../types';
import { getDatabaseService } from '../databaseService';
import { objectToDbFormat } from '../columnMapper';
import { migrateBudgetsToNewStructure, migrateBudgetsArray } from '../budgetMigration';
import {
    UsersRepository, AccountsRepository, ContactsRepository, CategoriesRepository,
    ProjectsRepository, BuildingsRepository, PropertiesRepository, UnitsRepository,
    TransactionsRepository, InvoicesRepository, BillsRepository, BudgetsRepository,
    RentalAgreementsRepository, ProjectAgreementsRepository, ContractsRepository,
    InstallmentPlansRepository, PlanAmenitiesRepository, RecurringTemplatesRepository, TransactionLogRepository, ErrorLogRepository,
    QuotationsRepository, DocumentsRepository, PMCycleAllocationsRepository, AppSettingsRepository,
    SalesReturnsRepository, VendorsRepository
} from './index';

import { BaseRepository } from './baseRepository';
import { getSyncOutboxService } from '../../sync/syncOutboxService';
import { getCurrentTenantId } from '../tenantUtils';
import { getCurrentUserId } from '../userUtils';

/** Sort items so parents appear before children (for FK parent_id → id). Handles missing parents and cycles. */
function sortByParentOrder<T>(
    items: T[],
    getId: (t: T) => string,
    getParentId: (t: T) => string | null | undefined
): T[] {
    if (items.length === 0) return [];
    const byId = new Map(items.map(i => [getId(i), i]));
    const depthCache = new Map<string, number>();
    const depth = (id: string, visited = new Set<string>()): number => {
        if (depthCache.has(id)) return depthCache.get(id)!;
        if (visited.has(id)) return 0;
        visited.add(id);
        const item = byId.get(id);
        const parentId = getParentId(item!);
        const d = parentId && byId.has(parentId) ? 1 + depth(parentId, visited) : 0;
        depthCache.set(id, d);
        return d;
    };
    return [...items].sort((a, b) => depth(getId(a)) - depth(getId(b)));
}

export class AppStateRepository {
    private db = getDatabaseService();
    private static saveQueue: Promise<void> = Promise.resolve();

    // Initialize all repositories
    private usersRepo = new UsersRepository();
    private accountsRepo = new AccountsRepository();
    private contactsRepo = new ContactsRepository();
    private categoriesRepo = new CategoriesRepository();
    private projectsRepo = new ProjectsRepository();
    private buildingsRepo = new BuildingsRepository();
    private propertiesRepo = new PropertiesRepository();
    private unitsRepo = new UnitsRepository();
    private transactionsRepo = new TransactionsRepository();
    private invoicesRepo = new InvoicesRepository();
    private billsRepo = new BillsRepository();
    private budgetsRepo = new BudgetsRepository();
    private rentalAgreementsRepo = new RentalAgreementsRepository();
    private projectAgreementsRepo = new ProjectAgreementsRepository();
    private contractsRepo = new ContractsRepository();
    private installmentPlansRepo = new InstallmentPlansRepository();
    private planAmenitiesRepo = new PlanAmenitiesRepository();
    private recurringTemplatesRepo = new RecurringTemplatesRepository();
    private transactionLogRepo = new TransactionLogRepository();
    private errorLogRepo = new ErrorLogRepository();
    private quotationsRepo = new QuotationsRepository();
    private documentsRepo = new DocumentsRepository();
    private pmCycleAllocationsRepo = new PMCycleAllocationsRepository();
    private appSettingsRepo = new AppSettingsRepository();
    private salesReturnsRepo = new SalesReturnsRepository();
    private vendorsRepo = new VendorsRepository();


    /**
     * Load complete application state from database
     */
    async loadState(): Promise<AppState> {
        // Ensure database is initialized
        if (!this.db.isReady()) {
            try {
                await this.db.initialize();
            } catch (error) {
                throw new Error(`Failed to initialize database: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        // Schema columns are ensured during DB initialization.
        // Only re-check if DB was just initialized in this call (first load).
        console.log('[CloudSync] loadState: loading data...');

        // Run rental_agreements tenant_id → contact_id migration if needed
        try {
            const { runRentalTenantIdToContactIdMigration } = await import('../migrations/migrate-rental-tenant-id-to-contact-id');
            const migrationResult = await runRentalTenantIdToContactIdMigration();
            if (migrationResult.success && migrationResult.message.includes('Successfully migrated')) {
            }
        } catch (migrationError) {
            console.warn('⚠️ Rental agreements migration failed during loadState (continuing):', migrationError);
        }

        // Run budget migration if needed (handles old backups with monthly budgets)
        try {
            const migrationResult = migrateBudgetsToNewStructure();
            if (migrationResult.success && migrationResult.migrated > 0) {
            }
        } catch (migrationError) {
            console.error('⚠️ Budget migration failed, continuing anyway:', migrationError);
        }

        // Phase 1: Load reference/lightweight entities first (fast — enables UI)
        const users = this.usersRepo.findAll();
        const accounts = this.accountsRepo.findAll();
        const contacts = this.contactsRepo.findAll();
        const categories = this.categoriesRepo.findAll();
        const projects = this.projectsRepo.findAll();
        const buildings = this.buildingsRepo.findAll();
        const properties = this.propertiesRepo.findAll();
        const units = this.unitsRepo.findAll();
        const vendors = this.vendorsRepo.findAll();
        const budgets = this.budgetsRepo.findAll();
        const rentalAgreements = this.rentalAgreementsRepo.findAll();
        const projectAgreements = this.projectAgreementsRepo.findAll();
        const recurringTemplates = this.recurringTemplatesRepo.findAll();
        const planAmenities = this.planAmenitiesRepo.findAll();

        // Phase 2: Load heavier entities (excludeHeavyColumns where possible)
        const transactions = this.transactionsRepo.findAll();
        const invoices = this.invoicesRepo.findAll();
        const bills = this.billsRepo.findAll({ excludeHeavyColumns: true });
        const contracts = this.contractsRepo.findAll({ excludeHeavyColumns: true });
        const quotations = this.quotationsRepo.findAll({ excludeHeavyColumns: true });
        const documents = this.documentsRepo.findAll({ excludeHeavyColumns: true });
        const pmCycleAllocations = this.pmCycleAllocationsRepo.findAll();
        const installmentPlans = this.installmentPlansRepo.findAll();
        const salesReturns = this.salesReturnsRepo.findAll();
        const transactionLog = this.transactionLogRepo.findAll({ limit: 500, orderBy: 'timestamp', orderDir: 'DESC' });
        const errorLog = this.errorLogRepo.findAll({ limit: 200, orderBy: 'timestamp', orderDir: 'DESC' });


        // Load settings - try cloud first, then fallback to local
        let settings: any = {};
        try {
            // Try to load from cloud if authenticated
            const { isAuthenticatedSafe } = await import('../../api/client');
            if (isAuthenticatedSafe()) {
                const { settingsSyncService } = await import('../../settingsSyncService');
                const cloudSettings = await settingsSyncService.loadSettings();
                // Merge cloud settings with local settings (cloud takes precedence)
                const localSettings = this.appSettingsRepo.loadAllSettings();
                settings = { ...localSettings, ...cloudSettings };
            } else {
                // Not authenticated, use local settings only
                settings = this.appSettingsRepo.loadAllSettings();
            }
        } catch (error) {
            // Fallback to local settings if cloud load fails
            console.warn('⚠️ Failed to load settings from cloud, using local settings:', error);
            settings = this.appSettingsRepo.loadAllSettings();
        }

        // Get current user
        const currentUserId = this.appSettingsRepo.getSetting('current_user_id');
        const currentUser = currentUserId ? users.find(u => u.id === currentUserId) || null : null;

        // Build AppState
        const state: AppState = {
            version: parseInt(this.db.getMetadata('schema_version') || '5'),
            users,
            currentUser,
            accounts,
            contacts,
            categories,
            projects,
            buildings: buildings.map(b => {
                // Normalize building to ensure all fields are properly mapped
                // Handle both camelCase and snake_case field names for backward compatibility
                const normalizedBuilding: Building = {
                    id: b.id || '',
                    name: b.name ?? b.name ?? '',
                    description: (b.description) || undefined,
                    color: (b.color) || undefined
                };
                return normalizedBuilding;
            }),
            properties: properties.map(p => {
                // Normalize property to ensure all fields are properly mapped
                // Handle both camelCase and snake_case field names for backward compatibility
                // Preserve null/undefined values explicitly to prevent data loss
                const normalizedProperty: Property = {
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
            }),
            units: units.map(u => {
                // Normalize unit to ensure all fields are properly mapped
                // Handle both camelCase and snake_case field names for backward compatibility
                // Preserve null/undefined values explicitly to prevent data loss
                // Use nullish coalescing (??) to preserve null values, only use || for defaults
                const normalizedUnit: Unit = {
                    id: u.id || '',
                    name: u.name ?? u.name ?? '',
                    projectId: u.projectId ?? u.project_id ?? '',
                    contactId: (u.contactId ?? u.contact_id) || undefined,
                    salePrice: (() => {
                        const price = u.salePrice ?? u.sale_price;
                        if (price == null) return undefined;
                        return typeof price === 'number' ? price : parseFloat(String(price));
                    })(),
                    description: (u.description) || undefined,
                    type: (u.type) || undefined,
                    area: (() => {
                        const areaValue = u.area;
                        if (areaValue == null) return undefined;
                        return typeof areaValue === 'number' ? areaValue : parseFloat(String(areaValue));
                    })(),
                    floor: (u.floor) || undefined
                };

                // Debug: Log units that seem to be missing critical data
                if (!normalizedUnit.name || !normalizedUnit.projectId) {
                    console.warn('⚠️ Unit normalization warning - missing critical fields:', {
                        id: normalizedUnit.id,
                        name: normalizedUnit.name,
                        projectId: normalizedUnit.projectId,
                        contactId: normalizedUnit.contactId,
                        salePrice: normalizedUnit.salePrice,
                        rawUnit: u
                    });
                }

                return normalizedUnit;
            }),
            transactions,
            invoices,
            bills: bills.map(b => {
                // Normalize bill to ensure all fields are properly mapped
                // Handle both camelCase and snake_case field names for backward compatibility
                // Preserve null/undefined values explicitly to prevent data loss
                // Use nullish coalescing (??) to preserve null values, only use || for defaults
                const normalizedBill: Bill = {
                    id: b.id || '',
                    billNumber: b.billNumber ?? b.bill_number ?? `BILL-${b.id}`,
                    contactId: (b.contactId ?? b.contact_id) || undefined,
                    vendorId: (b.vendorId ?? b.vendor_id) || undefined,
                    amount: typeof b.amount === 'number' ? b.amount : (b.amount != null ? parseFloat(String(b.amount)) : 0),
                    paidAmount: typeof b.paidAmount === 'number' ? b.paidAmount : (b.paidAmount != null ? parseFloat(String(b.paidAmount)) : (b.paid_amount != null ? parseFloat(String(b.paid_amount)) : 0)),
                    status: b.status ?? 'Unpaid',
                    issueDate: b.issueDate ?? b.issue_date ?? new Date().toISOString().split('T')[0],
                    // Use nullish coalescing to preserve null/undefined, but convert null to undefined for optional fields
                    dueDate: (b.dueDate ?? b.due_date) || undefined,
                    description: (b.description) || undefined,
                    categoryId: (b.categoryId ?? b.category_id) || undefined,
                    projectId: (b.projectId ?? b.project_id) || undefined,
                    buildingId: (b.buildingId ?? b.building_id) || undefined,
                    propertyId: (b.propertyId ?? b.property_id) || undefined,
                    projectAgreementId: (b.projectAgreementId ?? b.project_agreement_id ?? b.agreementId ?? b.agreement_id) || undefined,
                    contractId: (b.contractId ?? b.contract_id) || undefined,
                    staffId: (b.staffId ?? b.staff_id) || undefined,
                    documentPath: (b.documentPath ?? b.document_path) || undefined,
                    documentId: (b.documentId ?? b.document_id) || undefined,
                    expenseCategoryItems: (() => {
                        // Handle expenseCategoryItems - check both camelCase and snake_case
                        const items = b.expenseCategoryItems ?? b.expense_category_items;
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

                // Debug: Log bills that seem to be missing critical data
                if (!normalizedBill.billNumber || (!normalizedBill.contactId && !normalizedBill.vendorId)) {
                    console.warn('⚠️ Bill normalization warning - missing critical fields:', {
                        id: normalizedBill.id,
                        billNumber: normalizedBill.billNumber,
                        contactId: normalizedBill.contactId,
                        vendorId: normalizedBill.vendorId,
                        projectId: normalizedBill.projectId,
                        rawBill: b
                    });
                }

                return normalizedBill;
            }),
            quotations: quotations.map(q => ({
                ...q,
                vendorId: q.vendorId ?? q.vendor_id ?? '',
                items: typeof q.items === 'string' ? JSON.parse(q.items) : q.items
            })),
            documents,
            pmCycleAllocations: pmCycleAllocations.map(pm => ({
                ...pm,
                excludedCategoryIds: pm.excludedCategoryIds
                    ? (typeof pm.excludedCategoryIds === 'string' ? JSON.parse(pm.excludedCategoryIds) : pm.excludedCategoryIds)
                    : (pm.excluded_category_ids ? (typeof pm.excluded_category_ids === 'string' ? JSON.parse(pm.excluded_category_ids) : pm.excluded_category_ids) : [])
            })),
            budgets,
            planAmenities: (planAmenities || []).map(a => ({
                id: a.id || '',
                name: a.name || '',
                price: typeof a.price === 'number' ? a.price : parseFloat(String(a.price || '0')),
                isPercentage: a.isPercentage ?? a.is_percentage ?? false,
                isActive: a.isActive ?? a.is_active ?? true,
                description: a.description ?? undefined,
                createdAt: a.createdAt ?? a.created_at ?? undefined,
                updatedAt: a.updatedAt ?? a.updated_at ?? undefined
            })),
            rentalAgreements: rentalAgreements.map(ra => {
                // Normalize rental agreement to ensure all fields are properly mapped
                // Handle both camelCase and snake_case field names for backward compatibility
                // Preserve null/undefined values explicitly to prevent data loss
                // Use nullish coalescing (??) to preserve null values, only use || for defaults
                const normalizedAgreement: RentalAgreement = {
                    id: ra.id || '',
                    agreementNumber: ra.agreementNumber ?? ra.agreement_number ?? '',
                    // Contact ID (the tenant contact person in rental management). org_id is for tenant isolation.
                    contactId: ra.contactId ?? ra.contact_id ?? '',
                    propertyId: ra.propertyId ?? ra.property_id ?? '',
                    startDate: ra.startDate ?? ra.start_date ?? new Date().toISOString().split('T')[0],
                    endDate: ra.endDate ?? ra.end_date ?? new Date().toISOString().split('T')[0],
                    monthlyRent: typeof ra.monthlyRent === 'number' ? ra.monthlyRent : (typeof ra.monthly_rent === 'number' ? ra.monthly_rent : parseFloat(ra.monthly_rent || ra.monthlyRent || '0')),
                    rentDueDate: typeof ra.rentDueDate === 'number' ? ra.rentDueDate : (typeof ra.rent_due_date === 'number' ? ra.rent_due_date : parseInt(ra.rent_due_date || ra.rentDueDate || '1')),
                    status: ra.status || 'Active',
                    description: (ra.description) || undefined,
                    securityDeposit: ra.securityDeposit !== undefined && ra.securityDeposit !== null
                        ? (typeof ra.securityDeposit === 'number' ? ra.securityDeposit : parseFloat(String(ra.securityDeposit)))
                        : (ra.security_deposit !== undefined && ra.security_deposit !== null ? (typeof ra.security_deposit === 'number' ? ra.security_deposit : parseFloat(String(ra.security_deposit))) : undefined),
                    brokerId: (ra.brokerId ?? ra.broker_id) || undefined,
                    brokerFee: ra.brokerFee !== undefined && ra.brokerFee !== null
                        ? (typeof ra.brokerFee === 'number' ? ra.brokerFee : parseFloat(String(ra.brokerFee)))
                        : (ra.broker_fee !== undefined && ra.broker_fee !== null ? (typeof ra.broker_fee === 'number' ? ra.broker_fee : parseFloat(String(ra.broker_fee))) : undefined),
                    ownerId: (ra.ownerId ?? ra.owner_id) || undefined
                };

                // Debug: Log rental agreements that seem to be missing critical data
                if (!normalizedAgreement.agreementNumber || !normalizedAgreement.contactId || !normalizedAgreement.propertyId) {
                    console.warn('⚠️ Rental agreement normalization warning - missing critical fields:', {
                        id: normalizedAgreement.id,
                        agreementNumber: normalizedAgreement.agreementNumber,
                        contactId: normalizedAgreement.contactId,
                        propertyId: normalizedAgreement.propertyId,
                        rawAgreement: ra
                    });
                }

                return normalizedAgreement;
            }),
            projectAgreements: projectAgreements.map(pa => {
                // Normalize project agreement to ensure all fields are properly mapped
                // Handle both camelCase and snake_case field names for backward compatibility
                // Preserve null/undefined values explicitly to prevent data loss
                const normalizedAgreement: ProjectAgreement = {
                    id: pa.id || '',
                    agreementNumber: pa.agreementNumber ?? pa.agreement_number ?? '',
                    clientId: pa.clientId ?? pa.client_id ?? '',
                    projectId: pa.projectId ?? pa.project_id ?? '',
                    unitIds: (() => {
                        const ids = pa.unitIds ?? pa.unit_ids;
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
                    listPrice: (() => {
                        const price = pa.listPrice ?? pa.list_price;
                        return typeof price === 'number' ? price : parseFloat(String(price || '0'));
                    })(),
                    customerDiscount: (() => {
                        const discount = pa.customerDiscount ?? pa.customer_discount;
                        return typeof discount === 'number' ? discount : parseFloat(String(discount || '0'));
                    })(),
                    floorDiscount: (() => {
                        const discount = pa.floorDiscount ?? pa.floor_discount;
                        return typeof discount === 'number' ? discount : parseFloat(String(discount || '0'));
                    })(),
                    lumpSumDiscount: (() => {
                        const discount = pa.lumpSumDiscount ?? pa.lump_sum_discount;
                        return typeof discount === 'number' ? discount : parseFloat(String(discount || '0'));
                    })(),
                    miscDiscount: (() => {
                        const discount = pa.miscDiscount ?? pa.misc_discount;
                        return typeof discount === 'number' ? discount : parseFloat(String(discount || '0'));
                    })(),
                    sellingPrice: (() => {
                        const price = pa.sellingPrice ?? pa.selling_price;
                        return typeof price === 'number' ? price : parseFloat(String(price || '0'));
                    })(),
                    rebateAmount: (() => {
                        const amount = pa.rebateAmount ?? pa.rebate_amount;
                        if (amount == null) return undefined;
                        return typeof amount === 'number' ? amount : parseFloat(String(amount));
                    })(),
                    rebateBrokerId: (pa.rebateBrokerId ?? pa.rebate_broker_id) || undefined,
                    issueDate: pa.issueDate ?? pa.issue_date ?? new Date().toISOString().split('T')[0],
                    description: (pa.description) || undefined,
                    status: (pa.status ?? ProjectAgreementStatus.ACTIVE) as ProjectAgreementStatus,
                    cancellationDetails: (() => {
                        const details = pa.cancellationDetails ?? pa.cancellation_details;
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
                    installmentPlan: (() => {
                        const plan = pa.installmentPlan ?? pa.installment_plan;
                        if (!plan) return undefined;
                        if (typeof plan === 'string') {
                            try {
                                return JSON.parse(plan);
                            } catch {
                                return undefined;
                            }
                        }
                        if (typeof plan === 'object') return plan;
                        return undefined;
                    })(),
                    listPriceCategoryId: (pa.listPriceCategoryId ?? pa.list_price_category_id) || undefined,
                    customerDiscountCategoryId: (pa.customerDiscountCategoryId ?? pa.customer_discount_category_id) || undefined,
                    floorDiscountCategoryId: (pa.floorDiscountCategoryId ?? pa.floor_discount_category_id) || undefined,
                    lumpSumDiscountCategoryId: (pa.lumpSumDiscountCategoryId ?? pa.lump_sum_discount_category_id) || undefined,
                    miscDiscountCategoryId: (pa.miscDiscountCategoryId ?? pa.misc_discount_category_id) || undefined,
                    sellingPriceCategoryId: (pa.sellingPriceCategoryId ?? pa.selling_price_category_id) || undefined,
                    rebateCategoryId: (pa.rebateCategoryId ?? pa.rebate_category_id) || undefined
                };

                // Debug: Log agreements that seem to be missing critical data
                if (!normalizedAgreement.agreementNumber || !normalizedAgreement.clientId || !normalizedAgreement.projectId) {
                    console.warn('⚠️ Project Agreement normalization warning - missing critical fields:', {
                        id: normalizedAgreement.id,
                        agreementNumber: normalizedAgreement.agreementNumber,
                        clientId: normalizedAgreement.clientId,
                        projectId: normalizedAgreement.projectId,
                        rawAgreement: pa
                    });
                }

                return normalizedAgreement;
            }),
            contracts: contracts.map(c => ({
                ...c,
                vendorId: c.vendorId ?? c.vendor_id ?? '',
                documentId: (c as any).documentId ?? (c as any).document_id ?? undefined,
                expenseCategoryItems: c.expenseCategoryItems
                    ? (typeof c.expenseCategoryItems === 'string' ? JSON.parse(c.expenseCategoryItems) : c.expenseCategoryItems)
                    : undefined
            })),
            recurringInvoiceTemplates: recurringTemplates,
            agreementSettings: settings.agreementSettings || { prefix: 'AGR-', nextNumber: 1, padding: 4 },
            projectAgreementSettings: settings.projectAgreementSettings || { prefix: 'P-AGR-', nextNumber: 1, padding: 4 },
            rentalInvoiceSettings: settings.rentalInvoiceSettings || { prefix: 'INV-', nextNumber: 1, padding: 5 },
            projectInvoiceSettings: settings.projectInvoiceSettings || { prefix: 'P-INV-', nextNumber: 1, padding: 5 },
            printSettings: settings.printSettings || {
                companyName: 'My Company',
                companyAddress: '',
                companyContact: '',
                showLogo: true,
                showDatePrinted: true
            },
            whatsAppTemplates: settings.whatsAppTemplates || {
                invoiceReminder: 'Dear {contactName}, Invoice #{invoiceNumber} for {subject} is due on {dueDate}. Amount: {amount}.',
                invoiceReceipt: 'Dear {contactName}, Payment of {paidAmount} received for Invoice #{invoiceNumber}. Balance: {balance}.',
                billPayment: 'Dear {contactName}, Bill #{billNumber} has been paid. Amount: {paidAmount}.',
                billToOwner: 'Dear {contactName}, Maintenance bill #{billNumber} for your property. Amount: {amount}.',
                billToTenant: 'Dear {contactName}, Maintenance bill #{billNumber}. Amount: {amount}. {note}',
                vendorGreeting: 'Hello {contactName},'
            },
            dashboardConfig: settings.dashboardConfig || { visibleKpis: [] },
            installmentPlans: installmentPlans.map(p => {
                // Normalize installment plan to ensure all fields are properly mapped
                const normalizedPlan: InstallmentPlan = {
                    id: p.id || '',
                    projectId: p.projectId ?? p.project_id ?? '',
                    leadId: p.leadId ?? p.lead_id ?? '',
                    unitId: p.unitId ?? p.unit_id ?? '',
                    durationYears: p.durationYears ?? p.duration_years ?? 1,
                    downPaymentPercentage: typeof p.downPaymentPercentage === 'number' ? p.downPaymentPercentage : (typeof p.down_payment_percentage === 'number' ? p.down_payment_percentage : parseFloat(String(p.downPaymentPercentage ?? p.down_payment_percentage ?? '0'))),
                    frequency: p.frequency || 'Monthly',
                    listPrice: typeof p.listPrice === 'number' ? p.listPrice : (typeof p.list_price === 'number' ? p.list_price : parseFloat(String(p.listPrice ?? p.list_price ?? '0'))),
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
                    netValue: typeof p.netValue === 'number' ? p.netValue : (typeof p.net_value === 'number' ? p.net_value : parseFloat(String(p.netValue ?? p.net_value ?? '0'))),
                    downPaymentAmount: typeof p.downPaymentAmount === 'number' ? p.downPaymentAmount : (typeof p.down_payment_amount === 'number' ? p.down_payment_amount : parseFloat(String(p.downPaymentAmount ?? p.down_payment_amount ?? '0'))),
                    installmentAmount: typeof p.installmentAmount === 'number' ? p.installmentAmount : (typeof p.installment_amount === 'number' ? p.installment_amount : parseFloat(String(p.installmentAmount ?? p.installment_amount ?? '0'))),
                    totalInstallments: p.totalInstallments ?? p.total_installments ?? 0,
                    description: p.description || undefined,
                    introText: p.introText ?? p.intro_text ?? undefined,
                    version: p.version ?? 1,
                    rootId: p.rootId ?? p.root_id ?? undefined,
                    status: (p.status || 'Draft') as InstallmentPlan['status'],
                    approvalRequestedById: p.approvalRequestedById ?? p.approval_requested_by ?? undefined,
                    approvalRequestedToId: p.approvalRequestedToId ?? p.approval_requested_to ?? undefined,
                    approvalRequestedAt: p.approvalRequestedAt ?? p.approval_requested_at ?? undefined,
                    approvalReviewedById: p.approvalReviewedById ?? p.approval_reviewed_by ?? undefined,
                    approvalReviewedAt: p.approvalReviewedAt ?? p.approval_reviewed_at ?? undefined,
                    selectedAmenities: (() => {
                        if (p.selectedAmenities) {
                            if (typeof p.selectedAmenities === 'string') {
                                try {
                                    return JSON.parse(p.selectedAmenities);
                                } catch {
                                    return undefined;
                                }
                            }
                            return Array.isArray(p.selectedAmenities) ? p.selectedAmenities : undefined;
                        }
                        if (p.selected_amenities) {
                            if (typeof p.selected_amenities === 'string') {
                                try {
                                    return JSON.parse(p.selected_amenities);
                                } catch {
                                    return undefined;
                                }
                            }
                            return Array.isArray(p.selected_amenities) ? p.selected_amenities : undefined;
                        }
                        return undefined;
                    })(),
                    amenitiesTotal: typeof p.amenitiesTotal === 'number' ? p.amenitiesTotal : (typeof p.amenities_total === 'number' ? p.amenities_total : parseFloat(String(p.amenitiesTotal ?? p.amenities_total ?? '0'))),
                    createdAt: p.createdAt ?? p.created_at,
                    updatedAt: p.updatedAt ?? p.updated_at
                };
                return normalizedPlan;
            }),
            invoiceHtmlTemplate: settings.invoiceHtmlTemplate,
            showSystemTransactions: settings.showSystemTransactions ?? false,
            enableColorCoding: settings.enableColorCoding ?? true,
            enableBeepOnSave: settings.enableBeepOnSave ?? false,
            pmCostPercentage: settings.pmCostPercentage ?? 0,
            defaultProjectId: settings.defaultProjectId || undefined,
            lastServiceChargeRun: settings.lastServiceChargeRun,
            salesReturns,
            vendors,

            transactionLog,
            errorLog,
            enableDatePreservation: settings.enableDatePreservation ?? false,
            currentPage: (settings.currentPage as any) || 'dashboard',
            editingEntity: null,
            initialTransactionType: null,
            initialTransactionFilter: null,
            initialTabs: []
        };

        console.log(`[CloudSync] loadState done (from local DB): accounts=${state.accounts?.length ?? 0} contacts=${state.contacts?.length ?? 0} transactions=${state.transactions?.length ?? 0} installmentPlans=${state.installmentPlans?.length ?? 0} pmCycleAllocations=${state.pmCycleAllocations?.length ?? 0}`);
        return state;
    }

    /**
     * Save complete application state to database (serialized to avoid overlapping transactions)
     * @param state - The application state to save
     * @param disableSyncQueueing - If true, disables sync queueing (used when syncing FROM cloud TO local)
     */
    async saveState(state: AppState, disableSyncQueueing: boolean = false): Promise<void> {
        AppStateRepository.saveQueue = AppStateRepository.saveQueue.then(async () => {
            const entityCounts = `accounts=${state.accounts?.length ?? 0} contacts=${state.contacts?.length ?? 0} transactions=${state.transactions?.length ?? 0} invoices=${state.invoices?.length ?? 0} bills=${state.bills?.length ?? 0} projects=${state.projects?.length ?? 0} installmentPlans=${state.installmentPlans?.length ?? 0} pmCycleAllocations=${state.pmCycleAllocations?.length ?? 0}`;
            console.log(`[CloudSync] saveState starting (fromCloud=${disableSyncQueueing}) ${entityCounts}`);

            try {
                // Ensure database is initialized
                if (!this.db.isReady()) {
                    await this.db.initialize();
                }

                // Schema and tenant columns are ensured during DB initialization — no need to re-run on every save.

                // Migrate budgets if they're in old format (for in-memory data being saved)
                try {
                    state.budgets = migrateBudgetsArray(state.budgets);
                } catch (budgetMigrationError) {
                    console.warn('⚠️ Could not migrate budgets array, continuing anyway:', budgetMigrationError);
                }

                // Disable sync queueing if requested (when syncing FROM cloud TO local)
                if (disableSyncQueueing) {
                    BaseRepository.disableSyncQueueing();
                }

                try {
                    // Post-commit callback to queue sync operations
                    const onCommit = () => {
                        try {
                            // Check if sync queueing is disabled (check actual flag state, not just parameter)
                            const isSyncQueueingDisabled = BaseRepository.isSyncQueueingDisabled();

                            // Flush pending operations (this clears the tracker)
                            const pendingOps = BaseRepository.flushPendingSyncOperations();

                            // Only queue sync operations if sync queueing is enabled
                            if (isSyncQueueingDisabled || disableSyncQueueing) {
                                if (pendingOps.length > 0) {
                                }
                                // Clear the operations without queueing them
                                return;
                            }

                            if (pendingOps.length > 0) {
                                const outbox = getSyncOutboxService();
                                const tenantId = getCurrentTenantId();
                                const userId = getCurrentUserId();

                                if (tenantId) {
                                    let syncErrors = 0;
                                    pendingOps.forEach(op => {
                                        try {
                                            outbox.enqueue(tenantId, op.tableName, op.type, op.entityId, op.data || {}, userId ?? undefined);
                                        } catch (syncError) {
                                            syncErrors++;
                                            if (syncErrors === 1) {
                                                console.error(`❌ Failed to queue sync for ${op.tableName}:${op.entityId}:`, syncError);
                                            }
                                        }
                                    });
                                    if (syncErrors > 1) {
                                        console.error(`❌ ${syncErrors} total sync queue failures (suppressed repeated logs)`);
                                    }
                                } else {
                                    console.warn(`[AppStateRepository] No tenant context, skipping ${pendingOps.length} sync operations`);
                                }
                            }
                        } catch (error) {
                            console.error('❌ Error queueing sync operations after commit:', error);
                            // Don't fail the transaction if sync queueing fails
                        } finally {
                            // Re-enable sync queueing if it was disabled
                            if (disableSyncQueueing && BaseRepository.isSyncQueueingDisabled()) {
                                BaseRepository.enableSyncQueueing();
                            }
                        }
                    };

                    this.db.transaction([
                        () => {
                            // Build ID sets for FK sanitization (in scope for all save steps; avoids FOREIGN KEY constraint failed)
                            const contactIds = new Set(state.contacts.map(c => c.id));
                            const projectIds = new Set(state.projects.map(p => p.id));
                            const buildingIds = new Set(state.buildings.map(b => b.id));
                            const accountIds = new Set(state.accounts.map(a => a.id));
                            const categoryIds = new Set(state.categories.map(c => c.id));
                            const vendorIds = new Set((state.vendors || []).map(v => v.id));
                            const contractIds = new Set((state.contracts || []).map(c => c.id));
                            const propertyIds = new Set(state.properties.map(p => p.id));
                            const unitIds = new Set(state.units.map(u => u.id));

                            // Save all entities with individual error handling
                            try {
                                this.usersRepo.saveAll(state.users);
                            } catch (e) {
                                console.error('❌ Failed to save users:', e);
                                throw e;
                            }

                            try {
                                const accountsOrdered = sortByParentOrder(
                                    state.accounts,
                                    a => a.id,
                                    a => (a as { parentAccountId?: string; parent_account_id?: string }).parentAccountId ?? (a as { parent_account_id?: string }).parent_account_id ?? null
                                ).map(a => {
                                    // Sanitize parent_account_id reference
                                    const pid = (a as any).parentAccountId ?? (a as any).parent_account_id;
                                    if (pid && !accountIds.has(pid)) {
                                        console.warn(`[AppStateRepository] Sanitizing account ${a.id}: parent account ${pid} not in batch.`);
                                        return { ...a, parentAccountId: null, parent_account_id: null };
                                    }
                                    return a;
                                });
                                this.accountsRepo.saveAll(accountsOrdered);
                            } catch (e) {
                                console.error('❌ Failed to save accounts:', e);
                                throw e;
                            }

                            try {
                                this.contactsRepo.saveAll(state.contacts);
                            } catch (e) {
                                console.error('❌ Failed to save contacts:', e);
                                console.error('Contact data that failed:', state.contacts);
                                if (state.contacts.length > 0) {
                                    console.error('First contact details:', state.contacts[0]);
                                }
                                throw e;
                            }

                            try {
                                const categoriesOrdered = sortByParentOrder(
                                    state.categories,
                                    c => c.id,
                                    c => (c as { parentCategoryId?: string; parent_category_id?: string }).parentCategoryId ?? (c as { parent_category_id?: string }).parent_category_id ?? null
                                ).map(c => {
                                    // Sanitize parent_category_id reference
                                    const pid = (c as any).parentCategoryId ?? (c as any).parent_category_id;
                                    if (pid && !categoryIds.has(pid)) {
                                        console.warn(`[AppStateRepository] Sanitizing category ${c.id}: parent category ${pid} not in batch.`);
                                        return { ...c, parentCategoryId: null, parent_category_id: null };
                                    }
                                    return c;
                                });
                                this.categoriesRepo.saveAll(categoriesOrdered);
                            } catch (e) {
                                console.error('❌ Failed to save categories:', e);
                                throw e;
                            }

                            // Save vendors BEFORE transactions (transactions have FK vendor_id → vendors.id)
                            try {
                                this.vendorsRepo.saveAll(state.vendors || []);
                            } catch (e) {
                                console.error('❌ Failed to save vendors:', e);
                                throw e;
                            }

                            try {
                                this.projectsRepo.saveAll(state.projects);
                                this.buildingsRepo.saveAll(state.buildings);
                                // Filter properties: owner_id FK→contacts, building_id FK→buildings
                                const validProperties = state.properties.filter(
                                    p => contactIds.has(p.ownerId ?? (p as any).owner_id ?? '') &&
                                        buildingIds.has(p.buildingId ?? (p as any).building_id ?? '')
                                );
                                this.propertiesRepo.saveAll(validProperties);
                                // Filter units: project_id FK→projects (required), contact_id FK→contacts (optional)
                                const validUnits = state.units.filter(
                                    u => projectIds.has(u.projectId ?? (u as any).project_id ?? '') &&
                                        (!(u.contactId ?? (u as any).contact_id) || contactIds.has(u.contactId ?? (u as any).contact_id))
                                );
                                this.unitsRepo.saveAll(validUnits);
                                // Filter contracts: project_id FK→projects (required), vendor_id FK→vendors (required)
                                const validContracts = (state.contracts || []).filter(c =>
                                    projectIds.has(c.projectId ?? (c as any).project_id ?? '') &&
                                    vendorIds.has(c.vendorId ?? (c as any).vendor_id ?? '')
                                ).map(c => ({
                                    ...c,
                                    vendorId: c.vendorId || '',
                                    expenseCategoryItems: c.expenseCategoryItems ? JSON.stringify(c.expenseCategoryItems) : undefined
                                }));
                                const contractIdsForFilter = new Set(validContracts.map(c => c.id));
                                this.contractsRepo.saveAll(validContracts);
                                // Filter invoices: only save those with valid contact_id (invoices.contact_id NOT NULL, FK to contacts)
                                const validInvoices = state.invoices.filter(inv =>
                                    contactIds.has(inv.contactId ?? (inv as any).contact_id ?? '')
                                );
                                const invoiceIds = new Set(validInvoices.map(i => i.id));
                                this.invoicesRepo.saveAll(validInvoices);
                                // Sanitize bills: null contact_id/vendor_id if not in batch (avoids FK constraint failed)
                                const sanitizedBills = state.bills.map(b => {
                                    const billToSave: any = {
                                        id: b.id,
                                        billNumber: b.billNumber || `BILL-${b.id}`,
                                        amount: b.amount || 0,
                                        paidAmount: b.paidAmount || 0,
                                        status: b.status || 'Unpaid',
                                        issueDate: b.issueDate || new Date().toISOString().split('T')[0],
                                    };
                                    const cid = b.contactId ?? (b as any).contact_id;
                                    const vid = b.vendorId ?? (b as any).vendor_id;
                                    if (cid && contactIds.has(cid)) billToSave.contactId = cid;
                                    if (vid && vendorIds.has(vid)) billToSave.vendorId = vid;
                                    if (b.dueDate) billToSave.dueDate = b.dueDate;
                                    if (b.description) billToSave.description = b.description;
                                    if (b.categoryId && categoryIds.has(b.categoryId)) billToSave.categoryId = b.categoryId;
                                    if (b.projectId && projectIds.has(b.projectId)) billToSave.projectId = b.projectId;
                                    if (b.buildingId) billToSave.buildingId = b.buildingId;
                                    if (b.propertyId) billToSave.propertyId = b.propertyId;
                                    if (b.projectAgreementId) billToSave.projectAgreementId = b.projectAgreementId;
                                    if (b.contractId && contractIdsForFilter.has(b.contractId)) billToSave.contractId = b.contractId;
                                    if (b.staffId) billToSave.staffId = b.staffId;
                                    if (b.documentPath) billToSave.documentPath = b.documentPath;
                                    if (b.documentId) billToSave.documentId = b.documentId;
                                    if (b.expenseBearerType) billToSave.expenseBearerType = b.expenseBearerType;
                                    if (b.expenseCategoryItems) {
                                        billToSave.expenseCategoryItems = typeof b.expenseCategoryItems === 'string'
                                            ? b.expenseCategoryItems
                                            : JSON.stringify(b.expenseCategoryItems);
                                    }
                                    if ((b as any).userId ?? (b as any).user_id) billToSave.userId = (b as any).userId ?? (b as any).user_id;
                                    if (b.version != null) billToSave.version = b.version;
                                    return billToSave;
                                });
                                const billIds = new Set(sanitizedBills.map(b => b.id));
                                this.billsRepo.saveAll(sanitizedBills);
                                // Sanitize transactions so FKs only reference entities in this batch (avoids FK constraint failed)
                                const sanitizedTransactions = state.transactions
                                    .filter(t => accountIds.has(t.accountId ?? (t as any).account_id ?? ''))
                                    .map(t => {
                                        const out = { ...t };
                                        if ((t.billId ?? (t as any).bill_id) && !billIds.has(t.billId ?? (t as any).bill_id)) {
                                            (out as any).billId = undefined;
                                            (out as any).bill_id = undefined;
                                        }
                                        if ((t.invoiceId ?? (t as any).invoice_id) && !invoiceIds.has(t.invoiceId ?? (t as any).invoice_id)) {
                                            (out as any).invoiceId = undefined;
                                            (out as any).invoice_id = undefined;
                                        }
                                        if ((t.categoryId ?? (t as any).category_id) && !categoryIds.has(t.categoryId ?? (t as any).category_id)) {
                                            (out as any).categoryId = undefined;
                                            (out as any).category_id = undefined;
                                        }
                                        if ((t.contactId ?? (t as any).contact_id) && !contactIds.has(t.contactId ?? (t as any).contact_id)) {
                                            (out as any).contactId = undefined;
                                            (out as any).contact_id = undefined;
                                        }
                                        if ((t.vendorId ?? (t as any).vendor_id) && !vendorIds.has(t.vendorId ?? (t as any).vendor_id)) {
                                            (out as any).vendorId = undefined;
                                            (out as any).vendor_id = undefined;
                                        }
                                        if ((t.projectId ?? (t as any).project_id) && !projectIds.has(t.projectId ?? (t as any).project_id)) {
                                            (out as any).projectId = undefined;
                                            (out as any).project_id = undefined;
                                        }
                                        return out;
                                    });
                                this.transactionsRepo.saveAll(sanitizedTransactions);
                            } catch (e) {
                                console.error('❌ Failed to save projects/buildings/properties/units/contracts/invoices/bills/transactions:', e);
                                throw e;
                            }

                            // Save quotations: only those with valid vendor_id (quotations.vendor_id NOT NULL, FK to vendors)
                            try {
                                const validQuotations = (state.quotations || []).filter(q =>
                                    vendorIds.has(q.vendorId ?? (q as any).vendor_id ?? '')
                                ).map(q => ({
                                    ...q,
                                    vendorId: q.vendorId || '',
                                    items: typeof q.items === 'string' ? q.items : JSON.stringify(q.items)
                                }));
                                this.quotationsRepo.saveAll(validQuotations);
                            } catch (e) {
                                console.error('❌ Failed to save quotations:', e);
                                throw e;
                            }

                            try {
                                this.documentsRepo.saveAll(state.documents);
                                this.pmCycleAllocationsRepo.saveAll((state.pmCycleAllocations || []).map(pm => ({
                                    ...pm,
                                    projectId: projectIds.has(pm.projectId) ? pm.projectId : null,
                                    excludedCategoryIds: pm.excludedCategoryIds
                                        ? (typeof pm.excludedCategoryIds === 'string' ? pm.excludedCategoryIds : JSON.stringify(pm.excludedCategoryIds))
                                        : undefined
                                })));
                                // Filter budgets: category_id FK→categories (required), project_id FK→projects (optional)
                                const validBudgets = (state.budgets || []).filter(b =>
                                    categoryIds.has(b.categoryId ?? (b as any).category_id ?? '') &&
                                    (!(b.projectId ?? (b as any).project_id) || projectIds.has(b.projectId ?? (b as any).project_id))
                                );
                                this.budgetsRepo.saveAll(validBudgets);
                                // Filter rental_agreements: contact_id FK→contacts, property_id FK→properties
                                const validProps = state.properties.filter(p =>
                                    contactIds.has(p.ownerId ?? (p as any).owner_id ?? '') &&
                                    buildingIds.has(p.buildingId ?? (p as any).building_id ?? '')
                                );
                                const propertyIds = new Set(validProps.map(p => p.id));
                                const validRentalAgreements = (state.rentalAgreements || []).filter(ra =>
                                    contactIds.has(ra.contactId ?? (ra as any).contact_id ?? '') &&
                                    propertyIds.has(ra.propertyId ?? (ra as any).property_id ?? '')
                                );
                                this.rentalAgreementsRepo.saveAll(validRentalAgreements);
                                // Filter project_agreements: client_id FK→contacts, project_id FK→projects
                                const validProjectAgreements = (state.projectAgreements || []).filter(pa =>
                                    contactIds.has(pa.clientId ?? (pa as any).client_id ?? '') &&
                                    projectIds.has(pa.projectId ?? (pa as any).project_id ?? '')
                                ).map(pa => ({
                                    ...pa,
                                    unitIds: JSON.stringify(pa.unitIds),
                                    cancellationDetails: pa.cancellationDetails ? JSON.stringify(pa.cancellationDetails) : undefined,
                                    installmentPlan: pa.installmentPlan ? JSON.stringify(pa.installmentPlan) : undefined
                                }));
                                const projectAgreementIds = new Set(validProjectAgreements.map(pa => pa.id));
                                this.projectAgreementsRepo.saveAll(validProjectAgreements);
                                // Filter sales_returns: agreement_id FK→project_agreements, refund_bill_id FK→bills (optional)
                                const billIdsForFilter = new Set(state.bills.map(b => b.id));
                                const validSalesReturns = (state.salesReturns || []).filter(sr =>
                                    projectAgreementIds.has(sr.agreementId ?? (sr as any).agreement_id ?? '') &&
                                    (!(sr.refundBillId ?? (sr as any).refund_bill_id) || billIdsForFilter.has(sr.refundBillId ?? (sr as any).refund_bill_id))
                                );
                                this.salesReturnsRepo.saveAll(validSalesReturns);
                                // contracts already saved above (before bills/transactions)

                                // Other tables
                                // Filter recurring_templates: contact_id FK→contacts, property_id FK→properties
                                const validRecurringTemplates = (state.recurringInvoiceTemplates || []).map(t => ({
                                    ...t,
                                    contactId: contactIds.has(t.contactId) ? t.contactId : null,
                                    propertyId: propertyIds.has(t.propertyId) ? t.propertyId : null,
                                    buildingId: buildingIds.has(t.buildingId) ? t.buildingId : null
                                }));
                                this.recurringTemplatesRepo.saveAll(validRecurringTemplates);

                                // Sanitize installment_plans: project_id FK→projects, lead_id FK→contacts, unit_id FK→units
                                const sanitizedInstallmentPlans = (state.installmentPlans || []).map(plan => ({
                                    ...plan,
                                    projectId: projectIds.has(plan.projectId) ? plan.projectId : null,
                                    leadId: contactIds.has(plan.leadId) ? plan.leadId : null,
                                    unitId: unitIds.has(plan.unitId) ? plan.unitId : null
                                }));
                                const installmentPlanIds = new Set(sanitizedInstallmentPlans.map(p => p.id));
                                this.installmentPlansRepo.saveAll(sanitizedInstallmentPlans);

                                // plan_amenities is master data, no FKs to sanitize
                                this.planAmenitiesRepo.saveAll(state.planAmenities || []);

                            } catch (e) {
                                console.error('❌ Failed to save documents/budgets/agreements/contracts/templates:', e);
                                throw e;
                            }

                            try {
                                this.transactionLogRepo.saveAll(state.transactionLog);
                            } catch (e) {
                                console.error('❌ Failed to save transaction log:', e);
                                throw e;
                            }

                            // Ensure error_log rows have required fields (timestamp is NOT NULL)
                            try {
                                const normalizedErrors = (state.errorLog || []).map(err => ({
                                    ...err,
                                    timestamp: err.timestamp || new Date().toISOString()
                                }));
                                this.errorLogRepo.saveAll(normalizedErrors as any);
                            } catch (e) {
                                console.error('❌ Failed to save error log:', e);
                                throw e;
                            }

                            // Save settings
                            try {
                                this.appSettingsRepo.saveAllSettings({
                                    current_user_id: state.currentUser?.id,
                                    agreementSettings: state.agreementSettings,
                                    projectAgreementSettings: state.projectAgreementSettings,
                                    rentalInvoiceSettings: state.rentalInvoiceSettings,
                                    projectInvoiceSettings: state.projectInvoiceSettings,
                                    printSettings: state.printSettings,
                                    whatsAppTemplates: state.whatsAppTemplates,
                                    dashboardConfig: state.dashboardConfig,
                                    installmentPlans: state.installmentPlans || [],
                                    invoiceHtmlTemplate: state.invoiceHtmlTemplate,
                                    showSystemTransactions: state.showSystemTransactions,
                                    enableColorCoding: state.enableColorCoding,
                                    enableBeepOnSave: state.enableBeepOnSave,
                                    pmCostPercentage: state.pmCostPercentage,
                                    defaultProjectId: state.defaultProjectId,
                                    lastServiceChargeRun: state.lastServiceChargeRun,
                                    currentPage: state.currentPage
                                });
                            } catch (e) {
                                console.error('❌ Failed to save settings:', e);
                                throw e;
                            }
                        }
                    ], onCommit);
                    const contactsAfterTransaction = this.contactsRepo.findAll();
                    if (contactsAfterTransaction.length !== state.contacts.length) {
                        console.error(`❌ CRITICAL: Contact count mismatch AFTER transaction but BEFORE persistence!`);
                        console.error('Expected:', state.contacts.map(c => ({ id: c.id, name: c.name })));
                        console.error('Found:', contactsAfterTransaction.map((c: any) => ({ id: c.id, name: c.name })));
                    }

                } catch (transactionError) {
                    console.error('[CloudSync] Database transaction failed:', transactionError);
                    // Check what's in the database even after transaction failure
                    try {
                        const contactsAfterError = this.contactsRepo.findAll();
                        console.error(`🔍 Contacts in database after transaction error: ${contactsAfterError.length}`);
                    } catch (checkError) {
                        console.error('Could not check contacts after error:', checkError);
                    }
                    throw transactionError;
                }

                // Persist to storage after transaction completes
                await this.db.saveAsync();
                const savedContacts = this.contactsRepo.findAll();
                console.log(`[CloudSync] saveState completed successfully, contacts in DB: ${savedContacts.length}`);

                if (savedContacts.length !== state.contacts.length) {
                    console.error(`❌ Contact count mismatch! Expected ${state.contacts.length}, found ${savedContacts.length}`);
                    console.error('Expected contacts:', state.contacts.map(c => ({ id: c.id, name: c.name })));
                    console.error('Saved contacts:', savedContacts.map((c: any) => ({ id: c.id, name: c.name })));

                    // Check if there's a column mapping issue
                    if (state.contacts.length > 0 && savedContacts.length === 0) {
                        console.error('⚠️ No contacts were saved. This suggests a column mapping or insert issue.');
                        console.error('Checking table schema...');
                        try {
                            const tableInfo = this.db.query<{ name: string; type: string }>(`PRAGMA table_info(contacts)`);
                            console.error('Contacts table columns:', tableInfo.map(t => t.name));
                        } catch (schemaError) {
                            console.error('Could not check table schema:', schemaError);
                        }
                    }
                }
            } catch (error) {
                console.error('❌ Error saving state to database:', error);
                throw error; // Re-throw so caller knows save failed
            } finally {
                // Always re-enable sync queueing if it was disabled, even on error
                if (disableSyncQueueing && BaseRepository.isSyncQueueingDisabled()) {
                    BaseRepository.enableSyncQueueing();
                }
            }
        });

        return AppStateRepository.saveQueue;
    }

    /**
     * Get a single entity by type and id (for conflict resolution in bi-directional sync).
     */
    getEntityById(entityKey: string, id: string): Record<string, unknown> | null {
        const repo = this.getRepoByEntityKey(entityKey);
        if (!repo) return null;
        try {
            const found = (repo as any).findById(id);
            return found ? (found as Record<string, unknown>) : null;
        } catch {
            return null;
        }
    }

    /**
     * Upsert a single entity (create or update) for bi-directional sync.
     */
    upsertEntity(entityKey: string, data: Record<string, unknown>): void {
        const repo = this.getRepoByEntityKey(entityKey);
        if (!repo) return;
        const id = (data.id as string) ?? '';
        const r = repo as any;
        const existing = r.findById ? r.findById(id) : null;
        if (existing) {
            r.update(id, data);
        } else {
            r.insert(data);
        }
    }

    private getRepoByEntityKey(entityKey: string): BaseRepository<unknown> | null {
        const map: Record<string, BaseRepository<unknown>> = {
            accounts: this.accountsRepo,
            contacts: this.contactsRepo,
            categories: this.categoriesRepo,
            projects: this.projectsRepo,
            buildings: this.buildingsRepo,
            properties: this.propertiesRepo,
            units: this.unitsRepo,
            transactions: this.transactionsRepo,
            invoices: this.invoicesRepo,
            bills: this.billsRepo,
            budgets: this.budgetsRepo,
            plan_amenities: this.planAmenitiesRepo,
            contracts: this.contractsRepo,
            sales_returns: this.salesReturnsRepo,
            quotations: this.quotationsRepo,
            documents: this.documentsRepo,
            recurring_invoice_templates: this.recurringTemplatesRepo,
            pm_cycle_allocations: this.pmCycleAllocationsRepo,
            rental_agreements: this.rentalAgreementsRepo,
            project_agreements: this.projectAgreementsRepo,
            installment_plans: this.installmentPlansRepo,
            vendors: this.vendorsRepo,
        };
        return map[entityKey] ?? null;
    }
}
