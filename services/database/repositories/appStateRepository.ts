/**
 * App State Repository
 * 
 * Handles loading and saving the complete application state from/to the database.
 * This is the main entry point for state persistence.
 */

import { AppState } from '../../../types';
import { getDatabaseService } from '../databaseService';
import { objectToDbFormat } from '../columnMapper';
import { migrateBudgetsToNewStructure, migrateBudgetsArray } from '../budgetMigration';
import { 
    UsersRepository, AccountsRepository, ContactsRepository, CategoriesRepository,
    ProjectsRepository, BuildingsRepository, PropertiesRepository, UnitsRepository,
    TransactionsRepository, InvoicesRepository, BillsRepository, BudgetsRepository,
    RentalAgreementsRepository, ProjectAgreementsRepository, ContractsRepository,
    RecurringTemplatesRepository, SalaryComponentsRepository, StaffRepository,
    EmployeesRepository, PayrollCyclesRepository, PayslipsRepository,
    LegacyPayslipsRepository, BonusRecordsRepository, PayrollAdjustmentsRepository,
    LoanAdvanceRecordsRepository, AttendanceRecordsRepository,
    TaxConfigurationsRepository, StatutoryConfigurationsRepository,
    TransactionLogRepository, ErrorLogRepository, TasksRepository, AppSettingsRepository,
    QuotationsRepository, DocumentsRepository
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
    private recurringTemplatesRepo = new RecurringTemplatesRepository();
    private salaryComponentsRepo = new SalaryComponentsRepository();
    private staffRepo = new StaffRepository();
    private employeesRepo = new EmployeesRepository();
    private payrollCyclesRepo = new PayrollCyclesRepository();
    private payslipsRepo = new PayslipsRepository();
    private legacyPayslipsRepo = new LegacyPayslipsRepository();
    private bonusRecordsRepo = new BonusRecordsRepository();
    private payrollAdjustmentsRepo = new PayrollAdjustmentsRepository();
    private loanAdvanceRecordsRepo = new LoanAdvanceRecordsRepository();
    private attendanceRecordsRepo = new AttendanceRecordsRepository();
    private taxConfigurationsRepo = new TaxConfigurationsRepository();
    private statutoryConfigurationsRepo = new StatutoryConfigurationsRepository();
    private transactionLogRepo = new TransactionLogRepository();
    private errorLogRepo = new ErrorLogRepository();
    private tasksRepo = new TasksRepository();
    private quotationsRepo = new QuotationsRepository();
    private documentsRepo = new DocumentsRepository();
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
        const salaryComponents = this.salaryComponentsRepo.findAll();
        const staff = this.staffRepo.findAll();
        const employees = this.employeesRepo.findAll();
        const payrollCycles = this.payrollCyclesRepo.findAll();
        const payslips = this.payslipsRepo.findAll();
        const legacyPayslips = this.legacyPayslipsRepo.findAll();
        const bonusRecords = this.bonusRecordsRepo.findAll();
        const payrollAdjustments = this.payrollAdjustmentsRepo.findAll();
        const loanAdvanceRecords = this.loanAdvanceRecordsRepo.findAll();
        const attendanceRecords = this.attendanceRecordsRepo.findAll();
        const taxConfigurations = this.taxConfigurationsRepo.findAll();
        const statutoryConfigurations = this.statutoryConfigurationsRepo.findAll();
        const transactionLog = this.transactionLogRepo.findAll();
        const errorLog = this.errorLogRepo.findAll();
        const tasks = this.tasksRepo.findAll();
        const quotations = this.quotationsRepo.findAll();
        const documents = this.documentsRepo.findAll();

        // Load settings
        const settings = this.appSettingsRepo.loadAllSettings();

        // Separate project and rental staff
        const projectStaff = staff.filter(s => s.staff_type === 'project');
        const rentalStaff = staff.filter(s => s.staff_type === 'rental');

        // Separate project and rental payslips
        const projectPayslips = legacyPayslips.filter(p => p.payslip_type === 'project');
        const rentalPayslips = legacyPayslips.filter(p => p.payslip_type === 'rental');

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
            properties,
            units,
            transactions,
            invoices,
            bills: bills.map(b => ({
                ...b,
                expenseCategoryItems: b.expenseCategoryItems 
                    ? (typeof b.expenseCategoryItems === 'string' ? JSON.parse(b.expenseCategoryItems) : b.expenseCategoryItems)
                    : undefined
            })),
            quotations: quotations.map(q => ({
                ...q,
                items: typeof q.items === 'string' ? JSON.parse(q.items) : q.items
            })),
            documents,
            budgets,
            rentalAgreements,
            projectAgreements,
            contracts: contracts.map(c => ({
                ...c,
                expenseCategoryItems: c.expenseCategoryItems 
                    ? (typeof c.expenseCategoryItems === 'string' ? JSON.parse(c.expenseCategoryItems) : c.expenseCategoryItems)
                    : undefined
            })),
            projectStaff,
            rentalStaff,
            employees,
            salaryComponents,
            payrollCycles,
            payslips,
            bonusRecords,
            payrollAdjustments,
            loanAdvanceRecords,
            attendanceRecords,
            taxConfigurations,
            statutoryConfigurations,
            projectPayslips,
            rentalPayslips,
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
                            this.billsRepo.saveAll(state.bills.map(b => ({
                                ...b,
                                expenseCategoryItems: b.expenseCategoryItems 
                                    ? (typeof b.expenseCategoryItems === 'string' ? b.expenseCategoryItems : JSON.stringify(b.expenseCategoryItems))
                                    : undefined
                            })));
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
                            this.budgetsRepo.saveAll(state.budgets);
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
                            this.salaryComponentsRepo.saveAll(state.salaryComponents);
                        } catch (e) {
                            console.error('❌ Failed to save documents/budgets/agreements/contracts:', e);
                            throw e;
                        }
                        
                        // Save staff (combine project and rental)
                        try {
                            const allStaff = [
                                ...state.projectStaff.map(s => ({ ...s, staff_type: 'project' as const })),
                                ...state.rentalStaff.map(s => ({ ...s, staff_type: 'rental' as const }))
                            ];
                            this.staffRepo.saveAll(allStaff);
                        } catch (e) {
                            console.error('❌ Failed to save staff:', e);
                            throw e;
                        }

                        try {
                            this.employeesRepo.saveAll(state.employees);
                            this.payrollCyclesRepo.saveAll(state.payrollCycles);
                            this.payslipsRepo.saveAll(state.payslips);
                        } catch (e) {
                            console.error('❌ Failed to save employees/payroll:', e);
                            throw e;
                        }
                        
                        // Save legacy payslips (combine project and rental)
                        try {
                            const allLegacyPayslips = [
                                ...state.projectPayslips.map(p => ({ ...p, payslip_type: 'project' as const })),
                                ...state.rentalPayslips.map(p => ({ ...p, payslip_type: 'rental' as const }))
                            ];
                            this.legacyPayslipsRepo.saveAll(allLegacyPayslips);
                        } catch (e) {
                            console.error('❌ Failed to save legacy payslips:', e);
                            throw e;
                        }

                        try {
                            this.bonusRecordsRepo.saveAll(state.bonusRecords);
                            this.payrollAdjustmentsRepo.saveAll(state.payrollAdjustments);
                            this.loanAdvanceRecordsRepo.saveAll(state.loanAdvanceRecords);
                            this.attendanceRecordsRepo.saveAll(state.attendanceRecords);
                            this.taxConfigurationsRepo.saveAll(state.taxConfigurations);
                            this.statutoryConfigurationsRepo.saveAll(state.statutoryConfigurations);
                            this.transactionLogRepo.saveAll(state.transactionLog);
                        } catch (e) {
                            console.error('❌ Failed to save payroll records:', e);
                            throw e;
                        }

                        // Ensure error_log rows have required fields (timestamp is NOT NULL)
                        try {
                            const normalizedErrors = (state.errorLog || []).map(err => ({
                                ...err,
                                timestamp: err.timestamp || new Date().toISOString()
                            }));
                            this.errorLogRepo.saveAll(normalizedErrors as any);
                            this.tasksRepo.saveAll(state.tasks || []);
                        } catch (e) {
                            console.error('❌ Failed to save error log/tasks:', e);
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
