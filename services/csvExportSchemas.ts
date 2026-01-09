
import { AppState } from '../types';

export interface ExportSchema {
    key: string;
    displayName: string;
    category: 'financial' | 'master' | 'projects' | 'agreements' | 'payroll' | 'pm' | 'other';
    headers: string[];
    getData: (state: AppState, maps: ExportMaps) => any[];
}

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

const getName = (map: Map<string, string>, id?: string | null) => (id ? (map.get(id) || '') : '');
const getAgreementNumber = (agreementId: string | undefined | null, maps: ExportMaps) =>
    (agreementId ? (maps.rentalAgreementNoById.get(agreementId) || maps.projectAgreementNoById.get(agreementId) || '') : '');

// Helper to sort by parent (for hierarchical data)
const depthSortByParent = <T extends { id: string; parentAccountId?: string; parentCategoryId?: string }>(
    items: T[],
    parentKey: 'parentAccountId' | 'parentCategoryId'
): T[] => {
    const byId = new Map(items.map(i => [i.id, i]));
    const depthCache = new Map<string, number>();
    const depth = (id: string, visited = new Set<string>()): number => {
        if (depthCache.has(id)) return depthCache.get(id)!;
        if (visited.has(id)) return 0; // cycle safety
        visited.add(id);
        const item = byId.get(id);
        const parentId = item?.[parentKey] as string | undefined;
        const d = parentId && byId.has(parentId) ? 1 + depth(parentId, visited) : 0;
        depthCache.set(id, d);
        return d;
    };
    return [...items].sort((a, b) => depth(a.id) - depth(b.id));
};

