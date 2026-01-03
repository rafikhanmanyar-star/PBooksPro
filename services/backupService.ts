
import React from 'react';
import { AppAction, AppState, ContactType, TransactionType, AccountType, LoanSubtype } from '../types';
import { useProgress } from '../context/ProgressContext';
import { getDatabaseService } from './database/databaseService';
import { AppStateRepository } from './database/repositories/appStateRepository';
import { migrateBackupData, CURRENT_DATA_VERSION } from './backupMigration';

type ProgressReporter = ReturnType<typeof useProgress>;

// Helper to trigger file download
const downloadFile = (content: string | Uint8Array, fileName: string, contentType: string) => {
    const a = document.createElement("a");
    let blob: Blob;
    
    if (content instanceof Uint8Array) {
        blob = new Blob([content], { type: contentType });
    } else {
        blob = new Blob([content], { type: contentType });
    }
    
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    // Fix: Add timeout to ensure download starts before revoking URL (crucial for Firefox)
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 200);
};

export const createBackup = async (progress: ProgressReporter, dispatch: React.Dispatch<AppAction>) => {
    progress.startProgress('Creating Full Backup');
    try {
        await new Promise(res => setTimeout(res, 200));
        progress.updateProgress(25, 'Exporting database...');
        
        // Get database service and export binary backup
        const dbService = getDatabaseService();
        await dbService.initialize();
        
        const dbBackup = dbService.createBackup();
        
        await new Promise(res => setTimeout(res, 500));
        progress.updateProgress(90, 'Preparing download...');
        const date = new Date().toISOString().split('T')[0];
        
        // Download database backup
        downloadFile(dbBackup, `finance-tracker-backup-${date}.db`, 'application/octet-stream');
        
        progress.finishProgress('Backup file has been downloaded!');

    } catch (e) {
        console.error("Backup failed", e);
        const message = e instanceof Error ? e.message : 'An unknown error occurred.';
        progress.errorProgress(`Backup failed: ${message}`);
        dispatch({ type: 'ADD_ERROR_LOG', payload: { message: `Backup Error: ${message}`, stack: e instanceof Error ? e.stack : String(e) } });
    }
};

export const restoreBackup = async (file: File, dispatch: React.Dispatch<AppAction>, progress: ProgressReporter) => {
    progress.startProgress('Restoring from Backup');
    try {
        await new Promise(res => setTimeout(res, 200));
        progress.updateProgress(25, `Reading file: ${file.name}...`);
        
        const dbService = getDatabaseService();
        await dbService.initialize();
        
        // Validate that it's a database backup file
        if (!file.name.endsWith('.db') && file.type !== 'application/octet-stream') {
            throw new Error('Invalid backup file format. Please select a database backup file (.db).');
        }
        
        // Database backup restore
        progress.updateProgress(40, 'Loading database backup...');
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        progress.updateProgress(60, 'Restoring database...');
        dbService.restoreBackup(uint8Array);
        
        // CRITICAL: After restoring backup, ensure schema is up to date
        // This adds missing columns like expense_category_items to the restored database
        progress.updateProgress(65, 'Updating database schema...');
        // Ensure all tables exist and columns are added
        dbService.ensureAllTablesExist();
        dbService.ensureContractColumnsExist();
        
        // Also run schema migration check to update version if needed
        const dbServiceInternal = dbService as any;
        if (dbServiceInternal.checkAndMigrateSchema) {
            await dbServiceInternal.checkAndMigrateSchema();
        }
        
        progress.updateProgress(80, 'Loading application state...');
        const appStateRepo = new AppStateRepository();
        let restoredState = await appStateRepo.loadState();
        
        // Check if migration is needed (database backups may have old data format)
        const backupVersion = restoredState.version || 1;
        if (backupVersion < CURRENT_DATA_VERSION) {
            progress.updateProgress(85, `Migrating backup data from version ${backupVersion} to ${CURRENT_DATA_VERSION}...`);
            restoredState = migrateBackupData(restoredState);
            
            // Save migrated state back to database
            await appStateRepo.saveState(restoredState);
        }
        
        progress.updateProgress(90, 'Applying data to application...');
        dispatch({ type: 'SET_STATE', payload: restoredState });

        progress.finishProgress('Restore complete! The app will now reload.');

        setTimeout(() => {
            window.location.reload();
        }, 2000);

    } catch (e) {
        console.error("Restore failed", e);
        const message = e instanceof Error ? e.message : 'File might be corrupted or in an invalid format.';
        progress.errorProgress(`Restore failed: ${message}`);
        dispatch({ type: 'ADD_ERROR_LOG', payload: { message: `Restore Error: ${message}`, stack: e instanceof Error ? e.stack : String(e) } });
    }
};

