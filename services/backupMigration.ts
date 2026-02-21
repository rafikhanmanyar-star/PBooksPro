/**
 * Backup Migration Utility
 * 
 * Handles backward compatibility for restoring old backups on new versions.
 * Automatically migrates old data structures to match current schema.
 */

import { AppState, Bill, Contract, ProjectAgreement, RentalAgreement, Category, Transaction, Invoice, TransactionType } from '../types';

export interface BackupMetadata {
    version?: number;
    backupType?: string;
    backupDate?: string;
    [key: string]: any;
}

/**
 * Current data version - increment when schema changes
 */
export const CURRENT_DATA_VERSION = 5;

/**
 * Migrate backup data to current version
 */
export function migrateBackupData(backupData: any): AppState {
    const version = backupData.version || backupData.data?.version || 1;
    
    console.log(`🔄 Migrating backup from version ${version} to ${CURRENT_DATA_VERSION}`);
    
    // If it's a structured backup (like Loans/Investors/PM), extract the data
    let state: any = backupData;
    if (backupData.data && backupData.backupType) {
        // This is a structured backup, we need to merge it differently
        // For now, return as-is and let the restore function handle it
        return backupData as AppState;
    }
    
    // Migrate based on version
    if (version < 2) {
        state = migrateToV2(state);
    }
    if (version < 3) {
        state = migrateToV3(state);
    }
    if (version < 4) {
        state = migrateToV4(state);
    }
    if (version < 5) {
        state = migrateToV5(state);
    }
    
    // Normalize all entities to ensure they match current schema
    state = normalizeState(state);
    
    console.log(`✅ Backup migration complete`);
    
    return state;
}

/**
 * Migrate to version 2: Add missing fields to bills and contracts
 */
function migrateToV2(state: any): any {
    console.log('📦 Migrating to v2: Adding missing fields to bills and contracts');
    
    // Migrate bills
    if (state.bills && Array.isArray(state.bills)) {
        state.bills = state.bills.map((bill: any) => normalizeBill(bill));
    }
    
    // Migrate contracts
    if (state.contracts && Array.isArray(state.contracts)) {
        state.contracts = state.contracts.map((contract: any) => normalizeContract(contract));
    }
    
    return state;
}

/**
 * Migrate to version 3: Add category IDs to agreements
 */
function migrateToV3(state: any): any {
    console.log('📦 Migrating to v3: Adding category IDs to agreements');
    
    // Migrate project agreements
    if (state.projectAgreements && Array.isArray(state.projectAgreements)) {
        state.projectAgreements = state.projectAgreements.map((agreement: any) => normalizeProjectAgreement(agreement));
    }
    
    // Migrate rental agreements
    if (state.rentalAgreements && Array.isArray(state.rentalAgreements)) {
        state.rentalAgreements = state.rentalAgreements.map((agreement: any) => normalizeRentalAgreement(agreement));
    }
    
    return state;
}

/**
 * Migrate to version 4: Normalize categories and transactions
 */
function migrateToV4(state: any): any {
    console.log('📦 Migrating to v4: Normalizing categories and transactions');
    
    // Migrate categories
    if (state.categories && Array.isArray(state.categories)) {
        state.categories = state.categories.map((category: any) => normalizeCategory(category));
    }
    
    // Migrate transactions
    if (state.transactions && Array.isArray(state.transactions)) {
        state.transactions = state.transactions.map((transaction: any) => normalizeTransaction(transaction));
    }
    
    return state;
}

/**
 * Migrate to version 5: Normalize invoices and ensure all entities have required fields
 */
function migrateToV5(state: any): any {
    console.log('📦 Migrating to v5: Normalizing invoices and ensuring all entities are complete');
    
    // Migrate invoices
    if (state.invoices && Array.isArray(state.invoices)) {
        state.invoices = state.invoices.map((invoice: any) => normalizeInvoice(invoice));
    }
    
    return state;
}

/**
 * Normalize entire state to current schema
 */
function normalizeState(state: any): AppState {
    return {
        ...state,
        bills: (state.bills || []).map((b: any) => normalizeBill(b)),
        contracts: (state.contracts || []).map((c: any) => normalizeContract(c)),
        projectAgreements: (state.projectAgreements || []).map((pa: any) => normalizeProjectAgreement(pa)),
        rentalAgreements: (state.rentalAgreements || []).map((ra: any) => normalizeRentalAgreement(ra)),
        categories: (state.categories || []).map((cat: any) => normalizeCategory(cat)),
        transactions: (state.transactions || []).map((tx: any) => normalizeTransaction(tx)),
        invoices: (state.invoices || []).map((inv: any) => normalizeInvoice(inv)),
        version: CURRENT_DATA_VERSION,
    };
}

