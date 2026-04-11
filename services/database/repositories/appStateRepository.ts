/**
 * App State Repository
 * 
 * Handles loading and saving the complete application state from/to the database.
 * This is the main entry point for state persistence.
 */

import {
    AppState,
    CashflowCategoryMappingEntry,
    ProfitLossSubType,
    Bill,
    Invoice,
    Transaction,
    normalizeProjectAgreementStatus,
    InvoiceStatus,
    TransactionType,
    PersonalCategoryEntry,
    PersonalTransactionEntry,
} from '../../../types';
import { parseStoredDateToYyyyMmDdInput, toLocalDateString } from '../../../utils/dateUtils';
import { getDatabaseService } from '../databaseService';
import { objectToDbFormat } from '../columnMapper';
import { migrateBudgetsToNewStructure, migrateBudgetsArray } from '../budgetMigration';
import {
    UsersRepository, AccountsRepository, ContactsRepository, CategoriesRepository, PlCategoryMappingRepository,
    CashflowCategoryMappingRepository,
    ProjectsRepository, BuildingsRepository, PropertiesRepository, PropertyOwnershipHistoryRepository,
    UnitsRepository, TransactionsRepository, InvoicesRepository, BillsRepository, BudgetsRepository,
    RentalAgreementsRepository, ProjectAgreementsRepository, ContractsRepository,
    InstallmentPlansRepository, PlanAmenitiesRepository, RecurringTemplatesRepository, TransactionLogRepository, ErrorLogRepository,
    QuotationsRepository, DocumentsRepository, PMCycleAllocationsRepository, AppSettingsRepository,
    SalesReturnsRepository, VendorsRepository, ProjectReceivedAssetsRepository,
    PersonalCategoriesRepository, PersonalTransactionsRepository
} from './index';