// Project-wise backup
export const createProjectBackup = async (projectId: string, projectName: string, state: AppState, progress: ProgressReporter, dispatch: React.Dispatch<AppAction>) => {
    progress.startProgress('Creating Project Backup');
    try {
        await new Promise(res => setTimeout(res, 200));
        progress.updateProgress(10, 'Filtering project data...');
        
        // Step 1: Filter all direct project-related entities
        const projectUnits = state.units.filter((u: any) => u.projectId === projectId);
        const projectTransactions = state.transactions.filter((t: any) => t.projectId === projectId);
        const projectInvoices = state.invoices.filter((inv: any) => inv.projectId === projectId);
        const projectBills = state.bills.filter((b: any) => b.projectId === projectId);
        const projectAgreements = state.projectAgreements.filter((pa: any) => pa.projectId === projectId);
        const projectContracts = state.contracts.filter((c: any) => c.projectId === projectId);
        const projectStaff = state.projectStaff.filter((s: any) => s.projectId === projectId);
        const projectPayslips = state.projectPayslips.filter((p: any) => p.projectId === projectId);
        const projectBudgets = state.budgets.filter((b: any) => b.projectId === projectId);
        
        progress.updateProgress(20, 'Collecting related entity IDs...');
        
        // Step 2: Collect all related IDs
        const contactIds = new Set<string>();
        const categoryIds = new Set<string>();
        const accountIds = new Set<string>();
        const contractIds = new Set<string>();
        const billIds = new Set<string>();
        const agreementIds = new Set<string>();
        const invoiceIds = new Set<string>();
        const unitIds = new Set<string>();
        const quotationIds = new Set<string>();
        
        // Collect from units
        projectUnits.forEach(u => {
            if (u.contactId) contactIds.add(u.contactId);
            unitIds.add(u.id);
        });
        
        // Collect from transactions
        projectTransactions.forEach(t => {
            if (t.contactId) contactIds.add(t.contactId);
            if (t.categoryId) categoryIds.add(t.categoryId);
            if (t.accountId) accountIds.add(t.accountId);
            if (t.fromAccountId) accountIds.add(t.fromAccountId);
            if (t.toAccountId) accountIds.add(t.toAccountId);
            if (t.contractId) contractIds.add(t.contractId);
            if (t.billId) billIds.add(t.billId);
            if (t.invoiceId) invoiceIds.add(t.invoiceId);
            if (t.agreementId) agreementIds.add(t.agreementId);
        });
        
        // Collect from invoices
        projectInvoices.forEach(inv => {
            if (inv.contactId) contactIds.add(inv.contactId);
            if (inv.categoryId) categoryIds.add(inv.categoryId);
            if (inv.agreementId) agreementIds.add(inv.agreementId);
            invoiceIds.add(inv.id);
        });
        
        // Collect from bills
        projectBills.forEach(b => {
            if (b.contactId) contactIds.add(b.contactId);
            if (b.categoryId) categoryIds.add(b.categoryId);
            if (b.contractId) contractIds.add(b.contractId);
            if (b.projectAgreementId) agreementIds.add(b.projectAgreementId);
            billIds.add(b.id);
        });
        
        // Collect from project agreements
        projectAgreements.forEach(pa => {
            if (pa.clientId) contactIds.add(pa.clientId);
            if (pa.rebateBrokerId) contactIds.add(pa.rebateBrokerId);
            if (pa.listPriceCategoryId) categoryIds.add(pa.listPriceCategoryId);
            if (pa.customerDiscountCategoryId) categoryIds.add(pa.customerDiscountCategoryId);
            if (pa.floorDiscountCategoryId) categoryIds.add(pa.floorDiscountCategoryId);
            if (pa.lumpSumDiscountCategoryId) categoryIds.add(pa.lumpSumDiscountCategoryId);
            if (pa.miscDiscountCategoryId) categoryIds.add(pa.miscDiscountCategoryId);
            if (pa.sellingPriceCategoryId) categoryIds.add(pa.sellingPriceCategoryId);
            if (pa.rebateCategoryId) categoryIds.add(pa.rebateCategoryId);
            agreementIds.add(pa.id);
        });
        
        // Collect from contracts
        projectContracts.forEach(c => {
            if (c.vendorId) contactIds.add(c.vendorId);
            if (c.categoryIds && Array.isArray(c.categoryIds)) {
                c.categoryIds.forEach((catId: string) => categoryIds.add(catId));
            }
            contractIds.add(c.id);
        });
        
        // Collect from budgets
        projectBudgets.forEach(b => {
            if (b.categoryId) categoryIds.add(b.categoryId);
        });
        
        // Collect from project staff (if they have contactId)
        projectStaff.forEach((s: any) => {
            if (s.contactId) contactIds.add(s.contactId);
        });
        
        progress.updateProgress(40, 'Including related contacts and vendors...');
        
        // Step 3: Filter related entities
        const relatedContacts = state.contacts.filter((c: any) => contactIds.has(c.id));
        
        progress.updateProgress(50, 'Including related categories...');
        
        const relatedCategories = state.categories.filter((c: any) => categoryIds.has(c.id));
        
        progress.updateProgress(55, 'Including related accounts...');
        
        const relatedAccounts = state.accounts.filter((a: any) => accountIds.has(a.id));
        
        progress.updateProgress(60, 'Including related documents...');
        
        // Documents related to contracts, bills, and agreements
        const relatedDocuments = state.documents.filter((d: any) => {
            if (d.entityType === 'contract' && d.entityId && contractIds.has(d.entityId)) return true;
            if (d.entityType === 'bill' && d.entityId && billIds.has(d.entityId)) return true;
            if (d.entityType === 'agreement' && d.entityId && agreementIds.has(d.entityId)) return true;
            return false;
        });
        
        progress.updateProgress(65, 'Including related quotations...');
        
        // Quotations related to project vendors
        const vendorIds = new Set(Array.from(contactIds).filter(id => {
            const contact = state.contacts.find(c => c.id === id);
            return contact && contact.type === ContactType.VENDOR;
        }));
        const relatedQuotations = state.quotations.filter((q: any) => vendorIds.has(q.vendorId));
        
        // Collect quotation IDs for document lookup
        relatedQuotations.forEach(q => {
            quotationIds.add(q.id);
        });
        
        // Include quotation documents (documents where entityType is 'quotation' and entityId matches a quotation ID)
        const quotationDocuments = state.documents.filter((d: any) => 
            d.entityType === 'quotation' && d.entityId && quotationIds.has(d.entityId)
        );
        
        // Combine all documents
        const allRelatedDocuments = [...relatedDocuments, ...quotationDocuments];
        const uniqueDocuments = Array.from(new Map(allRelatedDocuments.map(d => [d.id, d])).values());
        
        progress.updateProgress(75, 'Building backup package...');
        
        // Step 4: Build the filtered state with all related entities
        const filteredState: Partial<AppState> = {
            ...state,
            version: CURRENT_DATA_VERSION, // Include version for backward compatibility
            // Direct project entities
            projects: state.projects.filter((p: any) => p.id === projectId),
            units: projectUnits,
            transactions: projectTransactions,
            invoices: projectInvoices,
            bills: projectBills,
            projectAgreements: projectAgreements,
            contracts: projectContracts,
            projectStaff: projectStaff,
            projectPayslips: projectPayslips,
            budgets: projectBudgets,
            
            // Related entities
            contacts: relatedContacts,
            categories: relatedCategories,
            accounts: relatedAccounts,
            documents: uniqueDocuments,
            quotations: relatedQuotations,
            
            // Keep other arrays empty or minimal to reduce backup size
            buildings: [],
            properties: [],
            rentalAgreements: [],
            rentalStaff: [],
            rentalPayslips: [],
            employees: [],
            salaryComponents: [],
            payrollCycles: [],
            payslips: [],
            bonusRecords: [],
            payrollAdjustments: [],
            loanAdvanceRecords: [],
            attendanceRecords: [],
            taxConfigurations: [],
            statutoryConfigurations: [],
            recurringInvoiceTemplates: [],
            transactionLog: [],
            errorLog: [],
            users: state.users, // Keep users for reference
            
            // Include project-related configuration/settings to ensure proper restoration
            projectAgreementSettings: state.projectAgreementSettings,
            projectInvoiceSettings: state.projectInvoiceSettings,
            printSettings: state.printSettings, // Include print settings as they affect invoice/bill printing
            whatsAppTemplates: state.whatsAppTemplates, // Include WhatsApp templates for notifications
            invoiceHtmlTemplate: state.invoiceHtmlTemplate, // Include invoice template
        };
        
        progress.updateProgress(85, 'Serializing project data...');
        const jsonData = JSON.stringify(filteredState, null, 2);
        
        progress.updateProgress(95, 'Preparing download...');
        const date = new Date().toISOString().split('T')[0];
        const safeName = projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        
        downloadFile(jsonData, `project-backup-${safeName}-${date}.json`, 'application/json');
        
        progress.finishProgress('Project backup file has been downloaded!');
    } catch (e) {
        console.error("Project backup failed", e);
        const message = e instanceof Error ? e.message : 'An unknown error occurred.';
        progress.errorProgress(`Project backup failed: ${message}`);
        dispatch({ type: 'ADD_ERROR_LOG', payload: { message: `Project Backup Error: ${message}`, stack: e instanceof Error ? e.stack : String(e) } });
    }
};

