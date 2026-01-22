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
    InstallmentPlansRepository, RecurringTemplatesRepository, TransactionLogRepository, ErrorLogRepository, 
    AppSettingsRepository, QuotationsRepository, DocumentsRepository, PMCycleAllocationsRepository
} from './index';
import { migrateTenantColumns } from '../tenantMigration';

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
    private recurringTemplatesRepo = new RecurringTemplatesRepository();
    private transactionLogRepo = new TransactionLogRepository();
    private errorLogRepo = new ErrorLogRepository();
    private quotationsRepo = new QuotationsRepository();
    private documentsRepo = new DocumentsRepository();
    private pmCycleAllocationsRepo = new PMCycleAllocationsRepository();
    private appSettingsRepo = new AppSettingsRepository();

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
        
        // CRITICAL: Ensure all schema columns exist BEFORE loading data
        // This prevents data loss when columns are missing (e.g., after restore)
        this.db.ensureAllTablesExist();
        this.db.ensureContractColumnsExist();
        // Ensure tenant_id columns exist on all relevant tables (idempotent)
        try {
            migrateTenantColumns();
        } catch (err) {
            console.warn('⚠️ Tenant column migration failed during loadState (continuing):', err);
        }
        
        // Run rental_agreements tenant_id → contact_id migration if needed
        try {
            const { runRentalTenantIdToContactIdMigration } = await import('../migrations/migrate-rental-tenant-id-to-contact-id');
            const migrationResult = await runRentalTenantIdToContactIdMigration();
            if (migrationResult.success && migrationResult.message.includes('Successfully migrated')) {
                console.log('✅ Rental agreements migration completed:', migrationResult.message);
            }
        } catch (migrationError) {
            console.warn('⚠️ Rental agreements migration failed during loadState (continuing):', migrationError);
        }
        
        // Run budget migration if needed (handles old backups with monthly budgets)
        try {
            const migrationResult = migrateBudgetsToNewStructure();
            if (migrationResult.success && migrationResult.migrated > 0) {
                console.log(`✅ Migrated ${migrationResult.migrated} budgets from old format`);
            }
        } catch (migrationError) {
            console.error('⚠️ Budget migration failed, continuing anyway:', migrationError);
        }
        
        // Load all entities
        const users = this.usersRepo.findAll();
        const accounts = this.accountsRepo.findAll();
        const contacts = this.contactsRepo.findAll();
        const categories = this.categoriesRepo.findAll();
        const projects = this.projectsRepo.findAll();
        const buildings = this.buildingsRepo.findAll();
        const properties = this.propertiesRepo.findAll();
        const units = this.unitsRepo.findAll();
        const transactions = this.transactionsRepo.findAll();
        const invoices = this.invoicesRepo.findAll();
        const bills = this.billsRepo.findAll();
        const budgets = this.budgetsRepo.findAll();
        const rentalAgreements = this.rentalAgreementsRepo.findAll();
        const projectAgreements = this.projectAgreementsRepo.findAll();
        const contracts = this.contractsRepo.findAll();
        const recurringTemplates = this.recurringTemplatesRepo.findAll();
        const transactionLog = this.transactionLogRepo.findAll();
        const errorLog = this.errorLogRepo.findAll();
        const quotations = this.quotationsRepo.findAll();
        const documents = this.documentsRepo.findAll();
        const pmCycleAllocations = this.pmCycleAllocationsRepo.findAll();
        const installmentPlans = this.installmentPlansRepo.findAll();

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
                console.log('✅ Loaded settings from cloud database');
            } else {
                // Not authenticated, use local settings only
                settings = this.appSettingsRepo.loadAllSettings();
                console.log('💾 Loaded settings from local database (not authenticated)');
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
                    contactId: b.contactId ?? b.contact_id ?? '',
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
                if (!normalizedBill.billNumber || !normalizedBill.contactId) {
                    console.warn('⚠️ Bill normalization warning - missing critical fields:', {
                        id: normalizedBill.id,
                        billNumber: normalizedBill.billNumber,
                        contactId: normalizedBill.contactId,
                        projectId: normalizedBill.projectId,
                        rawBill: b
                    });
                }
                
                return normalizedBill;
            }),
            quotations: quotations.map(q => ({
                ...q,
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
            rentalAgreements: rentalAgreements.map(ra => {
                // Normalize rental agreement to ensure all fields are properly mapped
                // Handle both camelCase and snake_case field names for backward compatibility
                // Preserve null/undefined values explicitly to prevent data loss
                // Use nullish coalescing (??) to preserve null values, only use || for defaults
                const normalizedAgreement: RentalAgreement = {
                    id: ra.id || '',
                    agreementNumber: ra.agreementNumber ?? ra.agreement_number ?? '',
                    // Contact ID (the tenant contact person in rental management, NOT the organization tenant_id)
                    // Backward compatibility: also check tenantId/tenant_id for old data
                    contactId: ra.contactId ?? ra.contact_id ?? ra.tenantId ?? ra.tenant_id ?? '',
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
                    status: (p.status || 'Draft') as 'Draft' | 'Locked',
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
            documentStoragePath: settings.documentStoragePath || undefined,
            lastServiceChargeRun: settings.lastServiceChargeRun,
            transactionLog,
            errorLog,
            currentPage: (settings.currentPage as any) || 'dashboard',
            editingEntity: null,
            initialTransactionType: null,
            initialTransactionFilter: null,
            initialTabs: []
        };

        return state;
    }

    /**
     * Save complete application state to database (serialized to avoid overlapping transactions)
     */
    async saveState(state: AppState): Promise<void> {
        AppStateRepository.saveQueue = AppStateRepository.saveQueue.then(async () => {
            try {
                // Ensure database is initialized
                if (!this.db.isReady()) {
                    await this.db.initialize();
                }
                
                // Ensure all tables exist (safety check for existing databases)
                // This will create any missing tables like 'quotations' if they don't exist
                try {
                    this.db.ensureAllTablesExist();
                } catch (tableCheckError) {
                    console.warn('⚠️ Could not verify tables exist, continuing anyway:', tableCheckError);
                }
                
                // Ensure tenant_id columns exist before saving (idempotent)
                try {
                    migrateTenantColumns();
                } catch (tenantError) {
                    console.warn('⚠️ Tenant column migration failed during saveState (continuing):', tenantError);
                }
                
                // Migrate budgets if they're in old format (for in-memory data being saved)
                try {
                    state.budgets = migrateBudgetsArray(state.budgets);
                } catch (budgetMigrationError) {
                    console.warn('⚠️ Could not migrate budgets array, continuing anyway:', budgetMigrationError);
                }

                console.log('💾 Saving state to database:', {
                    transactions: state.transactions.length,
                    contacts: state.contacts.length,
                    bills: state.bills.length,
                    invoices: state.invoices.length,
                    quotations: state.quotations.length
                });

                console.log('🔄 Starting database transaction...');
                try {
                    this.db.transaction([
                        () => {
                            // Save all entities with individual error handling
                            console.log('💾 Starting to save entities...');
                            
                            try {
                                this.usersRepo.saveAll(state.users);
                                console.log(`✅ Saved ${state.users.length} users`);
                            } catch (e) {
                                console.error('❌ Failed to save users:', e);
                                throw e;
                            }
                            
                            try {
                                this.accountsRepo.saveAll(state.accounts);
                                console.log(`✅ Saved ${state.accounts.length} accounts`);
                            } catch (e) {
                                console.error('❌ Failed to save accounts:', e);
                                throw e;
                            }
                            
                            try {
                                console.log(`💾 Saving ${state.contacts.length} contacts...`);
                                if (state.contacts.length > 0) {
                                    console.log('Sample contact data:', JSON.stringify(state.contacts[0], null, 2));
                                    // Log what the contact will look like after column mapping
                                    const sampleDbData = objectToDbFormat(state.contacts[0] as Record<string, any>);
                                    console.log('Sample contact after column mapping:', sampleDbData);
                                }
                                this.contactsRepo.saveAll(state.contacts);
                                console.log(`✅ Contacts saved successfully (${state.contacts.length} contacts)`);
                            } catch (e) {
                                console.error('❌ Failed to save contacts:', e);
                                console.error('Contact data that failed:', state.contacts);
                                if (state.contacts.length > 0) {
                                    console.error('First contact details:', state.contacts[0]);
                                }
                                throw e;
                            }
                        
                        try {
                            this.categoriesRepo.saveAll(state.categories);
                            console.log(`✅ Saved ${state.categories.length} categories`);
                        } catch (e) {
                            console.error('❌ Failed to save categories:', e);
                            throw e;
                        }
                        
                        try {
                            this.projectsRepo.saveAll(state.projects);
                            this.buildingsRepo.saveAll(state.buildings);
                            this.propertiesRepo.saveAll(state.properties);
                            this.unitsRepo.saveAll(state.units);
                            this.transactionsRepo.saveAll(state.transactions);
                            this.invoicesRepo.saveAll(state.invoices);
                            // Save bills with expenseCategoryItems serialized as JSON
                            // Ensure all fields are explicitly included to prevent data loss
                            this.billsRepo.saveAll(state.bills.map(b => {
                                const billToSave: any = {
                                    id: b.id,
                                    billNumber: b.billNumber || `BILL-${b.id}`,
                                    contactId: b.contactId || '',
                                    amount: b.amount || 0,
                                    paidAmount: b.paidAmount || 0,
                                    status: b.status || 'Unpaid',
                                    issueDate: b.issueDate || new Date().toISOString().split('T')[0],
                                };
                                // Only include optional fields if they have values (to avoid skipping in objectToDbFormat)
                                if (b.dueDate) billToSave.dueDate = b.dueDate;
                                if (b.description) billToSave.description = b.description;
                                if (b.categoryId) billToSave.categoryId = b.categoryId;
                                if (b.projectId) billToSave.projectId = b.projectId;
                                if (b.buildingId) billToSave.buildingId = b.buildingId;
                                if (b.propertyId) billToSave.propertyId = b.propertyId;
                                if (b.projectAgreementId) billToSave.projectAgreementId = b.projectAgreementId;
                                if (b.contractId) billToSave.contractId = b.contractId;
                                if (b.staffId) billToSave.staffId = b.staffId;
                                if (b.documentPath) billToSave.documentPath = b.documentPath;
                                if (b.expenseCategoryItems) {
                                    billToSave.expenseCategoryItems = typeof b.expenseCategoryItems === 'string' 
                                        ? b.expenseCategoryItems 
                                        : JSON.stringify(b.expenseCategoryItems);
                                }
                                return billToSave;
                            }));
                        } catch (e) {
                            console.error('❌ Failed to save projects/buildings/properties/units/transactions/invoices/bills:', e);
                            throw e;
                        }
                        
                        // Save quotations with items serialized as JSON
                        try {
                            this.quotationsRepo.saveAll(state.quotations.map(q => ({
                                ...q,
                                items: typeof q.items === 'string' ? q.items : JSON.stringify(q.items)
                            })));
                        } catch (e) {
                            console.error('❌ Failed to save quotations:', e);
                            throw e;
                        }
                        
                        try {
                            this.documentsRepo.saveAll(state.documents);
                            this.pmCycleAllocationsRepo.saveAll((state.pmCycleAllocations || []).map(pm => ({
                                ...pm,
                                excludedCategoryIds: pm.excludedCategoryIds 
                                    ? (typeof pm.excludedCategoryIds === 'string' ? pm.excludedCategoryIds : JSON.stringify(pm.excludedCategoryIds))
                                    : undefined
                            })));
                            this.budgetsRepo.saveAll(state.budgets);
                            this.installmentPlansRepo.saveAll((state.installmentPlans || []).map(p => ({
                                ...p,
                                discounts: typeof p.discounts === 'string' ? p.discounts : JSON.stringify(p.discounts || []),
                                selectedAmenities: typeof p.selectedAmenities === 'string' ? p.selectedAmenities : JSON.stringify(p.selectedAmenities || [])
                            })));
                            this.rentalAgreementsRepo.saveAll(state.rentalAgreements);
                            this.projectAgreementsRepo.saveAll(state.projectAgreements);
                            // Save contracts with expenseCategoryItems serialized as JSON
                            this.contractsRepo.saveAll((state.contracts || []).map(c => ({
                                ...c,
                                expenseCategoryItems: c.expenseCategoryItems 
                                    ? (typeof c.expenseCategoryItems === 'string' ? c.expenseCategoryItems : JSON.stringify(c.expenseCategoryItems))
                                    : undefined
                            })));
                            this.recurringTemplatesRepo.saveAll(state.recurringInvoiceTemplates);
                        } catch (e) {
                            console.error('❌ Failed to save documents/budgets/agreements/contracts:', e);
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
                                documentStoragePath: state.documentStoragePath,
                                lastServiceChargeRun: state.lastServiceChargeRun,
                                currentPage: state.currentPage
                            });
                        } catch (e) {
                            console.error('❌ Failed to save settings:', e);
                            throw e;
                        }
                    }
                ]);
                console.log('✅ Database transaction completed successfully');
                
                // Verify contacts IMMEDIATELY after transaction (before persistence)
                const contactsAfterTransaction = this.contactsRepo.findAll();
                console.log(`🔍 Contacts in database immediately after transaction: ${contactsAfterTransaction.length} (expected ${state.contacts.length})`);
                if (contactsAfterTransaction.length !== state.contacts.length) {
                    console.error(`❌ CRITICAL: Contact count mismatch AFTER transaction but BEFORE persistence!`);
                    console.error('Expected:', state.contacts.map(c => ({ id: c.id, name: c.name })));
                    console.error('Found:', contactsAfterTransaction.map((c: any) => ({ id: c.id, name: c.name })));
                }
                
                } catch (transactionError) {
                    console.error('❌ Database transaction failed:', transactionError);
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
                // Use async save to ensure data is persisted
                console.log('💾 Persisting database to storage...');
                await this.db.saveAsync();
                console.log('✅ Database persisted to storage');
                
                // Verify contacts were saved (after persistence completes)
                const savedContacts = this.contactsRepo.findAll();
                console.log('✅ State saved successfully to database');
                console.log(`📊 Verification: ${savedContacts.length} contacts in database (expected ${state.contacts.length})`);
                
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
                } else {
                    console.log('✅ Contact count matches! All contacts saved successfully.');
                }
        } catch (error) {
            console.error('❌ Error saving state to database:', error);
            throw error; // Re-throw so caller knows save failed
        }
        });

        return AppStateRepository.saveQueue;
    }
}