export const EXPORT_SCHEMAS: Record<string, ExportSchema> = {
    // Financial Documents
    bills: {
        key: 'bills',
        displayName: 'Bills',
        category: 'financial',
        headers: ['billNumber', 'contactName', 'amount', 'paidAmount', 'status', 'issueDate', 'dueDate', 'description', 'categoryName', 'projectName', 'buildingName', 'propertyName', 'contractNumber', 'agreementNumber'],
        getData: (state, maps) => state.bills.map(b => ({
            billNumber: b.billNumber,
            contactName: getName(maps.contactsById, b.contactId),
            amount: b.amount,
            paidAmount: b.paidAmount ?? 0,
            status: b.status,
            issueDate: b.issueDate,
            dueDate: b.dueDate ?? '',
            description: b.description ?? '',
            categoryName: getName(maps.categoriesById, b.categoryId),
            projectName: getName(maps.projectsById, b.projectId),
            buildingName: getName(maps.buildingsById, b.buildingId),
            propertyName: getName(maps.propertiesById, b.propertyId),
            contractNumber: getName(maps.contractNoById, b.contractId),
            agreementNumber: getAgreementNumber(b.projectAgreementId, maps),
        })),
    },
    invoices: {
        key: 'invoices',
        displayName: 'Invoices',
        category: 'financial',
        headers: ['invoiceNumber', 'contactName', 'amount', 'paidAmount', 'status', 'issueDate', 'dueDate', 'invoiceType', 'description', 'projectName', 'buildingName', 'propertyName', 'unitName', 'categoryName', 'agreementNumber', 'securityDepositCharge', 'serviceCharges', 'rentalMonth'],
        getData: (state, maps) => state.invoices.map(i => ({
            invoiceNumber: i.invoiceNumber,
            contactName: getName(maps.contactsById, i.contactId),
            amount: i.amount,
            paidAmount: i.paidAmount ?? 0,
            status: i.status,
            issueDate: i.issueDate,
            dueDate: i.dueDate,
            invoiceType: i.invoiceType,
            description: i.description ?? '',
            projectName: getName(maps.projectsById, i.projectId),
            buildingName: getName(maps.buildingsById, i.buildingId),
            propertyName: getName(maps.propertiesById, i.propertyId),
            unitName: getName(maps.unitsById, i.unitId),
            categoryName: getName(maps.categoriesById, i.categoryId),
            agreementNumber: getAgreementNumber(i.agreementId, maps),
            securityDepositCharge: i.securityDepositCharge ?? '',
            serviceCharges: i.serviceCharges ?? '',
            rentalMonth: i.rentalMonth ?? '',
        })),
    },
    contracts: {
        key: 'contracts',
        displayName: 'Contracts',
        category: 'agreements',
        headers: ['contractNumber', 'name', 'projectName', 'vendorName', 'totalAmount', 'area', 'rate', 'startDate', 'endDate', 'status', 'categoryNames', 'expenseCategoryNames', 'expenseQuantities', 'expensePricePerUnits', 'expenseNetValues', 'expenseUnits', 'paymentTerms', 'termsAndConditions', 'description'],
        getData: (state, maps) => (state.contracts || []).map(c => {
            const expenseCategoryNames: string[] = [];
            const expenseQuantities: string[] = [];
            const expensePricePerUnits: string[] = [];
            const expenseNetValues: string[] = [];
            const expenseUnits: string[] = [];
            
            if (c.expenseCategoryItems && c.expenseCategoryItems.length > 0) {
                c.expenseCategoryItems.forEach(item => {
                    expenseCategoryNames.push(getName(maps.categoriesById, item.categoryId));
                    expenseQuantities.push(String(item.quantity ?? 1));
                    expensePricePerUnits.push(String(item.pricePerUnit ?? 0));
                    expenseNetValues.push(String(item.netValue ?? 0));
                    expenseUnits.push(item.unit || 'quantity');
                });
            }
            
            return {
                contractNumber: c.contractNumber,
                name: c.name,
                projectName: getName(maps.projectsById, c.projectId),
                vendorName: getName(maps.contactsById, c.vendorId),
                totalAmount: c.totalAmount,
                area: c.area ?? '',
                rate: c.rate ?? '',
                startDate: c.startDate,
                endDate: c.endDate,
                status: c.status,
                categoryNames: (c.categoryIds || []).map(cid => getName(maps.categoriesById, cid)).filter(Boolean).join(', '),
                expenseCategoryNames: expenseCategoryNames.join(', '),
                expenseQuantities: expenseQuantities.join(', '),
                expensePricePerUnits: expensePricePerUnits.join(', '),
                expenseNetValues: expenseNetValues.join(', '),
                expenseUnits: expenseUnits.join(', '),
                paymentTerms: c.paymentTerms ?? '',
                termsAndConditions: c.termsAndConditions ?? '',
                description: c.description ?? '',
            };
        }),
    },
    rentalAgreements: {
        key: 'rentalAgreements',
        displayName: 'Rental Agreements',
        category: 'agreements',
        headers: ['agreementNumber', 'tenantName', 'propertyName', 'startDate', 'endDate', 'monthlyRent', 'rentDueDate', 'status', 'description', 'securityDeposit', 'brokerName', 'brokerFee'],
        getData: (state, maps) => state.rentalAgreements.map(a => ({
            agreementNumber: a.agreementNumber,
            tenantName: getName(maps.contactsById, a.tenantId),
            propertyName: getName(maps.propertiesById, a.propertyId),
            startDate: a.startDate,
            endDate: a.endDate,
            monthlyRent: a.monthlyRent,
            rentDueDate: a.rentDueDate,
            status: a.status,
            description: a.description ?? '',
            securityDeposit: a.securityDeposit ?? 0,
            brokerName: getName(maps.contactsById, a.brokerId),
            brokerFee: a.brokerFee ?? 0,
        })),
    },
    projectAgreements: {
        key: 'projectAgreements',
        displayName: 'Project Agreements',
        category: 'agreements',
        headers: ['agreementNumber', 'clientName', 'projectName', 'UnitNames', 'issueDate', 'status', 'description', 'listPrice', 'customerDiscount', 'floorDiscount', 'lumpSumDiscount', 'miscDiscount', 'sellingPrice', 'rebateAmount', 'rebateBrokerName', 'listPriceCategoryName', 'customerDiscountCategoryName', 'floorDiscountCategoryName', 'lumpSumDiscountCategoryName', 'miscDiscountCategoryName', 'sellingPriceCategoryName', 'rebateCategoryName', 'cancellationDetails'],
        getData: (state, maps) => state.projectAgreements.map(a => ({
            agreementNumber: a.agreementNumber,
            clientName: getName(maps.contactsById, a.clientId),
            projectName: getName(maps.projectsById, a.projectId),
            UnitNames: (a.unitIds || []).map(uid => getName(maps.unitsById, uid)).filter(Boolean).join(', '),
            issueDate: a.issueDate,
            status: a.status,
            description: a.description ?? '',
            listPrice: a.listPrice ?? 0,
            customerDiscount: a.customerDiscount ?? 0,
            floorDiscount: a.floorDiscount ?? 0,
            lumpSumDiscount: a.lumpSumDiscount ?? 0,
            miscDiscount: a.miscDiscount ?? 0,
            sellingPrice: a.sellingPrice ?? 0,
            rebateAmount: a.rebateAmount ?? 0,
            rebateBrokerName: getName(maps.contactsById, a.rebateBrokerId),
            listPriceCategoryName: getName(maps.categoriesById, a.listPriceCategoryId),
            customerDiscountCategoryName: getName(maps.categoriesById, a.customerDiscountCategoryId),
            floorDiscountCategoryName: getName(maps.categoriesById, a.floorDiscountCategoryId),
            lumpSumDiscountCategoryName: getName(maps.categoriesById, a.lumpSumDiscountCategoryId),
            miscDiscountCategoryName: getName(maps.categoriesById, a.miscDiscountCategoryId),
            sellingPriceCategoryName: getName(maps.categoriesById, a.sellingPriceCategoryId),
            rebateCategoryName: getName(maps.categoriesById, a.rebateCategoryId),
            cancellationDetails: a.cancellationDetails ? JSON.stringify(a.cancellationDetails) : '',
        })),
    },
    transactions: {
        key: 'transactions',
        displayName: 'Transactions',
        category: 'financial',
        headers: ['type', 'subtype', 'amount', 'date', 'description', 'accountName', 'fromAccountName', 'toAccountName', 'contactName', 'categoryName', 'projectName', 'buildingName', 'propertyName', 'unitName', 'invoiceNumber', 'billNumber', 'contractNumber', 'agreementNumber'],
        getData: (state, maps) => state.transactions.map(tx => ({
            type: tx.type,
            subtype: tx.subtype ?? '',
            amount: tx.amount,
            date: tx.date,
            description: tx.description ?? '',
            accountName: getName(maps.accountsById, tx.accountId),
            fromAccountName: getName(maps.accountsById, tx.fromAccountId),
            toAccountName: getName(maps.accountsById, tx.toAccountId),
            contactName: getName(maps.contactsById, tx.contactId),
            categoryName: getName(maps.categoriesById, tx.categoryId),
            projectName: getName(maps.projectsById, tx.projectId),
            buildingName: getName(maps.buildingsById, tx.buildingId),
            propertyName: getName(maps.propertiesById, tx.propertyId),
            unitName: getName(maps.unitsById, tx.unitId),
            invoiceNumber: getName(maps.invoiceNoById, tx.invoiceId),
            billNumber: getName(maps.billNoById, tx.billId),
            contractNumber: getName(maps.contractNoById, tx.contractId),
            agreementNumber: getAgreementNumber(tx.agreementId, maps),
        })),
    },
    loanTransactions: {
        key: 'loanTransactions',
        displayName: 'Loan Transactions',
        category: 'financial',
        headers: ['subtype', 'amount', 'date', 'description', 'accountName', 'contactName'],
        getData: (state, maps) => state.transactions
            .filter(tx => tx.type === 'Loan')
            .map(tx => ({
                subtype: tx.subtype ?? '',
                amount: tx.amount,
                date: tx.date,
                description: tx.description ?? '',
                accountName: getName(maps.accountsById, tx.accountId),
                contactName: getName(maps.contactsById, tx.contactId),
            })),
    },
    transferTransactions: {
        key: 'transferTransactions',
        displayName: 'Transfer Transactions',
        category: 'financial',
        headers: ['amount', 'date', 'description', 'fromAccountName', 'toAccountName'],
        getData: (state, maps) => state.transactions
            .filter(tx => tx.type === 'Transfer')
            .map(tx => ({
                amount: tx.amount,
                date: tx.date,
                description: tx.description ?? '',
                fromAccountName: getName(maps.accountsById, tx.fromAccountId),
                toAccountName: getName(maps.accountsById, tx.toAccountId),
            })),
    },
    investmentData: {
        key: 'investmentData',
        displayName: 'Investment Data',
        category: 'financial',
        headers: ['amount', 'date', 'description', 'fromAccountName', 'toAccountName', 'projectName'],
        getData: (state, maps) => state.transactions
            .filter(tx => tx.type === 'Transfer' && tx.projectId) // Equity transactions are transfers with projectId
            .map(tx => ({
                amount: tx.amount,
                date: tx.date,
                description: tx.description ?? '',
                fromAccountName: getName(maps.accountsById, tx.fromAccountId),
                toAccountName: getName(maps.accountsById, tx.toAccountId),
                projectName: getName(maps.projectsById, tx.projectId),
            })),
    },
    // Master Data
    contacts: {
        key: 'contacts',
        displayName: 'All Contacts',
        category: 'master',
        headers: ['name', 'type', 'description', 'contactNo', 'companyName', 'address'],
        getData: (state) => state.contacts.map(c => ({
            name: c.name,
            type: c.type,
            description: c.description ?? '',
            contactNo: c.contactNo ?? '',
            companyName: c.companyName ?? '',
            address: c.address ?? '',
        })),
    },
    vendors: {
        key: 'vendors',
        displayName: 'Vendors',
        category: 'master',
        headers: ['name', 'type', 'description', 'contactNo', 'companyName', 'address'],
        getData: (state) => state.contacts
            .filter(c => c.type === 'Vendor')
            .map(c => ({
                name: c.name,
                type: c.type,
                description: c.description ?? '',
                contactNo: c.contactNo ?? '',
                companyName: c.companyName ?? '',
                address: c.address ?? '',
            })),
    },
    tenants: {
        key: 'tenants',
        displayName: 'Tenants',
        category: 'master',
        headers: ['name', 'type', 'description', 'contactNo', 'companyName', 'address'],
        getData: (state) => state.contacts
            .filter(c => c.type === 'Tenant')
            .map(c => ({
                name: c.name,
                type: c.type,
                description: c.description ?? '',
                contactNo: c.contactNo ?? '',
                companyName: c.companyName ?? '',
                address: c.address ?? '',
            })),
    },
    owners: {
        key: 'owners',
        displayName: 'Owners',
        category: 'master',
        headers: ['name', 'type', 'description', 'contactNo', 'companyName', 'address'],
        getData: (state) => state.contacts
            .filter(c => c.type === 'Owner')
            .map(c => ({
                name: c.name,
                type: c.type,
                description: c.description ?? '',
                contactNo: c.contactNo ?? '',
                companyName: c.companyName ?? '',
                address: c.address ?? '',
            })),
    },
    staff: {
        key: 'staff',
        displayName: 'Staff',
        category: 'master',
        headers: ['name', 'type', 'description', 'contactNo', 'companyName', 'address'],
        getData: (state) => state.contacts
            .filter(c => c.type === 'Staff')
            .map(c => ({
                name: c.name,
                type: c.type,
                description: c.description ?? '',
                contactNo: c.contactNo ?? '',
                companyName: c.companyName ?? '',
                address: c.address ?? '',
            })),
    },
    brokers: {
        key: 'brokers',
        displayName: 'Brokers',
        category: 'master',
        headers: ['name', 'type', 'description', 'contactNo', 'companyName', 'address'],
        getData: (state) => state.contacts
            .filter(c => c.type === 'Broker')
            .map(c => ({
                name: c.name,
                type: c.type,
                description: c.description ?? '',
                contactNo: c.contactNo ?? '',
                companyName: c.companyName ?? '',
                address: c.address ?? '',
            })),
    },
    dealers: {
        key: 'dealers',
        displayName: 'Dealers',
        category: 'master',
        headers: ['name', 'type', 'description', 'contactNo', 'companyName', 'address'],
        getData: (state) => state.contacts
            .filter(c => c.type === 'Dealer')
            .map(c => ({
                name: c.name,
                type: c.type,
                description: c.description ?? '',
                contactNo: c.contactNo ?? '',
                companyName: c.companyName ?? '',
                address: c.address ?? '',
            })),
    },
    clients: {
        key: 'clients',
        displayName: 'Clients',
        category: 'master',
        headers: ['name', 'type', 'description', 'contactNo', 'companyName', 'address'],
        getData: (state) => state.contacts
            .filter(c => c.type === 'Client')
            .map(c => ({
                name: c.name,
                type: c.type,
                description: c.description ?? '',
                contactNo: c.contactNo ?? '',
                companyName: c.companyName ?? '',
                address: c.address ?? '',
            })),
    },
    friendsFamily: {
        key: 'friendsFamily',
        displayName: 'Friends & Family',
        category: 'master',
        headers: ['name', 'type', 'description', 'contactNo', 'companyName', 'address'],
        getData: (state) => state.contacts
            .filter(c => c.type === 'Friend & Family')
            .map(c => ({
                name: c.name,
                type: c.type,
                description: c.description ?? '',
                contactNo: c.contactNo ?? '',
                companyName: c.companyName ?? '',
                address: c.address ?? '',
            })),
    },
    accounts: {
        key: 'accounts',
        displayName: 'Accounts',
        category: 'master',
        headers: ['name', 'type', 'balance', 'description', 'parentAccountName'],
        getData: (state, maps) => depthSortByParent(state.accounts, 'parentAccountId').map(a => ({
            name: a.name,
            type: a.type,
            balance: a.balance,
            description: a.description ?? '',
            parentAccountName: getName(maps.accountsById, a.parentAccountId),
        })),
    },
    categories: {
        key: 'categories',
        displayName: 'Categories',
        category: 'master',
        headers: ['name', 'type', 'description', 'isPermanent', 'isRental', 'parentCategoryName'],
        getData: (state, maps) => depthSortByParent(state.categories as any, 'parentCategoryId').map((c: any) => ({
            name: c.name,
            type: c.type,
            description: c.description ?? '',
            isPermanent: c.isPermanent ?? false,
            isRental: c.isRental ?? false,
            parentCategoryName: getName(maps.categoriesById, c.parentCategoryId),
        })),
    },
    // Projects & Properties
    projects: {
        key: 'projects',
        displayName: 'Projects',
        category: 'projects',
        headers: ['name', 'description', 'color', 'status', 'pmConfig', 'installmentConfig'],
        getData: (state) => state.projects.map(p => ({
            name: p.name,
            description: p.description ?? '',
            color: p.color ?? '',
            status: p.status ?? '',
            pmConfig: p.pmConfig ? JSON.stringify(p.pmConfig) : '',
            installmentConfig: p.installmentConfig ? JSON.stringify(p.installmentConfig) : '',
        })),
    },
    buildings: {
        key: 'buildings',
        displayName: 'Buildings',
        category: 'projects',
        headers: ['name', 'description', 'color'],
        getData: (state) => state.buildings.map(b => ({
            name: b.name,
            description: b.description ?? '',
            color: b.color ?? '',
        })),
    },
    units: {
        key: 'units',
        displayName: 'Units',
        category: 'projects',
        headers: ['name', 'projectName', 'ownerName', 'salePrice', 'description'],
        getData: (state, maps) => state.units.map(u => ({
            name: u.name,
            projectName: getName(maps.projectsById, u.projectId),
            ownerName: getName(maps.contactsById, u.contactId),
            salePrice: u.salePrice ?? 0,
            description: u.description ?? '',
        })),
    },
    properties: {
        key: 'properties',
        displayName: 'Properties',
        category: 'projects',
        headers: ['name', 'ownerName', 'buildingName', 'description', 'monthlyServiceCharge'],
        getData: (state, maps) => state.properties.map(p => ({
            name: p.name,
            ownerName: getName(maps.contactsById, p.ownerId),
            buildingName: getName(maps.buildingsById, p.buildingId),
            description: p.description ?? '',
            monthlyServiceCharge: p.monthlyServiceCharge ?? 0,
        })),
    },
    // PM Management
    pmManagement: {
        key: 'pmManagement',
        displayName: 'PM Management Data',
        category: 'pm',
        headers: ['projectName', 'cycleName', 'allocationDate', 'amount', 'status'],
        getData: (state, maps) => {
            // PM Cycle Allocations - this would need to be added to AppState if not already present
            // For now, return empty array as placeholder
            return [];
        },
    },
};

// Get schemas grouped by category
export const getSchemasByCategory = (): Record<string, ExportSchema[]> => {
    const categories: Record<string, ExportSchema[]> = {
        financial: [],
        master: [],
        projects: [],
        agreements: [],
        payroll: [],
        pm: [],
        other: [],
    };
    
    Object.values(EXPORT_SCHEMAS).forEach(schema => {
        categories[schema.category].push(schema);
    });
    
    return categories;
};

// Get all schema keys
export const getAllSchemaKeys = (): string[] => {
    return Object.keys(EXPORT_SCHEMAS);
};