// Building-wise backup
export const createBuildingBackup = async (buildingId: string, buildingName: string, state: AppState, progress: ProgressReporter, dispatch: React.Dispatch<AppAction>) => {
    progress.startProgress('Creating Building Backup');
    try {
        await new Promise(res => setTimeout(res, 200));
        progress.updateProgress(25, 'Filtering building data...');
        
        // Filter all data related to the building
        const filteredState = {
            ...state,
            version: CURRENT_DATA_VERSION, // Include version for backward compatibility
            buildings: state.buildings.filter((b: any) => b.id === buildingId),
            properties: state.properties.filter((p: any) => p.buildingId === buildingId),
            transactions: state.transactions.filter((t: any) => t.buildingId === buildingId || (t.propertyId && state.properties.find((prop: any) => prop.id === t.propertyId && prop.buildingId === buildingId))),
            invoices: state.invoices.filter((inv: any) => inv.buildingId === buildingId || (inv.propertyId && state.properties.find((prop: any) => prop.id === inv.propertyId && prop.buildingId === buildingId))),
            bills: state.bills.filter((b: any) => b.buildingId === buildingId || (b.propertyId && state.properties.find((prop: any) => prop.id === b.propertyId && prop.buildingId === buildingId))),
            rentalAgreements: state.rentalAgreements.filter((ra: any) => ra.propertyId && state.properties.find((prop: any) => prop.id === ra.propertyId && prop.buildingId === buildingId)),
            contracts: state.contracts.filter((c: any) => c.buildingId === buildingId),
            rentalStaff: state.rentalStaff.filter((s: any) => s.buildingId === buildingId),
            rentalPayslips: state.rentalPayslips.filter((p: any) => p.buildingId === buildingId),
            budgets: state.budgets.filter((b: any) => b.buildingId === buildingId),
        };
        
        progress.updateProgress(50, 'Serializing building data...');
        const jsonData = JSON.stringify(filteredState, null, 2);
        
        progress.updateProgress(90, 'Preparing download...');
        const date = new Date().toISOString().split('T')[0];
        const safeName = buildingName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        
        downloadFile(jsonData, `building-backup-${safeName}-${date}.json`, 'application/json');
        
        progress.finishProgress('Building backup file has been downloaded!');
    } catch (e) {
        console.error("Building backup failed", e);
        const message = e instanceof Error ? e.message : 'An unknown error occurred.';
        progress.errorProgress(`Building backup failed: ${message}`);
        dispatch({ type: 'ADD_ERROR_LOG', payload: { message: `Building Backup Error: ${message}`, stack: e instanceof Error ? e.stack : String(e) } });
    }
};