/**
 * Normalize Bill to current schema
 */
function normalizeBill(bill: any): Bill {
    // Handle expenseCategoryItems - might be a JSON string or already parsed
    let expenseCategoryItems = bill.expenseCategoryItems || bill.expense_category_items;
    if (expenseCategoryItems && typeof expenseCategoryItems === 'string') {
        try {
            expenseCategoryItems = JSON.parse(expenseCategoryItems);
        } catch (e) {
            console.warn('Failed to parse expenseCategoryItems for bill', bill.id, e);
            expenseCategoryItems = undefined;
        }
    }
    
    return {
        id: bill.id,
        billNumber: bill.billNumber || bill.bill_number || `BILL-${bill.id}`,
        contactId: bill.contactId || bill.contact_id || '',
        amount: typeof bill.amount === 'number' ? bill.amount : parseFloat(bill.amount || '0'),
        paidAmount: typeof bill.paidAmount === 'number' ? bill.paidAmount : parseFloat(bill.paid_amount || bill.paidAmount || '0'),
        status: bill.status || 'Unpaid',
        issueDate: bill.issueDate || bill.issue_date || new Date().toISOString().split('T')[0],
        dueDate: bill.dueDate || bill.due_date || undefined,
        description: bill.description || undefined,
        categoryId: bill.categoryId || bill.category_id || undefined,
        projectId: bill.projectId || bill.project_id || undefined,
        buildingId: bill.buildingId || bill.building_id || undefined,
        propertyId: bill.propertyId || bill.property_id || undefined,
        projectAgreementId: bill.projectAgreementId || bill.project_agreement_id || bill.agreementId || bill.agreement_id || undefined,
        contractId: bill.contractId || bill.contract_id || undefined,
        staffId: bill.staffId || bill.staff_id || undefined,
        vendorId: bill.vendorId || bill.vendor_id || undefined,
        documentPath: bill.documentPath || bill.document_path || undefined,
        documentId: bill.documentId || bill.document_id || undefined,
        expenseCategoryItems: expenseCategoryItems,
    };
}

/**
 * Normalize Contract to current schema
 */
function normalizeContract(contract: any): Contract {
    // Handle expenseCategoryItems - might be a JSON string or already parsed
    let expenseCategoryItems = contract.expenseCategoryItems || contract.expense_category_items;
    
    // Parse if it's a JSON string
    if (expenseCategoryItems && typeof expenseCategoryItems === 'string') {
        try {
            expenseCategoryItems = JSON.parse(expenseCategoryItems);
        } catch (e) {
            console.warn('Failed to parse expenseCategoryItems for contract', contract.id, e);
            expenseCategoryItems = undefined;
        }
    }
    
    // If we have old categoryIds but no expenseCategoryItems, create them
    if (!expenseCategoryItems && contract.categoryIds && Array.isArray(contract.categoryIds) && contract.categoryIds.length > 0) {
        expenseCategoryItems = contract.categoryIds.map((catId: string, index: number) => ({
            id: `exp-${contract.id}-${index}`,
            categoryId: catId,
            unit: 'quantity' as const,
            quantity: 1,
            pricePerUnit: contract.totalAmount ? contract.totalAmount / contract.categoryIds.length : 0,
            netValue: contract.totalAmount ? contract.totalAmount / contract.categoryIds.length : 0,
        }));
    }
    
    return {
        id: contract.id,
        contractNumber: contract.contractNumber || contract.contract_number || `CONTRACT-${contract.id}`,
        name: contract.name || '',
        projectId: contract.projectId || contract.project_id || '',
        vendorId: contract.vendorId || contract.vendor_id || '',
        totalAmount: typeof contract.totalAmount === 'number' ? contract.totalAmount : parseFloat(contract.total_amount || contract.totalAmount || '0'),
        area: contract.area !== undefined ? (typeof contract.area === 'number' ? contract.area : parseFloat(contract.area || '0')) : undefined,
        rate: contract.rate !== undefined ? (typeof contract.rate === 'number' ? contract.rate : parseFloat(contract.rate || '0')) : undefined,
        startDate: contract.startDate || contract.start_date || new Date().toISOString().split('T')[0],
        endDate: contract.endDate || contract.end_date || new Date().toISOString().split('T')[0],
        status: contract.status || 'Active',
        categoryIds: contract.categoryIds || contract.category_ids || (expenseCategoryItems ? expenseCategoryItems.map((item: any) => item.categoryId) : []),
        expenseCategoryItems: expenseCategoryItems,
        termsAndConditions: contract.termsAndConditions || contract.terms_and_conditions || undefined,
        paymentTerms: contract.paymentTerms || contract.payment_terms || undefined,
        description: contract.description || undefined,
    };
}

