
import { AppState, Contract, Bill, Transaction, TransactionType, InvoiceType, AccountType, LoanSubtype } from '../types';

export interface ExportMaps {
    accountsById: Map<string, string>;
    contactsById: Map<string, string>;
    categoriesById: Map<string, string>;
    projectsById: Map<string, string>;
    buildingsById: Map<string, string>;
    propertiesById: Map<string, string>;
    unitsById: Map<string, string>;
    rentalAgreementNoById: Map<string, string>;
    projectAgreementNoById: Map<string, string>;
    invoiceNoById: Map<string, string>;
    billNoById: Map<string, string>;
    contractNoById: Map<string, string>;
}

export interface ExportSchema {
    sheetName: string;
    headers: string[];
    version: string;
    transform: (state: AppState, maps: ExportMaps, helpers: ExportHelpers) => any[];
}

export interface ExportHelpers {
    getName: (map: Map<string, string>, id?: string | null) => string;
    getAgreementNumber: (agreementId?: string | null) => string;
    depthSortByParent: <T extends { id: string; parentAccountId?: string; parentCategoryId?: string }>(
        items: T[],
        parentKey: 'parentAccountId' | 'parentCategoryId'
    ) => T[];
    safeJson: (val: any) => string;
}

// Helper function to create export schemas
const createExportSchemas = (): Record<string, ExportSchema> => {
    const schemas: Record<string, ExportSchema> = {};

    // Settings
    schemas.Settings = {
        sheetName: 'Settings',
        version: '1.0',
        headers: ['Key', 'Value'],
        transform: (state: AppState, maps: ExportMaps, helpers: ExportHelpers) => [
            { Key: 'AgreementSettings', Value: helpers.safeJson(state.agreementSettings) },
            { Key: 'ProjectAgreementSettings', Value: helpers.safeJson(state.projectAgreementSettings) },
            { Key: 'RentalInvoiceSettings', Value: helpers.safeJson(state.rentalInvoiceSettings) },
            { Key: 'ProjectInvoiceSettings', Value: helpers.safeJson(state.projectInvoiceSettings) },
            { Key: 'PrintSettings', Value: helpers.safeJson(state.printSettings) },
            { Key: 'WhatsAppTemplates', Value: helpers.safeJson(state.whatsAppTemplates) },
            { Key: 'DashboardConfig', Value: helpers.safeJson(state.dashboardConfig) },
            { Key: 'InvoiceHtmlTemplate', Value: helpers.safeJson(state.invoiceHtmlTemplate ?? '') },
            { Key: 'PmCostPercentage', Value: helpers.safeJson(state.pmCostPercentage) },
            { Key: 'ShowSystemTransactions', Value: helpers.safeJson(state.showSystemTransactions) },
            { Key: 'EnableColorCoding', Value: helpers.safeJson(state.enableColorCoding) },
            { Key: 'EnableBeepOnSave', Value: helpers.safeJson(state.enableBeepOnSave) },
            { Key: 'LastServiceChargeRun', Value: helpers.safeJson(state.lastServiceChargeRun ?? '') },
        ]
    };

    // Accounts
    schemas.Accounts = {
        sheetName: 'Accounts',
        version: '1.0',
        headers: ['id', 'name', 'type', 'balance', 'isPermanent', 'description', 'parentAccountName'],
        transform: (state: AppState, maps: ExportMaps, helpers: ExportHelpers) => 
            helpers.depthSortByParent(state.accounts, 'parentAccountId').map(a => ({
                id: a.id,
                name: a.name,
                type: a.type,
                balance: a.balance,
                isPermanent: a.isPermanent ?? false,
                description: a.description ?? '',
                parentAccountName: helpers.getName(maps.accountsById, a.parentAccountId),
            }))
    };

    // Contacts
    schemas.Contacts = {
        sheetName: 'Contacts',
        version: '1.0',
        headers: ['id', 'name', 'type', 'description', 'contactNo', 'companyName', 'address'],
        transform: (state: AppState) => state.contacts.map(c => ({
            id: c.id,
            name: c.name,
            type: c.type,
            description: c.description ?? '',
            contactNo: c.contactNo ?? '',
            companyName: c.companyName ?? '',
            address: c.address ?? '',
        }))
    };

    // Categories
    schemas.Categories = {
        sheetName: 'Categories',
        version: '1.0',
        headers: ['id', 'name', 'type', 'description', 'isPermanent', 'isRental', 'parentCategoryName'],
        transform: (state: AppState, maps: ExportMaps, helpers: ExportHelpers) => 
            helpers.depthSortByParent(state.categories as any, 'parentCategoryId').map((c: any) => ({
                id: c.id,
                name: c.name,
                type: c.type,
                description: c.description ?? '',
                isPermanent: c.isPermanent ?? false,
                isRental: c.isRental ?? false,
                parentCategoryName: helpers.getName(maps.categoriesById, c.parentCategoryId),
            }))
    };

    // Projects
    schemas.Projects = {
        sheetName: 'Projects',
        version: '1.0',
        headers: ['id', 'name', 'description', 'color', 'status', 'pmConfig', 'installmentConfig'],
        transform: (state: AppState, maps: ExportMaps, helpers: ExportHelpers) => state.projects.map(p => ({
            id: p.id,
            name: p.name,
            description: p.description ?? '',
            color: p.color ?? '',
            status: p.status ?? '',
            pmConfig: p.pmConfig ? helpers.safeJson(p.pmConfig) : '',
            installmentConfig: p.installmentConfig ? helpers.safeJson(p.installmentConfig) : '',
        }))
    };

    // Buildings
    schemas.Buildings = {
        sheetName: 'Buildings',
        version: '1.0',
        headers: ['id', 'name', 'description', 'color'],
        transform: (state: AppState) => state.buildings.map(b => ({
            id: b.id,
            name: b.name,
            description: b.description ?? '',
            color: b.color ?? '',
        }))
    };

    // Properties
    schemas.Properties = {
        sheetName: 'Properties',
        version: '1.0',
        headers: ['id', 'name', 'ownerName', 'buildingName', 'description', 'monthlyServiceCharge'],
        transform: (state: AppState, maps: ExportMaps, helpers: ExportHelpers) => state.properties.map(p => ({
            id: p.id,
            name: p.name,
            ownerName: helpers.getName(maps.contactsById, p.ownerId),
            buildingName: helpers.getName(maps.buildingsById, p.buildingId),
            description: p.description ?? '',
            monthlyServiceCharge: p.monthlyServiceCharge ?? 0,
        }))
    };

    // Units
    schemas.Units = {
        sheetName: 'Units',
        version: '1.1',
        headers: ['id', 'name', 'type', 'area', 'floor', 'projectName', 'ownerName', 'salePrice', 'description'],
        transform: (state: AppState, maps: ExportMaps, helpers: ExportHelpers) => state.units.map(u => ({
            id: u.id,
            name: u.name,
            type: u.type ?? '',
            area: u.area ?? 0,
            floor: u.floor ?? '',
            projectName: helpers.getName(maps.projectsById, u.projectId),
            ownerName: helpers.getName(maps.contactsById, u.contactId),
            salePrice: u.salePrice ?? 0,
            description: u.description ?? '',
        }))
    };

    // RentalAgreements
    schemas.RentalAgreements = {
        sheetName: 'RentalAgreements',
        version: '1.0',
        headers: ['id', 'agreementNumber', 'tenantName', 'propertyName', 'startDate', 'endDate', 'monthlyRent', 'rentDueDate', 'status', 'description', 'securityDeposit', 'brokerName', 'brokerFee'],
        transform: (state: AppState, maps: ExportMaps, helpers: ExportHelpers) => state.rentalAgreements.map(a => ({
            id: a.id,
            agreementNumber: a.agreementNumber,
            tenantName: helpers.getName(maps.contactsById, a.tenantId),
            propertyName: helpers.getName(maps.propertiesById, a.propertyId),
            startDate: a.startDate,
            endDate: a.endDate,
            monthlyRent: a.monthlyRent,
            rentDueDate: a.rentDueDate,
            status: a.status,
            description: a.description ?? '',
            securityDeposit: a.securityDeposit ?? 0,
            brokerName: helpers.getName(maps.contactsById, a.brokerId),
            brokerFee: a.brokerFee ?? 0,
        }))
    };

    // ProjectAgreements
    schemas.ProjectAgreements = {
        sheetName: 'ProjectAgreements',
        version: '1.0',
        headers: ['id', 'agreementNumber', 'clientName', 'projectName', 'UnitNames', 'issueDate', 'status', 'description', 'cancellationDetails', 'listPrice', 'customerDiscount', 'floorDiscount', 'lumpSumDiscount', 'miscDiscount', 'sellingPrice', 'rebateAmount', 'rebateBrokerName', 'listPriceCategoryName', 'customerDiscountCategoryName', 'floorDiscountCategoryName', 'lumpSumDiscountCategoryName', 'miscDiscountCategoryName', 'sellingPriceCategoryName', 'rebateCategoryName'],
        transform: (state: AppState, maps: ExportMaps, helpers: ExportHelpers) => state.projectAgreements.map(a => ({
            id: a.id,
            agreementNumber: a.agreementNumber,
            clientName: helpers.getName(maps.contactsById, a.clientId),
            projectName: helpers.getName(maps.projectsById, a.projectId),
            UnitNames: (a.unitIds || []).map(uid => helpers.getName(maps.unitsById, uid)).filter(Boolean).join(', '),
            issueDate: a.issueDate,
            status: a.status,
            description: a.description ?? '',
            cancellationDetails: a.cancellationDetails ? helpers.safeJson(a.cancellationDetails) : '',
            listPrice: a.listPrice ?? 0,
            customerDiscount: a.customerDiscount ?? 0,
            floorDiscount: a.floorDiscount ?? 0,
            lumpSumDiscount: a.lumpSumDiscount ?? 0,
            miscDiscount: a.miscDiscount ?? 0,
            sellingPrice: a.sellingPrice ?? 0,
            rebateAmount: a.rebateAmount ?? 0,
            rebateBrokerName: helpers.getName(maps.contactsById, a.rebateBrokerId),
            listPriceCategoryName: helpers.getName(maps.categoriesById, a.listPriceCategoryId),
            customerDiscountCategoryName: helpers.getName(maps.categoriesById, a.customerDiscountCategoryId),
            floorDiscountCategoryName: helpers.getName(maps.categoriesById, a.floorDiscountCategoryId),
            lumpSumDiscountCategoryName: helpers.getName(maps.categoriesById, a.lumpSumDiscountCategoryId),
            miscDiscountCategoryName: helpers.getName(maps.categoriesById, a.miscDiscountCategoryId),
            sellingPriceCategoryName: helpers.getName(maps.categoriesById, a.sellingPriceCategoryId),
            rebateCategoryName: helpers.getName(maps.categoriesById, a.rebateCategoryId),
        }))
    };

    // Contracts - This is the key schema that was recently modified
    schemas.Contracts = {
        sheetName: 'Contracts',
        version: '1.1',
        headers: ['id', 'contractNumber', 'name', 'projectName', 'vendorName', 'totalAmount', 'area', 'rate', 'startDate', 'endDate', 'status', 'categoryNames', 'expenseCategoryNames', 'expenseQuantities', 'expensePricePerUnits', 'expenseNetValues', 'expenseUnits', 'paymentTerms', 'termsAndConditions', 'description'],
        transform: (state: AppState, maps: ExportMaps, helpers: ExportHelpers) => {
            return (state.contracts || []).map(c => {
                const expenseCategoryNames: string[] = [];
                const expenseQuantities: string[] = [];
                const expensePricePerUnits: string[] = [];
                const expenseNetValues: string[] = [];
                const expenseUnits: string[] = [];
                
                if (c.expenseCategoryItems && c.expenseCategoryItems.length > 0) {
                    c.expenseCategoryItems.forEach(item => {
                        expenseCategoryNames.push(helpers.getName(maps.categoriesById, item.categoryId));
                        expenseQuantities.push(String(item.quantity ?? 1));
                        expensePricePerUnits.push(String(item.pricePerUnit ?? 0));
                        expenseNetValues.push(String(item.netValue ?? 0));
                        expenseUnits.push(item.unit || 'quantity');
                    });
                }
                
                return {
                    id: c.id,
                    contractNumber: c.contractNumber,
                    name: c.name,
                    projectName: helpers.getName(maps.projectsById, c.projectId),
                    vendorName: helpers.getName(maps.contactsById, c.vendorId),
                    totalAmount: c.totalAmount,
                    area: c.area ?? '',
                    rate: c.rate ?? '',
                    startDate: c.startDate,
                    endDate: c.endDate,
                    status: c.status,
                    categoryNames: (c.categoryIds || []).map(cid => 
                        helpers.getName(maps.categoriesById, cid)).filter(Boolean).join(', '),
                    expenseCategoryNames: expenseCategoryNames.join(', '),
                    expenseQuantities: expenseQuantities.join(', '),
                    expensePricePerUnits: expensePricePerUnits.join(', '),
                    expenseNetValues: expenseNetValues.join(', '),
                    expenseUnits: expenseUnits.join(', '),
                    paymentTerms: c.paymentTerms ?? '',
                    termsAndConditions: c.termsAndConditions ?? '',
                    description: c.description ?? '',
                };
            });
        }
    };

    // RecurringTemplates
    schemas.RecurringTemplates = {
        sheetName: 'RecurringTemplates',
        version: '1.0',
        headers: ['id', 'contactName', 'propertyName', 'buildingName', 'agreementNumber', 'amount', 'descriptionTemplate', 'dayOfMonth', 'nextDueDate', 'active'],
        transform: (state: AppState, maps: ExportMaps, helpers: ExportHelpers) => 
            state.recurringInvoiceTemplates.map(t => ({
                id: t.id,
                contactName: helpers.getName(maps.contactsById, t.contactId),
                propertyName: helpers.getName(maps.propertiesById, t.propertyId),
                buildingName: helpers.getName(maps.buildingsById, t.buildingId),
                agreementNumber: helpers.getAgreementNumber(t.agreementId),
                amount: t.amount,
                descriptionTemplate: t.descriptionTemplate ?? '',
                dayOfMonth: t.dayOfMonth,
                nextDueDate: t.nextDueDate,
                active: t.active,
            }))
    };

    // Invoices
    schemas.Invoices = {
        sheetName: 'Invoices',
        version: '1.0',
        headers: ['id', 'invoiceNumber', 'contactName', 'amount', 'paidAmount', 'status', 'issueDate', 'dueDate', 'invoiceType', 'description', 'projectName', 'buildingName', 'propertyName', 'unitName', 'categoryName', 'agreementNumber', 'securityDepositCharge', 'serviceCharges', 'rentalMonth'],
        transform: (state: AppState, maps: ExportMaps, helpers: ExportHelpers) => state.invoices.map(i => ({
            id: i.id,
            invoiceNumber: i.invoiceNumber,
            contactName: helpers.getName(maps.contactsById, i.contactId),
            amount: i.amount,
            paidAmount: i.paidAmount ?? 0,
            status: i.status,
            issueDate: i.issueDate,
            dueDate: i.dueDate,
            invoiceType: i.invoiceType,
            description: i.description ?? '',
            projectName: helpers.getName(maps.projectsById, i.projectId),
            buildingName: helpers.getName(maps.buildingsById, i.buildingId),
            propertyName: helpers.getName(maps.propertiesById, i.propertyId),
            unitName: helpers.getName(maps.unitsById, i.unitId),
            categoryName: helpers.getName(maps.categoriesById, i.categoryId),
            agreementNumber: helpers.getAgreementNumber(i.agreementId),
            securityDepositCharge: i.securityDepositCharge ?? '',
            serviceCharges: i.serviceCharges ?? '',
            rentalMonth: i.rentalMonth ?? '',
        }))
    };

    // Helper function to determine bill kind
    const getBillKind = (state: AppState, billId?: string): 'rental' | 'project' | 'unknown' => {
        if (!billId) return 'unknown';
        const b = state.bills.find(x => x.id === billId);
        if (!b) return 'unknown';
        if (b.projectId || b.contractId || b.projectAgreementId) return 'project';
        if (b.buildingId || b.propertyId || b.staffId) return 'rental';
        return 'unknown';
    };

    // ProjectBills
    schemas.ProjectBills = {
        sheetName: 'ProjectBills',
        version: '1.1',
        headers: ['id', 'billNumber', 'contactName', 'amount', 'paidAmount', 'status', 'issueDate', 'dueDate', 'description', 'categoryName', 'projectName', 'contractNumber', 'agreementNumber', 'projectAgreementId', 'expenseCategoryNames', 'expenseQuantities', 'expensePricePerUnits', 'expenseNetValues', 'expenseUnits'],
        transform: (state: AppState, maps: ExportMaps, helpers: ExportHelpers) => {
            return state.bills
                .filter(b => getBillKind(state, b.id) === 'project')
                .map(b => {
                    const expenseCategoryNames: string[] = [];
                    const expenseQuantities: string[] = [];
                    const expensePricePerUnits: string[] = [];
                    const expenseNetValues: string[] = [];
                    const expenseUnits: string[] = [];
                    
                    if (b.expenseCategoryItems && b.expenseCategoryItems.length > 0) {
                        b.expenseCategoryItems.forEach(item => {
                            expenseCategoryNames.push(helpers.getName(maps.categoriesById, item.categoryId));
                            expenseQuantities.push(String(item.quantity ?? 1));
                            expensePricePerUnits.push(String(item.pricePerUnit ?? 0));
                            expenseNetValues.push(String(item.netValue ?? 0));
                            expenseUnits.push(item.unit || 'quantity');
                        });
                    }
                    
                    return {
                        id: b.id,
                        billNumber: b.billNumber,
                        contactName: helpers.getName(maps.contactsById, b.contactId),
                        amount: b.amount,
                        paidAmount: b.paidAmount ?? 0,
                        status: b.status,
                        issueDate: b.issueDate,
                        dueDate: b.dueDate ?? '',
                        description: b.description ?? '',
                        categoryName: helpers.getName(maps.categoriesById, b.categoryId),
                        projectName: helpers.getName(maps.projectsById, b.projectId),
                        contractNumber: helpers.getName(maps.contractNoById, b.contractId),
                        agreementNumber: helpers.getName(maps.projectAgreementNoById, b.projectAgreementId),
                        projectAgreementId: b.projectAgreementId ?? '',
                        expenseCategoryNames: expenseCategoryNames.join(', '),
                        expenseQuantities: expenseQuantities.join(', '),
                        expensePricePerUnits: expensePricePerUnits.join(', '),
                        expenseNetValues: expenseNetValues.join(', '),
                        expenseUnits: expenseUnits.join(', '),
                    };
                });
        }
    };

    // RentalBills
    schemas.RentalBills = {
        sheetName: 'RentalBills',
        version: '1.1',
        headers: ['id', 'billNumber', 'contactName', 'amount', 'paidAmount', 'status', 'issueDate', 'dueDate', 'description', 'categoryName', 'buildingName', 'propertyName', 'staffName', 'staffId', 'expenseBearerType', 'expenseCategoryNames', 'expenseQuantities', 'expensePricePerUnits', 'expenseNetValues', 'expenseUnits'],
        transform: (state: AppState, maps: ExportMaps, helpers: ExportHelpers) => {
            return state.bills
                .filter(b => getBillKind(state, b.id) === 'rental')
                .map(b => {
                    const expenseCategoryNames: string[] = [];
                    const expenseQuantities: string[] = [];
                    const expensePricePerUnits: string[] = [];
                    const expenseNetValues: string[] = [];
                    const expenseUnits: string[] = [];
                    
                    if (b.expenseCategoryItems && b.expenseCategoryItems.length > 0) {
                        b.expenseCategoryItems.forEach(item => {
                            expenseCategoryNames.push(helpers.getName(maps.categoriesById, item.categoryId));
                            expenseQuantities.push(String(item.quantity ?? 1));
                            expensePricePerUnits.push(String(item.pricePerUnit ?? 0));
                            expenseNetValues.push(String(item.netValue ?? 0));
                            expenseUnits.push(item.unit || 'quantity');
                        });
                    }
                    
                    return {
                        id: b.id,
                        billNumber: b.billNumber,
                        contactName: helpers.getName(maps.contactsById, b.contactId),
                        amount: b.amount,
                        paidAmount: b.paidAmount ?? 0,
                        status: b.status,
                        issueDate: b.issueDate,
                        dueDate: b.dueDate ?? '',
                        description: b.description ?? '',
                        categoryName: helpers.getName(maps.categoriesById, b.categoryId),
                        buildingName: helpers.getName(maps.buildingsById, b.buildingId),
                        propertyName: helpers.getName(maps.propertiesById, b.propertyId),
                        staffName: helpers.getName(maps.contactsById, b.staffId),
                        staffId: b.staffId ?? '',
                        expenseBearerType: b.expenseBearerType ?? '',
                        expenseCategoryNames: expenseCategoryNames.join(', '),
                        expenseQuantities: expenseQuantities.join(', '),
                        expensePricePerUnits: expensePricePerUnits.join(', '),
                        expenseNetValues: expenseNetValues.join(', '),
                        expenseUnits: expenseUnits.join(', '),
                    };
                });
        }
    };

    // Bills (legacy/combined)
    schemas.Bills = {
        sheetName: 'Bills',
        version: '1.1',
        headers: ['id', 'billNumber', 'contactName', 'amount', 'paidAmount', 'status', 'issueDate', 'dueDate', 'description', 'categoryName', 'projectName', 'buildingName', 'propertyName', 'projectAgreementId', 'agreementNumber', 'contractId', 'contractNumber', 'staffId', 'expenseBearerType', 'expenseCategoryNames', 'expenseQuantities', 'expensePricePerUnits', 'expenseNetValues', 'expenseUnits'],
        transform: (state: AppState, maps: ExportMaps, helpers: ExportHelpers) => {
            return state.bills
                .filter(b => getBillKind(state, b.id) === 'rental') // Only rental bills to avoid duplication
                .map(b => {
                    const expenseCategoryNames: string[] = [];
                    const expenseQuantities: string[] = [];
                    const expensePricePerUnits: string[] = [];
                    const expenseNetValues: string[] = [];
                    const expenseUnits: string[] = [];
                    
                    if (b.expenseCategoryItems && b.expenseCategoryItems.length > 0) {
                        b.expenseCategoryItems.forEach(item => {
                            expenseCategoryNames.push(helpers.getName(maps.categoriesById, item.categoryId));
                            expenseQuantities.push(String(item.quantity ?? 1));
                            expensePricePerUnits.push(String(item.pricePerUnit ?? 0));
                            expenseNetValues.push(String(item.netValue ?? 0));
                            expenseUnits.push(item.unit || 'quantity');
                        });
                    }
                    
                    return {
                        id: b.id,
                        billNumber: b.billNumber,
                        contactName: helpers.getName(maps.contactsById, b.contactId),
                        amount: b.amount,
                        paidAmount: b.paidAmount ?? 0,
                        status: b.status,
                        issueDate: b.issueDate,
                        dueDate: b.dueDate ?? '',
                        description: b.description ?? '',
                        categoryName: helpers.getName(maps.categoriesById, b.categoryId),
                        projectName: helpers.getName(maps.projectsById, b.projectId),
                        buildingName: helpers.getName(maps.buildingsById, b.buildingId),
                        propertyName: helpers.getName(maps.propertiesById, b.propertyId),
                        contractNumber: helpers.getName(maps.contractNoById, b.contractId),
                        agreementNumber: helpers.getName(maps.projectAgreementNoById, b.projectAgreementId),
                        projectAgreementId: b.projectAgreementId ?? '',
                        contractId: b.contractId ?? '',
                        staffId: b.staffId ?? '',
                        expenseBearerType: b.expenseBearerType ?? '',
                        expenseCategoryNames: expenseCategoryNames.join(', '),
                        expenseQuantities: expenseQuantities.join(', '),
                        expensePricePerUnits: expensePricePerUnits.join(', '),
                        expenseNetValues: expenseNetValues.join(', '),
                        expenseUnits: expenseUnits.join(', '),
                    };
                });
        }
    };

    // Helper to determine invoice kind
    const getInvoiceKind = (state: AppState, invoiceId?: string): 'rental' | 'project' | 'unknown' => {
        if (!invoiceId) return 'unknown';
        const inv = state.invoices.find(x => x.id === invoiceId);
        if (!inv) return 'unknown';
        if (inv.invoiceType === InvoiceType.INSTALLMENT) return 'project';
        if (inv.invoiceType === InvoiceType.RENTAL || inv.invoiceType === InvoiceType.SECURITY_DEPOSIT || inv.invoiceType === InvoiceType.SERVICE_CHARGE) return 'rental';
        const rentalAgreementIds = new Set(state.rentalAgreements.map(a => a.id));
        const projectAgreementIds = new Set(state.projectAgreements.map(a => a.id));
        if (inv.agreementId) {
            if (rentalAgreementIds.has(inv.agreementId)) return 'rental';
            if (projectAgreementIds.has(inv.agreementId)) return 'project';
        }
        if (inv.propertyId || inv.buildingId) return 'rental';
        if (inv.projectId || inv.unitId) return 'project';
        return 'unknown';
    };

    // RentalInvoicePayments
    schemas.RentalInvoicePayments = {
        sheetName: 'RentalInvoicePayments',
        version: '1.0',
        headers: ['id', 'amount', 'date', 'description', 'accountName', 'invoiceNumber'],
        transform: (state: AppState, maps: ExportMaps, helpers: ExportHelpers) => 
            state.transactions
                .filter(tx => tx.type === TransactionType.INCOME && !!tx.invoiceId && getInvoiceKind(state, tx.invoiceId) === 'rental')
                .map(tx => ({
                    id: tx.id,
                    amount: tx.amount,
                    date: tx.date,
                    description: tx.description ?? '',
                    accountName: helpers.getName(maps.accountsById, tx.accountId),
                    invoiceNumber: helpers.getName(maps.invoiceNoById, tx.invoiceId),
                }))
    };

    // ProjectInvoicePayments
    schemas.ProjectInvoicePayments = {
        sheetName: 'ProjectInvoicePayments',
        version: '1.0',
        headers: ['id', 'amount', 'date', 'description', 'accountName', 'invoiceNumber'],
        transform: (state: AppState, maps: ExportMaps, helpers: ExportHelpers) => 
            state.transactions
                .filter(tx => tx.type === TransactionType.INCOME && !!tx.invoiceId && getInvoiceKind(state, tx.invoiceId) === 'project')
                .map(tx => ({
                    id: tx.id,
                    amount: tx.amount,
                    date: tx.date,
                    description: tx.description ?? '',
                    accountName: helpers.getName(maps.accountsById, tx.accountId),
                    invoiceNumber: helpers.getName(maps.invoiceNoById, tx.invoiceId),
                }))
    };

    // RentalBillPayments
    schemas.RentalBillPayments = {
        sheetName: 'RentalBillPayments',
        version: '1.0',
        headers: ['id', 'amount', 'date', 'description', 'accountName', 'billNumber'],
        transform: (state: AppState, maps: ExportMaps, helpers: ExportHelpers) => 
            state.transactions
                .filter(tx => tx.type === TransactionType.EXPENSE && !!tx.billId && getBillKind(state, tx.billId) === 'rental')
                .map(tx => ({
                    id: tx.id,
                    amount: tx.amount,
                    date: tx.date,
                    description: tx.description ?? '',
                    accountName: helpers.getName(maps.accountsById, tx.accountId),
                    billNumber: helpers.getName(maps.billNoById, tx.billId),
                }))
    };

    // ProjectBillPayments
    schemas.ProjectBillPayments = {
        sheetName: 'ProjectBillPayments',
        version: '1.0',
        headers: ['id', 'amount', 'date', 'description', 'accountName', 'billNumber'],
        transform: (state: AppState, maps: ExportMaps, helpers: ExportHelpers) => 
            state.transactions
                .filter(tx => tx.type === TransactionType.EXPENSE && !!tx.billId && getBillKind(state, tx.billId) === 'project')
                .map(tx => ({
                    id: tx.id,
                    amount: tx.amount,
                    date: tx.date,
                    description: tx.description ?? '',
                    accountName: helpers.getName(maps.accountsById, tx.accountId),
                    billNumber: helpers.getName(maps.billNoById, tx.billId),
                }))
    };

    // LoanTransactions
    schemas.LoanTransactions = {
        sheetName: 'LoanTransactions',
        version: '1.0',
        headers: ['id', 'subtype', 'amount', 'date', 'description', 'accountName', 'contactName'],
        transform: (state: AppState, maps: ExportMaps, helpers: ExportHelpers) => 
            state.transactions
                .filter(tx => tx.type === TransactionType.LOAN)
                .map(tx => ({
                    id: tx.id,
                    subtype: tx.subtype ?? LoanSubtype.RECEIVE,
                    amount: tx.amount,
                    date: tx.date,
                    description: tx.description ?? '',
                    accountName: helpers.getName(maps.accountsById, tx.accountId),
                    contactName: helpers.getName(maps.contactsById, tx.contactId),
                }))
    };

    // EquityTransactions
    const equityAccountIds = (state: AppState): Set<string> => 
        new Set(state.accounts.filter(a => a.type === AccountType.EQUITY).map(a => a.id));

    schemas.EquityTransactions = {
        sheetName: 'EquityTransactions',
        version: '1.0',
        headers: ['id', 'amount', 'date', 'description', 'fromAccountName', 'toAccountName', 'projectName', 'projectId'],
        transform: (state: AppState, maps: ExportMaps, helpers: ExportHelpers) => {
            const equityIds = equityAccountIds(state);
            return state.transactions
                .filter(tx => tx.type === TransactionType.TRANSFER && 
                         (equityIds.has(tx.fromAccountId || '') || equityIds.has(tx.toAccountId || '')))
                .map(tx => ({
                    id: tx.id,
                    amount: tx.amount,
                    date: tx.date,
                    description: tx.description ?? '',
                    fromAccountName: helpers.getName(maps.accountsById, tx.fromAccountId),
                    toAccountName: helpers.getName(maps.accountsById, tx.toAccountId),
                    projectName: helpers.getName(maps.projectsById, tx.projectId),
                    projectId: tx.projectId ?? '',
                }));
        }
    };

    // TransferTransactions
    schemas.TransferTransactions = {
        sheetName: 'TransferTransactions',
        version: '1.0',
        headers: ['id', 'amount', 'date', 'description', 'fromAccountName', 'toAccountName'],
        transform: (state: AppState, maps: ExportMaps, helpers: ExportHelpers) => {
            const equityIds = equityAccountIds(state);
            return state.transactions
                .filter(tx => tx.type === TransactionType.TRANSFER && 
                         !equityIds.has(tx.fromAccountId || '') && 
                         !equityIds.has(tx.toAccountId || ''))
                .map(tx => ({
                    id: tx.id,
                    amount: tx.amount,
                    date: tx.date,
                    description: tx.description ?? '',
                    fromAccountName: helpers.getName(maps.accountsById, tx.fromAccountId),
                    toAccountName: helpers.getName(maps.accountsById, tx.toAccountId),
                }));
        }
    };

    // IncomeTransactions
    schemas.IncomeTransactions = {
        sheetName: 'IncomeTransactions',
        version: '1.0',
        headers: ['id', 'amount', 'date', 'description', 'accountName', 'contactName', 'categoryName', 'projectName'],
        transform: (state: AppState, maps: ExportMaps, helpers: ExportHelpers) => 
            state.transactions
                .filter(tx => tx.type === TransactionType.INCOME && !tx.invoiceId)
                .map(tx => ({
                    id: tx.id,
                    amount: tx.amount,
                    date: tx.date,
                    description: tx.description ?? '',
                    accountName: helpers.getName(maps.accountsById, tx.accountId),
                    contactName: helpers.getName(maps.contactsById, tx.contactId),
                    categoryName: helpers.getName(maps.categoriesById, tx.categoryId),
                    projectName: helpers.getName(maps.projectsById, tx.projectId),
                }))
    };

    // ExpenseTransactions
    schemas.ExpenseTransactions = {
        sheetName: 'ExpenseTransactions',
        version: '1.0',
        headers: ['id', 'amount', 'date', 'description', 'accountName', 'contactName', 'categoryName'],
        transform: (state: AppState, maps: ExportMaps, helpers: ExportHelpers) => 
            state.transactions
                .filter(tx => tx.type === TransactionType.EXPENSE && !tx.billId)
                .map(tx => ({
                    id: tx.id,
                    amount: tx.amount,
                    date: tx.date,
                    description: tx.description ?? '',
                    accountName: helpers.getName(maps.accountsById, tx.accountId),
                    contactName: helpers.getName(maps.contactsById, tx.contactId),
                    categoryName: helpers.getName(maps.categoriesById, tx.categoryId),
                }))
    };

    // Budgets
    schemas.Budgets = {
        sheetName: 'Budgets',
        version: '1.0',
        headers: ['id', 'categoryId', 'categoryName', 'projectId', 'projectName', 'amount'],
        transform: (state: AppState, maps: ExportMaps, helpers: ExportHelpers) => state.budgets.map(b => ({
            id: b.id,
            categoryId: b.categoryId,
            categoryName: helpers.getName(maps.categoriesById, b.categoryId),
            projectId: b.projectId || '',
            projectName: b.projectId ? helpers.getName(maps.projectsById, b.projectId) : '',
            amount: b.amount,
        }))
    };

    // Transactions (main sheet - excludes split transactions)
    schemas.Transactions = {
        sheetName: 'Transactions',
        version: '1.0',
        headers: ['id', 'type', 'subtype', 'amount', 'date', 'description', 'accountName', 'fromAccountName', 'toAccountName', 'contactName', 'projectName', 'buildingName', 'propertyName', 'unitName', 'categoryName', 'invoiceNumber', 'billNumber', 'contractNumber', 'agreementNumber', 'batchId'],
        transform: (state: AppState, maps: ExportMaps, helpers: ExportHelpers) => 
            state.transactions
                .filter(tx => !tx.billId && !tx.invoiceId && tx.type !== TransactionType.LOAN && tx.type !== TransactionType.TRANSFER)
                .map(tx => ({
                    id: tx.id,
                    type: tx.type,
                    subtype: tx.subtype ?? '',
                    amount: tx.amount,
                    date: tx.date,
                    description: tx.description ?? '',
                    accountName: helpers.getName(maps.accountsById, tx.accountId),
                    fromAccountName: helpers.getName(maps.accountsById, tx.fromAccountId),
                    toAccountName: helpers.getName(maps.accountsById, tx.toAccountId),
                    contactName: helpers.getName(maps.contactsById, tx.contactId),
                    projectName: helpers.getName(maps.projectsById, tx.projectId),
                    buildingName: helpers.getName(maps.buildingsById, tx.buildingId),
                    propertyName: helpers.getName(maps.propertiesById, tx.propertyId),
                    unitName: helpers.getName(maps.unitsById, tx.unitId),
                    categoryName: helpers.getName(maps.categoriesById, tx.categoryId),
                    invoiceNumber: helpers.getName(maps.invoiceNoById, tx.invoiceId),
                    billNumber: helpers.getName(maps.billNoById, tx.billId),
                    contractNumber: helpers.getName(maps.contractNoById, tx.contractId),
                    agreementNumber: helpers.getAgreementNumber(tx.agreementId),
                    batchId: tx.batchId ?? '',
                }))
    };

    return schemas;
};

export const EXPORT_SCHEMAS: Record<string, ExportSchema> = createExportSchemas();

// Helper to get all export schemas in dependency order
export const getExportSchemasInOrder = (): ExportSchema[] => {
    const order = [
        'Settings', 'Accounts', 'Contacts', 'Categories', 
        'Projects', 'Buildings', 'Properties', 'Units',
        'RentalAgreements', 'ProjectAgreements', 'Contracts', 'RecurringTemplates',
        'Invoices', 'ProjectBills', 'RentalBills', 'Bills',
        'RentalInvoicePayments', 'ProjectInvoicePayments', 'RentalBillPayments', 'ProjectBillPayments',
        'LoanTransactions', 'EquityTransactions', 'TransferTransactions', 'IncomeTransactions', 'ExpenseTransactions',
        'Budgets', 'Transactions'
    ];
    
    return order
        .map(name => EXPORT_SCHEMAS[name])
        .filter((schema): schema is ExportSchema => schema !== undefined);
};