// Restore project/building backup
export const restoreProjectBuildingBackup = async (file: File, dispatch: React.Dispatch<AppAction>, progress: ProgressReporter) => {
    progress.startProgress('Restoring Project/Building Backup');
    try {
        await new Promise(res => setTimeout(res, 200));
        progress.updateProgress(25, `Reading file: ${file.name}...`);
        
        const text = await file.text();
        const backupData = JSON.parse(text);
        
        progress.updateProgress(50, 'Validating backup data...');
        if (!backupData.projects && !backupData.buildings) {
            throw new Error('Invalid backup file. Must contain project or building data.');
        }
        
        progress.updateProgress(60, 'Migrating backup data to current version...');
        
        // Migrate backup data to current version first
        const migratedBackupData = migrateBackupData(backupData);
        
        progress.updateProgress(65, 'Merging backup data...');
        const appStateRepo = new AppStateRepository();
        const currentState = await appStateRepo.loadState();
        
        // Helper function to merge arrays by ID (backup items are already normalized by migrateBackupData)
        const mergeById = (current: any[], backup: any[] | undefined): any[] => {
            if (!backup || !Array.isArray(backup)) return current;
            return [...current.filter((item: any) => !backup.find((bi: any) => bi.id === item.id)), ...backup];
        };
        
        // Merge backup data with current state (using migrated data)
        const mergedState = {
            ...currentState,
            // Merge projects
            projects: mergeById(currentState.projects, migratedBackupData.projects),
            // Merge buildings
            buildings: mergeById(currentState.buildings, migratedBackupData.buildings),
            // Merge units
            units: mergeById(currentState.units, migratedBackupData.units),
            // Merge properties
            properties: mergeById(currentState.properties, migratedBackupData.properties),
            // Merge transactions (normalized)
            transactions: mergeById(currentState.transactions, migratedBackupData.transactions),
            // Merge invoices (normalized)
            invoices: mergeById(currentState.invoices, migratedBackupData.invoices),
            // Merge bills (normalized - this is critical for reports)
            bills: mergeById(currentState.bills, migratedBackupData.bills),
            // Merge agreements (normalized)
            projectAgreements: mergeById(currentState.projectAgreements, migratedBackupData.projectAgreements),
            rentalAgreements: mergeById(currentState.rentalAgreements, migratedBackupData.rentalAgreements),
            // Merge contracts (normalized - this is critical for reports)
            contracts: mergeById(currentState.contracts, migratedBackupData.contracts),
            // Merge contacts/vendors
            contacts: mergeById(currentState.contacts, migratedBackupData.contacts),
            // Merge categories (normalized - this is critical for reports)
            categories: mergeById(currentState.categories, migratedBackupData.categories),
            // Merge accounts
            accounts: mergeById(currentState.accounts, migratedBackupData.accounts),
            // Merge documents
            documents: mergeById(currentState.documents, migratedBackupData.documents),
            // Merge quotations
            quotations: mergeById(currentState.quotations || [], migratedBackupData.quotations),
            // Merge budgets
            budgets: mergeById(currentState.budgets, migratedBackupData.budgets),
            // Merge project staff
            projectStaff: mergeById(currentState.projectStaff || [], migratedBackupData.projectStaff),
            // Merge project payslips
            projectPayslips: mergeById(currentState.projectPayslips || [], migratedBackupData.projectPayslips),
        };
        
        progress.updateProgress(80, 'Saving merged data...');
        await appStateRepo.saveState(mergedState);
        
        progress.updateProgress(90, 'Applying data to application...');
        dispatch({ type: 'SET_STATE', payload: mergedState });
        
        progress.finishProgress('Restore complete!');
    } catch (e) {
        console.error("Restore failed", e);
        const message = e instanceof Error ? e.message : 'File might be corrupted or in an invalid format.';
        progress.errorProgress(`Restore failed: ${message}`);
        dispatch({ type: 'ADD_ERROR_LOG', payload: { message: `Restore Error: ${message}`, stack: e instanceof Error ? e.stack : String(e) } });
    }
};

