
import { ContractExpenseCategoryItem } from '../types';

export interface ImportMaps {
    accounts: Map<string, string>;
    contacts: Map<string, string>;
    categories: Map<string, string>;
    projects: Map<string, string>;
    buildings: Map<string, string>;
    properties: Map<string, string>;
    units: Map<string, string>;
    rentalAgreements: Map<string, string>;
    projectAgreements: Map<string, string>;
    invoices: Map<string, string>;
    bills: Map<string, string>;
    contracts: Map<string, string>;
    salaryComponents: Map<string, string>;
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

export interface ImportSchema {
    sheetName: string;
    version: string;
    requiredFields: string[];
    optionalFields: string[];
    allowedFields: Set<string>;
    validate?: (row: any, maps: ImportMaps, normalizeName: (name: string) => string) => ValidationResult;
}

// Helper function for name normalization (shared with importService)
const normalizeNameForComparison = (name: string): string => {
    if (!name) return '';
    return String(name).trim().replace(/\s+/g, ' ').toLowerCase();
};

// Helper to safely parse JSON (shared utility)
const safeJsonParse = (str: any) => {
    if (typeof str === 'object') return str;
    try {
        return str ? JSON.parse(str) : undefined;
    } catch (e) {
        return undefined;
    }
};

// Export this function so it can be used by importService
export const parseExpenseCategoryItems = (
    row: any,
    maps: ImportMaps,
    normalizeNameForComparison: (name: string) => string
): ContractExpenseCategoryItem[] | undefined => {
    const expenseCategoryNamesRaw = row.expenseCategoryNames || row.ExpenseCategoryNames || '';
    const expenseQuantitiesRaw = row.expenseQuantities || row.ExpenseQuantities || '';
    const expensePricePerUnitsRaw = row.expensePricePerUnits || row.ExpensePricePerUnits || '';
    const expenseNetValuesRaw = row.expenseNetValues || row.ExpenseNetValues || '';
    const expenseUnitsRaw = row.expenseUnits || row.ExpenseUnits || '';

    const expenseCategoryItemsRaw = row.expenseCategoryItems || row.ExpenseCategoryItems;

    if (expenseCategoryNamesRaw && expenseCategoryNamesRaw.trim()) {
        const categoryNames = String(expenseCategoryNamesRaw).split(',').map(s => s.trim()).filter(Boolean);
        const quantities = String(expenseQuantitiesRaw || '').split(',').map(s => s.trim());
        const pricePerUnits = String(expensePricePerUnitsRaw || '').split(',').map(s => s.trim());
        const netValues = String(expenseNetValuesRaw || '').split(',').map(s => s.trim());
        const units = String(expenseUnitsRaw || '').split(',').map(s => s.trim());

        return categoryNames.map((categoryName, idx) => {
            const categoryId = maps.categories.get(normalizeNameForComparison(categoryName));
            if (!categoryId) return null;

            return {
                id: `item-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`,
                categoryId,
                unit: (units[idx] && ['Cubic Feet', 'Square feet', 'feet', 'quantity'].includes(units[idx]))
                    ? units[idx] as 'Cubic Feet' | 'Square feet' | 'feet' | 'quantity'
                    : 'quantity',
                quantity: parseFloat(quantities[idx]) || 1,
                pricePerUnit: parseFloat(pricePerUnits[idx]) || 0,
                netValue: parseFloat(netValues[idx]) || 0
            } as ContractExpenseCategoryItem;
        }).filter((item): item is ContractExpenseCategoryItem => item !== null);
    } else if (expenseCategoryItemsRaw) {
        const parsed = safeJsonParse(expenseCategoryItemsRaw);
        if (Array.isArray(parsed)) {
            return parsed.map((item: any, idx: number) => {
                const categoryId = item.categoryId || (item.categoryName ? maps.categories.get(normalizeNameForComparison(item.categoryName)) : '');
                if (!categoryId) return null;

                return {
                    id: item.id || `item-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`,
                    categoryId,
                    unit: (item.unit && ['Cubic Feet', 'Square feet', 'feet', 'quantity'].includes(item.unit)) ? item.unit : 'quantity',
                    quantity: typeof item.quantity === 'number' ? item.quantity : (item.quantity !== undefined && item.quantity !== null ? parseFloat(String(item.quantity)) || 1 : 1),
                    pricePerUnit: typeof item.pricePerUnit === 'number' ? item.pricePerUnit : (item.pricePerUnit !== undefined && item.pricePerUnit !== null ? parseFloat(String(item.pricePerUnit)) || 0 : 0),
                    netValue: typeof item.netValue === 'number' ? item.netValue : (item.netValue !== undefined && item.netValue !== null ? parseFloat(String(item.netValue)) || 0 : 0)
                } as ContractExpenseCategoryItem;
            }).filter((item): item is ContractExpenseCategoryItem => item !== null);
        }
    }
    return undefined;
};

// Create import schemas
const createImportSchemas = (): Record<string, ImportSchema> => {
    const schemas: Record<string, ImportSchema> = {};

    // Settings
    schemas.Settings = {
        sheetName: 'Settings',
        version: '1.0',
        requiredFields: ['Key'],
        optionalFields: ['Value'],
        allowedFields: new Set(['Key', 'Value'])
    };

    // SalaryComponents
    schemas.SalaryComponents = {
        sheetName: 'SalaryComponents',
        version: '1.0',
        requiredFields: ['name', 'type'],
        optionalFields: ['id', 'isTaxable', 'isSystem'],
        allowedFields: new Set(['id', 'name', 'type', 'isTaxable', 'isSystem'])
    };

    // Accounts
    schemas.Accounts = {
        sheetName: 'Accounts',
        version: '1.0',
        requiredFields: ['name', 'type'],
        optionalFields: ['id', 'balance', 'isPermanent', 'description', 'parentAccount', 'parentAccountName', 'parentAccountId'],
        allowedFields: new Set(['id', 'name', 'type', 'balance', 'isPermanent', 'description', 'parentAccount', 'parentAccountName', 'parentAccountId'])
    };

    // Contacts
    schemas.Contacts = {
        sheetName: 'Contacts',
        version: '1.0',
        requiredFields: ['name'],
        optionalFields: ['id', 'type', 'description', 'contactNo', 'companyName', 'address'],
        allowedFields: new Set(['id', 'name', 'type', 'description', 'contactNo', 'companyName', 'address'])
    };

    // Categories
    schemas.Categories = {
        sheetName: 'Categories',
        version: '1.0',
        requiredFields: ['name', 'type'],
        optionalFields: ['id', 'description', 'parentCategory', 'parentCategoryName', 'isPermanent', 'isRental'],
        allowedFields: new Set(['id', 'name', 'type', 'description', 'parentCategory', 'parentCategoryName', 'isPermanent', 'isRental'])
    };

    // Projects
    schemas.Projects = {
        sheetName: 'Projects',
        version: '1.0',
        requiredFields: ['name'],
        optionalFields: ['id', 'description', 'color', 'status', 'pmConfig', 'installmentConfig'],
        allowedFields: new Set(['id', 'name', 'description', 'color', 'status', 'pmConfig', 'installmentConfig'])
    };

    // Buildings
    schemas.Buildings = {
        sheetName: 'Buildings',
        version: '1.0',
        requiredFields: ['name'],
        optionalFields: ['id', 'description', 'color'],
        allowedFields: new Set(['id', 'name', 'description', 'color'])
    };

    // Properties
    schemas.Properties = {
        sheetName: 'Properties',
        version: '1.0',
        requiredFields: ['name'],
        optionalFields: ['id', 'ownerName', 'owner', 'buildingName', 'building', 'description', 'monthlyServiceCharge'],
        allowedFields: new Set(['id', 'name', 'ownerName', 'owner', 'buildingName', 'building', 'description', 'monthlyServiceCharge'])
    };

    // Units
    schemas.Units = {
        sheetName: 'Units',
        version: '1.0',
        requiredFields: ['name'],
        optionalFields: ['id', 'projectName', 'project', 'ownerName', 'clientName', 'owner', 'salePrice', 'description', 'tenantName', 'tenant'],
        allowedFields: new Set(['id', 'name', 'projectName', 'project', 'ownerName', 'clientName', 'owner', 'salePrice', 'description', 'tenantName', 'tenant'])
    };

    // Staff
    schemas.Staff = {
        sheetName: 'Staff',
        version: '1.0',
        requiredFields: ['Name', 'StaffName'],
        optionalFields: ['id', 'employeeId', 'designation', 'basicSalary', 'joiningDate', 'status', 'email', 'ProjectName', 'Project', 'BuildingName', 'Building', 'salaryStructure', 'bankDetails', 'history', 'exitDetails', 'advanceBalance'],
        allowedFields: new Set(['id', 'Name', 'StaffName', 'employeeId', 'designation', 'basicSalary', 'joiningDate', 'status', 'email', 'ProjectName', 'Project', 'BuildingName', 'Building', 'salaryStructure', 'bankDetails', 'history', 'exitDetails', 'advanceBalance'])
    };

    // RentalAgreements
    schemas.RentalAgreements = {
        sheetName: 'RentalAgreements',
        version: '1.0',
        requiredFields: ['agreementNumber', 'startDate', 'endDate', 'monthlyRent'],
        optionalFields: ['id', 'tenantName', 'tenant', 'propertyName', 'property', 'rentDueDate', 'status', 'description', 'securityDeposit', 'brokerName', 'broker', 'brokerFee'],
        allowedFields: new Set(['id', 'agreementNumber', 'tenantName', 'tenant', 'propertyName', 'property', 'startDate', 'endDate', 'monthlyRent', 'rentDueDate', 'status', 'description', 'securityDeposit', 'brokerName', 'broker', 'brokerFee'])
    };

    // ProjectAgreements
    schemas.ProjectAgreements = {
        sheetName: 'ProjectAgreements',
        version: '1.0',
        requiredFields: ['agreementNumber', 'sellingPrice'],
        optionalFields: [
            'id', 'clientName', 'client', 'ownerName', 'owner', 'projectName', 'project',
            'UnitNames', 'issueDate', 'status', 'description', 'cancellationDetails',
            'listPrice', 'customerDiscount', 'floorDiscount', 'lumpSumDiscount', 'miscDiscount',
            'rebateAmount', 'rebateBrokerName', 'rebate Broker',
            'listPriceCategoryName', 'customerDiscountCategoryName', 'floorDiscountCategoryName',
            'lumpSumDiscountCategoryName', 'miscDiscountCategoryName', 'sellingPriceCategoryName', 'rebateCategoryName'
        ],
        allowedFields: new Set([
            'id', 'agreementNumber', 'clientName', 'client', 'ownerName', 'owner',
            'projectName', 'project', 'UnitNames', 'issueDate', 'status', 'description', 'cancellationDetails',
            'listPrice', 'customerDiscount', 'floorDiscount', 'lumpSumDiscount', 'miscDiscount', 'sellingPrice',
            'rebateAmount', 'rebateBrokerName', 'rebate Broker',
            'listPriceCategoryName', 'customerDiscountCategoryName', 'floorDiscountCategoryName',
            'lumpSumDiscountCategoryName', 'miscDiscountCategoryName', 'sellingPriceCategoryName', 'rebateCategoryName'
        ])
    };

    // Contracts - Key schema with expense category items
    schemas.Contracts = {
        sheetName: 'Contracts',
        version: '1.1',
        requiredFields: ['contractNumber', 'name', 'totalAmount', 'startDate', 'endDate'],
        optionalFields: [
            'id', 'projectName', 'project', 'vendorName', 'vendor', 'area', 'rate', 'status',
            'categoryNames', 'CategoryNames', 'expenseCategoryItems', 'ExpenseCategoryItems',
            'expenseCategoryNames', 'ExpenseCategoryNames', 'expenseQuantities', 'ExpenseQuantities',
            'expensePricePerUnits', 'ExpensePricePerUnits', 'expenseNetValues', 'ExpenseNetValues',
            'expenseUnits', 'ExpenseUnits', 'paymentTerms', 'PaymentTerms', 'termsAndConditions', 'description'
        ],
        allowedFields: new Set([
            'id', 'contractNumber', 'name', 'projectName', 'project', 'vendorName', 'vendor',
            'totalAmount', 'area', 'rate', 'startDate', 'endDate', 'status', 'categoryNames', 'CategoryNames',
            'expenseCategoryItems', 'ExpenseCategoryItems', 'expenseCategoryNames', 'ExpenseCategoryNames',
            'expenseQuantities', 'ExpenseQuantities', 'expensePricePerUnits', 'ExpensePricePerUnits',
            'expenseNetValues', 'ExpenseNetValues', 'expenseUnits', 'ExpenseUnits',
            'paymentTerms', 'PaymentTerms', 'termsAndConditions', 'description'
        ]),
        validate: (row: any, maps: ImportMaps, normalizeName: (name: string) => string) => {
            const errors: string[] = [];
            const warnings: string[] = [];

            if (!row.contractNumber || !String(row.contractNumber).trim()) {
                errors.push('contractNumber is required');
            }
            if (!row.name || !String(row.name).trim()) {
                errors.push('name is required');
            }
            if (!row.totalAmount || isNaN(parseFloat(row.totalAmount))) {
                errors.push('totalAmount must be a valid number');
            }
            if (!row.startDate) {
                errors.push('startDate is required');
            }
            if (!row.endDate) {
                errors.push('endDate is required');
            }

            if (row.projectName) {
                const projectId = maps.projects.get(normalizeName(row.projectName));
                if (!projectId) {
                    warnings.push(`Project "${row.projectName}" not found`);
                }
            }

            if (row.vendorName) {
                const vendorId = maps.contacts.get(normalizeName(row.vendorName));
                if (!vendorId) {
                    warnings.push(`Vendor "${row.vendorName}" not found`);
                }
            }

            if (row.expenseCategoryNames) {
                const categoryNames = String(row.expenseCategoryNames).split(',').map(s => s.trim());
                categoryNames.forEach(catName => {
                    if (catName && !maps.categories.get(normalizeName(catName))) {
                        warnings.push(`Category "${catName}" not found in expenseCategoryNames`);
                    }
                });
            }

            return { valid: errors.length === 0, errors, warnings };
        }
    };

    // RecurringTemplates
    schemas.RecurringTemplates = {
        sheetName: 'RecurringTemplates',
        version: '1.0',
        requiredFields: [],
        optionalFields: ['id', 'contactName', 'contact', 'propertyName', 'property', 'buildingName', 'building', 'agreementId', 'agreementNumber', 'AgreementNumber', 'amount', 'descriptionTemplate', 'dayOfMonth', 'nextDueDate', 'active'],
        allowedFields: new Set(['id', 'contactName', 'contact', 'propertyName', 'property', 'buildingName', 'building', 'agreementId', 'agreementNumber', 'AgreementNumber', 'amount', 'descriptionTemplate', 'dayOfMonth', 'nextDueDate', 'active'])
    };

    // Invoices
    schemas.Invoices = {
        sheetName: 'Invoices',
        version: '1.0',
        requiredFields: ['invoiceNumber', 'amount', 'issueDate'],
        optionalFields: ['id', 'contactName', 'contact', 'paidAmount', 'status', 'dueDate', 'invoiceType', 'description', 'projectName', 'project', 'buildingName', 'building', 'propertyName', 'property', 'unitName', 'unit', 'categoryName', 'agreementNumber', 'securityDepositCharge', 'serviceCharges', 'rentalMonth'],
        allowedFields: new Set(['id', 'invoiceNumber', 'contactName', 'contact', 'amount', 'paidAmount', 'status', 'issueDate', 'dueDate', 'invoiceType', 'description', 'projectName', 'project', 'buildingName', 'building', 'propertyName', 'property', 'unitName', 'unit', 'categoryName', 'agreementNumber', 'securityDepositCharge', 'serviceCharges', 'rentalMonth'])
    };

    // ProjectBills
    schemas.ProjectBills = {
        sheetName: 'ProjectBills',
        version: '1.1',
        requiredFields: ['billNumber', 'amount', 'issueDate'],
        optionalFields: [
            'id', 'contactName', 'contact', 'paidAmount', 'status', 'dueDate', 'description',
            'categoryName', 'projectName', 'project', 'contractNumber', 'contract',
            'agreementNumber', 'projectAgreementId',
            'expenseCategoryItems', 'ExpenseCategoryItems', 'expenseCategoryNames', 'ExpenseCategoryNames',
            'expenseQuantities', 'ExpenseQuantities', 'expensePricePerUnits', 'ExpensePricePerUnits',
            'expenseNetValues', 'ExpenseNetValues', 'expenseUnits', 'ExpenseUnits'
        ],
        allowedFields: new Set([
            'id', 'billNumber', 'contactName', 'contact', 'amount', 'paidAmount', 'status',
            'issueDate', 'dueDate', 'description', 'categoryName', 'projectName', 'project',
            'contractNumber', 'contract', 'agreementNumber', 'projectAgreementId',
            'expenseCategoryItems', 'ExpenseCategoryItems', 'expenseCategoryNames', 'ExpenseCategoryNames',
            'expenseQuantities', 'ExpenseQuantities', 'expensePricePerUnits', 'ExpensePricePerUnits',
            'expenseNetValues', 'ExpenseNetValues', 'expenseUnits', 'ExpenseUnits'
        ])
    };

    // RentalBills
    schemas.RentalBills = {
        sheetName: 'RentalBills',
        version: '1.1',
        requiredFields: ['billNumber', 'amount', 'issueDate'],
        optionalFields: [
            'id', 'contactName', 'contact', 'paidAmount', 'status', 'dueDate', 'description',
            'categoryName', 'buildingName', 'building', 'propertyName', 'property',
            'staffName', 'staff', 'staffId',
            'expenseCategoryItems', 'ExpenseCategoryItems', 'expenseCategoryNames', 'ExpenseCategoryNames',
            'expenseQuantities', 'ExpenseQuantities', 'expensePricePerUnits', 'ExpensePricePerUnits',
            'expenseNetValues', 'ExpenseNetValues', 'expenseUnits', 'ExpenseUnits'
        ],
        allowedFields: new Set([
            'id', 'billNumber', 'contactName', 'contact', 'amount', 'paidAmount', 'status',
            'issueDate', 'dueDate', 'description', 'categoryName', 'buildingName', 'building',
            'propertyName', 'property', 'staffName', 'staff', 'staffId',
            'expenseCategoryItems', 'ExpenseCategoryItems', 'expenseCategoryNames', 'ExpenseCategoryNames',
            'expenseQuantities', 'ExpenseQuantities', 'expensePricePerUnits', 'ExpensePricePerUnits',
            'expenseNetValues', 'ExpenseNetValues', 'expenseUnits', 'ExpenseUnits'
        ])
    };

    // Bills (legacy)
    schemas.Bills = {
        sheetName: 'Bills',
        version: '1.1',
        requiredFields: ['billNumber', 'amount', 'issueDate'],
        optionalFields: [
            'id', 'contactName', 'contact', 'paidAmount', 'status', 'dueDate', 'description',
            'categoryName', 'projectName', 'project', 'buildingName', 'building',
            'propertyName', 'property', 'projectAgreementId', 'agreementId', 'agreementNumber',
            'contractId', 'contractNumber', 'staffId', 'staff',
            'expenseCategoryItems', 'ExpenseCategoryItems', 'expenseCategoryNames', 'ExpenseCategoryNames',
            'expenseQuantities', 'ExpenseQuantities', 'expensePricePerUnits', 'ExpensePricePerUnits',
            'expenseNetValues', 'ExpenseNetValues', 'expenseUnits', 'ExpenseUnits'
        ],
        allowedFields: new Set([
            'id', 'billNumber', 'contactName', 'contact', 'amount', 'paidAmount', 'status',
            'issueDate', 'dueDate', 'description', 'categoryName', 'projectName', 'project',
            'buildingName', 'building', 'propertyName', 'property', 'projectAgreementId',
            'agreementId', 'agreementNumber', 'contractId', 'contractNumber', 'staffId', 'staff',
            'expenseCategoryItems', 'ExpenseCategoryItems', 'expenseCategoryNames', 'ExpenseCategoryNames',
            'expenseQuantities', 'ExpenseQuantities', 'expensePricePerUnits', 'ExpensePricePerUnits',
            'expenseNetValues', 'ExpenseNetValues', 'expenseUnits', 'ExpenseUnits'
        ])
    };

    // Budgets
    schemas.Budgets = {
        sheetName: 'Budgets',
        version: '1.0',
        requiredFields: ['amount'],
        optionalFields: ['id', 'categoryId', 'categoryName', 'projectId', 'projectName'],
        allowedFields: new Set(['id', 'categoryId', 'categoryName', 'projectId', 'projectName', 'amount'])
    };

    // Payslips
    schemas.Payslips = {
        sheetName: 'Payslips',
        version: '1.0',
        requiredFields: [],
        optionalFields: ['id', 'staffName', 'staff', 'month', 'issueDate', 'basicSalary', 'allowances', 'deductions', 'bonuses', 'totalAllowances', 'totalDeductions', 'totalBonuses', 'grossSalary', 'netSalary', 'status'],
        allowedFields: new Set(['id', 'staffName', 'staff', 'month', 'issueDate', 'basicSalary', 'allowances', 'deductions', 'bonuses', 'totalAllowances', 'totalDeductions', 'totalBonuses', 'grossSalary', 'netSalary', 'status'])
    };

    // Transactions
    schemas.Transactions = {
        sheetName: 'Transactions',
        version: '1.0',
        requiredFields: ['type', 'amount', 'date'],
        optionalFields: [
            'id', 'subtype', 'description',
            'accountName', 'AccountName', 'fromAccountName', 'FromAccountName', 'toAccountName', 'ToAccountName',
            'contactName', 'ContactName', 'projectName', 'ProjectName', 'buildingName', 'BuildingName',
            'propertyName', 'PropertyName', 'unitName', 'UnitName', 'categoryName', 'CategoryName',
            'invoiceNumber', 'InvoiceNumber', 'billNumber', 'BillNumber', 'contractNumber', 'ContractNumber',
            'agreementNumber', 'AgreementNumber', 'payslipId', 'batchId'
        ],
        allowedFields: new Set([
            'id', 'type', 'subtype', 'amount', 'date', 'description',
            'accountName', 'AccountName', 'fromAccountName', 'FromAccountName', 'toAccountName', 'ToAccountName',
            'contactName', 'ContactName', 'projectName', 'ProjectName', 'buildingName', 'BuildingName',
            'propertyName', 'PropertyName', 'unitName', 'UnitName', 'categoryName', 'CategoryName',
            'invoiceNumber', 'InvoiceNumber', 'billNumber', 'BillNumber', 'contractNumber', 'ContractNumber',
            'agreementNumber', 'AgreementNumber', 'payslipId', 'batchId'
        ])
    };

    // RentalInvoicePayments
    schemas.RentalInvoicePayments = {
        sheetName: 'RentalInvoicePayments',
        version: '1.0',
        requiredFields: ['amount', 'date', 'invoiceNumber'],
        optionalFields: ['id', 'description', 'accountName', 'AccountName', 'contactName', 'ContactName', 'categoryName', 'CategoryName', 'projectName', 'ProjectName', 'buildingName', 'BuildingName', 'propertyName', 'PropertyName', 'unitName', 'UnitName', 'contractNumber', 'ContractNumber', 'agreementNumber', 'AgreementNumber'],
        allowedFields: new Set(['id', 'amount', 'date', 'description', 'accountName', 'AccountName', 'invoiceNumber', 'InvoiceNumber', 'contactName', 'ContactName', 'categoryName', 'CategoryName', 'projectName', 'ProjectName', 'buildingName', 'BuildingName', 'propertyName', 'PropertyName', 'unitName', 'UnitName', 'contractNumber', 'ContractNumber', 'agreementNumber', 'AgreementNumber'])
    };

    // ProjectInvoicePayments
    schemas.ProjectInvoicePayments = {
        sheetName: 'ProjectInvoicePayments',
        version: '1.0',
        requiredFields: ['amount', 'date', 'invoiceNumber'],
        optionalFields: ['id', 'description', 'accountName', 'AccountName', 'contactName', 'ContactName', 'categoryName', 'CategoryName', 'projectName', 'ProjectName', 'buildingName', 'BuildingName', 'propertyName', 'PropertyName', 'unitName', 'UnitName', 'contractNumber', 'ContractNumber', 'agreementNumber', 'AgreementNumber'],
        allowedFields: new Set(['id', 'amount', 'date', 'description', 'accountName', 'AccountName', 'invoiceNumber', 'InvoiceNumber', 'contactName', 'ContactName', 'categoryName', 'CategoryName', 'projectName', 'ProjectName', 'buildingName', 'BuildingName', 'propertyName', 'PropertyName', 'unitName', 'UnitName', 'contractNumber', 'ContractNumber', 'agreementNumber', 'AgreementNumber'])
    };

    // RentalBillPayments
    schemas.RentalBillPayments = {
        sheetName: 'RentalBillPayments',
        version: '1.0',
        requiredFields: ['amount', 'date', 'billNumber'],
        optionalFields: ['id', 'description', 'accountName', 'AccountName', 'contactName', 'ContactName', 'categoryName', 'CategoryName', 'projectName', 'ProjectName', 'buildingName', 'BuildingName', 'propertyName', 'PropertyName', 'unitName', 'UnitName', 'contractNumber', 'ContractNumber', 'agreementNumber', 'AgreementNumber'],
        allowedFields: new Set(['id', 'amount', 'date', 'description', 'accountName', 'AccountName', 'billNumber', 'BillNumber', 'contactName', 'ContactName', 'categoryName', 'CategoryName', 'projectName', 'ProjectName', 'buildingName', 'BuildingName', 'propertyName', 'PropertyName', 'unitName', 'UnitName', 'contractNumber', 'ContractNumber', 'agreementNumber', 'AgreementNumber'])
    };

    // ProjectBillPayments
    schemas.ProjectBillPayments = {
        sheetName: 'ProjectBillPayments',
        version: '1.0',
        requiredFields: ['amount', 'date', 'billNumber'],
        optionalFields: ['id', 'description', 'accountName', 'AccountName', 'contactName', 'ContactName', 'categoryName', 'CategoryName', 'projectName', 'ProjectName', 'buildingName', 'BuildingName', 'propertyName', 'PropertyName', 'unitName', 'UnitName', 'contractNumber', 'ContractNumber', 'agreementNumber', 'AgreementNumber'],
        allowedFields: new Set(['id', 'amount', 'date', 'description', 'accountName', 'AccountName', 'billNumber', 'BillNumber', 'contactName', 'ContactName', 'categoryName', 'CategoryName', 'projectName', 'ProjectName', 'buildingName', 'BuildingName', 'propertyName', 'PropertyName', 'unitName', 'UnitName', 'contractNumber', 'ContractNumber', 'agreementNumber', 'AgreementNumber'])
    };

    // LoanTransactions
    schemas.LoanTransactions = {
        sheetName: 'LoanTransactions',
        version: '1.0',
        requiredFields: ['subtype', 'amount', 'date'],
        optionalFields: ['id', 'description', 'accountName', 'AccountName', 'contactName', 'ContactName'],
        allowedFields: new Set(['id', 'subtype', 'amount', 'date', 'description', 'accountName', 'AccountName', 'contactName', 'ContactName'])
    };

    // EquityTransactions
    schemas.EquityTransactions = {
        sheetName: 'EquityTransactions',
        version: '1.0',
        requiredFields: ['amount', 'date'],
        optionalFields: ['id', 'description', 'fromAccountName', 'FromAccountName', 'toAccountName', 'ToAccountName', 'projectName', 'ProjectName', 'projectId', 'ProjectId'],
        allowedFields: new Set(['id', 'amount', 'date', 'description', 'fromAccountName', 'FromAccountName', 'toAccountName', 'ToAccountName', 'projectName', 'ProjectName', 'projectId', 'ProjectId'])
    };

    // TransferTransactions
    schemas.TransferTransactions = {
        sheetName: 'TransferTransactions',
        version: '1.0',
        requiredFields: ['amount', 'date'],
        optionalFields: ['id', 'description', 'fromAccountName', 'FromAccountName', 'toAccountName', 'ToAccountName'],
        allowedFields: new Set(['id', 'amount', 'date', 'description', 'fromAccountName', 'FromAccountName', 'toAccountName', 'ToAccountName'])
    };

    // IncomeTransactions
    schemas.IncomeTransactions = {
        sheetName: 'IncomeTransactions',
        version: '1.0',
        requiredFields: ['amount', 'date'],
        optionalFields: ['id', 'description', 'accountName', 'AccountName', 'contactName', 'ContactName', 'categoryName', 'CategoryName', 'projectName', 'ProjectName'],
        allowedFields: new Set(['id', 'amount', 'date', 'description', 'accountName', 'AccountName', 'contactName', 'ContactName', 'categoryName', 'CategoryName', 'projectName', 'ProjectName'])
    };

    // ExpenseTransactions
    schemas.ExpenseTransactions = {
        sheetName: 'ExpenseTransactions',
        version: '1.0',
        requiredFields: ['amount', 'date'],
        optionalFields: ['id', 'description', 'accountName', 'AccountName', 'contactName', 'ContactName', 'categoryName', 'CategoryName'],
        allowedFields: new Set(['id', 'amount', 'date', 'description', 'accountName', 'AccountName', 'contactName', 'ContactName', 'categoryName', 'CategoryName'])
    };

    return schemas;
};

export const IMPORT_SCHEMAS: Record<string, ImportSchema> = createImportSchemas();

// Get import schema for a sheet
export const getImportSchema = (sheetName: string): ImportSchema | undefined => {
    return IMPORT_SCHEMAS[sheetName];
};