/**
 * Normalize ProjectAgreement to current schema
 */
function normalizeProjectAgreement(agreement: any): ProjectAgreement {
    return {
        id: agreement.id,
        agreementNumber: agreement.agreementNumber || agreement.agreement_number || `AGR-${agreement.id}`,
        clientId: agreement.clientId || agreement.client_id || '',
        projectId: agreement.projectId || agreement.project_id || '',
        unitIds: agreement.unitIds || agreement.unit_ids || agreement.unitId ? [agreement.unitId] : (agreement.unit_id ? [agreement.unit_id] : []),
        listPrice: typeof agreement.listPrice === 'number' ? agreement.listPrice : parseFloat(agreement.list_price || agreement.listPrice || '0'),
        customerDiscount: typeof agreement.customerDiscount === 'number' ? agreement.customerDiscount : parseFloat(agreement.customer_discount || agreement.customerDiscount || '0'),
        floorDiscount: typeof agreement.floorDiscount === 'number' ? agreement.floorDiscount : parseFloat(agreement.floor_discount || agreement.floorDiscount || '0'),
        lumpSumDiscount: typeof agreement.lumpSumDiscount === 'number' ? agreement.lumpSumDiscount : parseFloat(agreement.lump_sum_discount || agreement.lumpSumDiscount || '0'),
        miscDiscount: typeof agreement.miscDiscount === 'number' ? agreement.miscDiscount : parseFloat(agreement.misc_discount || agreement.miscDiscount || '0'),
        sellingPrice: typeof agreement.sellingPrice === 'number' ? agreement.sellingPrice : parseFloat(agreement.selling_price || agreement.sellingPrice || '0'),
        rebateAmount: agreement.rebateAmount !== undefined ? (typeof agreement.rebateAmount === 'number' ? agreement.rebateAmount : parseFloat(agreement.rebate_amount || agreement.rebateAmount || '0')) : undefined,
        rebateBrokerId: agreement.rebateBrokerId || agreement.rebate_broker_id || undefined,
        issueDate: agreement.issueDate || agreement.issue_date || new Date().toISOString().split('T')[0],
        description: agreement.description || undefined,
        status: agreement.status || 'Active',
        cancellationDetails: agreement.cancellationDetails || agreement.cancellation_details || undefined,
        listPriceCategoryId: agreement.listPriceCategoryId || agreement.list_price_category_id || undefined,
        customerDiscountCategoryId: agreement.customerDiscountCategoryId || agreement.customer_discount_category_id || undefined,
        floorDiscountCategoryId: agreement.floorDiscountCategoryId || agreement.floor_discount_category_id || undefined,
        lumpSumDiscountCategoryId: agreement.lumpSumDiscountCategoryId || agreement.lump_sum_discount_category_id || undefined,
        miscDiscountCategoryId: agreement.miscDiscountCategoryId || agreement.misc_discount_category_id || undefined,
        sellingPriceCategoryId: agreement.sellingPriceCategoryId || agreement.selling_price_category_id || undefined,
        rebateCategoryId: agreement.rebateCategoryId || agreement.rebate_category_id || undefined,
    };
}

/**
 * Normalize RentalAgreement to current schema
 */
function normalizeRentalAgreement(agreement: any): RentalAgreement {
    return {
        id: agreement.id,
        agreementNumber: agreement.agreementNumber || agreement.agreement_number || `RENT-${agreement.id}`,
        contactId: agreement.contactId || agreement.contact_id || agreement.tenantId || agreement.tenant_id || '',
        propertyId: agreement.propertyId || agreement.property_id || '',
        startDate: agreement.startDate || agreement.start_date || new Date().toISOString().split('T')[0],
        endDate: agreement.endDate || agreement.end_date || new Date().toISOString().split('T')[0],
        monthlyRent: typeof agreement.monthlyRent === 'number' ? agreement.monthlyRent : parseFloat(agreement.monthly_rent || agreement.monthlyRent || '0'),
        rentDueDate: typeof agreement.rentDueDate === 'number' ? agreement.rentDueDate : parseInt(agreement.rent_due_date || agreement.rentDueDate || '1'),
        status: agreement.status || 'Active',
        description: agreement.description || undefined,
        securityDeposit: agreement.securityDeposit !== undefined ? (typeof agreement.securityDeposit === 'number' ? agreement.securityDeposit : parseFloat(agreement.security_deposit || agreement.securityDeposit || '0')) : undefined,
        brokerId: agreement.brokerId || agreement.broker_id || undefined,
        brokerFee: agreement.brokerFee !== undefined ? (typeof agreement.brokerFee === 'number' ? agreement.brokerFee : parseFloat(agreement.broker_fee || agreement.brokerFee || '0')) : undefined,
        ownerId: agreement.ownerId || agreement.owner_id || undefined,
    };
}