// ============================================================================
// LOANS, INVESTORS & PM CONFIG BACKUP & RESTORE
// ============================================================================

/**
 * Creates a comprehensive backup of Loans, Investors, and PM Configuration data
 * Includes all related contacts, vendors, accounts, categories, and settings
 */
export const createLoansInvestorsPMBackup = async (
    state: AppState,
    progress: ProgressReporter,
    dispatch: React.Dispatch<AppAction>
) => {
    progress.startProgress('Creating Loans, Investors & PM Config Backup');
    try {
        await new Promise(res => setTimeout(res, 200));
        progress.updateProgress(5, 'Identifying loan transactions...');

        // ===== STEP 1: COLLECT LOAN DATA =====
        const loanTransactions = state.transactions.filter(
            tx => tx.type === TransactionType.LOAN || 
                  (tx.type === TransactionType.TRANSFER && tx.subtype && 
                   [LoanSubtype.GIVE, LoanSubtype.RECEIVE, LoanSubtype.REPAY, LoanSubtype.COLLECT].includes(tx.subtype as LoanSubtype))
        );
        
        // Also include loan advance records from payroll
        const loanAdvanceRecords = state.loanAdvanceRecords || [];

        progress.updateProgress(15, 'Identifying investor accounts and transactions...');

        // ===== STEP 2: COLLECT INVESTOR DATA =====
        // Find all equity accounts (investors)
        const equityAccounts = state.accounts.filter(acc => acc.type === AccountType.EQUITY);
        const equityAccountIds = new Set(equityAccounts.map(acc => acc.id));

        // Find all investor-related transactions:
        // 1. TRANSFER transactions involving equity accounts
        // 2. INCOME transactions going to equity accounts (profit distribution)
        const investorTransactions = state.transactions.filter(tx => {
            if (tx.type === TransactionType.TRANSFER) {
                return (tx.fromAccountId && equityAccountIds.has(tx.fromAccountId)) ||
                       (tx.toAccountId && equityAccountIds.has(tx.toAccountId));
            }
            if (tx.type === TransactionType.INCOME) {
                return tx.accountId && equityAccountIds.has(tx.accountId);
            }
            return false;
        });

        progress.updateProgress(25, 'Collecting PM configuration data...');

        // ===== STEP 3: COLLECT PM CONFIG DATA =====
        // Get all projects with PM configuration
        const projectsWithPMConfig = state.projects.filter(p => p.pmConfig);
        
        // Extract PM configs
        const pmConfigs = projectsWithPMConfig.map(p => ({
            projectId: p.id,
            projectName: p.name,
            pmConfig: p.pmConfig
        }));

        progress.updateProgress(35, 'Collecting related contacts and vendors...');

        // ===== STEP 4: COLLECT RELATED ENTITIES =====
        const contactIds = new Set<string>();
        const categoryIds = new Set<string>();
        const accountIds = new Set<string>();
        const projectIds = new Set<string>();

        // Collect from loan transactions
        loanTransactions.forEach(tx => {
            if (tx.contactId) contactIds.add(tx.contactId);
            if (tx.accountId) accountIds.add(tx.accountId);
            if (tx.fromAccountId) accountIds.add(tx.fromAccountId);
            if (tx.toAccountId) accountIds.add(tx.toAccountId);
            if (tx.categoryId) categoryIds.add(tx.categoryId);
            if (tx.projectId) projectIds.add(tx.projectId);
        });

        // Collect from loan advance records
        loanAdvanceRecords.forEach(loan => {
            // Loan advance records are linked to employees, which might be contacts
            // We'll include all employees that have loan records
        });

        // Collect from investor transactions
        investorTransactions.forEach(tx => {
            if (tx.contactId) contactIds.add(tx.contactId);
            if (tx.accountId) accountIds.add(tx.accountId);
            if (tx.fromAccountId) accountIds.add(tx.fromAccountId);
            if (tx.toAccountId) accountIds.add(tx.toAccountId);
            if (tx.categoryId) categoryIds.add(tx.categoryId);
            if (tx.projectId) projectIds.add(tx.projectId);
        });

        // Collect from PM configs (excluded categories)
        pmConfigs.forEach(pm => {
            if (pm.pmConfig?.excludedCategoryIds) {
                pm.pmConfig.excludedCategoryIds.forEach(catId => categoryIds.add(catId));
            }
            projectIds.add(pm.projectId);
        });

        // Add all equity accounts to accountIds
        equityAccounts.forEach(acc => accountIds.add(acc.id));

        progress.updateProgress(50, 'Including related contacts and vendors...');

        // Filter related entities
        const relatedContacts = state.contacts.filter(c => contactIds.has(c.id));
        
        // Include all vendors (they might be loan providers/recipients)
        const allVendors = state.contacts.filter(c => c.type === ContactType.VENDOR);
        const allContacts = Array.from(new Map([...relatedContacts, ...allVendors].map(c => [c.id, c])).values());

        progress.updateProgress(60, 'Including related categories...');

        const relatedCategories = state.categories.filter(c => categoryIds.has(c.id));
        
        // Include parent categories if any
        const parentCategoryIds = new Set<string>();
        relatedCategories.forEach(cat => {
            if (cat.parentCategoryId) parentCategoryIds.add(cat.parentCategoryId);
        });
        const parentCategories = state.categories.filter(c => parentCategoryIds.has(c.id));
        const allCategories = Array.from(new Map([...relatedCategories, ...parentCategories].map(c => [c.id, c])).values());

        progress.updateProgress(70, 'Including related accounts...');

        const relatedAccounts = state.accounts.filter(a => accountIds.has(a.id));
        
        // Include parent accounts if any
        const parentAccountIds = new Set<string>();
        relatedAccounts.forEach(acc => {
            if (acc.parentAccountId) parentAccountIds.add(acc.parentAccountId);
        });
        const parentAccounts = state.accounts.filter(a => parentAccountIds.has(a.id));
        const allAccounts = Array.from(new Map([...relatedAccounts, ...parentAccounts].map(a => [a.id, a])).values());

        progress.updateProgress(80, 'Including related projects...');

        const relatedProjects = state.projects.filter(p => projectIds.has(p.id));

        progress.updateProgress(85, 'Building backup package...');

        // ===== STEP 5: BUILD BACKUP PACKAGE =====
        const backupData = {
            version: '1.0',
            backupType: 'LoansInvestorsPMConfig',
            backupDate: new Date().toISOString(),
            data: {
                // Loan data
                loanTransactions,
                loanAdvanceRecords,
                
                // Investor data
                equityAccounts,
                investorTransactions,
                
                // PM Config data
                projectsWithPMConfig: relatedProjects,
                pmConfigs,
                
                // Related entities
                contacts: allContacts,
                categories: allCategories,
                accounts: allAccounts,
                
                // Related settings that might affect these sections
                projectAgreementSettings: state.projectAgreementSettings,
                projectInvoiceSettings: state.projectInvoiceSettings,
                printSettings: state.printSettings,
                dashboardConfig: state.dashboardConfig,
            },
            metadata: {
                loanTransactionCount: loanTransactions.length,
                loanAdvanceRecordCount: loanAdvanceRecords.length,
                equityAccountCount: equityAccounts.length,
                investorTransactionCount: investorTransactions.length,
                pmConfigCount: pmConfigs.length,
                contactCount: allContacts.length,
                categoryCount: allCategories.length,
                accountCount: allAccounts.length,
            }
        };

        progress.updateProgress(90, 'Serializing backup data...');
        const jsonData = JSON.stringify(backupData, null, 2);

        progress.updateProgress(95, 'Preparing download...');
        const date = new Date().toISOString().split('T')[0];
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + 
                         new Date().toTimeString().split(' ')[0].replace(/:/g, '-');

        downloadFile(jsonData, `loans-investors-pm-backup-${timestamp}.json`, 'application/json');

        progress.finishProgress('Backup file has been downloaded!');
    } catch (e) {
        console.error("Loans/Investors/PM backup failed", e);
        const message = e instanceof Error ? e.message : 'An unknown error occurred.';
        progress.errorProgress(`Backup failed: ${message}`);
        dispatch({ type: 'ADD_ERROR_LOG', payload: { message: `Loans/Investors/PM Backup Error: ${message}`, stack: e instanceof Error ? e.stack : String(e) } });
    }
};