import { getCurrentTenantId } from '../tenantUtils';
import { getCurrentUserId } from '../userUtils';
import { BaseRepository } from './baseRepository';
import { isLocalOnlyMode } from '../../../config/apiUrl';
import { ensureMandatorySystemAccountsPersisted } from '../mandatorySystemAccounts';
import { ensureMandatorySystemCategoriesPersisted } from '../mandatorySystemCategories';
import { notifyDatabaseError } from '../../dbErrorNotification';
import {
    reconcileRentalAgreementsList,
    rentalAgreementsReconcileChanged,
} from '../../rentalAgreementReconcile';

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
    // Upstream sync removed -- local-only architecture

    // Initialize all repositories
    private usersRepo = new UsersRepository();
    private accountsRepo = new AccountsRepository();
    private contactsRepo = new ContactsRepository();
    private categoriesRepo = new CategoriesRepository();
    private plCategoryMappingRepo = new PlCategoryMappingRepository();
    private cashflowCategoryMappingRepo = new CashflowCategoryMappingRepository();
    private projectsRepo = new ProjectsRepository();
    private buildingsRepo = new BuildingsRepository();
    private propertiesRepo = new PropertiesRepository();
    private propertyOwnershipHistoryRepo = new PropertyOwnershipHistoryRepository();
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
    private projectReceivedAssetsRepo = new ProjectReceivedAssetsRepository();
    private vendorsRepo = new VendorsRepository();
    private personalCategoriesRepo = new PersonalCategoriesRepository();
    private personalTransactionsRepo = new PersonalTransactionsRepository();


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
        if (!this.db.isReady()) {
            throw new Error('Local database not open. Select or create a company first.');
        }

        // Schema columns are ensured during DB initialization.
        console.log('[LocalDB] loadState: loading data...');



        // Run budget migration if needed (handles old backups with monthly budgets)
        try {
            const migrationResult = migrateBudgetsToNewStructure();
            if (migrationResult.success && migrationResult.migrated > 0) {
            }
        } catch (migrationError) {
            console.error('⚠️ Budget migration failed, continuing anyway:', migrationError);
        }

        const users = this.usersRepo.findAll();
        let accounts = this.accountsRepo.findAll();
        ensureMandatorySystemAccountsPersisted(this.accountsRepo, accounts);
        accounts = this.accountsRepo.findAll();
        // Contacts: in API/LAN mode PostgreSQL is source of truth (GET /contacts + incremental sync); avoid stale SQLite rows in React state.
        const contacts: AppState['contacts'] = isLocalOnlyMode() ? this.contactsRepo.findAll() : [];
        let categories = this.categoriesRepo.findAll();
        ensureMandatorySystemCategoriesPersisted(this.categoriesRepo, categories);
        categories = this.categoriesRepo.findAll();
        categories = this.mergePlSubtypesFromMapping(categories);
        // Projects & units: source of truth is PostgreSQL API — not loaded from SQLite (see AppStateApiService / GET /projects, /units).
        const projects: AppState['projects'] = [];
        const buildings = this.buildingsRepo.findAll();
        const properties = this.propertiesRepo.findAll();
        const propertyOwnershipHistory = this.propertyOwnershipHistoryRepo.findAll();
        const units: AppState['units'] = [];
        // Vendors: source of truth is PostgreSQL API — not loaded from SQLite (GET /vendors).
        const vendors: AppState['vendors'] = [];
        const budgets = this.budgetsRepo.findAll();
        const rentalAgreements = this.rentalAgreementsRepo.findAll();
        const projectAgreements = this.projectAgreementsRepo.findAll();
        const recurringTemplates = this.recurringTemplatesRepo.findAll();
        const planAmenities = this.planAmenitiesRepo.findAll();
        const transactions = this.transactionsRepo.findAll();
        const invoices = this.invoicesRepo.findAll();
        const bills = this.billsRepo.findAll({ excludeHeavyColumns: true });
        const contracts = this.contractsRepo.findAll({ excludeHeavyColumns: true });
        const quotations = this.quotationsRepo.findAll({ excludeHeavyColumns: true });
        const documents = this.documentsRepo.findAll({ excludeHeavyColumns: true });
        const pmCycleAllocations = this.pmCycleAllocationsRepo.findAll();
        const installmentPlans = this.installmentPlansRepo.findAll();
        const salesReturns = this.salesReturnsRepo.findAll();
        const projectReceivedAssets = this.projectReceivedAssetsRepo.findAll();
        const personalCategoriesRaw = this.personalCategoriesRepo.findAll();
        const personalTransactionsRaw = this.personalTransactionsRepo.findAll();
        const transactionLog = this.transactionLogRepo.findAll({ limit: 500, orderBy: 'timestamp', orderDir: 'DESC' });
        const errorLog = this.errorLogRepo.findAll({ limit: 200, orderBy: 'timestamp', orderDir: 'DESC' });

        // ── Repair data corrupted by the batch INSERT OR REPLACE bug ──
        // The bug used the first record's keys as column list; any column absent
        // on that record was omitted from INSERT OR REPLACE, causing SQLite to
        // replace it with NULL.  The repair uses cross-table relationships to
        // restore missing FK fields.  Each UPDATE is a no-op when data is intact.
        try {
            this.repairCorruptedFields();
        } catch (repairErr) {
            console.error('[LocalDB] Data repair failed (non-fatal):', repairErr);
        }

        // Re-read entities that may have been repaired by the above UPDATE statements
        const repairedInvoices = this.invoicesRepo.findAll();
        const repairedTransactions = this.transactionsRepo.findAll();
        const repairedBills = this.billsRepo.findAll({ excludeHeavyColumns: true });
        const repairedRentalAgreements = this.rentalAgreementsRepo.findAll();
        const repairedProperties = this.propertiesRepo.findAll();

        // Normalize properties so monthlyServiceCharge is always a number (fixes Monthly Service Charges report and Settings grid)
        const normalizedProperties = repairedProperties.map((p: any) => ({
            ...p,
            monthlyServiceCharge: p.monthlyServiceCharge != null ? Number(p.monthlyServiceCharge) : 0,
        }));

        let cashFlowCategoryMappings: CashflowCategoryMappingEntry[] = [];
        try {
            cashFlowCategoryMappings = this.cashflowCategoryMappingRepo
                .findAllForTenant(getCurrentTenantId())
                .map((r) => ({
                    accountId: r.accountId,
                    category: r.category as CashflowCategoryMappingEntry['category'],
                }));
        } catch (e) {
            console.warn('[LocalDB] cashflow_category_mapping load skipped:', e);
        }

        const rawSettings = this.appSettingsRepo.loadAllSettings();
        // In API/LAN mode, tenant-wide settings come from PostgreSQL (GET /app-settings); keep only device-local keys in SQLite.
        const settings: any = isLocalOnlyMode()
            ? rawSettings
            : {
                  current_user_id: rawSettings.current_user_id,
                  currentPage: rawSettings.currentPage,
              };

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
            buildings,
            properties: normalizedProperties,
            propertyOwnershipHistory: propertyOwnershipHistory || [],
            units,
            transactions: repairedTransactions,
            invoices: repairedInvoices.map((inv: any) => ({
                ...inv,
                issueDate:
                    inv.issueDate != null && String(inv.issueDate).trim() !== ''
                        ? parseStoredDateToYyyyMmDdInput(String(inv.issueDate))
                        : inv.issueDate ?? toLocalDateString(new Date()),
                dueDate:
                    inv.dueDate != null && String(inv.dueDate).trim() !== ''
                        ? parseStoredDateToYyyyMmDdInput(String(inv.dueDate))
                        : inv.dueDate,
            })),
            bills: repairedBills.map((b: any) => ({
                ...b,
                status: b.status ?? 'Unpaid',
                issueDate:
                    b.issueDate != null && String(b.issueDate).trim() !== ''
                        ? parseStoredDateToYyyyMmDdInput(String(b.issueDate))
                        : toLocalDateString(new Date()),
                dueDate:
                    b.dueDate != null && String(b.dueDate).trim() !== ''
                        ? parseStoredDateToYyyyMmDdInput(String(b.dueDate))
                        : b.dueDate,
                billNumber: b.billNumber ?? `BILL-${b.id}`,
            })),
            quotations,
            documents,
            pmCycleAllocations: pmCycleAllocations.map((pm: any) => ({
                ...pm,
                excludedCategoryIds: Array.isArray(pm.excludedCategoryIds) ? pm.excludedCategoryIds : [],
            })),
            budgets,
            planAmenities: planAmenities || [],
            rentalAgreements: (() => {
                const mapped = repairedRentalAgreements.map((ra: any) => ({
                    ...ra,
                    status: ra.status || 'Active',
                    startDate: ra.startDate ?? toLocalDateString(new Date()),
                    endDate: ra.endDate ?? toLocalDateString(new Date()),
                    rentDueDate: typeof ra.rentDueDate === 'number' ? ra.rentDueDate : parseInt(String(ra.rentDueDate || '1')),
                }));
                try {
                    const reconciled = reconcileRentalAgreementsList(mapped);
                    if (rentalAgreementsReconcileChanged(mapped, reconciled)) {
                        try {
                            this.rentalAgreementsRepo.saveAll(reconciled, { skipOrphanCleanup: true });
                        } catch (persistErr) {
                            console.warn('[LocalDB] rental agreement reconcile persist failed:', persistErr);
                        }
                    }
                    return reconciled;
                } catch (e) {
                    console.warn('[LocalDB] rental agreement reconcile skipped:', e);
                    return mapped;
                }
            })(),
            projectAgreements: projectAgreements.map((pa: any) => ({
                ...pa,
                unitIds: Array.isArray(pa.unitIds) ? pa.unitIds : [],
                status: normalizeProjectAgreementStatus(pa.status),
                issueDate: pa.issueDate ?? toLocalDateString(new Date()),
            })),
            contracts,
            recurringInvoiceTemplates: recurringTemplates.map((t: any) => ({
                ...t,
                nextDueDate:
                    t.nextDueDate != null && String(t.nextDueDate).trim() !== ''
                        ? parseStoredDateToYyyyMmDdInput(String(t.nextDueDate))
                        : t.nextDueDate ?? '',
            })),
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
            accountConsistency: settings.accountConsistency || { actualByAccountId: {} },
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
            projectReceivedAssets,
            vendors,
            personalCategories: personalCategoriesRaw.map(
                (r: any): PersonalCategoryEntry => ({
                    id: r.id,
                    name: r.name || '',
                    type: r.type === 'Expense' ? 'Expense' : 'Income',
                    sortOrder: typeof r.sortOrder === 'number' ? r.sortOrder : Number(r.sort_order ?? 0) || 0,
                    version: typeof r.version === 'number' ? r.version : undefined,
                    deletedAt: r.deletedAt ?? r.deleted_at ?? undefined,
                })
            ),
            personalTransactions: personalTransactionsRaw.map(
                (r: any): PersonalTransactionEntry => ({
                    id: r.id,
                    tenantId: r.tenantId ?? r.tenant_id,
                    accountId: r.accountId ?? r.account_id ?? '',
                    personalCategoryId: r.personalCategoryId ?? r.personal_category_id ?? '',
                    type: r.type === 'Expense' ? 'Expense' : 'Income',
                    amount: typeof r.amount === 'number' ? r.amount : parseFloat(String(r.amount ?? '0')),
                    transactionDate: r.transactionDate ?? r.transaction_date ?? '',
                    description: r.description ?? undefined,
                    version: typeof r.version === 'number' ? r.version : undefined,
                    deletedAt: r.deletedAt ?? r.deleted_at ?? undefined,
                    createdAt: r.createdAt ?? r.created_at,
                    updatedAt: r.updatedAt ?? r.updated_at,
                })
            ),
            cashFlowCategoryMappings,

            transactionLog,
            errorLog,
            enableDatePreservation: settings.enableDatePreservation ?? false,
            whatsAppMode: (settings.whatsAppMode === 'api' || settings.whatsAppMode === 'manual') ? settings.whatsAppMode : 'manual',
            currentPage: (settings.currentPage as any) || 'dashboard',
            editingEntity: null,
            initialTransactionType: null,
            initialTransactionFilter: null,
            initialTabs: []
        };

        // Repair invoice paidAmount/status when they are out of sync with transactions (e.g. payment was deleted but invoice was not updated)
        state.invoices = this.repairInvoicePaidAmountFromTransactions(state.invoices, state.transactions);
        state.bills = this.repairBillPaidAmountFromTransactions(state.bills, state.transactions);

        console.log(`[LocalDB] loadState done: accounts=${state.accounts?.length ?? 0} contacts=${state.contacts?.length ?? 0} transactions=${state.transactions?.length ?? 0} installmentPlans=${state.installmentPlans?.length ?? 0} pmCycleAllocations=${state.pmCycleAllocations?.length ?? 0}`);
        return state;
    }

    /**
     * Recompute each invoice's paidAmount from INCOME transactions linked to that invoice.
     * If stored paidAmount/status differs, correct the invoice and persist to DB.
     * Fixes state where a payment was deleted but the invoice row was not updated.
     */
    private repairInvoicePaidAmountFromTransactions(invoices: Invoice[], transactions: Transaction[]): Invoice[] {
        const incomeByInvoice = new Map<string, number>();
        for (const tx of transactions) {
            const type = tx.type === TransactionType.INCOME || (tx as any).type === 'Income' || (tx as any).type === 'INCOME';
            if (!type || !tx.invoiceId) continue;
            const amt = typeof tx.amount === 'number' ? tx.amount : parseFloat(String(tx.amount)) || 0;
            incomeByInvoice.set(tx.invoiceId, (incomeByInvoice.get(tx.invoiceId) ?? 0) + amt);
        }
        const threshold = 0.01;
        let repaired = 0;
        const result = invoices.map(inv => {
            const computedPaid = incomeByInvoice.get(inv.id) ?? 0;
            const storedPaid = typeof inv.paidAmount === 'number' ? inv.paidAmount : parseFloat(String(inv.paidAmount ?? 0)) || 0;
            if (Math.abs(computedPaid - storedPaid) < threshold) return inv;
            const amount = typeof inv.amount === 'number' ? inv.amount : parseFloat(String(inv.amount)) || 0;
            let newStatus = inv.status;
            if (computedPaid >= amount - threshold) newStatus = InvoiceStatus.PAID;
            else if (computedPaid > threshold) newStatus = InvoiceStatus.PARTIALLY_PAID;
            else newStatus = InvoiceStatus.UNPAID;
            const updated = { ...inv, paidAmount: computedPaid, status: newStatus };
            if (this.db.isReady()) {
                try {
                    this.invoicesRepo.update(inv.id, { paidAmount: computedPaid, status: newStatus });
                    repaired++;
                } catch (e) {
                    console.warn('[LocalDB] repairInvoicePaidAmount: failed to persist invoice', inv.id, e);
                }
            }
            return updated;
        });
        if (repaired > 0) {
            console.log(`[LocalDB] repairInvoicePaidAmount: corrected ${repaired} invoice(s) to match transactions`);
        }
        return result;
    }

    /**
     * Recompute each bill's paidAmount from EXPENSE transactions linked to that bill (bill_id).
     * Mirrors repairInvoicePaidAmountFromTransactions; fixes rental/project bills showing Unpaid after payment.
     */
    private repairBillPaidAmountFromTransactions(bills: Bill[], transactions: Transaction[]): Bill[] {
        const expenseByBill = new Map<string, number>();
        for (const tx of transactions) {
            const isExpense =
                tx.type === TransactionType.EXPENSE ||
                (tx as any).type === 'Expense' ||
                (tx as any).type === 'EXPENSE';
            if (!isExpense) continue;
            const bid = tx.billId ?? (tx as any).bill_id;
            if (!bid) continue;
            const amt = typeof tx.amount === 'number' ? tx.amount : parseFloat(String(tx.amount)) || 0;
            const key = String(bid);
            expenseByBill.set(key, (expenseByBill.get(key) ?? 0) + amt);
        }
        const threshold = 0.01;
        let repaired = 0;
        const result = bills.map(bill => {
            const computedPaid = expenseByBill.get(String(bill.id)) ?? 0;
            const storedPaid = typeof bill.paidAmount === 'number' ? bill.paidAmount : parseFloat(String(bill.paidAmount ?? 0)) || 0;
            if (Math.abs(computedPaid - storedPaid) < threshold) return bill;
            const amount = typeof bill.amount === 'number' ? bill.amount : parseFloat(String(bill.amount)) || 0;
            let newStatus: string;
            if (computedPaid >= amount - threshold) newStatus = InvoiceStatus.PAID;
            else if (computedPaid > threshold) newStatus = InvoiceStatus.PARTIALLY_PAID;
            else newStatus = InvoiceStatus.UNPAID;
            const updated = { ...bill, paidAmount: computedPaid, status: newStatus as Bill['status'] };
            if (this.db.isReady()) {
                try {
                    this.billsRepo.update(bill.id, { paidAmount: computedPaid, status: newStatus as Bill['status'] });
                    repaired++;
                } catch (e) {
                    console.warn('[LocalDB] repairBillPaidAmount: failed to persist bill', bill.id, e);
                }
            }
            return updated;
        });
        if (repaired > 0) {
            console.log(`[LocalDB] repairBillPaidAmount: corrected ${repaired} bill(s) to match payment transactions`);
        }
        return result;
    }

    // loadDelta removed -- local-only architecture has no delta sync

    /**
     * Map reducer action type (e.g. 'DELETE_CONTACT') to database table name.
     * Used for incremental delete persistence to avoid full saveState on delete.
     */
    private static readonly DELETE_ACTION_TO_TABLE: Record<string, string> = {
        DELETE_ACCOUNT: 'accounts',
        DELETE_CONTACT: 'contacts',
        DELETE_VENDOR: 'vendors',
        DELETE_TRANSACTION: 'transactions',
        DELETE_INVOICE: 'invoices',
        DELETE_BILL: 'bills',
        DELETE_PROJECT: 'projects',
        DELETE_BUILDING: 'buildings',
        DELETE_PROPERTY: 'properties',
        DELETE_UNIT: 'units',
        DELETE_CATEGORY: 'categories',
        DELETE_USER: 'users',
        DELETE_RENTAL_AGREEMENT: 'rental_agreements',
        DELETE_PROJECT_AGREEMENT: 'project_agreements',
        DELETE_QUOTATION: 'quotations',
        DELETE_DOCUMENT: 'documents',
        DELETE_BUDGET: 'budgets',
        DELETE_PM_CYCLE_ALLOCATION: 'pm_cycle_allocations',
        DELETE_SALES_RETURN: 'sales_returns',
        DELETE_PROJECT_RECEIVED_ASSET: 'project_received_assets',
        DELETE_CONTRACT: 'contracts',
        DELETE_RECURRING_TEMPLATE: 'recurring_invoice_templates',
        DELETE_INSTALLMENT_PLAN: 'installment_plans',
        DELETE_PLAN_AMENITY: 'plan_amenities',
    };

    /**
     * Persist a single new transaction and any linked invoice/bill updates without running full saveState.
     * Used when the only state change was ADD_TRANSACTION to avoid blocking the UI with a full save (~2s+).
     * @param transaction - The new transaction to insert
     * @param updatedInvoices - Invoices whose paidAmount/status were updated by applyTransactionEffect (e.g. one invoice for invoice payment)
     * @param updatedBills - Bills whose paidAmount/status were updated (e.g. bill payment)
     */
    insertTransactionAndUpdateLinked(transaction: Transaction, updatedInvoices: Invoice[] = [], updatedBills: Bill[] = []): void {
        if (!this.db.isReady()) return;
        try {
            this.db.transaction([
                () => {
                    this.transactionsRepo.insert(transaction);
                    for (const inv of updatedInvoices) {
                        this.invoicesRepo.update(inv.id, { paidAmount: inv.paidAmount, status: inv.status });
                    }
                    for (const bill of updatedBills) {
                        this.billsRepo.update(bill.id, { paidAmount: bill.paidAmount, status: bill.status });
                    }
                }
            ]);
        } catch (e) {
            console.error('[LocalDB] insertTransactionAndUpdateLinked failed:', e);
            notifyDatabaseError(e, { context: 'Could not save the payment to the local database.' });
            throw e;
        }
    }

    /**
     * Delete a single transaction and persist any linked invoice/bill paidAmount and status updates.
     * Used when reversing a payment so the DB stays in sync with reducer-updated invoices/bills.
     */
    deleteTransactionAndUpdateLinked(transactionId: string, invoice?: Invoice | null, bill?: Bill | null): void {
        if (!this.db.isReady()) return;
        try {
            this.db.transaction([
                () => {
                    this.transactionsRepo.delete(transactionId);
                    if (invoice) {
                        this.invoicesRepo.update(invoice.id, { paidAmount: invoice.paidAmount, status: invoice.status });
                    }
                    if (bill) {
                        this.billsRepo.update(bill.id, { paidAmount: bill.paidAmount, status: bill.status });
                    }
                }
            ]);
            console.log(`[LocalDB] deleteTransactionAndUpdateLinked ${transactionId} (incremental)`);
        } catch (e) {
            console.error('[LocalDB] deleteTransactionAndUpdateLinked failed:', e);
            notifyDatabaseError(e, { context: 'Could not update the local database after reversing a payment.' });
            throw e;
        }
    }

    /**
     * Persist a single entity deletion to the database without running full saveState.
     * Call this when the only state change was a delete to avoid blocking the UI with a full save.
     * @param tableKey - Table name (e.g. 'contacts', 'transactions')
     * @param id - Primary key of the deleted record
     */
    deleteEntity(tableKey: string, id: string): void {
        if (!this.db.isReady()) return;
        const repos: Record<string, { delete: (id: string) => void }> = {
            accounts: this.accountsRepo,
            contacts: this.contactsRepo,
            vendors: this.vendorsRepo,
            transactions: this.transactionsRepo,
            invoices: this.invoicesRepo,
            bills: this.billsRepo,
            projects: this.projectsRepo,
            buildings: this.buildingsRepo,
            properties: this.propertiesRepo,
            property_ownership_history: this.propertyOwnershipHistoryRepo,
            units: this.unitsRepo,
            categories: this.categoriesRepo,
            users: this.usersRepo,
            rental_agreements: this.rentalAgreementsRepo,
            project_agreements: this.projectAgreementsRepo,
            quotations: this.quotationsRepo,
            documents: this.documentsRepo,
            budgets: this.budgetsRepo,
            pm_cycle_allocations: this.pmCycleAllocationsRepo,
            sales_returns: this.salesReturnsRepo,
            project_received_assets: this.projectReceivedAssetsRepo,
            contracts: this.contractsRepo,
            recurring_invoice_templates: this.recurringTemplatesRepo,
            installment_plans: this.installmentPlansRepo,
            plan_amenities: this.planAmenitiesRepo,
            personal_categories: this.personalCategoriesRepo,
            personal_transactions: this.personalTransactionsRepo,
        };
        const repo = repos[tableKey];
        if (repo) {
            try {
                repo.delete(id);
                console.log(`[LocalDB] deleteEntity ${tableKey} ${id} (incremental)`);
            } catch (e) {
                console.error(`[LocalDB] deleteEntity failed for ${tableKey}/${id}:`, e);
                notifyDatabaseError(e, { context: 'Could not delete the record in the local database.' });
                throw e;
            }
        }
    }

    /**
     * Persist multiple new transactions and their linked invoice/bill updates without running full saveState.
     * Used for BATCH_ADD_TRANSACTIONS (bulk payments) to avoid blocking the UI.
     */
    async insertTransactionsBatchAndUpdateLinked(
        transactions: Transaction[],
        updatedInvoices: Invoice[] = [],
        updatedBills: Bill[] = []
    ): Promise<void> {
        if (!this.db.isReady() || transactions.length === 0) return;
        const eds = this.db as any;
        try {
            if (typeof eds.transactionAsync === 'function') {
                const ops: { type: 'query' | 'run'; sql: string; params?: unknown[] }[] = [];
                ops.push({ type: 'run', sql: 'PRAGMA foreign_keys = OFF' });
                ops.push(...this.transactionsRepo.buildBatchInsertOrReplaceOps_public(transactions));
                for (const inv of updatedInvoices) {
                    ops.push({
                        type: 'run',
                        sql: `UPDATE invoices SET paid_amount = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
                        params: [inv.paidAmount, inv.status, inv.id],
                    });
                }
                for (const bill of updatedBills) {
                    ops.push({
                        type: 'run',
                        sql: `UPDATE bills SET paid_amount = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
                        params: [bill.paidAmount, bill.status, bill.id],
                    });
                }
                ops.push({ type: 'run', sql: 'PRAGMA foreign_keys = ON' });
                await eds.transactionAsync(ops);
                console.log(`[LocalDB] insertTransactionsBatchAndUpdateLinked: ${transactions.length} txs, ${updatedInvoices.length} invoices, ${updatedBills.length} bills (async)`);
            } else {
                this.db.transaction([() => {
                    for (const tx of transactions) this.transactionsRepo.insert(tx);
                    for (const inv of updatedInvoices) this.invoicesRepo.update(inv.id, { paidAmount: inv.paidAmount, status: inv.status });
                    for (const bill of updatedBills) this.billsRepo.update(bill.id, { paidAmount: bill.paidAmount, status: bill.status });
                }]);
            }
        } catch (e) {
            console.error('[LocalDB] insertTransactionsBatchAndUpdateLinked failed:', e);
            notifyDatabaseError(e, { context: 'Could not save bulk payments to the local database.' });
            throw e;
        }
    }

    /**
     * Delete multiple transactions by ID without running full saveState.
     * Used for BATCH_DELETE_TRANSACTIONS (reverse bulk payments).
     */
    async deleteTransactionsBatch(transactionIds: string[], updatedInvoices: Invoice[] = [], updatedBills: Bill[] = []): Promise<void> {
        if (!this.db.isReady() || transactionIds.length === 0) return;
        const eds = this.db as any;
        try {
            if (typeof eds.transactionAsync === 'function') {
                const ops: { type: 'query' | 'run'; sql: string; params?: unknown[] }[] = [];
                const BATCH = 500;
                for (let i = 0; i < transactionIds.length; i += BATCH) {
                    const batch = transactionIds.slice(i, i + BATCH);
                    const placeholders = batch.map(() => '?').join(',');
                    ops.push({
                        type: 'run',
                        sql: `DELETE FROM transactions WHERE id IN (${placeholders})`,
                        params: batch,
                    });
                }
                for (const inv of updatedInvoices) {
                    ops.push({
                        type: 'run',
                        sql: `UPDATE invoices SET paid_amount = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
                        params: [inv.paidAmount, inv.status, inv.id],
                    });
                }
                for (const bill of updatedBills) {
                    ops.push({
                        type: 'run',
                        sql: `UPDATE bills SET paid_amount = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
                        params: [bill.paidAmount, bill.status, bill.id],
                    });
                }
                await eds.transactionAsync(ops);
                console.log(`[LocalDB] deleteTransactionsBatch: ${transactionIds.length} txs deleted (async)`);
            } else {
                this.db.transaction([() => {
                    for (const id of transactionIds) this.transactionsRepo.delete(id);
                    for (const inv of updatedInvoices) this.invoicesRepo.update(inv.id, { paidAmount: inv.paidAmount, status: inv.status });
                    for (const bill of updatedBills) this.billsRepo.update(bill.id, { paidAmount: bill.paidAmount, status: bill.status });
                }]);
            }
        } catch (e) {
            console.error('[LocalDB] deleteTransactionsBatch failed:', e);
            notifyDatabaseError(e, { context: 'Could not reverse bulk payments in the local database.' });
            throw e;
        }
    }

    /**
     * Persist a single entity update to the database without running full saveState.
     */
    async updateEntityAsync(tableKey: string, id: string, data: Record<string, unknown>): Promise<void> {
        if (!this.db.isReady()) return;
        const repo = this.getRepoByEntityKey(tableKey);
        if (!repo) return;
        try {
            (repo as any).update(id, data);
            console.log(`[LocalDB] updateEntityAsync ${tableKey} ${id} (incremental)`);
        } catch (e) {
            console.error(`[LocalDB] updateEntityAsync failed for ${tableKey}/${id}:`, e);
            notifyDatabaseError(e, { context: 'Could not save the change to the local database.' });
            throw e;
        }
    }

    /**
     * Repair fields that were nullified by the batch INSERT OR REPLACE bug.
     * Uses cross-table relationships to restore missing FK fields in-place.
     * Each UPDATE is a no-op when data is already intact.
     */
    private repairCorruptedFields(): void {
        const repairStatements = [
            // ── Invoices: recover agreement_id from transactions that still have it ──
            `UPDATE invoices SET agreement_id = (
                SELECT t.agreement_id FROM transactions t
                WHERE t.invoice_id = invoices.id AND t.agreement_id IS NOT NULL AND t.agreement_id != ''
                LIMIT 1
            ) WHERE (agreement_id IS NULL OR agreement_id = '')
              AND EXISTS (SELECT 1 FROM transactions t WHERE t.invoice_id = invoices.id AND t.agreement_id IS NOT NULL AND t.agreement_id != '')`,

            // ── Invoices: recover agreement_id from project_agreements by matching contact_id ──
            // Fallback when transaction.agreement_id was also corrupted
            `UPDATE invoices SET agreement_id = (
                SELECT pa.id FROM project_agreements pa
                WHERE pa.client_id = invoices.contact_id
                  AND pa.project_id IS NOT NULL
                LIMIT 1
            ) WHERE (agreement_id IS NULL OR agreement_id = '')
              AND (invoice_type = 'Installment' OR invoice_type IS NULL OR invoice_type = '')
              AND contact_id IS NOT NULL AND contact_id != ''
              AND EXISTS (SELECT 1 FROM project_agreements pa WHERE pa.client_id = invoices.contact_id)`,

            // ── Invoices: recover agreement_id from rental_agreements by matching contact_id + property ──
            `UPDATE invoices SET agreement_id = (
                SELECT ra.id FROM rental_agreements ra
                WHERE ra.contact_id = invoices.contact_id
                  AND (ra.property_id = invoices.property_id OR invoices.property_id IS NULL OR invoices.property_id = '')
                LIMIT 1
            ) WHERE (agreement_id IS NULL OR agreement_id = '')
              AND (invoice_type = 'Rental' OR invoice_type IS NULL OR invoice_type = '')
              AND contact_id IS NOT NULL AND contact_id != ''
              AND EXISTS (SELECT 1 FROM rental_agreements ra WHERE ra.contact_id = invoices.contact_id)`,

            // ── Invoices: recover invoice_type from linked agreement type ──
            // If agreement exists in project_agreements → Installment
            `UPDATE invoices SET invoice_type = 'Installment'
            WHERE (invoice_type IS NULL OR invoice_type = '')
              AND agreement_id IS NOT NULL AND agreement_id != ''
              AND EXISTS (SELECT 1 FROM project_agreements pa WHERE pa.id = invoices.agreement_id)`,

            // If agreement exists in rental_agreements → Rental
            `UPDATE invoices SET invoice_type = 'Rental'
            WHERE (invoice_type IS NULL OR invoice_type = '')
              AND agreement_id IS NOT NULL AND agreement_id != ''
              AND EXISTS (SELECT 1 FROM rental_agreements ra WHERE ra.id = invoices.agreement_id)`,

            // Recover invoice_type from transaction description patterns
            `UPDATE invoices SET invoice_type = 'Installment'
            WHERE (invoice_type IS NULL OR invoice_type = '')
              AND EXISTS (SELECT 1 FROM transactions t WHERE t.invoice_id = invoices.id
                AND (t.description LIKE '%installment%' OR t.description LIKE '%Installment%'))`,

            // Recover invoice_type from invoice_number prefix patterns (P-INV- → Installment, INV- without P- → Rental)
            `UPDATE invoices SET invoice_type = 'Installment'
            WHERE (invoice_type IS NULL OR invoice_type = '')
              AND invoice_number LIKE 'P-INV-%'`,

            `UPDATE invoices SET invoice_type = 'Rental'
            WHERE (invoice_type IS NULL OR invoice_type = '')
              AND invoice_number LIKE 'INV-%'
              AND invoice_number NOT LIKE 'P-INV-%'`,

            // Recover invoice_type from project_id: if an invoice has project_id set, it's likely Installment
            `UPDATE invoices SET invoice_type = 'Installment'
            WHERE (invoice_type IS NULL OR invoice_type = '')
              AND project_id IS NOT NULL AND project_id != ''
              AND (property_id IS NULL OR property_id = '')`,

            // Recover invoice_type from property_id: if an invoice has property_id but no project_id, it's likely Rental
            `UPDATE invoices SET invoice_type = 'Rental'
            WHERE (invoice_type IS NULL OR invoice_type = '')
              AND property_id IS NOT NULL AND property_id != ''
              AND (project_id IS NULL OR project_id = '')`,

            // Recover invoice_type from unit_id → units.project_id (unit belongs to a project → Installment)
            `UPDATE invoices SET invoice_type = 'Installment'
            WHERE (invoice_type IS NULL OR invoice_type = '')
              AND unit_id IS NOT NULL AND unit_id != ''
              AND EXISTS (SELECT 1 FROM units u WHERE u.id = invoices.unit_id AND u.project_id IS NOT NULL AND u.project_id != '')`,

            // ── Invoices: recover propertyId / buildingId / unitId / projectId / categoryId from rental agreements ──
            `UPDATE invoices SET property_id = (
                SELECT ra.property_id FROM rental_agreements ra WHERE ra.id = invoices.agreement_id
            ) WHERE agreement_id IS NOT NULL AND agreement_id != ''
              AND (property_id IS NULL OR property_id = '')`,

            `UPDATE invoices SET building_id = (
                SELECT p.building_id FROM properties p WHERE p.id = invoices.property_id
            ) WHERE property_id IS NOT NULL AND property_id != ''
              AND (building_id IS NULL OR building_id = '')`,

            // Recover invoices unitId from project_agreement_units junction table
            `UPDATE invoices SET unit_id = (
                SELECT pau.unit_id FROM project_agreement_units pau
                WHERE pau.agreement_id = invoices.agreement_id LIMIT 1
            ) WHERE agreement_id IS NOT NULL AND agreement_id != ''
              AND (unit_id IS NULL OR unit_id = '')
              AND EXISTS (SELECT 1 FROM project_agreement_units pau WHERE pau.agreement_id = invoices.agreement_id)`,

            // Recover invoices projectId from project agreements
            `UPDATE invoices SET project_id = (
                SELECT pa.project_id FROM project_agreements pa WHERE pa.id = invoices.agreement_id
            ) WHERE agreement_id IS NOT NULL AND agreement_id != ''
              AND (project_id IS NULL OR project_id = '')
              AND EXISTS (SELECT 1 FROM project_agreements pa WHERE pa.id = invoices.agreement_id)`,

            // Recover invoices categoryId based on invoice_type
            `UPDATE invoices SET category_id = (
                SELECT c.id FROM categories c WHERE c.name = 'Unit Selling Income' AND c.type = 'Income' LIMIT 1
            ) WHERE invoice_type = 'Installment'
              AND (category_id IS NULL OR category_id = '')`,

            `UPDATE invoices SET category_id = (
                SELECT c.id FROM categories c WHERE c.name = 'Rental Income' AND c.type = 'Income' LIMIT 1
            ) WHERE invoice_type = 'Rental'
              AND (category_id IS NULL OR category_id = '')`,

            `UPDATE invoices SET category_id = (
                SELECT c.id FROM categories c WHERE c.name = 'Service Charge Income' AND c.type = 'Income' LIMIT 1
            ) WHERE invoice_type = 'Service Charge'
              AND (category_id IS NULL OR category_id = '')`,

            `UPDATE invoices SET category_id = (
                SELECT c.id FROM categories c WHERE c.name = 'Security Deposit' AND c.type = 'Income' LIMIT 1
            ) WHERE invoice_type = 'Security Deposit'
              AND (category_id IS NULL OR category_id = '')`,

            // Recover invoices projectId from units when unit_id is available but project_id is not
            `UPDATE invoices SET project_id = (
                SELECT u.project_id FROM units u WHERE u.id = invoices.unit_id AND u.project_id IS NOT NULL AND u.project_id != ''
            ) WHERE unit_id IS NOT NULL AND unit_id != ''
              AND (project_id IS NULL OR project_id = '')`,

            // Recover invoices buildingId from properties.building_id when property_id is available
            `UPDATE invoices SET building_id = (
                SELECT p.building_id FROM properties p WHERE p.id = invoices.property_id AND p.building_id IS NOT NULL AND p.building_id != ''
            ) WHERE property_id IS NOT NULL AND property_id != ''
              AND (building_id IS NULL OR building_id = '')`,

            // Recover invoices contact_id from project agreements when agreement_id is available
            `UPDATE invoices SET contact_id = (
                SELECT pa.client_id FROM project_agreements pa WHERE pa.id = invoices.agreement_id
            ) WHERE agreement_id IS NOT NULL AND agreement_id != ''
              AND (contact_id IS NULL OR contact_id = '')
              AND EXISTS (SELECT 1 FROM project_agreements pa WHERE pa.id = invoices.agreement_id)`,

            // Recover invoices contact_id from rental agreements
            `UPDATE invoices SET contact_id = (
                SELECT ra.contact_id FROM rental_agreements ra WHERE ra.id = invoices.agreement_id
            ) WHERE agreement_id IS NOT NULL AND agreement_id != ''
              AND (contact_id IS NULL OR contact_id = '')
              AND EXISTS (SELECT 1 FROM rental_agreements ra WHERE ra.id = invoices.agreement_id)`,

            // ── Transactions: recover invoice_id from description matching 'Invoice #XXX' ──
            // Payment transactions have descriptions like "Payment for Invoice #INV-0001"
            `UPDATE transactions SET invoice_id = (
                SELECT i.id FROM invoices i
                WHERE transactions.description LIKE '%Invoice #' || i.invoice_number || '%'
                  AND i.id IS NOT NULL
                LIMIT 1
            ) WHERE type = 'Income'
              AND (invoice_id IS NULL OR invoice_id = '')
              AND description LIKE '%Invoice #%'
              AND EXISTS (
                SELECT 1 FROM invoices i
                WHERE transactions.description LIKE '%Invoice #' || i.invoice_number || '%'
              )`,

            // ── Transactions: recover projectId / categoryId / contactId / propertyId / unitId from linked invoices ──
            `UPDATE transactions SET project_id = (
                SELECT i.project_id FROM invoices i WHERE i.id = transactions.invoice_id AND i.project_id IS NOT NULL AND i.project_id != ''
            ) WHERE invoice_id IS NOT NULL AND invoice_id != ''
              AND (project_id IS NULL OR project_id = '')`,

            `UPDATE transactions SET category_id = (
                SELECT i.category_id FROM invoices i WHERE i.id = transactions.invoice_id AND i.category_id IS NOT NULL AND i.category_id != ''
            ) WHERE invoice_id IS NOT NULL AND invoice_id != ''
              AND (category_id IS NULL OR category_id = '')`,

            `UPDATE transactions SET contact_id = (
                SELECT i.contact_id FROM invoices i WHERE i.id = transactions.invoice_id AND i.contact_id IS NOT NULL AND i.contact_id != ''
            ) WHERE invoice_id IS NOT NULL AND invoice_id != ''
              AND (contact_id IS NULL OR contact_id = '')`,

            `UPDATE transactions SET property_id = (
                SELECT i.property_id FROM invoices i WHERE i.id = transactions.invoice_id AND i.property_id IS NOT NULL AND i.property_id != ''
            ) WHERE invoice_id IS NOT NULL AND invoice_id != ''
              AND (property_id IS NULL OR property_id = '')`,

            `UPDATE transactions SET unit_id = (
                SELECT i.unit_id FROM invoices i WHERE i.id = transactions.invoice_id AND i.unit_id IS NOT NULL AND i.unit_id != ''
            ) WHERE invoice_id IS NOT NULL AND invoice_id != ''
              AND (unit_id IS NULL OR unit_id = '')`,

            `UPDATE transactions SET building_id = (
                SELECT i.building_id FROM invoices i WHERE i.id = transactions.invoice_id AND i.building_id IS NOT NULL AND i.building_id != ''
            ) WHERE invoice_id IS NOT NULL AND invoice_id != ''
              AND (building_id IS NULL OR building_id = '')`,

            // ── Transactions: Security Deposit Refund to tenant — set building_id from property (rental termination refund flow)
            `UPDATE transactions SET building_id = (
                SELECT p.building_id FROM properties p WHERE p.id = transactions.property_id AND p.building_id IS NOT NULL AND p.building_id != ''
            ) WHERE property_id IS NOT NULL AND property_id != ''
              AND (building_id IS NULL OR building_id = '')
              AND category_id = (SELECT id FROM categories WHERE name = 'Security Deposit Refund' AND type = 'Expense' LIMIT 1)`,

            // ── Transactions: recover projectId / categoryId from linked bills ──
            `UPDATE transactions SET project_id = (
                SELECT b.project_id FROM bills b WHERE b.id = transactions.bill_id AND b.project_id IS NOT NULL AND b.project_id != ''
            ) WHERE bill_id IS NOT NULL AND bill_id != ''
              AND (project_id IS NULL OR project_id = '')`,

            `UPDATE transactions SET category_id = (
                SELECT b.category_id FROM bills b WHERE b.id = transactions.bill_id AND b.category_id IS NOT NULL AND b.category_id != ''
            ) WHERE bill_id IS NOT NULL AND bill_id != ''
              AND type = 'Expense'
              AND (category_id IS NULL OR category_id = '')`,

            // ── Transactions: recover agreement_id from linked invoices ──
            `UPDATE transactions SET agreement_id = (
                SELECT i.agreement_id FROM invoices i WHERE i.id = transactions.invoice_id AND i.agreement_id IS NOT NULL AND i.agreement_id != ''
            ) WHERE invoice_id IS NOT NULL AND invoice_id != ''
              AND (agreement_id IS NULL OR agreement_id = '')`,

            // ── Transactions: recover category_id by invoice_type when still missing ──
            `UPDATE transactions SET category_id = (
                SELECT c.id FROM categories c WHERE c.name = 'Unit Selling Income' AND c.type = 'Income' LIMIT 1
            ) WHERE invoice_id IS NOT NULL AND invoice_id != ''
              AND (category_id IS NULL OR category_id = '')
              AND EXISTS (SELECT 1 FROM invoices i WHERE i.id = transactions.invoice_id AND i.invoice_type = 'Installment')`,

            `UPDATE transactions SET category_id = (
                SELECT c.id FROM categories c WHERE c.name = 'Rental Income' AND c.type = 'Income' LIMIT 1
            ) WHERE invoice_id IS NOT NULL AND invoice_id != ''
              AND (category_id IS NULL OR category_id = '')
              AND EXISTS (SELECT 1 FROM invoices i WHERE i.id = transactions.invoice_id AND i.invoice_type = 'Rental')`,

            `UPDATE transactions SET category_id = (
                SELECT c.id FROM categories c WHERE c.name = 'Service Charge Income' AND c.type = 'Income' LIMIT 1
            ) WHERE invoice_id IS NOT NULL AND invoice_id != ''
              AND (category_id IS NULL OR category_id = '')
              AND EXISTS (SELECT 1 FROM invoices i WHERE i.id = transactions.invoice_id AND i.invoice_type = 'Service Charge')`,

            `UPDATE transactions SET category_id = (
                SELECT c.id FROM categories c WHERE c.name = 'Security Deposit' AND c.type = 'Income' LIMIT 1
            ) WHERE invoice_id IS NOT NULL AND invoice_id != ''
              AND (category_id IS NULL OR category_id = '')
              AND EXISTS (SELECT 1 FROM invoices i WHERE i.id = transactions.invoice_id AND i.invoice_type = 'Security Deposit')`,

            // ── Transactions: recover project_id from project_agreements via invoice agreement_id ──
            // When both invoice.project_id and transaction.project_id are null but invoice.agreement_id was recovered
            `UPDATE transactions SET project_id = (
                SELECT pa.project_id FROM project_agreements pa
                JOIN invoices i ON i.agreement_id = pa.id
                WHERE i.id = transactions.invoice_id AND pa.project_id IS NOT NULL AND pa.project_id != ''
                LIMIT 1
            ) WHERE invoice_id IS NOT NULL AND invoice_id != ''
              AND (project_id IS NULL OR project_id = '')
              AND EXISTS (
                SELECT 1 FROM invoices i
                JOIN project_agreements pa ON pa.id = i.agreement_id
                WHERE i.id = transactions.invoice_id AND pa.project_id IS NOT NULL
              )`,

            // ── Transactions: recover unit_id from project_agreement_units via invoice agreement_id ──
            `UPDATE transactions SET unit_id = (
                SELECT pau.unit_id FROM project_agreement_units pau
                JOIN invoices i ON i.agreement_id = pau.agreement_id
                WHERE i.id = transactions.invoice_id
                LIMIT 1
            ) WHERE invoice_id IS NOT NULL AND invoice_id != ''
              AND (unit_id IS NULL OR unit_id = '')
              AND EXISTS (
                SELECT 1 FROM invoices i
                JOIN project_agreement_units pau ON pau.agreement_id = i.agreement_id
                WHERE i.id = transactions.invoice_id
              )`,

            // ── Transactions: recover from_account_id from account_id for TRANSFER transactions ──
            // In this app, TRANSFER transactions always set accountId = fromAccountId
            `UPDATE transactions SET from_account_id = account_id
            WHERE type = 'Transfer'
              AND (from_account_id IS NULL OR from_account_id = '')
              AND account_id IS NOT NULL AND account_id != ''`,

            // ── Bills: recover projectId from linked contracts or invoices ──
            `UPDATE bills SET project_id = (
                SELECT c.project_id FROM contracts c WHERE c.id = bills.contract_id AND c.project_id IS NOT NULL AND c.project_id != ''
            ) WHERE contract_id IS NOT NULL AND contract_id != ''
              AND (project_id IS NULL OR project_id = '')`,

            // ── Rental Agreements: recover owner_id from properties ──
            `UPDATE rental_agreements SET owner_id = (
                SELECT p.owner_id FROM properties p WHERE p.id = rental_agreements.property_id AND p.owner_id IS NOT NULL AND p.owner_id != ''
            ) WHERE property_id IS NOT NULL AND property_id != ''
              AND (owner_id IS NULL OR owner_id = '')`,

            // ── Rental Agreements: recover broker_id from transactions that paid to a broker ──
            // Broker payout transactions have category 'Broker Fee' and agreement_id
            `UPDATE rental_agreements SET broker_id = (
                SELECT t.contact_id FROM transactions t
                JOIN categories c ON c.id = t.category_id
                WHERE t.agreement_id = rental_agreements.id
                  AND c.name = 'Broker Fee'
                  AND t.contact_id IS NOT NULL AND t.contact_id != ''
                LIMIT 1
            ) WHERE (broker_id IS NULL OR broker_id = '')
              AND EXISTS (
                SELECT 1 FROM transactions t
                JOIN categories c ON c.id = t.category_id
                WHERE t.agreement_id = rental_agreements.id AND c.name = 'Broker Fee' AND t.contact_id IS NOT NULL AND t.contact_id != ''
              )`,

            // ── Rental Agreements: recover broker_fee from Broker Fee transactions ──
            `UPDATE rental_agreements SET broker_fee = (
                SELECT t.amount FROM transactions t
                JOIN categories c ON c.id = t.category_id
                WHERE (t.agreement_id = rental_agreements.id OR t.property_id = rental_agreements.property_id)
                  AND c.name = 'Broker Fee'
                  AND t.amount > 0
                LIMIT 1
            ) WHERE broker_id IS NOT NULL AND broker_id != ''
              AND (broker_fee IS NULL OR broker_fee = 0)
              AND EXISTS (
                SELECT 1 FROM transactions t
                JOIN categories c ON c.id = t.category_id
                WHERE (t.agreement_id = rental_agreements.id OR t.property_id = rental_agreements.property_id)
                  AND c.name = 'Broker Fee' AND t.amount > 0
              )`,

            // ── Rental Agreements: recover broker_id from transactions with property_id match and Broker Fee category ──
            `UPDATE rental_agreements SET broker_id = (
                SELECT t.contact_id FROM transactions t
                JOIN categories c ON c.id = t.category_id
                WHERE t.property_id = rental_agreements.property_id
                  AND c.name = 'Broker Fee'
                  AND t.contact_id IS NOT NULL AND t.contact_id != ''
                LIMIT 1
            ) WHERE (broker_id IS NULL OR broker_id = '')
              AND property_id IS NOT NULL AND property_id != ''
              AND EXISTS (
                SELECT 1 FROM transactions t
                JOIN categories c ON c.id = t.category_id
                WHERE t.property_id = rental_agreements.property_id AND c.name = 'Broker Fee' AND t.contact_id IS NOT NULL AND t.contact_id != ''
              )`,

            // ── Rental Agreements: recover broker_id from transactions whose description contains 'broker' ──
            // Fallback when category_id on the transaction was also corrupted to NULL
            `UPDATE rental_agreements SET broker_id = (
                SELECT t.contact_id FROM transactions t
                WHERE (t.agreement_id = rental_agreements.id OR t.property_id = rental_agreements.property_id)
                  AND t.contact_id IS NOT NULL AND t.contact_id != ''
                  AND LOWER(t.description) LIKE '%broker%'
                LIMIT 1
            ) WHERE (broker_id IS NULL OR broker_id = '')
              AND EXISTS (
                SELECT 1 FROM transactions t
                WHERE (t.agreement_id = rental_agreements.id OR t.property_id = rental_agreements.property_id)
                  AND t.contact_id IS NOT NULL AND t.contact_id != ''
                  AND LOWER(t.description) LIKE '%broker%'
              )`,

            // ── Rental Agreements: recover broker_id by finding a BROKER/DEALER contact linked to the property ──
            // Last resort: find any transaction on this property whose contact_id is a broker/dealer type
            `UPDATE rental_agreements SET broker_id = (
                SELECT t.contact_id FROM transactions t
                JOIN contacts ct ON ct.id = t.contact_id
                WHERE (t.agreement_id = rental_agreements.id OR t.property_id = rental_agreements.property_id)
                  AND (ct.type = 'BROKER' OR ct.type = 'DEALER' OR ct.type = 'Broker' OR ct.type = 'Dealer')
                  AND t.contact_id IS NOT NULL AND t.contact_id != ''
                LIMIT 1
            ) WHERE (broker_id IS NULL OR broker_id = '')
              AND EXISTS (
                SELECT 1 FROM transactions t
                JOIN contacts ct ON ct.id = t.contact_id
                WHERE (t.agreement_id = rental_agreements.id OR t.property_id = rental_agreements.property_id)
                  AND (ct.type = 'BROKER' OR ct.type = 'DEALER' OR ct.type = 'Broker' OR ct.type = 'Dealer')
              )`,

            // ── Rental Agreements: recover broker_fee from transactions matching broker description ──
            // Fallback when category_id on the transaction was corrupted
            `UPDATE rental_agreements SET broker_fee = (
                SELECT t.amount FROM transactions t
                WHERE (t.agreement_id = rental_agreements.id OR t.property_id = rental_agreements.property_id)
                  AND LOWER(t.description) LIKE '%broker%'
                  AND t.amount > 0
                LIMIT 1
            ) WHERE broker_id IS NOT NULL AND broker_id != ''
              AND (broker_fee IS NULL OR broker_fee = 0)
              AND EXISTS (
                SELECT 1 FROM transactions t
                WHERE (t.agreement_id = rental_agreements.id OR t.property_id = rental_agreements.property_id)
                  AND LOWER(t.description) LIKE '%broker%' AND t.amount > 0
              )`,

            // ── Properties: recover owner_id from rental agreements that have owner_id ──
            `UPDATE properties SET owner_id = (
                SELECT ra.owner_id FROM rental_agreements ra
                WHERE ra.property_id = properties.id AND ra.owner_id IS NOT NULL AND ra.owner_id != ''
                LIMIT 1
            ) WHERE (owner_id IS NULL OR owner_id = '')
              AND EXISTS (SELECT 1 FROM rental_agreements ra WHERE ra.property_id = properties.id AND ra.owner_id IS NOT NULL AND ra.owner_id != '')`,

            // ── Invoices: recalculate paid_amount from linked Income transactions (fixes project selling LG-06 / LG-11 showing unpaid when payments exist) ──
            `UPDATE invoices SET paid_amount = (
                SELECT COALESCE(SUM(t.amount), 0) FROM transactions t
                WHERE t.invoice_id = invoices.id AND t.type = 'Income'
            )`,

            // ── Invoices: set status from paid_amount vs amount (after paid_amount repair above) ──
            `UPDATE invoices SET status = CASE
                WHEN COALESCE(paid_amount, 0) >= amount - 0.1 THEN 'Paid'
                WHEN COALESCE(paid_amount, 0) > 0.1 THEN 'Partially Paid'
                ELSE 'Unpaid'
            END WHERE status IS NOT NULL AND (status = 'Unpaid' OR status = 'Partially Paid' OR status = 'Paid' OR status = 'Overdue')`,

            // ── Bills: recalculate paid_amount from linked payment transactions (same fix as invoices) ──
            `UPDATE bills SET paid_amount = (
                SELECT COALESCE(SUM(t.amount), 0) FROM transactions t
                WHERE t.bill_id = bills.id AND t.type = 'Expense'
            )`,

            // ── Bills: set status from paid_amount vs amount ──
            `UPDATE bills SET status = CASE
                WHEN COALESCE(paid_amount, 0) >= amount - 0.1 THEN 'Paid'
                WHEN COALESCE(paid_amount, 0) > 0.1 THEN 'Partially Paid'
                ELSE 'Unpaid'
            END WHERE status IS NOT NULL AND (status = 'Unpaid' OR status = 'Partially Paid' OR status = 'Paid' OR status = 'Overdue')`,
        ];

        // Diagnostic: log rental agreements with missing broker data before repair
        try {
            const missingBroker = this.db.query<{ id: string; agreement_number: string; broker_id: string | null; broker_fee: number | null; property_id: string | null }>(
                `SELECT id, agreement_number, broker_id, broker_fee, property_id FROM rental_agreements WHERE broker_id IS NULL OR broker_id = ''`
            );
            if (missingBroker.length > 0) {
                console.log(`[LocalDB] Rental agreements with missing broker_id: ${missingBroker.length}`, missingBroker.map(r => r.agreement_number || r.id));
            }
        } catch (_) {}

        let totalRepaired = 0;
        for (const sql of repairStatements) {
            try {
                this.db.execute(sql);
                const result = this.db.query<{ changes: number }>('SELECT changes() as changes');
                const changed = result[0]?.changes ?? 0;
                if (changed > 0) {
                    totalRepaired += changed;
                    console.log(`[LocalDB] Repair: ${changed} row(s) updated by: ${sql.substring(0, 80)}...`);
                }
            } catch (e) {
                console.warn(`[LocalDB] Repair statement failed (non-fatal): ${sql.substring(0, 60)}...`, e);
            }
        }
        if (totalRepaired > 0) {
            console.log(`[LocalDB] Data repair: restored ${totalRepaired} corrupted field(s) across invoices/transactions/bills`);
        }

        // Post-repair diagnostic: check if broker data is still missing
        try {
            const stillMissing = this.db.query<{ id: string; agreement_number: string; property_id: string | null }>(
                `SELECT id, agreement_number, property_id FROM rental_agreements WHERE broker_id IS NULL OR broker_id = ''`
            );
            if (stillMissing.length > 0) {
                console.log(`[LocalDB] After repair: ${stillMissing.length} rental agreement(s) still have no broker_id (may be intentional if no broker was assigned):`,
                    stillMissing.map(r => r.agreement_number || r.id));
            }
        } catch (_) {}
    }

    /**
     * Resolve DELETE_* action type to table key for deleteEntity, or null if not a known delete.
     */
    static getTableKeyForDeleteAction(actionType: string): string | null {
        return AppStateRepository.DELETE_ACTION_TO_TABLE[actionType] ?? null;
    }

    /**
     * Save complete application state to database (serialized to avoid overlapping transactions)
     * @param state - The application state to save
     * @param disableSyncQueueing - If true, disables sync queueing (used when syncing FROM cloud TO local)
     */
    async saveState(state: AppState, disableSyncQueueing: boolean = false): Promise<void> {
        AppStateRepository.saveQueue = AppStateRepository.saveQueue.then(async () => {
            const entityCounts = `accounts=${state.accounts?.length ?? 0} contacts=${state.contacts?.length ?? 0} transactions=${state.transactions?.length ?? 0} invoices=${state.invoices?.length ?? 0} bills=${state.bills?.length ?? 0} projects=${state.projects?.length ?? 0} installmentPlans=${state.installmentPlans?.length ?? 0} pmCycleAllocations=${state.pmCycleAllocations?.length ?? 0}`;
            console.log(`[LocalDB] saveState starting ${entityCounts}`);

            try {
                // Ensure database is initialized
                if (!this.db.isReady()) {
                    await this.db.initialize();
                }
                // If still not ready (e.g. Electron multi-company: no company DB open yet), skip save — no-op
                if (!this.db.isReady()) {
                    return;
                }

                // Schema and tenant columns are ensured during DB initialization — no need to re-run on every save.

                // Migrate budgets if they're in old format (for in-memory data being saved)
                try {
                    state.budgets = migrateBudgetsArray(state.budgets);
                } catch (budgetMigrationError) {
                    console.warn('⚠️ Could not migrate budgets array, continuing anyway:', budgetMigrationError);
                }

                try {
                    // Load existing documents' file_data before transaction so we can hydrate state.documents
                    // (state.documents are loaded with excludeHeavyColumns: true and lack file_data)
                    const documentFileDataById = new Map<string, string>();
                    if ((state.documents?.length ?? 0) > 0) {
                        const existingDocsWithFileData = this.documentsRepo.findAll({ excludeHeavyColumns: false });
                        for (const d of existingDocsWithFileData) {
                            const raw = d as Record<string, unknown>;
                            const fd = raw.file_data ?? raw.fileData;
                            documentFileDataById.set(d.id, typeof fd === 'string' ? fd : '');
                        }
                    }

                    const skipOrphan = { skipOrphanCleanup: true };

                    this.db.transaction([
                        () => {
                            const contactIds = new Set(state.contacts.map(c => c.id));
                            const projectIds = new Set(state.projects.map(p => p.id));
                            const buildingIds = new Set(state.buildings.map(b => b.id));
                            const accountIds = new Set(state.accounts.map(a => a.id));
                            const categoryIds = new Set(state.categories.map(c => c.id));
                            const vendorIds = new Set((state.vendors || []).map(v => v.id));
                            const contractIds = new Set((state.contracts || []).map(c => c.id));
                            const propertyIds = new Set(state.properties.map(p => p.id));
                            const unitIds = new Set(state.units.map(u => u.id));

                            try {
                                this.usersRepo.saveAll(state.users, skipOrphan);
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
                                this.accountsRepo.saveAll(accountsOrdered, skipOrphan);
                            } catch (e) {
                                console.error('❌ Failed to save accounts:', e);
                                throw e;
                            }

                            try {
                                this.contactsRepo.saveAll(state.contacts, skipOrphan);
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
                                this.categoriesRepo.saveAll(categoriesOrdered, skipOrphan);
                                this.syncPlCategoryMappings(categoriesOrdered as AppState['categories']);
                            } catch (e) {
                                console.error('❌ Failed to save categories:', e);
                                throw e;
                            }

                            // Save vendors BEFORE transactions (transactions have FK vendor_id → vendors.id); mirror API vendors to SQLite only when not local-only.
                            if (!isLocalOnlyMode()) {
                                try {
                                    this.vendorsRepo.saveAll(state.vendors || [], skipOrphan);
                                } catch (e) {
                                    console.error('❌ Failed to save vendors:', e);
                                    throw e;
                                }
                            }

                            try {
                                // Mirror API-backed projects/units to SQLite only when not in local-only build (FK integrity for transactions, etc.).
                                if (!isLocalOnlyMode()) {
                                    this.projectsRepo.saveAll(state.projects, skipOrphan);
                                }
                                this.buildingsRepo.saveAll(state.buildings, skipOrphan);
                                // properties: sanitize FKs but keep all records
                                const validProperties = state.properties.map(p => {
                                    const ownerId = p.ownerId ?? (p as any).owner_id;
                                    const bldgId = p.buildingId ?? (p as any).building_id ?? '';
                                    return {
                                        ...p,
                                        ownerId: (ownerId && contactIds.has(ownerId)) ? ownerId : (ownerId || null),
                                        buildingId: (bldgId && buildingIds.has(bldgId)) ? bldgId : (bldgId || null),
                                    };
                                });
                                this.propertiesRepo.saveAll(validProperties, skipOrphan);
                                // property ownership history: valid property_id and owner_id
                                const contactIdsForOwnership = new Set(state.contacts.map(c => c.id));
                                const validOwnershipHistory = (state.propertyOwnershipHistory || []).filter(
                                    h => state.properties.some(p => p.id === h.propertyId) && contactIdsForOwnership.has(h.ownerId)
                                );
                                this.propertyOwnershipHistoryRepo.saveAll(validOwnershipHistory, skipOrphan);
                                // units: sanitize FKs but keep all records
                                const validUnits = state.units.map(u => {
                                    const pid = u.projectId ?? (u as any).project_id ?? '';
                                    const cid = u.contactId ?? (u as any).contact_id;
                                    return {
                                        ...u,
                                        projectId: (pid && projectIds.has(pid)) ? pid : (pid || null),
                                        contactId: (cid && contactIds.has(cid)) ? cid : (cid || null),
                                    };
                                });
                                if (!isLocalOnlyMode()) {
                                    this.unitsRepo.saveAll(validUnits, skipOrphan);
                                }
                                // contracts: sanitize FKs but keep all records
                                const validContracts = (state.contracts || []).map(c => {
                                    const pid = c.projectId ?? (c as any).project_id ?? '';
                                    const vid = c.vendorId ?? (c as any).vendor_id ?? '';
                                    return {
                                        ...c,
                                        projectId: (pid && projectIds.has(pid)) ? pid : (pid || null),
                                        vendorId: (vid && vendorIds.has(vid)) ? vid : (vid || ''),
                                        expenseCategoryItems: c.expenseCategoryItems ? JSON.stringify(c.expenseCategoryItems) : undefined
                                    };
                                });
                                const contractIdsForFilter = new Set(validContracts.map(c => c.id));
                                this.contractsRepo.saveAll(validContracts, skipOrphan);
                                // invoices: sanitize FKs but keep all records
                                const validInvoices = state.invoices.map(inv => {
                                    const cid = inv.contactId ?? (inv as any).contact_id;
                                    return {
                                        ...inv,
                                        contactId: (cid && contactIds.has(cid)) ? cid : (cid || null),
                                    };
                                });
                                const invoiceIds = new Set(validInvoices.map(i => i.id));
                                this.invoicesRepo.saveAll(validInvoices, skipOrphan);
                                // Sanitize bills: null contact_id/vendor_id if not in batch (avoids FK constraint failed)
                                const sanitizedBills = state.bills.map(b => {
                                    const billToSave: any = {
                                        id: b.id,
                                        billNumber: b.billNumber || `BILL-${b.id}`,
                                        amount: b.amount || 0,
                                        paidAmount: b.paidAmount || 0,
                                        status: b.status || 'Unpaid',
                                        issueDate: b.issueDate || toLocalDateString(new Date()),
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
                                this.billsRepo.saveAll(sanitizedBills, skipOrphan);
                                // Sanitize transactions: null out invalid FKs but never drop records
                                const sanitizedTransactions = state.transactions
                                    .map(t => {
                                        const accId = t.accountId ?? (t as any).account_id;
                                        if (accId && !accountIds.has(accId)) {
                                            (t as any).accountId = null;
                                            (t as any).account_id = null;
                                        }
                                        return t;
                                    })
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
                                this.transactionsRepo.saveAll(sanitizedTransactions, skipOrphan);
                            } catch (e) {
                                console.error('❌ Failed to save projects/buildings/properties/units/contracts/invoices/bills/transactions:', e);
                                throw e;
                            }

                            // quotations: sanitize FKs but keep all records
                            try {
                                const validQuotations = (state.quotations || []).map(q => {
                                    const vid = q.vendorId ?? (q as any).vendor_id ?? '';
                                    return {
                                        ...q,
                                        vendorId: (vid && vendorIds.has(vid)) ? vid : (vid || ''),
                                        items: typeof q.items === 'string' ? q.items : JSON.stringify(q.items)
                                    };
                                });
                                this.quotationsRepo.saveAll(validQuotations, skipOrphan);
                            } catch (e) {
                                console.error('❌ Failed to save quotations:', e);
                                throw e;
                            }

                            try {
                                const hydratedDocuments = (state.documents || []).map(doc => {
                                    const raw = doc as Record<string, unknown>;
                                    const fileData = raw.fileData ?? raw.file_data ?? documentFileDataById.get(doc.id) ?? '';
                                    return { ...doc, fileData };
                                });
                                this.documentsRepo.saveAll(hydratedDocuments, skipOrphan);
                                this.pmCycleAllocationsRepo.saveAll((state.pmCycleAllocations || []).map(pm => ({
                                    ...pm,
                                    projectId: projectIds.has(pm.projectId) ? pm.projectId : null,
                                    excludedCategoryIds: pm.excludedCategoryIds
                                        ? (typeof pm.excludedCategoryIds === 'string' ? pm.excludedCategoryIds : JSON.stringify(pm.excludedCategoryIds))
                                        : undefined
                                })), skipOrphan);
                                // budgets: sanitize FKs but keep all records
                                const validBudgets = (state.budgets || []).map(b => {
                                    const catId = b.categoryId ?? (b as any).category_id ?? '';
                                    const pid = b.projectId ?? (b as any).project_id;
                                    return {
                                        ...b,
                                        categoryId: (catId && categoryIds.has(catId)) ? catId : (catId || null),
                                        projectId: (pid && projectIds.has(pid)) ? pid : (pid || null),
                                    };
                                });
                                this.budgetsRepo.saveAll(validBudgets, skipOrphan);
                                // rental_agreements: contact_id is NOT NULL; never send null (use '' if invalid so INSERT doesn't omit column)
                                const allPropertyIds = new Set(state.properties.map(p => p.id));
                                const validRentalAgreements = (state.rentalAgreements || []).map(ra => {
                                    const cid = ra.contactId ?? (ra as any).contact_id ?? '';
                                    const pid = ra.propertyId ?? (ra as any).property_id ?? '';
                                    return {
                                        ...ra,
                                        contactId: (cid && contactIds.has(cid)) ? cid : (cid || ''),
                                        propertyId: (pid && (allPropertyIds.has(pid) || propertyIds.has(pid))) ? pid : (pid || null),
                                    };
                                });
                                this.rentalAgreementsRepo.saveAll(validRentalAgreements, skipOrphan);

                                const personalCategoryIds = new Set((state.personalCategories || []).map(c => c.id));
                                const validPersonalCategories = (state.personalCategories || []).map(c => ({
                                    ...c,
                                    sortOrder: typeof c.sortOrder === 'number' ? c.sortOrder : 0,
                                }));
                                this.personalCategoriesRepo.saveAll(validPersonalCategories as any, skipOrphan);
                                const validPersonalTransactions = (state.personalTransactions || []).map(tx => ({
                                    ...tx,
                                    accountId: accountIds.has(tx.accountId) ? tx.accountId : '',
                                    personalCategoryId: personalCategoryIds.has(tx.personalCategoryId) ? tx.personalCategoryId : '',
                                }));
                                this.personalTransactionsRepo.saveAll(validPersonalTransactions as any, skipOrphan);

                                // project_agreements: sanitize FKs but NEVER drop records
                                const validProjectAgreements = (state.projectAgreements || []).map(pa => {
                                    const cid = pa.clientId ?? (pa as any).client_id ?? '';
                                    const pid = pa.projectId ?? (pa as any).project_id ?? '';
                                    return {
                                        ...pa,
                                        clientId: (cid && contactIds.has(cid)) ? cid : (cid || null),
                                        client_id: undefined,
                                        projectId: (pid && projectIds.has(pid)) ? pid : (pid || null),
                                        project_id: undefined,
                                        unitIds: JSON.stringify(pa.unitIds),
                                        cancellationDetails: pa.cancellationDetails ? JSON.stringify(pa.cancellationDetails) : undefined,
                                        installmentPlan: pa.installmentPlan ? JSON.stringify(pa.installmentPlan) : undefined
                                    };
                                });
                                const projectAgreementIds = new Set(validProjectAgreements.map(pa => pa.id));
                                this.projectAgreementsRepo.saveAll(validProjectAgreements, skipOrphan);
                                // sales_returns: sanitize FKs but keep all records
                                const billIdsForFilter = new Set(state.bills.map(b => b.id));
                                const validSalesReturns = (state.salesReturns || []).map(sr => {
                                    const aid = sr.agreementId ?? (sr as any).agreement_id ?? '';
                                    const rbid = sr.refundBillId ?? (sr as any).refund_bill_id;
                                    return {
                                        ...sr,
                                        agreementId: (aid && projectAgreementIds.has(aid)) ? aid : (aid || null),
                                        refundBillId: (rbid && billIdsForFilter.has(rbid)) ? rbid : (rbid || null),
                                    };
                                });
                                this.salesReturnsRepo.saveAll(validSalesReturns, skipOrphan);
                                // project_received_assets: sanitize FKs but keep all records
                                const validProjectReceivedAssets = (state.projectReceivedAssets || []).map(a => ({
                                    ...a,
                                    projectId: (a.projectId && projectIds.has(a.projectId)) ? a.projectId : (a.projectId || null),
                                    contactId: (a.contactId && contactIds.has(a.contactId)) ? a.contactId : (a.contactId || null),
                                    invoiceId: (a.invoiceId && invoiceIds.has(a.invoiceId)) ? a.invoiceId : (a.invoiceId || null),
                                }));
                                this.projectReceivedAssetsRepo.saveAll(validProjectReceivedAssets, skipOrphan);
                                // contracts already saved above (before bills/transactions)

                                // Other tables
                                // Filter recurring_templates: contact_id FK→contacts, property_id FK→properties
                                const validRecurringTemplates = (state.recurringInvoiceTemplates || []).map(t => ({
                                    ...t,
                                    contactId: contactIds.has(t.contactId) ? t.contactId : null,
                                    propertyId: propertyIds.has(t.propertyId) ? t.propertyId : null,
                                    buildingId: buildingIds.has(t.buildingId) ? t.buildingId : null
                                }));
                                this.recurringTemplatesRepo.saveAll(validRecurringTemplates, skipOrphan);

                                // Sanitize installment_plans: project_id FK→projects, lead_id FK→contacts, unit_id FK→units
                                const sanitizedInstallmentPlans = (state.installmentPlans || []).map(plan => ({
                                    ...plan,
                                    projectId: projectIds.has(plan.projectId) ? plan.projectId : null,
                                    leadId: contactIds.has(plan.leadId) ? plan.leadId : null,
                                    unitId: unitIds.has(plan.unitId) ? plan.unitId : null
                                }));
                                const installmentPlanIds = new Set(sanitizedInstallmentPlans.map(p => p.id));
                                this.installmentPlansRepo.saveAll(sanitizedInstallmentPlans, skipOrphan);

                                // plan_amenities is master data, no FKs to sanitize
                                this.planAmenitiesRepo.saveAll(state.planAmenities || [], skipOrphan);

                            } catch (e) {
                                console.error('❌ Failed to save documents/budgets/agreements/contracts/templates:', e);
                                throw e;
                            }

                            try {
                                // Ensure required DB columns are set (NOT NULL): created_at, version, updated_at; tenant_id defaulted in prepareRecordForDb
                                const normalizedTransactionLog = (state.transactionLog || []).map(entry => {
                                    const createdAt = (entry as any).createdAt ?? (entry as any).created_at ?? entry.timestamp ?? new Date().toISOString();
                                    return {
                                        ...entry,
                                        createdAt,
                                        version: (entry as any).version ?? 1,
                                        updatedAt: (entry as any).updatedAt ?? (entry as any).updated_at ?? createdAt
                                    };
                                });
                                this.transactionLogRepo.saveAll(normalizedTransactionLog as any, skipOrphan);
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
                                this.errorLogRepo.saveAll(normalizedErrors as any, skipOrphan);
                            } catch (e) {
                                console.error('❌ Failed to save error log:', e);
                                throw e;
                            }

                            // Save settings: full blob in local-only; device-local keys only when using PostgreSQL API (tenant settings sync via appStateApi.syncTenantSettingsToApi).
                            try {
                                if (isLocalOnlyMode()) {
                                    this.appSettingsRepo.saveAllSettings({
                                        current_user_id: state.currentUser?.id,
                                        agreementSettings: state.agreementSettings,
                                        projectAgreementSettings: state.projectAgreementSettings,
                                        rentalInvoiceSettings: state.rentalInvoiceSettings,
                                        projectInvoiceSettings: state.projectInvoiceSettings,
                                        printSettings: state.printSettings,
                                        whatsAppTemplates: state.whatsAppTemplates,
                                        dashboardConfig: state.dashboardConfig,
                                        accountConsistency: state.accountConsistency,
                                        installmentPlans: state.installmentPlans || [],
                                        invoiceHtmlTemplate: state.invoiceHtmlTemplate,
                                        showSystemTransactions: state.showSystemTransactions,
                                        enableColorCoding: state.enableColorCoding,
                                        enableBeepOnSave: state.enableBeepOnSave,
                                        whatsAppMode: state.whatsAppMode,
                                        pmCostPercentage: state.pmCostPercentage,
                                        defaultProjectId: state.defaultProjectId,
                                        lastServiceChargeRun: state.lastServiceChargeRun,
                                        currentPage: state.currentPage
                                    });
                                } else {
                                    this.appSettingsRepo.saveAllSettings({
                                        current_user_id: state.currentUser?.id,
                                        currentPage: state.currentPage
                                    });
                                }
                            } catch (e) {
                                console.error('❌ Failed to save settings:', e);
                                throw e;
                            }
                        }
                    ]);
                    const contactsAfterTransaction = this.contactsRepo.findAll();
                    if (contactsAfterTransaction.length !== state.contacts.length) {
                        // When state.contacts is empty, saveAll([]) intentionally does nothing (baseRepository); no error.
                        if (state.contacts.length === 0) {
                            console.log(`[LocalDB] saveState: contacts not in state (0); DB has ${contactsAfterTransaction.length} (saveAll([]) skipped by design).`);
                        } else {
                            console.error(`❌ CRITICAL: Contact count mismatch AFTER transaction but BEFORE persistence! Expected ${state.contacts.length}, found ${contactsAfterTransaction.length}`);
                            const sample = contactsAfterTransaction.slice(0, 3).map((c: any) => ({ id: c.id, name: c.name }));
                            console.error('Sample of contacts in DB:', JSON.stringify(sample));
                        }
                    }

                } catch (transactionError) {
                    const errMsg = transactionError instanceof Error ? transactionError.message : String(transactionError);
                    if (errMsg.includes('No database open')) {
                        (this.db as { invalidateConnection?: () => void }).invalidateConnection?.();
                        return;
                    }
                    console.error('[LocalDB] Database transaction failed:', transactionError);
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
                console.log(`[LocalDB] saveState completed successfully, contacts in DB: ${savedContacts.length}`);

                if (savedContacts.length !== state.contacts.length) {
                    // When state.contacts is empty, saveAll([]) intentionally does nothing (baseRepository); no error.
                    if (state.contacts.length === 0) {
                        console.log(`[LocalDB] saveState: contacts not in state (0); DB has ${savedContacts.length} (saveAll([]) skipped by design).`);
                    } else {
                        console.error(`❌ Contact count mismatch! Expected ${state.contacts.length}, found ${savedContacts.length}`);
                        const expectedSample = state.contacts.slice(0, 3).map(c => ({ id: c.id, name: c.name }));
                        const savedSample = savedContacts.slice(0, 3).map((c: any) => ({ id: c.id, name: c.name }));
                        console.error('Expected (sample):', JSON.stringify(expectedSample));
                        console.error('Saved (sample):', JSON.stringify(savedSample));

                        if (state.contacts.length > 0 && savedContacts.length === 0) {
                            console.error('⚠️ No contacts were saved. This suggests a column mapping or insert issue.');
                            try {
                                const tableInfo = this.db.query<{ name: string; type: string }>(`PRAGMA table_info(contacts)`);
                                console.error('Contacts table columns:', tableInfo.map(t => t.name));
                            } catch (schemaError) {
                                console.error('Could not check table schema:', schemaError);
                            }
                        }
                    }
                }

                if (!isLocalOnlyMode()) {
                    void import('../../api/appStateApi').then(({ getAppStateApiService }) => {
                        getAppStateApiService().syncTenantSettingsToApi(state);
                    });
                }
            } catch (error) {
                const errMsg = error instanceof Error ? error.message : String(error);
                if (errMsg.includes('No database open')) {
                    (this.db as { invalidateConnection?: () => void }).invalidateConnection?.();
                    return;
                }
                console.error('❌ Error saving state to database:', error);
                notifyDatabaseError(error, { context: 'Saving to the local database failed. Your changes may not be persisted until this is resolved.' });
                throw error;
            } finally {
                // No sync cleanup needed -- local-only architecture
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
            property_ownership_history: this.propertyOwnershipHistoryRepo,
            units: this.unitsRepo,
            transactions: this.transactionsRepo,
            invoices: this.invoicesRepo,
            bills: this.billsRepo,
            budgets: this.budgetsRepo,
            plan_amenities: this.planAmenitiesRepo,
            contracts: this.contractsRepo,
            sales_returns: this.salesReturnsRepo,
            project_received_assets: this.projectReceivedAssetsRepo,
            quotations: this.quotationsRepo,
            documents: this.documentsRepo,
            recurring_invoice_templates: this.recurringTemplatesRepo,
            pm_cycle_allocations: this.pmCycleAllocationsRepo,
            rental_agreements: this.rentalAgreementsRepo,
            project_agreements: this.projectAgreementsRepo,
            installment_plans: this.installmentPlansRepo,
            vendors: this.vendorsRepo,
            personal_categories: this.personalCategoriesRepo,
            personal_transactions: this.personalTransactionsRepo,
        };
        return map[entityKey] ?? null;
    }

    private mergePlSubtypesFromMapping(categories: AppState['categories']): AppState['categories'] {
        try {
            const rows = this.plCategoryMappingRepo.findAll() as Array<Record<string, unknown>>;
            if (!rows.length) return categories;
            const byCat = new Map<string, ProfitLossSubType>();
            const allowed: ProfitLossSubType[] = [
                'revenue',
                'cost_of_sales',
                'operating_expense',
                'other_income',
                'finance_cost',
                'tax',
            ];
            for (const r of rows) {
                const cid = (r.category_id ?? r.categoryId) as string | undefined;
                const pt = (r.pl_type ?? r.plType) as string | undefined;
                if (cid && pt && allowed.includes(pt as ProfitLossSubType)) {
                    byCat.set(cid, pt as ProfitLossSubType);
                }
            }
            return categories.map((c) => ({
                ...c,
                plSubType: byCat.get(c.id) ?? c.plSubType,
            }));
        } catch (e) {
            console.warn('[AppStateRepository] mergePlSubtypesFromMapping failed:', e);
            return categories;
        }
    }

    private syncPlCategoryMappings(categories: AppState['categories']): void {
        try {
            const tenantId = getCurrentTenantId() || '';
            this.db.run(`DELETE FROM pl_category_mapping WHERE tenant_id = ?`, [tenantId]);
            for (const c of categories) {
                if (!c.plSubType) continue;
                const id = `plmap-${tenantId}-${c.id}`.replace(/[^a-zA-Z0-9_-]/g, '_');
                this.db.run(
                    `INSERT OR REPLACE INTO pl_category_mapping (id, tenant_id, category_id, pl_type, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
                    [id, tenantId, c.id, c.plSubType]
                );
            }
        } catch (e) {
            console.warn('[AppStateRepository] syncPlCategoryMappings failed:', e);
        }
    }
}