/**
 * Normalize Category to current schema
 */
function normalizeCategory(category: any): Category {
    return {
        id: category.id,
        name: category.name || '',
        type: category.type || TransactionType.EXPENSE,
        description: category.description || undefined,
        isPermanent: category.isPermanent !== undefined ? (typeof category.isPermanent === 'boolean' ? category.isPermanent : category.is_permanent === 1 || category.is_permanent === true) : false,
        isRental: category.isRental !== undefined ? (typeof category.isRental === 'boolean' ? category.isRental : category.is_rental === 1 || category.is_rental === true) : false,
        parentCategoryId: category.parentCategoryId || category.parent_category_id || undefined,
    };
}

/**
 * Normalize Transaction to current schema
 */
function normalizeTransaction(transaction: any): Transaction {
    return {
        id: transaction.id,
        type: transaction.type || TransactionType.EXPENSE,
        subtype: transaction.subtype || undefined,
        amount: typeof transaction.amount === 'number' ? transaction.amount : parseFloat(transaction.amount || '0'),
        date: transaction.date || new Date().toISOString().split('T')[0],
        description: transaction.description || undefined,
        accountId: transaction.accountId || transaction.account_id || '',
        fromAccountId: transaction.fromAccountId || transaction.from_account_id || undefined,
        toAccountId: transaction.toAccountId || transaction.to_account_id || undefined,
        categoryId: transaction.categoryId || transaction.category_id || undefined,
        contactId: transaction.contactId || transaction.contact_id || undefined,
        projectId: transaction.projectId || transaction.project_id || undefined,
        buildingId: transaction.buildingId || transaction.building_id || undefined,
        propertyId: transaction.propertyId || transaction.property_id || undefined,
        unitId: transaction.unitId || transaction.unit_id || undefined,
        invoiceId: transaction.invoiceId || transaction.invoice_id || undefined,
        billId: transaction.billId || transaction.bill_id || undefined,
        payslipId: transaction.payslipId || transaction.payslip_id || undefined,
        contractId: transaction.contractId || transaction.contract_id || undefined,
        agreementId: transaction.agreementId || transaction.agreement_id || undefined,
        batchId: transaction.batchId || transaction.batch_id || undefined,
        isSystem: transaction.isSystem !== undefined ? (typeof transaction.isSystem === 'boolean' ? transaction.isSystem : transaction.is_system === 1 || transaction.is_system === true) : false,
        children: transaction.children || undefined,
    };
}

/**
 * Normalize Invoice to current schema
 */
function normalizeInvoice(invoice: any): Invoice {
    return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber || invoice.invoice_number || `INV-${invoice.id}`,
        contactId: invoice.contactId || invoice.contact_id || '',
        amount: typeof invoice.amount === 'number' ? invoice.amount : parseFloat(invoice.amount || '0'),
        paidAmount: typeof invoice.paidAmount === 'number' ? invoice.paidAmount : parseFloat(invoice.paid_amount || invoice.paidAmount || '0'),
        status: invoice.status || 'Unpaid',
        issueDate: invoice.issueDate || invoice.issue_date || new Date().toISOString().split('T')[0],
        dueDate: invoice.dueDate || invoice.due_date || new Date().toISOString().split('T')[0],
        invoiceType: invoice.invoiceType || invoice.invoice_type || 'Rental',
        description: invoice.description || undefined,
        projectId: invoice.projectId || invoice.project_id || undefined,
        buildingId: invoice.buildingId || invoice.building_id || undefined,
        propertyId: invoice.propertyId || invoice.property_id || undefined,
        unitId: invoice.unitId || invoice.unit_id || undefined,
        categoryId: invoice.categoryId || invoice.category_id || undefined,
        agreementId: invoice.agreementId || invoice.agreement_id || undefined,
        securityDepositCharge: invoice.securityDepositCharge !== undefined ? (typeof invoice.securityDepositCharge === 'number' ? invoice.securityDepositCharge : parseFloat(invoice.security_deposit_charge || invoice.securityDepositCharge || '0')) : undefined,
        serviceCharges: invoice.serviceCharges !== undefined ? (typeof invoice.serviceCharges === 'number' ? invoice.serviceCharges : parseFloat(invoice.service_charges || invoice.serviceCharges || '0')) : undefined,
        rentalMonth: invoice.rentalMonth || invoice.rental_month || undefined,
    };
}