/**
 * Restores Loans, Investors, and PM Configuration data from backup
 * Merges with existing data without losing any records
 */
export const restoreLoansInvestorsPMBackup = async (
    file: File,
    dispatch: React.Dispatch<AppAction>,
    progress: ProgressReporter
) => {
    progress.startProgress('Restoring Loans, Investors & PM Config Backup');
    try {
        await new Promise(res => setTimeout(res, 200));
        progress.updateProgress(10, `Reading file: ${file.name}...`);

        const text = await file.text();
        const backupData = JSON.parse(text);

        progress.updateProgress(20, 'Validating backup data...');
        
        if (!backupData.backupType || backupData.backupType !== 'LoansInvestorsPMConfig') {
            throw new Error('Invalid backup file. This file is not a Loans/Investors/PM Config backup.');
        }

        if (!backupData.data) {
            throw new Error('Invalid backup file format. Missing data section.');
        }

        progress.updateProgress(30, 'Loading current application state...');
        const appStateRepo = new AppStateRepository();
        const currentState = await appStateRepo.loadState();

        progress.updateProgress(35, 'Migrating backup data to current version...');
        // Migrate backup data to current version first
        const migratedBackupData = migrateBackupData(backupData);

        progress.updateProgress(40, 'Merging loan data...');

        // Helper function to merge arrays by ID (backup data takes precedence)
        const mergeById = (current: any[], backup: any[] | undefined): any[] => {
            if (!backup || !Array.isArray(backup)) return current;
            const backupMap = new Map(backup.map(item => [item.id, item]));
            const currentFiltered = current.filter(item => !backupMap.has(item.id));
            return [...currentFiltered, ...backup];
        };

        // Helper function to merge objects (backup data takes precedence)
        const mergeObject = (current: any, backup: any): any => {
            if (!backup) return current;
            return { ...current, ...backup };
        };

        // ===== STEP 1: MERGE LOAN DATA =====
        const migratedLoanTransactions = migratedBackupData.data?.loanTransactions 
            ? migratedBackupData.data.loanTransactions.map((tx: any) => migrateBackupData({ transactions: [tx] }).transactions[0])
            : backupData.data.loanTransactions || [];
            
        const mergedLoanTransactions = mergeById(
            currentState.transactions,
            migratedLoanTransactions
        );

        const mergedLoanAdvanceRecords = mergeById(
            currentState.loanAdvanceRecords || [],
            migratedBackupData.data?.loanAdvanceRecords || backupData.data.loanAdvanceRecords
        );

        progress.updateProgress(50, 'Merging investor data...');

        // ===== STEP 2: MERGE INVESTOR DATA =====
        // Merge equity accounts
        const mergedAccounts = mergeById(
            currentState.accounts,
            migratedBackupData.data?.equityAccounts || backupData.data.equityAccounts
        );

        // Get all equity account IDs from backup for filtering
        const backupEquityAccountIds = new Set(
            ((migratedBackupData.data?.equityAccounts || backupData.data.equityAccounts) || []).map((acc: any) => acc.id)
        );

        // Merge investor transactions (normalized)
        const migratedInvestorTransactions = migratedBackupData.data?.investorTransactions
            ? migratedBackupData.data.investorTransactions.map((tx: any) => migrateBackupData({ transactions: [tx] }).transactions[0])
            : backupData.data.investorTransactions || [];
            
        const mergedInvestorTransactions = mergeById(
            mergedLoanTransactions, // Already includes loan transactions
            migratedInvestorTransactions
        );

        // Combine all transactions (mergedInvestorTransactions already contains all loan and investor transactions from backup)
        // We need to add back any current transactions that are NOT loans or investors
        const backupTransactionIds = new Set<string>();
        mergedInvestorTransactions.forEach(tx => backupTransactionIds.add(tx.id));

        // Get all current transactions that are not loans or investors, or are loans/investors not in backup
        const otherTransactions = currentState.transactions.filter(tx => {
            // If already in backup, skip (backup takes precedence)
            if (backupTransactionIds.has(tx.id)) return false;

            // Check if this is a loan transaction
            const isLoan = tx.type === TransactionType.LOAN || 
                          (tx.subtype && [LoanSubtype.GIVE, LoanSubtype.RECEIVE, LoanSubtype.REPAY, LoanSubtype.COLLECT].includes(tx.subtype as LoanSubtype));
            
            // Check if this is an investor transaction
            const isInvestor = (tx.type === TransactionType.TRANSFER && (
                (tx.fromAccountId && backupEquityAccountIds.has(tx.fromAccountId)) ||
                (tx.toAccountId && backupEquityAccountIds.has(tx.toAccountId))
            )) || (tx.type === TransactionType.INCOME && tx.accountId && backupEquityAccountIds.has(tx.accountId));
            
            // For loan/investor transactions not in backup, we keep them (they're new)
            // For all other transactions, we keep them
            return true;
        });

        // Final transactions: merged investor transactions (includes loans) + other transactions
        const finalTransactions = [...mergedInvestorTransactions, ...otherTransactions];

        progress.updateProgress(60, 'Merging PM configuration...');

        // ===== STEP 3: MERGE PM CONFIG DATA =====
        const mergedProjects = currentState.projects.map(project => {
            const backupProject = backupData.data.projectsWithPMConfig?.find((p: any) => p.id === project.id);
            if (backupProject && backupProject.pmConfig) {
                return {
                    ...project,
                    pmConfig: backupProject.pmConfig
                };
            }
            return project;
        });

        // Add any new projects from backup that don't exist
        const existingProjectIds = new Set(currentState.projects.map(p => p.id));
        const newProjects = (backupData.data.projectsWithPMConfig || []).filter((p: any) => !existingProjectIds.has(p.id));
        const finalProjects = [...mergedProjects, ...newProjects];

        progress.updateProgress(70, 'Merging related entities...');

        // ===== STEP 4: MERGE RELATED ENTITIES =====
        const mergedContacts = mergeById(
            currentState.contacts,
            migratedBackupData.data?.contacts || backupData.data.contacts
        );

        // Normalize categories before merging (critical for reports)
        const normalizedCategories = (migratedBackupData.data?.categories || backupData.data.categories || []).map((cat: any) => 
            migrateBackupData({ categories: [cat] }).categories[0]
        );
        const mergedCategories = mergeById(
            currentState.categories,
            normalizedCategories
        );

        const finalAccounts = mergeById(
            mergedAccounts,
            backupData.data.accounts
        );

        progress.updateProgress(80, 'Merging settings...');

        // ===== STEP 5: MERGE SETTINGS =====
        const mergedSettings = {
            projectAgreementSettings: mergeObject(
                currentState.projectAgreementSettings,
                backupData.data.projectAgreementSettings
            ),
            projectInvoiceSettings: mergeObject(
                currentState.projectInvoiceSettings,
                backupData.data.projectInvoiceSettings
            ),
            printSettings: mergeObject(
                currentState.printSettings,
                backupData.data.printSettings
            ),
            dashboardConfig: mergeObject(
                currentState.dashboardConfig,
                backupData.data.dashboardConfig
            ),
        };

        progress.updateProgress(85, 'Building final state...');

        // ===== STEP 6: BUILD FINAL STATE =====
        const mergedState: AppState = {
            ...currentState,
            transactions: finalTransactions,
            loanAdvanceRecords: mergedLoanAdvanceRecords,
            accounts: finalAccounts,
            projects: finalProjects,
            contacts: mergedContacts,
            categories: mergedCategories,
            projectAgreementSettings: mergedSettings.projectAgreementSettings,
            projectInvoiceSettings: mergedSettings.projectInvoiceSettings,
            printSettings: mergedSettings.printSettings,
            dashboardConfig: mergedSettings.dashboardConfig,
        };

        progress.updateProgress(90, 'Saving merged data...');
        await appStateRepo.saveState(mergedState);

        progress.updateProgress(95, 'Applying data to application...');
        dispatch({ type: 'SET_STATE', payload: mergedState });

        progress.finishProgress('Restore complete! All data has been merged without losing any existing records.');
    } catch (e) {
        console.error("Loans/Investors/PM restore failed", e);
        const message = e instanceof Error ? e.message : 'File might be corrupted or in an invalid format.';
        progress.errorProgress(`Restore failed: ${message}`);
        dispatch({ type: 'ADD_ERROR_LOG', payload: { message: `Loans/Investors/PM Restore Error: ${message}`, stack: e instanceof Error ? e.stack : String(e) } });
    }
};
