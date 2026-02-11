
import type { Dispatch } from 'react';
export { ImportType } from '../types';
import { AppState, AppAction, ImportLogEntry, Account, Contact, Vendor, Quotation, Project, Category, Building, Property, Unit, Transaction, Invoice, Bill, RentalAgreement, ProjectAgreement, Budget, ContactType, TransactionType, RentalAgreementStatus, ProjectAgreementStatus, InvoiceStatus, InvoiceType, LoanSubtype, AccountType, Contract, ContractExpenseCategoryItem, ContractStatus, RecurringInvoiceTemplate, ImportType } from '../types';
import type { ProgressContextType } from '../context/ProgressContext';
import * as XLSX from 'xlsx';
import { normalizeNameForComparison } from '../utils/stringUtils';
import { IMPORT_SCHEMAS } from './importSchemas';
import { AppStateRepository } from './database/repositories/appStateRepository';

type ProgressReporter = ProgressContextType;
type LogFunction = (entry: ImportLogEntry) => void;

// ImportType moved to types.ts


// Data Correction Interface (kept for backward compatibility, but no longer used)
export interface CorrectionRequest {
    sheet: string;
    row: number;
    data: any;
    missingFields: string[];
}

// Helper to generate unique ID for imported records
const generateImportId = (prefix: string, index: number): string => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `imp-${prefix}-${timestamp}-${index}-${random}`;
};

// Helper to generate transaction ID for bills and invoices
const generateTransactionId = (type: 'bill' | 'invoice', number: string, id: string): string => {
    const normalizedNumber = String(number).trim().replace(/\s+/g, '-');
    const normalizedId = String(id).trim().replace(/\s+/g, '-');
    return `${type}-${normalizedNumber}_${normalizedId}`;
};

// Helper to generate transaction ID for standalone transactions (without bills/invoices)
const generateStandaloneTransactionId = (txType: string, transactionId: string): string => {
    const normalizedTxId = String(transactionId).trim().replace(/\s+/g, '-');
    if (txType === TransactionType.INCOME) {
        return `noinvoice_${normalizedTxId}`;
    } else if (txType === TransactionType.EXPENSE) {
        return `nobill_${normalizedTxId}`;
    }
    return normalizedTxId; // For other types like TRANSFER, LOAN, etc.
};

// Helper function to generate detailed error messages with correction suggestions
const generateErrorWithSuggestions = (
    sheet: string,
    row: number,
    data: any,
    missingFields: string[],
    invalidRefs?: { field: string; value: string; suggestions?: string[] }[]
): string => {
    const rowNum = row + 2; // Excel row number (1-indexed + header)
    let message = `❌ Row ${rowNum} in "${sheet}" sheet has the following issues:\n\n`;

    if (missingFields.length > 0) {
        message += `📋 MISSING REQUIRED FIELDS:\n`;
        missingFields.forEach(field => {
            message += `   • "${field}" is required but is empty or missing\n`;
        });
        message += `\n   💡 SUGGESTION: Add the missing field(s) to row ${rowNum} in your Excel file.\n\n`;
    }

    if (invalidRefs && invalidRefs.length > 0) {
        message += `🔗 INVALID REFERENCES:\n`;
        invalidRefs.forEach(ref => {
            message += `   • "${ref.field}" value "${ref.value}" not found in the system\n`;
            if (ref.suggestions && ref.suggestions.length > 0) {
                message += `     Did you mean: ${ref.suggestions.slice(0, 3).join(', ')}${ref.suggestions.length > 3 ? '...' : ''}?\n`;
            }
        });
        message += `\n   💡 SUGGESTION: Check the spelling or create the referenced item first.\n\n`;
    }

    // Show available data for context
    const availableFields = Object.keys(data).filter(k => data[k] && String(data[k]).trim() !== '');
    if (availableFields.length > 0) {
        message += `📄 Available data in this row: ${availableFields.join(', ')}\n`;
    }

    return message;
};

// Helper to normalize user input for Contact Types into strict Enum values
const normalizeContactType = (input: string): ContactType | null => {
    if (!input) return null;
    const lower = input.trim().toLowerCase();

    if (Object.values(ContactType).map(t => t.toLowerCase()).includes(lower as any)) {
        const entry = Object.entries(ContactType).find(([_, val]) => val.toLowerCase() === lower);
        return entry ? entry[1] : null;
    }

    if (lower === 'friend') return ContactType.FRIEND_FAMILY;
    if (lower === 'family') return ContactType.FRIEND_FAMILY;
    if (lower === 'client') return ContactType.OWNER;

    return null;
};

// Helper to safely parse JSON strings from Excel
const safeJsonParse = (str: any) => {
    if (typeof str === 'object') return str; // Already an object
    try {
        return str ? JSON.parse(str) : undefined;
    } catch (e) {
        return undefined;
    }
};

// Helper to parse expense category items from separate columns (new format) or JSON (old format)
const parseExpenseCategoryItems = (
    row: any,
    maps: { categories: Map<string, string> },
    normalizeNameForComparison: (name: string) => string
): ContractExpenseCategoryItem[] | undefined => {
    const expenseCategoryNamesRaw = row.expenseCategoryNames || row.ExpenseCategoryNames || '';
    const expenseQuantitiesRaw = row.expenseQuantities || row.ExpenseQuantities || '';
    const expensePricePerUnitsRaw = row.expensePricePerUnits || row.ExpensePricePerUnits || '';
    const expenseNetValuesRaw = row.expenseNetValues || row.ExpenseNetValues || '';
    const expenseUnitsRaw = row.expenseUnits || row.ExpenseUnits || '';

    // Also support old JSON format for backward compatibility
    const expenseCategoryItemsRaw = row.expenseCategoryItems || row.ExpenseCategoryItems;

    if (expenseCategoryNamesRaw && expenseCategoryNamesRaw.trim()) {
        // New format: comma-separated columns
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
                unit: (units[idx] && ['Cubic Feet', 'Square feet', 'feet', 'quantity'].includes(units[idx])) ? units[idx] as 'Cubic Feet' | 'Square feet' | 'feet' | 'quantity' : 'quantity',
                quantity: parseFloat(quantities[idx]) || 1,
                pricePerUnit: parseFloat(pricePerUnits[idx]) || 0,
                netValue: parseFloat(netValues[idx]) || 0
            } as ContractExpenseCategoryItem;
        }).filter((item): item is ContractExpenseCategoryItem => item !== null);
    } else if (expenseCategoryItemsRaw) {
        // Old format: JSON string (backward compatibility)
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

// Helper to format text data: trim and convert to Title Case
const formatTextData = (value: any): string => {
    if (value === null || value === undefined || value === '') {
        return '';
    }

    // Convert to string and trim leading/trailing spaces
    let text = String(value).trim();

    if (!text) return '';

    // Convert to Title Case: capitalize first character of each word
    // Preserve internal spacing and punctuation
    // Split by word boundaries (spaces, hyphens, etc.) and capitalize first letter of each word
    text = text.replace(/\w\S*/g, (word) => {
        // Capitalize first character, lowercase the rest
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });

    return text;
};

// Helper to format text field value (only if it's a text field)
const formatTextField = (value: any, fieldName: string, sheetName: string): any => {
    // Return as-is if null, undefined, or empty
    if (value === null || value === undefined || value === '') {
        return value;
    }

    // Skip formatting for non-text fields (numeric, dates, IDs, etc.)
    const skipFormattingFields = [
        'id', 'amount', 'balance', 'paidAmount', 'salePrice', 'monthlyRent', 'securityDeposit',
        'brokerFee', 'listPrice', 'customerDiscount', 'floorDiscount', 'lumpSumDiscount',
        'miscDiscount', 'sellingPrice', 'rebateAmount', 'totalAmount', 'area', 'rate',
        'monthlyServiceCharge', 'rentDueDate', 'dayOfMonth', 'isPermanent',
        'isTaxable', 'isSystem', 'isRental', 'active', 'status', 'type', 'subtype',
        'invoiceType', 'date', 'issueDate', 'dueDate', 'startDate', 'endDate', 'joiningDate',
        'nextDueDate', 'month', 'color', 'email', 'contactNo', 'invoiceNumber',
        'billNumber', 'contractNumber', 'agreementNumber', 'transactionId',
        'batchId', 'parentAccountId', 'parentCategoryId', 'projectId', 'buildingId',
        'propertyId', 'unitId', 'categoryId', 'contactId', 'accountId', 'invoiceId',
        'billId', 'contractId', 'agreementId', 'staffId', 'tenantId', 'clientId',
        'ownerId', 'brokerId', 'rebateBrokerId', 'projectAgreementId', 'fromAccountId',
        'toAccountId', 'unitIds', 'Key', 'Value'
    ];

    const fieldLower = fieldName.toLowerCase();

    // Skip formatting for numeric/date/enum/ID fields
    if (skipFormattingFields.some(field => fieldLower === field.toLowerCase())) {
        return value;
    }

    // Skip formatting for JSON/complex object fields
    if (fieldLower.includes('config') ||
        fieldLower.includes('structure') ||
        fieldLower.includes('details') ||
        fieldLower.includes('history') ||
        fieldLower.includes('allowances') ||
        fieldLower.includes('deductions') ||
        fieldLower.includes('template') ||
        fieldLower.includes('pmconfig') ||
        fieldLower.includes('installmentconfig') ||
        fieldLower.includes('bankdetails') ||
        fieldLower.includes('exitdetails') ||
        fieldLower.includes('cancellationdetails')) {
        return value;
    }

    // Skip formatting if value looks like a number or date
    if (typeof value === 'number' || !isNaN(Number(value))) {
        return value;
    }

    // Format text fields: trim and convert to Title Case
    return formatTextData(value);
};

const validateRecord = (record: any, requiredFields: string[]): string[] => {
    return requiredFields.filter(field => {
        const val = record[field];
        return val === undefined || val === null || val === '';
    });
};

export const importFromExcel = (file: File): Promise<{ [key: string]: any[] }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (!event.target?.result) {
                return reject(new Error("FileReader error: result is null."));
            }
            try {
                const data = event.target.result;
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                const sheets: { [key: string]: any[] } = {};
                workbook.SheetNames.forEach(sheetName => {
                    const worksheet = workbook.Sheets[sheetName];
                    const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
                    sheets[sheetName] = json;
                });
                resolve(sheets);
            } catch (e) {
                reject(e);
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
};

// Template generation function
export const generateImportTemplate = (importType: ImportType): void => {
    const workbook = XLSX.utils.book_new();

    // Get template data based on import type
    const getTemplateData = (): { sheetName: string; headers: string[]; exampleRows: any[] }[] => {
        switch (importType) {
            case ImportType.ACCOUNTS:
                return [{
                    sheetName: 'Accounts',
                    headers: ['name', 'type', 'balance', 'description', 'parentAccountName'],
                    exampleRows: [
                        { name: 'Cash Account', type: 'Asset', balance: '0', description: 'Main cash account', parentAccountName: '' },
                        { name: 'Bank Account', type: 'Asset', balance: '0', description: 'Primary bank account', parentAccountName: '' }
                    ]
                }];

            case ImportType.CONTACTS:
                return [{
                    sheetName: 'Contacts',
                    headers: ['name', 'type', 'description', 'contactNo', 'companyName', 'address'],
                    exampleRows: [
                        { name: 'John Doe', type: 'Owner', description: 'Property owner', contactNo: '+1234567890', companyName: '', address: '123 Main St' },
                        { name: 'ABC Company', type: 'Vendor', description: 'Supplier', contactNo: '+1234567891', companyName: 'ABC Company', address: '456 Business Ave' }
                    ]
                }];

            case ImportType.VENDORS:
                return [{
                    sheetName: 'Contacts',
                    headers: ['name', 'type', 'description', 'contactNo', 'companyName', 'address'],
                    exampleRows: [
                        { name: 'ABC Company', type: 'Vendor', description: 'Material supplier', contactNo: '+1234567891', companyName: 'ABC Company', address: '456 Business Ave' },
                        { name: 'XYZ Services', type: 'Vendor', description: 'Service provider', contactNo: '+1234567892', companyName: 'XYZ Services', address: '789 Service Rd' }
                    ]
                }];

            case ImportType.CATEGORIES:
                return [{
                    sheetName: 'Categories',
                    headers: ['name', 'type', 'description', 'parentCategoryName'],
                    exampleRows: [
                        { name: 'Rent Income', type: 'Income', description: 'Rental income', parentCategoryName: '' },
                        { name: 'Material Expense', type: 'Expense', description: 'Material costs', parentCategoryName: '' }
                    ]
                }];

            case ImportType.PROJECTS:
                return [{
                    sheetName: 'Projects',
                    headers: ['name', 'description', 'color', 'status'],
                    exampleRows: [
                        { name: 'Project Alpha', description: 'Residential project', color: '#3B82F6', status: 'Active' },
                        { name: 'Project Beta', description: 'Commercial project', color: '#10B981', status: 'Planning' }
                    ]
                }];

            case ImportType.BUILDINGS:
                return [{
                    sheetName: 'Buildings',
                    headers: ['name', 'description', 'color'],
                    exampleRows: [
                        { name: 'Building A', description: 'Main building', color: '#3B82F6' },
                        { name: 'Building B', description: 'Secondary building', color: '#10B981' }
                    ]
                }];

            case ImportType.PROPERTIES:
                return [{
                    sheetName: 'Properties',
                    headers: ['name', 'ownerName', 'buildingName', 'description', 'monthlyServiceCharge'],
                    exampleRows: [
                        { name: 'Property 101', ownerName: 'John Doe', buildingName: 'Building A', description: '2BHK apartment', monthlyServiceCharge: '500' },
                        { name: 'Property 102', ownerName: 'Jane Smith', buildingName: 'Building A', description: '3BHK apartment', monthlyServiceCharge: '750' }
                    ]
                }];

            case ImportType.UNITS:
                return [{
                    sheetName: 'Units',
                    headers: ['name', 'projectName', 'ownerName', 'salePrice', 'description'],
                    exampleRows: [
                        { name: 'Unit 201', projectName: 'Project Alpha', ownerName: 'John Doe', salePrice: '500000', description: '2BHK unit' },
                        { name: 'Unit 202', projectName: 'Project Alpha', ownerName: 'Jane Smith', salePrice: '750000', description: '3BHK unit' }
                    ]
                }];

            case ImportType.AGREEMENTS:
                return [
                    {
                        sheetName: 'RentalAgreements',
                        headers: ['agreementNumber', 'propertyName', 'tenantName', 'ownerName', 'brokerName', 'startDate', 'endDate', 'monthlyRent', 'rentDueDate', 'status', 'securityDeposit', 'brokerFee', 'description'],
                        exampleRows: [
                            { agreementNumber: 'RA-001', propertyName: 'Property 101', tenantName: 'Tenant One', ownerName: 'Owner Name', brokerName: 'Broker Name', startDate: '2024-01-01', endDate: '2024-12-31', monthlyRent: '10000', rentDueDate: '5', status: 'Active', securityDeposit: '30000', brokerFee: '5000', description: 'Annual rental' }
                        ]
                    },
                    {
                        sheetName: 'ProjectAgreements',
                        headers: [
                            'agreementNumber',
                            'clientName',
                            'projectName',
                            'UnitNames',
                            'issueDate',
                            'status',
                            'description',
                            // Amounts (as per ProjectAgreementForm)
                            'listPrice',
                            'customerDiscount',
                            'floorDiscount',
                            'lumpSumDiscount',
                            'miscDiscount',
                            'sellingPrice',
                            'rebateAmount',
                            'rebateBrokerName',
                            // Category mappings (as per ProjectAgreementForm)
                            'listPriceCategoryName',
                            'customerDiscountCategoryName',
                            'floorDiscountCategoryName',
                            'lumpSumDiscountCategoryName',
                            'miscDiscountCategoryName',
                            'sellingPriceCategoryName',
                            'rebateCategoryName',
                            // Optional JSON
                            'cancellationDetails'
                        ],
                        exampleRows: [
                            {
                                agreementNumber: 'PA-001',
                                clientName: 'John Doe',
                                projectName: 'Project Alpha',
                                UnitNames: 'Unit 201, Unit 202',
                                issueDate: '2024-01-01',
                                status: 'Active',
                                description: 'Unit purchase agreement',
                                listPrice: '1250000',
                                customerDiscount: '50000',
                                floorDiscount: '25000',
                                lumpSumDiscount: '0',
                                miscDiscount: '0',
                                sellingPrice: '1175000',
                                rebateAmount: '0',
                                rebateBrokerName: '',
                                listPriceCategoryName: 'Project Listed Income',
                                customerDiscountCategoryName: 'Customer Discount',
                                floorDiscountCategoryName: 'Floor Discount',
                                lumpSumDiscountCategoryName: 'Lump Sum Discount',
                                miscDiscountCategoryName: 'Misc Discount',
                                sellingPriceCategoryName: 'Unit Selling Income',
                                rebateCategoryName: 'Broker Fee',
                                cancellationDetails: ''
                            }
                        ]
                    }
                ];

            case ImportType.RENTAL_AGREEMENTS:
                return [{
                    sheetName: 'RentalAgreements',
                    headers: ['agreementNumber', 'tenantName', 'propertyName', 'startDate', 'endDate', 'monthlyRent', 'rentDueDate', 'status', 'description', 'securityDeposit', 'brokerName', 'brokerFee'],
                    exampleRows: [
                        { agreementNumber: 'RA-001', tenantName: 'Tenant One', propertyName: 'Property 101', startDate: '2024-01-01', endDate: '2024-12-31', monthlyRent: '10000', rentDueDate: '5', status: 'Active', description: 'Annual rental', securityDeposit: '30000', brokerName: '', brokerFee: '5000' }
                    ]
                }];

            case ImportType.PROJECT_AGREEMENTS:
                return [{
                    sheetName: 'ProjectAgreements',
                    headers: [
                        'agreementNumber',
                        'clientName',
                        'projectName',
                        'UnitNames',
                        'issueDate',
                        'status',
                        'description',
                        // Amounts (as per ProjectAgreementForm)
                        'listPrice',
                        'customerDiscount',
                        'floorDiscount',
                        'lumpSumDiscount',
                        'miscDiscount',
                        'sellingPrice',
                        'rebateAmount',
                        'rebateBrokerName',
                        // Category mappings (as per ProjectAgreementForm)
                        'listPriceCategoryName',
                        'customerDiscountCategoryName',
                        'floorDiscountCategoryName',
                        'lumpSumDiscountCategoryName',
                        'miscDiscountCategoryName',
                        'sellingPriceCategoryName',
                        'rebateCategoryName',
                        // Optional JSON
                        'cancellationDetails'
                    ],
                    exampleRows: [
                        {
                            agreementNumber: 'PA-001',
                            clientName: 'John Doe',
                            projectName: 'Project Alpha',
                            UnitNames: 'Unit 201, Unit 202',
                            issueDate: '2024-01-01',
                            status: 'Active',
                            description: 'Unit purchase agreement',
                            listPrice: '1250000',
                            customerDiscount: '50000',
                            floorDiscount: '25000',
                            lumpSumDiscount: '0',
                            miscDiscount: '0',
                            sellingPrice: '1175000',
                            rebateAmount: '0',
                            rebateBrokerName: '',
                            listPriceCategoryName: 'Project Listed Income',
                            customerDiscountCategoryName: 'Customer Discount',
                            floorDiscountCategoryName: 'Floor Discount',
                            lumpSumDiscountCategoryName: 'Lump Sum Discount',
                            miscDiscountCategoryName: 'Misc Discount',
                            sellingPriceCategoryName: 'Unit Selling Income',
                            rebateCategoryName: 'Broker Fee',
                            cancellationDetails: ''
                        }
                    ]
                }];

            case ImportType.CONTRACTS:
                return [{
                    sheetName: 'Contracts',
                    headers: ['contractNumber', 'name', 'projectName', 'vendorName', 'totalAmount', 'startDate', 'endDate', 'status', 'description'],
                    exampleRows: [
                        { contractNumber: 'CNT-001', name: 'Construction Contract', projectName: 'Project Alpha', vendorName: 'ABC Company', totalAmount: '1000000', startDate: '2024-01-01', endDate: '2024-12-31', status: 'Active', description: 'Main construction contract' }
                    ]
                }];

            case ImportType.INVOICES:
                return [{
                    sheetName: 'Invoices',
                    headers: ['invoiceNumber', 'contactName', 'amount', 'issueDate', 'dueDate', 'invoiceType', 'description', 'categoryName', 'projectName', 'buildingName', 'propertyName', 'unitName', 'agreementNumber', 'securityDepositCharge', 'serviceCharges', 'rentalMonth'],
                    exampleRows: [
                        { invoiceNumber: 'INV-001', contactName: 'Tenant One', amount: '10000', issueDate: '2024-01-01', dueDate: '2024-01-31', invoiceType: 'Rental', description: 'Monthly rent', categoryName: 'Rent Income', projectName: '', buildingName: 'Building A', propertyName: 'Property 101', unitName: '', agreementNumber: 'RA-001', securityDepositCharge: '0', serviceCharges: '0', rentalMonth: '' },
                        { invoiceNumber: 'INV-002', contactName: 'Client One', amount: '250000', issueDate: '2024-01-01', dueDate: '2024-01-31', invoiceType: 'Installment', description: 'Project installment', categoryName: 'Unit Selling Income', projectName: 'Project Alpha', buildingName: '', propertyName: '', unitName: 'Unit 201', agreementNumber: 'PA-001', securityDepositCharge: '0', serviceCharges: '0', rentalMonth: '' }
                    ]
                }];

            case ImportType.BILLS:
                return [{
                    sheetName: 'Bills',
                    headers: ['billNumber', 'contactName', 'amount', 'issueDate', 'dueDate', 'description', 'categoryName', 'projectName', 'contractNumber'],
                    exampleRows: [
                        { billNumber: 'BILL-001', contactName: 'ABC Company', amount: '5000', issueDate: '2024-01-01', dueDate: '2024-01-31', description: 'Material purchase', categoryName: 'Material Expense', projectName: 'Project Alpha', contractNumber: '' }
                    ]
                }];

            case ImportType.PROJECT_BILLS:
                return [{
                    sheetName: 'ProjectBills',
                    headers: [
                        'billNumber',
                        'contactName',
                        'categoryName',
                        'projectName',
                        'contractNumber',
                        'agreementNumber',
                        'amount',
                        'issueDate',
                        'dueDate',
                        'description'
                    ],
                    exampleRows: [
                        {
                            billNumber: 'PBILL-001',
                            contactName: 'ABC Company',
                            categoryName: 'Material Expense',
                            projectName: 'Project Alpha',
                            contractNumber: 'CNT-001',
                            agreementNumber: '',
                            amount: '5000',
                            issueDate: '2024-01-01',
                            dueDate: '2024-01-31',
                            description: 'Material purchase (Project)'
                        }
                    ]
                }];

            case ImportType.RENTAL_BILLS:
                return [{
                    sheetName: 'RentalBills',
                    headers: [
                        'billNumber',
                        'contactName',
                        'categoryName',
                        'buildingName',
                        'propertyName',
                        'staffName',
                        'amount',
                        'issueDate',
                        'dueDate',
                        'description'
                    ],
                    exampleRows: [
                        {
                            billNumber: 'RBILL-001',
                            contactName: 'XYZ Services',
                            categoryName: 'Maintenance Expense',
                            buildingName: 'Building A',
                            propertyName: '',
                            staffName: '',
                            amount: '1200',
                            issueDate: '2024-01-05',
                            dueDate: '2024-01-31',
                            description: 'Maintenance bill (Rental)'
                        }
                    ]
                }];

            case ImportType.PAYMENTS:
                return [{
                    sheetName: 'Transactions',
                    headers: ['type', 'amount', 'date', 'description', 'accountName', 'fromAccountName', 'toAccountName', 'contactName', 'categoryName', 'projectName', 'buildingName', 'propertyName', 'unitName', 'contractNumber', 'agreementNumber', 'invoiceNumber', 'billNumber', 'subtype'],
                    exampleRows: [
                        { type: 'Income', amount: '10000', date: '2024-01-05', description: 'Rent payment', accountName: 'Bank Account', fromAccountName: '', toAccountName: '', contactName: 'Tenant One', categoryName: '', projectName: '', buildingName: 'Building A', propertyName: 'Property 101', unitName: '', contractNumber: '', agreementNumber: 'RA-001', invoiceNumber: 'INV-001', billNumber: '', subtype: '' },
                        { type: 'Expense', amount: '5000', date: '2024-01-10', description: 'Material payment', accountName: 'Bank Account', fromAccountName: '', toAccountName: '', contactName: 'ABC Company', categoryName: 'Material Expense', projectName: 'Project Alpha', buildingName: '', propertyName: '', unitName: '', contractNumber: 'CTR-001', agreementNumber: '', invoiceNumber: '', billNumber: 'BILL-001', subtype: '' },
                        { type: 'Income', amount: '2000', date: '2024-01-15', description: 'Misc income', accountName: 'Cash Account', fromAccountName: '', toAccountName: '', contactName: '', categoryName: 'Other Income', projectName: '', buildingName: '', propertyName: '', unitName: '', contractNumber: '', agreementNumber: '', invoiceNumber: '', billNumber: '', subtype: '' },
                        { type: 'Transfer', amount: '10000', date: '2024-01-20', description: 'Cash deposit', accountName: '', fromAccountName: 'Cash Account', toAccountName: 'Bank Account', contactName: '', categoryName: '', projectName: '', buildingName: '', propertyName: '', unitName: '', contractNumber: '', agreementNumber: '', invoiceNumber: '', billNumber: '', subtype: '' },
                        { type: 'Loan', amount: '50000', date: '2024-01-25', description: 'Loan received', accountName: 'Bank Account', fromAccountName: '', toAccountName: '', contactName: 'Abdul Haq', categoryName: '', projectName: '', buildingName: '', propertyName: '', unitName: '', contractNumber: '', agreementNumber: '', invoiceNumber: '', billNumber: '', subtype: 'Receive Loan' }
                    ]
                }];

            case ImportType.RENTAL_INVOICE_PAYMENTS:
                return [{
                    sheetName: 'RentalInvoicePayments',
                    headers: ['invoiceNumber', 'accountName', 'amount', 'date', 'description', 'contactName', 'categoryName', 'projectName', 'buildingName', 'propertyName', 'unitName', 'contractNumber', 'agreementNumber'],
                    exampleRows: [
                        { invoiceNumber: 'INV-RENT-001', accountName: 'Bank Account', amount: '10000', date: '2024-01-05', description: 'Rental invoice payment', contactName: 'Tenant One', categoryName: '', projectName: '', buildingName: 'Building A', propertyName: 'Property 101', unitName: '', contractNumber: '', agreementNumber: 'RA-001' }
                    ]
                }];

            case ImportType.PROJECT_INVOICE_PAYMENTS:
                return [{
                    sheetName: 'ProjectInvoicePayments',
                    headers: ['invoiceNumber', 'accountName', 'amount', 'date', 'description', 'contactName', 'categoryName', 'projectName', 'buildingName', 'propertyName', 'unitName', 'contractNumber', 'agreementNumber'],
                    exampleRows: [
                        { invoiceNumber: 'INV-PROJ-001', accountName: 'Bank Account', amount: '250000', date: '2024-01-05', description: 'Project installment payment', contactName: 'Client One', categoryName: '', projectName: 'Project Alpha', buildingName: '', propertyName: '', unitName: 'Unit 201', contractNumber: '', agreementNumber: 'PA-001' }
                    ]
                }];

            case ImportType.RENTAL_BILL_PAYMENTS:
                return [{
                    sheetName: 'RentalBillPayments',
                    headers: ['billNumber', 'accountName', 'amount', 'date', 'description', 'contactName', 'categoryName', 'projectName', 'buildingName', 'propertyName', 'unitName', 'contractNumber', 'agreementNumber'],
                    exampleRows: [
                        { billNumber: 'RBILL-001', accountName: 'Bank Account', amount: '1200', date: '2024-01-10', description: 'Rental bill payment', contactName: 'XYZ Services', categoryName: 'Maintenance Expense', projectName: '', buildingName: 'Building A', propertyName: 'Property 101', unitName: '', contractNumber: '', agreementNumber: '' }
                    ]
                }];

            case ImportType.PROJECT_BILL_PAYMENTS:
                return [{
                    sheetName: 'ProjectBillPayments',
                    headers: ['billNumber', 'accountName', 'amount', 'date', 'description', 'contactName', 'categoryName', 'projectName', 'buildingName', 'propertyName', 'unitName', 'contractNumber', 'agreementNumber'],
                    exampleRows: [
                        { billNumber: 'PBILL-001', accountName: 'Bank Account', amount: '5000', date: '2024-01-10', description: 'Project bill payment', contactName: 'ABC Company', categoryName: 'Material Expense', projectName: 'Project Alpha', buildingName: '', propertyName: '', unitName: '', contractNumber: 'CTR-001', agreementNumber: 'PA-001' }
                    ]
                }];

            case ImportType.LOAN_TRANSACTIONS:
                return [{
                    sheetName: 'LoanTransactions',
                    headers: ['subtype', 'accountName', 'contactName', 'amount', 'date', 'description', 'categoryName', 'projectName', 'buildingName', 'propertyName', 'unitName', 'contractNumber', 'agreementNumber'],
                    exampleRows: [
                        { subtype: 'Receive Loan', accountName: 'Bank Account', contactName: 'Abdul Haq', amount: '50000', date: '2024-01-03', description: 'Loan received', categoryName: '', projectName: '', buildingName: '', propertyName: '', unitName: '', contractNumber: '', agreementNumber: '' }
                    ]
                }];

            case ImportType.EQUITY_TRANSACTIONS:
                return [{
                    sheetName: 'EquityTransactions',
                    headers: ['fromAccountName', 'toAccountName', 'amount', 'date', 'description', 'projectName', 'projectId'],
                    exampleRows: [
                        { fromAccountName: 'Investor Equity', toAccountName: 'Bank Account', amount: '50000', date: '2024-01-02', description: 'Investment', projectName: 'Project Alpha', projectId: '' }
                    ]
                }];

            case ImportType.TRANSFER_TRANSACTIONS:
                return [{
                    sheetName: 'TransferTransactions',
                    headers: ['fromAccountName', 'toAccountName', 'amount', 'date', 'description'],
                    exampleRows: [
                        { fromAccountName: 'Cash Account', toAccountName: 'Bank Account', amount: '10000', date: '2024-01-02', description: 'Cash deposit' }
                    ]
                }];

            case ImportType.INCOME_TRANSACTIONS:
                return [{
                    sheetName: 'IncomeTransactions',
                    headers: ['accountName', 'amount', 'date', 'description', 'contactName', 'categoryName', 'projectName', 'buildingName', 'propertyName', 'unitName', 'contractNumber', 'agreementNumber'],
                    exampleRows: [
                        { accountName: 'Cash Account', amount: '2000', date: '2024-01-15', description: 'Misc income (no invoice)', contactName: '', categoryName: 'Other Income', projectName: 'Project Alpha', buildingName: '', propertyName: '', unitName: '', contractNumber: '', agreementNumber: '' }
                    ]
                }];

            case ImportType.EXPENSE_TRANSACTIONS:
                return [{
                    sheetName: 'ExpenseTransactions',
                    headers: ['accountName', 'amount', 'date', 'description', 'contactName', 'categoryName', 'projectName', 'buildingName', 'propertyName', 'unitName', 'contractNumber', 'agreementNumber'],
                    exampleRows: [
                        { accountName: 'Cash Account', amount: '500', date: '2024-01-16', description: 'Misc expense (no bill)', contactName: '', categoryName: 'Other Expense', projectName: '', buildingName: '', propertyName: '', unitName: '', contractNumber: '', agreementNumber: '' }
                    ]
                }];

            case ImportType.RECURRING_TEMPLATES:
                return [{
                    sheetName: 'RecurringTemplates',
                    headers: ['contactName', 'propertyName', 'amount', 'descriptionTemplate', 'dayOfMonth', 'nextDueDate', 'active', 'agreementNumber'],
                    exampleRows: [
                        { contactName: 'Tenant One', propertyName: 'Property 101', amount: '10000', descriptionTemplate: 'Monthly rent for {month}', dayOfMonth: '5', nextDueDate: '2024-02-05', active: 'true', agreementNumber: 'RA-001' }
                    ]
                }];

            case ImportType.BUDGETS:
                return [{
                    sheetName: 'Budgets',
                    headers: ['categoryName', 'projectName', 'amount'],
                    exampleRows: [
                        { categoryName: 'Material Expense', projectName: '', amount: '50000' },
                        { categoryName: 'Labor Expense', projectName: 'Project A', amount: '30000' }
                    ]
                }];

            default:
                return [];
        }
    };

    const templateData = getTemplateData();

    if (templateData.length === 0) {
        // For full import, create a comprehensive template
        const allSheets = [
            { sheetName: 'Accounts', headers: ['name', 'type', 'balance', 'description'] },
            { sheetName: 'Contacts', headers: ['name', 'type', 'description', 'contactNo', 'companyName', 'address'] },
            { sheetName: 'Categories', headers: ['name', 'type', 'description'] },
            { sheetName: 'Projects', headers: ['name', 'description', 'color', 'status'] },
            { sheetName: 'Buildings', headers: ['name', 'description', 'color'] },
            { sheetName: 'Properties', headers: ['name', 'ownerName', 'buildingName', 'description', 'monthlyServiceCharge'] },
            { sheetName: 'Units', headers: ['name', 'projectName', 'ownerName', 'salePrice', 'description'] },
            { sheetName: 'RentalAgreements', headers: ['agreementNumber', 'tenantName', 'propertyName', 'startDate', 'endDate', 'monthlyRent', 'rentDueDate'] },
            { sheetName: 'ProjectAgreements', headers: ['agreementNumber', 'clientName', 'projectName', 'sellingPrice', 'issueDate'] },
            { sheetName: 'Invoices', headers: ['invoiceNumber', 'contactName', 'amount', 'issueDate', 'dueDate', 'invoiceType'] },
            { sheetName: 'Bills', headers: ['billNumber', 'contactName', 'amount', 'issueDate', 'dueDate', 'description'] },
            { sheetName: 'Transactions', headers: ['type', 'amount', 'date', 'description', 'accountName', 'invoiceNumber', 'billNumber'] }
        ];

        allSheets.forEach(({ sheetName, headers }) => {
            const worksheet = XLSX.utils.aoa_to_sheet([headers]);
            XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        });
    } else {
        templateData.forEach(({ sheetName, headers, exampleRows }) => {
            // Create worksheet with headers and example rows
            const data = [headers, ...exampleRows.map(row => headers.map(h => row[h] || ''))];
            const worksheet = XLSX.utils.aoa_to_sheet(data);
            XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        });
    }

    // Generate filename based on import type
    const typeName = importType === ImportType.FULL ? 'Full' :
        importType.charAt(0).toUpperCase() + importType.slice(1).replace(/_/g, '-');
    const filename = `import-template-${typeName.toLowerCase()}.xlsx`;

    XLSX.writeFile(workbook, filename);
};

// Separate import functions for each type
export const runImportAccounts = async (
    sheets: { [key: string]: any[] },
    originalState: AppState,
    dispatch: Dispatch<AppAction>,
    progress: ProgressReporter,
    onLog: LogFunction
): Promise<{ success: number; skipped: number; errors: number }> => {
    const filteredSheets: { [key: string]: any[] } = {
        Accounts: sheets.Accounts || []
    };
    return runImportProcess(filteredSheets, originalState, dispatch, progress, onLog, ImportType.ACCOUNTS);
};

export const runImportContacts = async (
    sheets: { [key: string]: any[] },
    originalState: AppState,
    dispatch: Dispatch<AppAction>,
    progress: ProgressReporter,
    onLog: LogFunction
): Promise<{ success: number; skipped: number; errors: number }> => {
    const filteredSheets: { [key: string]: any[] } = {
        Contacts: sheets.Contacts || []
    };
    return runImportProcess(filteredSheets, originalState, dispatch, progress, onLog, ImportType.CONTACTS);
};

export const runImportVendors = async (
    sheets: { [key: string]: any[] },
    originalState: AppState,
    dispatch: Dispatch<AppAction>,
    progress: ProgressReporter,
    onLog: LogFunction
): Promise<{ success: number; skipped: number; errors: number }> => {
    // Vendors are contacts with type VENDOR, so use contacts import
    const filteredSheets: { [key: string]: any[] } = {
        Contacts: sheets.Contacts || []
    };
    return runImportProcess(filteredSheets, originalState, dispatch, progress, onLog, ImportType.VENDORS);
};

export const runImportCategories = async (
    sheets: { [key: string]: any[] },
    originalState: AppState,
    dispatch: Dispatch<AppAction>,
    progress: ProgressReporter,
    onLog: LogFunction
): Promise<{ success: number; skipped: number; errors: number }> => {
    const filteredSheets: { [key: string]: any[] } = {
        Categories: sheets.Categories || []
    };
    return runImportProcess(filteredSheets, originalState, dispatch, progress, onLog, ImportType.CATEGORIES);
};

export const runImportProjects = async (
    sheets: { [key: string]: any[] },
    originalState: AppState,
    dispatch: Dispatch<AppAction>,
    progress: ProgressReporter,
    onLog: LogFunction
): Promise<{ success: number; skipped: number; errors: number }> => {
    const filteredSheets: { [key: string]: any[] } = {
        Projects: sheets.Projects || []
    };
    return runImportProcess(filteredSheets, originalState, dispatch, progress, onLog, ImportType.PROJECTS);
};

export const runImportBuildings = async (
    sheets: { [key: string]: any[] },
    originalState: AppState,
    dispatch: Dispatch<AppAction>,
    progress: ProgressReporter,
    onLog: LogFunction
): Promise<{ success: number; skipped: number; errors: number }> => {
    const filteredSheets: { [key: string]: any[] } = {
        Buildings: sheets.Buildings || []
    };
    return runImportProcess(filteredSheets, originalState, dispatch, progress, onLog, ImportType.BUILDINGS);
};

export const runImportProperties = async (
    sheets: { [key: string]: any[] },
    originalState: AppState,
    dispatch: Dispatch<AppAction>,
    progress: ProgressReporter,
    onLog: LogFunction
): Promise<{ success: number; skipped: number; errors: number }> => {
    const filteredSheets: { [key: string]: any[] } = {
        Properties: sheets.Properties || []
    };
    return runImportProcess(filteredSheets, originalState, dispatch, progress, onLog, ImportType.PROPERTIES);
};

export const runImportUnits = async (
    sheets: { [key: string]: any[] },
    originalState: AppState,
    dispatch: Dispatch<AppAction>,
    progress: ProgressReporter,
    onLog: LogFunction
): Promise<{ success: number; skipped: number; errors: number }> => {
    const filteredSheets: { [key: string]: any[] } = {
        Units: sheets.Units || []
    };
    return runImportProcess(filteredSheets, originalState, dispatch, progress, onLog, ImportType.UNITS);
};

export const runImportAgreements = async (
    sheets: { [key: string]: any[] },
    originalState: AppState,
    dispatch: Dispatch<AppAction>,
    progress: ProgressReporter,
    onLog: LogFunction
): Promise<{ success: number; skipped: number; errors: number }> => {
    const filteredSheets: { [key: string]: any[] } = {
        RentalAgreements: sheets.RentalAgreements || [],
        ProjectAgreements: sheets.ProjectAgreements || []
    };
    return runImportProcess(filteredSheets, originalState, dispatch, progress, onLog, ImportType.AGREEMENTS);
};

export const runImportRentalAgreements = async (
    sheets: { [key: string]: any[] },
    originalState: AppState,
    dispatch: Dispatch<AppAction>,
    progress: ProgressReporter,
    onLog: LogFunction
): Promise<{ success: number; skipped: number; errors: number }> => {
    // Pass full workbook sheets; ImportType.RENTAL_AGREEMENTS ensures ONLY RentalAgreements is processed.
    // This also preserves our tolerant sheet-name matching (spaces/underscores/case-insensitive).
    return runImportProcess(sheets, originalState, dispatch, progress, onLog, ImportType.RENTAL_AGREEMENTS);
};

export const runImportProjectAgreements = async (
    sheets: { [key: string]: any[] },
    originalState: AppState,
    dispatch: Dispatch<AppAction>,
    progress: ProgressReporter,
    onLog: LogFunction
): Promise<{ success: number; skipped: number; errors: number }> => {
    // Pass full workbook sheets; ImportType.PROJECT_AGREEMENTS ensures ONLY ProjectAgreements is processed.
    // This also preserves our tolerant sheet-name matching (spaces/underscores/case-insensitive).
    return runImportProcess(sheets, originalState, dispatch, progress, onLog, ImportType.PROJECT_AGREEMENTS);
};

export const runImportContracts = async (
    sheets: { [key: string]: any[] },
    originalState: AppState,
    dispatch: Dispatch<AppAction>,
    progress: ProgressReporter,
    onLog: LogFunction
): Promise<{ success: number; skipped: number; errors: number }> => {
    const filteredSheets: { [key: string]: any[] } = {
        Contracts: sheets.Contracts || []
    };
    return runImportProcess(filteredSheets, originalState, dispatch, progress, onLog, ImportType.CONTRACTS);
};

export const runImportInvoices = async (
    sheets: { [key: string]: any[] },
    originalState: AppState,
    dispatch: Dispatch<AppAction>,
    progress: ProgressReporter,
    onLog: LogFunction
): Promise<{ success: number; skipped: number; errors: number }> => {
    const filteredSheets: { [key: string]: any[] } = {
        Invoices: sheets.Invoices || []
    };
    return runImportProcess(filteredSheets, originalState, dispatch, progress, onLog, ImportType.INVOICES);
};

export const runImportBills = async (
    sheets: { [key: string]: any[] },
    originalState: AppState,
    dispatch: Dispatch<AppAction>,
    progress: ProgressReporter,
    onLog: LogFunction
): Promise<{ success: number; skipped: number; errors: number }> => {
    const filteredSheets: { [key: string]: any[] } = {
        Bills: sheets.Bills || []
    };
    return runImportProcess(filteredSheets, originalState, dispatch, progress, onLog, ImportType.BILLS);
};

export const runImportProjectBills = async (
    sheets: { [key: string]: any[] },
    originalState: AppState,
    dispatch: Dispatch<AppAction>,
    progress: ProgressReporter,
    onLog: LogFunction
): Promise<{ success: number; skipped: number; errors: number }> => {
    // Pass full workbook; ImportType.PROJECT_BILLS ensures ONLY ProjectBills is processed.
    return runImportProcess(sheets, originalState, dispatch, progress, onLog, ImportType.PROJECT_BILLS);
};

export const runImportRentalBills = async (
    sheets: { [key: string]: any[] },
    originalState: AppState,
    dispatch: Dispatch<AppAction>,
    progress: ProgressReporter,
    onLog: LogFunction
): Promise<{ success: number; skipped: number; errors: number }> => {
    // Pass full workbook; ImportType.RENTAL_BILLS ensures ONLY RentalBills is processed.
    return runImportProcess(sheets, originalState, dispatch, progress, onLog, ImportType.RENTAL_BILLS);
};

export const runImportPayments = async (
    sheets: { [key: string]: any[] },
    originalState: AppState,
    dispatch: Dispatch<AppAction>,
    progress: ProgressReporter,
    onLog: LogFunction
): Promise<{ success: number; skipped: number; errors: number }> => {
    const filteredSheets: { [key: string]: any[] } = {
        Transactions: sheets.Transactions || []
    };
    return runImportProcess(filteredSheets, originalState, dispatch, progress, onLog, ImportType.PAYMENTS);
};

// --- Split Transactions Imports (all read from their own sheets) ---
export const runImportRentalInvoicePayments = async (
    sheets: { [key: string]: any[] },
    originalState: AppState,
    dispatch: Dispatch<AppAction>,
    progress: ProgressReporter,
    onLog: LogFunction
): Promise<{ success: number; skipped: number; errors: number }> =>
    runImportProcess(sheets, originalState, dispatch, progress, onLog, ImportType.RENTAL_INVOICE_PAYMENTS);

export const runImportProjectInvoicePayments = async (
    sheets: { [key: string]: any[] },
    originalState: AppState,
    dispatch: Dispatch<AppAction>,
    progress: ProgressReporter,
    onLog: LogFunction
): Promise<{ success: number; skipped: number; errors: number }> =>
    runImportProcess(sheets, originalState, dispatch, progress, onLog, ImportType.PROJECT_INVOICE_PAYMENTS);

export const runImportRentalBillPayments = async (
    sheets: { [key: string]: any[] },
    originalState: AppState,
    dispatch: Dispatch<AppAction>,
    progress: ProgressReporter,
    onLog: LogFunction
): Promise<{ success: number; skipped: number; errors: number }> =>
    runImportProcess(sheets, originalState, dispatch, progress, onLog, ImportType.RENTAL_BILL_PAYMENTS);

export const runImportProjectBillPayments = async (
    sheets: { [key: string]: any[] },
    originalState: AppState,
    dispatch: Dispatch<AppAction>,
    progress: ProgressReporter,
    onLog: LogFunction
): Promise<{ success: number; skipped: number; errors: number }> =>
    runImportProcess(sheets, originalState, dispatch, progress, onLog, ImportType.PROJECT_BILL_PAYMENTS);

export const runImportLoanTransactions = async (
    sheets: { [key: string]: any[] },
    originalState: AppState,
    dispatch: Dispatch<AppAction>,
    progress: ProgressReporter,
    onLog: LogFunction
): Promise<{ success: number; skipped: number; errors: number }> =>
    runImportProcess(sheets, originalState, dispatch, progress, onLog, ImportType.LOAN_TRANSACTIONS);

export const runImportEquityTransactions = async (
    sheets: { [key: string]: any[] },
    originalState: AppState,
    dispatch: Dispatch<AppAction>,
    progress: ProgressReporter,
    onLog: LogFunction
): Promise<{ success: number; skipped: number; errors: number }> =>
    runImportProcess(sheets, originalState, dispatch, progress, onLog, ImportType.EQUITY_TRANSACTIONS);

export const runImportTransferTransactions = async (
    sheets: { [key: string]: any[] },
    originalState: AppState,
    dispatch: Dispatch<AppAction>,
    progress: ProgressReporter,
    onLog: LogFunction
): Promise<{ success: number; skipped: number; errors: number }> =>
    runImportProcess(sheets, originalState, dispatch, progress, onLog, ImportType.TRANSFER_TRANSACTIONS);

export const runImportIncomeTransactions = async (
    sheets: { [key: string]: any[] },
    originalState: AppState,
    dispatch: Dispatch<AppAction>,
    progress: ProgressReporter,
    onLog: LogFunction
): Promise<{ success: number; skipped: number; errors: number }> =>
    runImportProcess(sheets, originalState, dispatch, progress, onLog, ImportType.INCOME_TRANSACTIONS);

export const runImportExpenseTransactions = async (
    sheets: { [key: string]: any[] },
    originalState: AppState,
    dispatch: Dispatch<AppAction>,
    progress: ProgressReporter,
    onLog: LogFunction
): Promise<{ success: number; skipped: number; errors: number }> =>
    runImportProcess(sheets, originalState, dispatch, progress, onLog, ImportType.EXPENSE_TRANSACTIONS);

export const runImportRecurringTemplates = async (
    sheets: { [key: string]: any[] },
    originalState: AppState,
    dispatch: Dispatch<AppAction>,
    progress: ProgressReporter,
    onLog: LogFunction
): Promise<{ success: number; skipped: number; errors: number }> => {
    const filteredSheets: { [key: string]: any[] } = {
        RecurringTemplates: sheets.RecurringTemplates || []
    };
    return runImportProcess(filteredSheets, originalState, dispatch, progress, onLog, ImportType.RECURRING_TEMPLATES);
};


export const runImportBudgets = async (
    sheets: { [key: string]: any[] },
    originalState: AppState,
    dispatch: Dispatch<AppAction>,
    progress: ProgressReporter,
    onLog: LogFunction
): Promise<{ success: number; skipped: number; errors: number }> => {
    const filteredSheets: { [key: string]: any[] } = {
        Budgets: sheets.Budgets || []
    };
    return runImportProcess(filteredSheets, originalState, dispatch, progress, onLog, ImportType.BUDGETS);
};

export const runImportProcess = async (
    sheets: { [key: string]: any[] },
    originalState: AppState,
    dispatch: Dispatch<AppAction>,
    progress: ProgressReporter,
    onLog: LogFunction,
    importType: ImportType = ImportType.FULL
): Promise<{ success: number; skipped: number; errors: number; corrections: CorrectionRequest[] }> => {

    const tempState: AppState = JSON.parse(JSON.stringify(originalState));
    let summary = { success: 0, skipped: 0, errors: 0, corrections: [] as CorrectionRequest[] }; // corrections kept for backward compatibility but not used

    const log = (sheet: string, row: number, status: 'Success' | 'Skipped' | 'Error' | 'Warning', message: string, data?: any) => {
        const rowNum = (row || 0) + 2;
        onLog({ timestamp: new Date().toISOString(), sheet, row: rowNum, status, message, data });
        if (status === 'Success') summary.success++;
        else if (status === 'Skipped') summary.skipped++;
        else if (status === 'Error') {
            summary.errors++;
        }
    };

    // Helper to find similar names for suggestions
    const findSimilarNames = (searchTerm: string, map: Map<string, string>, limit: number = 5): string[] => {
        if (!searchTerm) return [];
        const normalizedSearch = normalizeNameForComparison(searchTerm);
        const suggestions: string[] = [];
        // Map keys are already normalized, but we normalize again to ensure consistency
        for (const [mapKey] of map.entries()) {
            const normalizedKey = normalizeNameForComparison(String(mapKey));
            // Use includes for partial matching (suggestions)
            if (normalizedKey.includes(normalizedSearch) || normalizedSearch.includes(normalizedKey)) {
                // Return the original contact/building name from tempState, not the map key
                // We need to find the original name that corresponds to this map key
                suggestions.push(String(mapKey)); // Map key might be normalized, but we'll use it
                if (suggestions.length >= limit) break;
            }
        }
        return suggestions;
    };

    // Lookup Maps (Name -> ID)
    // Use normalizeNameForComparison to ensure consistent key formatting
    const maps = {
        accounts: new Map(tempState.accounts.map(i => [normalizeNameForComparison(i.name), i.id])),
        contacts: new Map(tempState.contacts.map(i => [normalizeNameForComparison(i.name), i.id])),
        projects: new Map(tempState.projects.map(i => [normalizeNameForComparison(i.name), i.id])),
        categories: new Map(tempState.categories.map(i => [normalizeNameForComparison(i.name), i.id])),
        buildings: new Map(tempState.buildings.map(i => [normalizeNameForComparison(i.name), i.id])),
        properties: new Map(tempState.properties.map(i => [normalizeNameForComparison(i.name), i.id])),
        units: new Map(tempState.units.map(i => [normalizeNameForComparison(i.name), i.id])),
        rentalAgreements: new Map(tempState.rentalAgreements.map(i => [normalizeNameForComparison(i.agreementNumber), i.id])),
        projectAgreements: new Map(tempState.projectAgreements.map(i => [normalizeNameForComparison(i.agreementNumber), i.id])),
        invoices: new Map(tempState.invoices.map(i => [normalizeNameForComparison(i.invoiceNumber), i.id])),
        bills: new Map(tempState.bills.map(i => [normalizeNameForComparison(i.billNumber), i.id])),
        contracts: new Map((tempState.contracts || []).map(i => [normalizeNameForComparison(i.contractNumber), i.id])),
        vendors: new Map((tempState.vendors || []).map(i => [normalizeNameForComparison(i.name), i.id])),
    };

    // Track transaction IDs for duplicate detection
    const transactionIds = new Set<string>(
        tempState.transactions
            .map(tx => {
                // Generate transaction ID from invoice/bill if available
                if (tx.type === TransactionType.INCOME && tx.invoiceId) {
                    const inv = tempState.invoices.find(i => i.id === tx.invoiceId);
                    if (inv) return generateTransactionId('invoice', inv.invoiceNumber, inv.id);
                    // If invoice not found, treat as standalone
                    return generateStandaloneTransactionId(tx.type, tx.id);
                }
                if (tx.type === TransactionType.EXPENSE && tx.billId) {
                    const bill = tempState.bills.find(b => b.id === tx.billId);
                    if (bill) return generateTransactionId('bill', bill.billNumber, bill.id);
                    // If bill not found, treat as standalone
                    return generateStandaloneTransactionId(tx.type, tx.id);
                }
                // Standalone transaction (no invoice/bill)
                if (tx.type === TransactionType.INCOME || tx.type === TransactionType.EXPENSE) {
                    return generateStandaloneTransactionId(tx.type, tx.id);
                }
                return tx.id; // For other types like TRANSFER, LOAN, etc.
            })
    );

    // Helper to resolve ID from multiple potential column names
    // Uses normalizeNameForComparison to ensure consistent case-insensitive matching with map keys
    const resolveId = (map: Map<string, string>, row: any, ...keys: string[]): string | undefined => {
        for (const key of keys) {
            const value = row[key];
            // Check for null, undefined, or empty string
            if (value === null || value === undefined || value === '') {
                continue;
            }

            // Convert to string and trim whitespace
            let rawValue = String(value);
            rawValue = rawValue.trim();

            // Skip if empty after trimming
            if (!rawValue) {
                continue;
            }

            // Normalize the input value for case-insensitive comparison
            // This handles any case/spacing variations: "Abdul Haq", "abdul haq", "ABDUL HAQ" all become "abdul haq"
            const normalizedVal = normalizeNameForComparison(rawValue);

            // Skip if normalization resulted in empty string
            if (!normalizedVal) {
                continue;
            }

            // First try: Direct map lookup - map keys are already normalized when map was created
            if (map.has(normalizedVal)) {
                const foundId = map.get(normalizedVal);
                if (foundId) {
                    return foundId;
                }
            }

            // Second try: Iterate through all map entries and compare
            // Map keys are already normalized, so we can compare directly
            for (const [mapKey, mapId] of map.entries()) {
                if (!mapKey || !mapId) continue;

                // Map keys are already normalized when map was created
                // So we can compare directly (both should be lowercase, trimmed, space-normalized)
                if (String(mapKey) === normalizedVal) {
                    return mapId;
                }

                // Fallback: Normalize both sides again just to be absolutely sure
                // This handles any edge cases where normalization might differ
                const normalizedMapKey = normalizeNameForComparison(String(mapKey));
                if (normalizedMapKey === normalizedVal) {
                    return mapId;
                }
            }
        }
        return undefined;
    };

    // Allowed columns per sheet for schema compatibility checks (friendly headers used in import)
    // Use allowedColumns from import schemas - this ensures consistency between export and import
    const allowedColumns: Record<string, Set<string>> = {};
    Object.entries(IMPORT_SCHEMAS).forEach(([sheetName, schema]) => {
        allowedColumns[sheetName] = schema.allowedFields;
    });

    const normalizeKey = (key: string) => key.toString().trim().replace(/\s+/g, '').replace(/_/g, '').toLowerCase();
    const allowedNormalizedMap: Record<string, Map<string, string>> = {};
    Object.entries(allowedColumns).forEach(([sheet, cols]) => {
        const map = new Map<string, string>();
        cols.forEach(col => map.set(normalizeKey(col), col));
        allowedNormalizedMap[sheet] = map;
    });

    const normalizeRow = (sheet: string, row: any): any => {
        const map = allowedNormalizedMap[sheet];
        if (!map) return row;
        const normalized: any = {};
        Object.entries(row).forEach(([key, value]) => {
            const norm = normalizeKey(key);
            const canonical = map.get(norm) || key;
            // Format text fields: trim and convert to Title Case
            normalized[canonical] = formatTextField(value, canonical, sheet);
        });
        return normalized;
    };

    const checkColumns = (sheet: string, row: any, rowNum: number) => {
        const map = allowedNormalizedMap[sheet];
        if (!map) return; // Unknown sheet, skip
        const invalid = Object.keys(row).filter(k => !map.has(normalizeKey(k)));
        if (invalid.length > 0) {
            const msg = `Unknown columns [${invalid.join(', ')}] in sheet ${sheet} row ${rowNum + 2}. Please correct the Excel headers.`;
            log(sheet, rowNum, 'Error', msg, row);
        }
    };

    // Filter sheets based on import type
    let orderedSheets: string[] = [];
    switch (importType) {
        case ImportType.ACCOUNTS:
            orderedSheets = ['Accounts'];
            break;
        case ImportType.CONTACTS:
        case ImportType.VENDORS:
            orderedSheets = ['Contacts'];
            break;
        case ImportType.CATEGORIES:
            orderedSheets = ['Categories'];
            break;
        case ImportType.PROJECTS:
            orderedSheets = ['Projects'];
            break;
        case ImportType.BUILDINGS:
            orderedSheets = ['Buildings'];
            break;
        case ImportType.PROPERTIES:
            orderedSheets = ['Properties'];
            break;
        case ImportType.UNITS:
            orderedSheets = ['Units'];
            break;
        case ImportType.AGREEMENTS:
            orderedSheets = ['RentalAgreements', 'ProjectAgreements'];
            break;
        case ImportType.RENTAL_AGREEMENTS:
            orderedSheets = ['RentalAgreements'];
            break;
        case ImportType.PROJECT_AGREEMENTS:
            orderedSheets = ['ProjectAgreements'];
            break;
        case ImportType.CONTRACTS:
            orderedSheets = ['Contracts'];
            break;
        case ImportType.INVOICES:
            orderedSheets = ['Invoices'];
            break;
        case ImportType.BILLS:
            orderedSheets = ['Bills'];
            break;
        case ImportType.PROJECT_BILLS:
            orderedSheets = ['ProjectBills'];
            break;
        case ImportType.RENTAL_BILLS:
            orderedSheets = ['RentalBills'];
            break;
        case ImportType.PAYMENTS:
            orderedSheets = ['Transactions'];
            break;
        case ImportType.RENTAL_INVOICE_PAYMENTS:
            orderedSheets = ['RentalInvoicePayments'];
            break;
        case ImportType.PROJECT_INVOICE_PAYMENTS:
            orderedSheets = ['ProjectInvoicePayments'];
            break;
        case ImportType.RENTAL_BILL_PAYMENTS:
            orderedSheets = ['RentalBillPayments'];
            break;
        case ImportType.PROJECT_BILL_PAYMENTS:
            orderedSheets = ['ProjectBillPayments'];
            break;
        case ImportType.LOAN_TRANSACTIONS:
            orderedSheets = ['LoanTransactions'];
            break;
        case ImportType.EQUITY_TRANSACTIONS:
            orderedSheets = ['EquityTransactions'];
            break;
        case ImportType.TRANSFER_TRANSACTIONS:
            orderedSheets = ['TransferTransactions'];
            break;
        case ImportType.INCOME_TRANSACTIONS:
            orderedSheets = ['IncomeTransactions'];
            break;
        case ImportType.EXPENSE_TRANSACTIONS:
            orderedSheets = ['ExpenseTransactions'];
            break;
        case ImportType.RECURRING_TEMPLATES:
            orderedSheets = ['RecurringTemplates'];
            break;
        case ImportType.BUDGETS:
            orderedSheets = ['Budgets'];
            break;
        default:
            // Full import - all sheets in order
            orderedSheets = [
                'Settings', 'Accounts', 'Contacts', 'Categories',
                'Projects', 'Buildings', 'Properties', 'Units',
                'RentalAgreements', 'ProjectAgreements', 'Contracts', 'RecurringTemplates',
                'Invoices',
                'ProjectBills', 'RentalBills', 'Bills',
                'RentalInvoicePayments', 'ProjectInvoicePayments', 'RentalBillPayments', 'ProjectBillPayments',
                'LoanTransactions', 'EquityTransactions', 'TransferTransactions', 'IncomeTransactions', 'ExpenseTransactions',
                'Budgets', 'Transactions'
            ];
    }

    // Normalize sheet-name matching (case/space/underscore-insensitive)
    const normalizeSheetName = (name: string) =>
        String(name || '').trim().replace(/\s+/g, '').replace(/_/g, '').toLowerCase();
    const sheetKeyByNormalizedName = new Map<string, string>();
    Object.keys(sheets || {}).forEach(k => sheetKeyByNormalizedName.set(normalizeSheetName(k), k));
    const getSheetRows = (expectedSheetName: string): any[] | undefined => {
        const actualKey = sheetKeyByNormalizedName.get(normalizeSheetName(expectedSheetName));
        return actualKey ? sheets[actualKey] : undefined;
    };

    for (const sheetName of orderedSheets) {
        const sheetRows = getSheetRows(sheetName);
        if (!sheetRows) {
            // For single-type imports, show a clear error instead of silently doing nothing.
            if (importType !== ImportType.FULL) {
                const available = Object.keys(sheets || {}).join(', ') || '(none)';
                log(
                    'Import',
                    0,
                    'Error',
                    `Missing required sheet "${sheetName}" for this import type.\n` +
                    `Found sheets: ${available}\n` +
                    `💡 Fix: Rename the Excel sheet tab to "${sheetName}" (case-insensitive; spaces/underscores are ignored).`
                );
            }
            continue;
        }

        progress.updateProgress(
            Math.round(orderedSheets.indexOf(sheetName) / orderedSheets.length * 90),
            `Processing: ${sheetName}...`
        );
        await new Promise(res => setTimeout(res, 10));

        for (const [index, rawRow] of sheetRows.entries()) {
            const rowNum = index;
            // Normalize row keys to canonical headers (trim/space/underscore/case-insensitive)
            // Note: normalizeRow also formats text fields to Title Case, but resolveId will normalize for comparison
            const row = normalizeRow(sheetName, rawRow);

            // For reference fields (like ownerName, buildingName), ensure they're normalized for comparison
            // This is a safety measure to ensure consistent comparison
            if (sheetName === 'Properties') {
                if (row.ownerName) row.ownerName = String(row.ownerName).trim();
                if (row.owner) row.owner = String(row.owner).trim();
                if (row.buildingName) row.buildingName = String(row.buildingName).trim();
                if (row.building) row.building = String(row.building).trim();
            }
            try {
                // Schema compatibility check: flag unknown columns for this sheet
                checkColumns(sheetName, row, rowNum);

                // --- SETTINGS ---
                if (sheetName === 'Settings') {
                    if (row.Key && row.Value) {
                        try {
                            const val = safeJsonParse(row.Value);
                            // Only update if parsing was successful or it's a primitive
                            const payload = typeof val !== 'undefined' ? val : row.Value;

                            // Map keys to action types
                            const actionMap: Record<string, string> = {
                                'AgreementSettings': 'UPDATE_AGREEMENT_SETTINGS',
                                'ProjectAgreementSettings': 'UPDATE_PROJECT_AGREEMENT_SETTINGS',
                                'RentalInvoiceSettings': 'UPDATE_RENTAL_INVOICE_SETTINGS',
                                'ProjectInvoiceSettings': 'UPDATE_PROJECT_INVOICE_SETTINGS',
                                'PrintSettings': 'UPDATE_PRINT_SETTINGS',
                                'WhatsAppTemplates': 'UPDATE_WHATSAPP_TEMPLATES',
                                'DashboardConfig': 'UPDATE_DASHBOARD_CONFIG',
                                'InvoiceHtmlTemplate': 'UPDATE_INVOICE_TEMPLATE',
                                'PmCostPercentage': 'UPDATE_PM_COST_PERCENTAGE',
                                'ShowSystemTransactions': 'TOGGLE_SYSTEM_TRANSACTIONS',
                                'EnableColorCoding': 'TOGGLE_COLOR_CODING',
                                'EnableBeepOnSave': 'TOGGLE_BEEP_ON_SAVE',
                                'LastServiceChargeRun': 'SET_LAST_SERVICE_CHARGE_RUN'
                            };

                            if (actionMap[row.Key]) {
                                dispatch({ type: actionMap[row.Key] as any, payload });
                                // Also update tempState to reflect current process context
                                (tempState as any)[row.Key.charAt(0).toLowerCase() + row.Key.slice(1)] = payload;
                                log(sheetName, rowNum, 'Success', `Updated setting: ${row.Key}`);
                            } else if (row.Key === 'InstallmentPlans') {
                                // Handle installment plans array import
                                const plans = safeJsonParse(row.Value);
                                if (Array.isArray(plans)) {
                                    if (!tempState.installmentPlans) {
                                        tempState.installmentPlans = [];
                                    }
                                    plans.forEach((plan: any) => {
                                        if (plan.id && plan.projectId && plan.ownerId) {
                                            const existingPlanIndex = tempState.installmentPlans.findIndex((p: any) => p.id === plan.id);
                                            if (existingPlanIndex >= 0) {
                                                tempState.installmentPlans[existingPlanIndex] = plan;
                                                dispatch({ type: 'UPDATE_INSTALLMENT_PLAN', payload: plan });
                                            } else {
                                                tempState.installmentPlans.push(plan);
                                                dispatch({ type: 'ADD_INSTALLMENT_PLAN', payload: plan });
                                            }
                                        }
                                    });
                                    log(sheetName, rowNum, 'Success', `Imported ${plans.length} installment plans`);
                                }
                            }
                        } catch (e) {
                            log(sheetName, rowNum, 'Error', `Failed to parse setting: ${row.Key}`);
                        }
                    }
                }

                // --- ACCOUNTS ---
                else if (sheetName === 'Accounts') {
                    if (maps.accounts.has(normalizeNameForComparison(row.name))) {
                        log(sheetName, rowNum, 'Skipped', `Duplicate entry: An account with the name "${row.name}" already exists in the system.`, row);
                        continue;
                    }
                    const missing = validateRecord(row, ['name', 'type']);
                    if (missing.length > 0) {
                        const validTypes = Object.values(AccountType).join(', ');
                        const errorMsg = generateErrorWithSuggestions(sheetName, rowNum, row, missing);
                        log(sheetName, rowNum, 'Error', errorMsg + (missing.includes('type') ? `\n   💡 Valid account types are: ${validTypes}` : ''), row);
                        continue;
                    }

                    // Accept both camelCase + TitleCase headers for parent reference
                    const parentId = resolveId(
                        maps.accounts,
                        row,
                        'parentAccountName',
                        'parentAccount',
                        'ParentAccountName',
                        'ParentAccount'
                    );

                    const newAccount: Account = {
                        id: generateImportId('acc', index),
                        name: row.name,
                        type: row.type as AccountType,
                        balance: parseFloat(row.balance) || 0,
                        isPermanent: false,
                        description: row.description,
                        parentAccountId: parentId
                    };
                    tempState.accounts.push(newAccount);
                    maps.accounts.set(normalizeNameForComparison(newAccount.name), newAccount.id);
                    log(sheetName, rowNum, 'Success', `Added Account: ${newAccount.name}`);
                }

                // --- CONTACTS ---
                else if (sheetName === 'Contacts') {
                    const rowTypeLower = String(row.type || '').toLowerCase();
                    const isVendor = rowTypeLower === 'vendor' || rowTypeLower === 'supplier';

                    if (importType === ImportType.VENDORS && !isVendor) {
                        log(sheetName, rowNum, 'Skipped', `Contact type is not a vendor. Only vendors are imported when selecting "Vendors Only" import type.`, row);
                        continue;
                    }

                    if (importType === ImportType.CONTACTS && isVendor) {
                        log(sheetName, rowNum, 'Skipped', `Contact type is a vendor. Use "Vendors Only" import to import vendors.`, row);
                        continue;
                    }

                    const type = normalizeContactType(row.type);
                    if (!type && !isVendor) {
                        const validTypes = Object.values(ContactType).join(', ');
                        const errorMsg = generateErrorWithSuggestions(sheetName, rowNum, row, ['type']);
                        log(sheetName, rowNum, 'Error', errorMsg + `\n   💡 Valid types are: ${validTypes}\n   Common alternatives: "Vendor" (for Supplier), "Friend" or "Family" (for Friend & Family), "Client" (for Owner)`, row);
                        continue;
                    }

                    if (isVendor) {
                        if (maps.vendors.has(normalizeNameForComparison(row.name))) {
                            log(sheetName, rowNum, 'Skipped', `Duplicate entry: A vendor with the name "${row.name}" already exists in the system.`, row);
                            continue;
                        }
                    } else {
                        if (maps.contacts.has(normalizeNameForComparison(row.name))) {
                            log(sheetName, rowNum, 'Skipped', `Duplicate entry: A contact with the name "${row.name}" already exists in the system.`, row);
                            continue;
                        }
                    }

                    const missing = validateRecord(row, ['name']);
                    if (missing.length > 0) {
                        const errorMsg = generateErrorWithSuggestions(sheetName, rowNum, row, missing);
                        log(sheetName, rowNum, 'Error', errorMsg, row);
                        continue;
                    }

                    if (isVendor) {
                        const newVendor: Vendor = {
                            id: generateImportId('ven', index),
                            name: row.name,
                            description: row.description, contactNo: row.contactNo,
                            companyName: row.companyName, address: row.address
                        };
                        (tempState.vendors ||= []);
                        tempState.vendors.push(newVendor);
                        maps.vendors.set(normalizeNameForComparison(newVendor.name), newVendor.id);
                        log(sheetName, rowNum, 'Success', `Added Vendor: ${newVendor.name}`);
                    } else {
                        const newContact: Contact = {
                            id: generateImportId('con', index),
                            name: row.name, type: type!,
                            description: row.description, contactNo: row.contactNo,
                            companyName: row.companyName, address: row.address
                        };
                        tempState.contacts.push(newContact);
                        maps.contacts.set(normalizeNameForComparison(newContact.name), newContact.id);
                        log(sheetName, rowNum, 'Success', `Added Contact: ${newContact.name}`);
                    }
                }

                // --- CATEGORIES ---
                else if (sheetName === 'Categories') {
                    if (maps.categories.has(normalizeNameForComparison(row.name))) {
                        log(sheetName, rowNum, 'Skipped', `Duplicate entry: A category with the name "${row.name}" already exists in the system.`, row);
                        continue;
                    }

                    const missing = validateRecord(row, ['name', 'type']);
                    if (missing.length > 0) {
                        const validTypes = `${TransactionType.INCOME}, ${TransactionType.EXPENSE}`;
                        const errorMsg = generateErrorWithSuggestions(sheetName, rowNum, row, missing);
                        log(sheetName, rowNum, 'Error', errorMsg + (missing.includes('type') ? `\n   💡 Valid category types are: ${validTypes}` : ''), row);
                        continue;
                    }

                    // Accept both camelCase + TitleCase headers for parent reference
                    const parentId = resolveId(
                        maps.categories,
                        row,
                        'parentCategoryName',
                        'parentCategory',
                        'ParentCategoryName',
                        'ParentCategory'
                    );

                    const newCat: Category = {
                        id: generateImportId('cat', index),
                        name: row.name, type: row.type, description: row.description,
                        parentCategoryId: parentId
                    };
                    tempState.categories.push(newCat);
                    maps.categories.set(normalizeNameForComparison(newCat.name), newCat.id);
                    log(sheetName, rowNum, 'Success', `Added Category: ${newCat.name}`);
                }

                // --- PROJECTS ---
                else if (sheetName === 'Projects') {
                    if (maps.projects.has(normalizeNameForComparison(row.name))) {
                        log(sheetName, rowNum, 'Skipped', `Duplicate entry: A project with the name "${row.name}" already exists in the system.`, row);
                        continue;
                    }
                    const missing = validateRecord(row, ['name']);
                    if (missing.length > 0) {
                        const errorMsg = generateErrorWithSuggestions(sheetName, rowNum, row, missing);
                        log(sheetName, rowNum, 'Error', errorMsg, row);
                        continue;
                    }

                    const newProj: Project = {
                        id: generateImportId('proj', index),
                        name: row.name, description: row.description,
                        color: row.color,
                        status: row.status,
                        pmConfig: safeJsonParse(row.pmConfig),
                        installmentConfig: safeJsonParse(row.installmentConfig)
                    };
                    tempState.projects.push(newProj);
                    maps.projects.set(normalizeNameForComparison(newProj.name), newProj.id);
                    log(sheetName, rowNum, 'Success', `Added Project: ${newProj.name}`);
                }

                // --- BUILDINGS ---
                else if (sheetName === 'Buildings') {
                    if (maps.buildings.has(normalizeNameForComparison(row.name))) {
                        log(sheetName, rowNum, 'Skipped', `Duplicate entry: A building with the name "${row.name}" already exists in the system.`, row);
                        continue;
                    }
                    const missing = validateRecord(row, ['name']);
                    if (missing.length > 0) {
                        const errorMsg = generateErrorWithSuggestions(sheetName, rowNum, row, missing);
                        log(sheetName, rowNum, 'Error', errorMsg, row);
                        continue;
                    }

                    const newBldg: Building = {
                        id: generateImportId('bldg', index),
                        name: row.name, description: row.description, color: row.color
                    };
                    tempState.buildings.push(newBldg);
                    maps.buildings.set(normalizeNameForComparison(newBldg.name), newBldg.id);
                    log(sheetName, rowNum, 'Success', `Added Building: ${newBldg.name}`);
                }

                // --- PROPERTIES ---
                else if (sheetName === 'Properties') {
                    if (maps.properties.has(normalizeNameForComparison(row.name))) {
                        log(sheetName, rowNum, 'Skipped', `Duplicate entry: A property with the name "${row.name}" already exists in the system.`, row);
                        continue;
                    }
                    // Excel templates/canonical headers use camelCase (ownerName/buildingName),
                    // but exports and user files may use Title Case (OwnerName/BuildingName) or short names.
                    const ownerId = resolveId(maps.contacts, row, 'ownerName', 'OwnerName', 'owner', 'Owner', 'clientName', 'ClientName');
                    const buildingId = resolveId(maps.buildings, row, 'buildingName', 'BuildingName', 'building', 'Building');

                    const invalidRefs: { field: string; value: string; suggestions?: string[] }[] = [];
                    if (!ownerId) {
                        const ownerValue = row.ownerName || row.OwnerName || row.owner || row.Owner || '';
                        invalidRefs.push({
                            field: 'Owner',
                            value: ownerValue,
                            suggestions: findSimilarNames(ownerValue, maps.contacts)
                        });
                    }
                    if (!buildingId) {
                        const buildingValue = row.buildingName || row.BuildingName || row.building || row.Building || '';
                        invalidRefs.push({
                            field: 'Building',
                            value: buildingValue,
                            suggestions: findSimilarNames(buildingValue, maps.buildings)
                        });
                    }
                    if (invalidRefs.length > 0) {
                        const errorMsg = generateErrorWithSuggestions(sheetName, rowNum, row, [], invalidRefs);
                        log(sheetName, rowNum, 'Error', errorMsg, row);
                        continue;
                    }

                    const missing = validateRecord(row, ['name']);
                    if (missing.length > 0) {
                        const errorMsg = generateErrorWithSuggestions(sheetName, rowNum, row, missing);
                        log(sheetName, rowNum, 'Error', errorMsg, row);
                        continue;
                    }

                    const newProp: Property = {
                        id: generateImportId('prop', index),
                        name: row.name, ownerId, buildingId,
                        description: row.description,
                        monthlyServiceCharge: parseFloat(row.monthlyServiceCharge)
                    };
                    tempState.properties.push(newProp);
                    maps.properties.set(normalizeNameForComparison(newProp.name), newProp.id);
                    log(sheetName, rowNum, 'Success', `Added Property: ${newProp.name}`);
                }

                // --- UNITS ---
                else if (sheetName === 'Units') {
                    if (maps.units.has(normalizeNameForComparison(row.name))) {
                        log(sheetName, rowNum, 'Skipped', `Duplicate entry: A unit with the name "${row.name}" already exists in the system.`, row);
                        continue;
                    }
                    // Units template uses camelCase (projectName). Also accept export-style headers.
                    const projectId = resolveId(maps.projects, row, 'projectName', 'ProjectName', 'project', 'Project');
                    const ownerId = resolveId(maps.contacts, row, 'ownerName', 'OwnerName', 'clientName', 'ClientName', 'owner', 'Owner', 'client', 'Client');

                    if (!projectId) {
                        const projectValue = row.projectName || row.ProjectName || row.project || row.Project || '';
                        const invalidRefs = [{
                            field: 'Project',
                            value: projectValue,
                            suggestions: findSimilarNames(projectValue, maps.projects)
                        }];
                        const errorMsg = generateErrorWithSuggestions(sheetName, rowNum, row, [], invalidRefs);
                        log(sheetName, rowNum, 'Error', errorMsg, row);
                        continue;
                    }

                    const missing = validateRecord(row, ['name']);
                    if (missing.length > 0) {
                        const errorMsg = generateErrorWithSuggestions(sheetName, rowNum, row, missing);
                        log(sheetName, rowNum, 'Error', errorMsg, row);
                        continue;
                    }

                    const newUnit: Unit = {
                        id: generateImportId('unit', index),
                        name: row.name,
                        projectId,
                        contactId: ownerId,
                        salePrice: row.salePrice ? parseFloat(row.salePrice) : undefined,
                        description: row.description || undefined,
                        type: row.type || undefined,
                        area: row.area ? parseFloat(row.area) : undefined,
                        floor: row.floor || undefined
                    };
                    tempState.units.push(newUnit);
                    maps.units.set(normalizeNameForComparison(newUnit.name), newUnit.id);
                    log(sheetName, rowNum, 'Success', `Added Unit: ${newUnit.name}`);
                }

                // --- AGREEMENTS & CONTRACTS ---
                else if (sheetName === 'RentalAgreements') {
                    if (maps.rentalAgreements.has(normalizeNameForComparison(row.agreementNumber))) continue;
                    const tenantId = resolveId(maps.contacts, row, 'tenantName', 'TenantName', 'tenant', 'Tenant');
                    const propertyId = resolveId(maps.properties, row, 'propertyName', 'PropertyName', 'property', 'Property');
                    const brokerId = resolveId(maps.contacts, row, 'brokerName', 'BrokerName', 'broker', 'Broker');

                    if (tenantId && propertyId) {
                        const missing = validateRecord(row, ['agreementNumber', 'startDate', 'endDate', 'monthlyRent']);
                        if (missing.length > 0) {
                            const errorMsg = generateErrorWithSuggestions(sheetName, rowNum, row, missing);
                            log(sheetName, rowNum, 'Error', errorMsg, row);
                            continue;
                        }

                        const newAgr: RentalAgreement = {
                            id: generateImportId('ra', index),
                            agreementNumber: row.agreementNumber,
                            contactId: tenantId, propertyId, brokerId,
                            startDate: new Date(row.startDate).toISOString(),
                            endDate: new Date(row.endDate).toISOString(),
                            monthlyRent: parseFloat(row.monthlyRent),
                            rentDueDate: parseInt(row.rentDueDate),
                            status: row.status,
                            description: row.description,
                            securityDeposit: parseFloat(row.securityDeposit),
                            brokerFee: parseFloat(row.brokerFee)
                        };
                        tempState.rentalAgreements.push(newAgr);
                        maps.rentalAgreements.set(normalizeNameForComparison(newAgr.agreementNumber), newAgr.id);
                        log(sheetName, rowNum, 'Success', `Added Agreement: ${newAgr.agreementNumber}`);
                    } else {
                        const invalidRefs: { field: string; value: string; suggestions?: string[] }[] = [];
                        if (!tenantId) {
                            const tenantValue = row.tenantName || row.tenant || '';
                            invalidRefs.push({
                                field: 'Tenant',
                                value: tenantValue,
                                suggestions: findSimilarNames(tenantValue, maps.contacts)
                            });
                        }
                        if (!propertyId) {
                            const propertyValue = row.propertyName || row.property || '';
                            invalidRefs.push({
                                field: 'Property',
                                value: propertyValue,
                                suggestions: findSimilarNames(propertyValue, maps.properties)
                            });
                        }
                        const errorMsg = generateErrorWithSuggestions(sheetName, rowNum, row, [], invalidRefs);
                        log(sheetName, rowNum, 'Error', errorMsg, row);
                    }
                }
                else if (sheetName === 'ProjectAgreements') {
                    if (maps.projectAgreements.has(normalizeNameForComparison(row.agreementNumber))) continue;
                    // Updated to look for OwnerName as well as ClientName
                    const clientId = resolveId(maps.contacts, row, 'clientName', 'ClientName', 'ownerName', 'OwnerName', 'client', 'Client', 'owner', 'Owner');
                    const projectId = resolveId(maps.projects, row, 'projectName', 'ProjectName', 'project', 'Project');
                    const rebateBrokerId = resolveId(maps.contacts, row, 'rebateBrokerName', 'RebateBrokerName', 'rebateBroker', 'RebateBroker', 'Rebate Broker');

                    // Resolve Units (comma separated names) - handle case variations
                    const unitIds: string[] = [];
                    const unitNamesValue = row.UnitNames || row.unitNames || row.Unitnames || row.unitnames || row['Unit Names'] || row['unit names'];
                    if (unitNamesValue && String(unitNamesValue).trim()) {
                        const names = String(unitNamesValue).split(',').map((s: string) => s.trim()).filter(s => s);
                        const notFoundUnits: string[] = [];
                        names.forEach((name: string) => {
                            const normalizedName = normalizeNameForComparison(name);
                            if (maps.units.has(normalizedName)) {
                                unitIds.push(maps.units.get(normalizedName)!);
                            } else {
                                notFoundUnits.push(name);
                            }
                        });
                        if (notFoundUnits.length > 0 && names.length > 0) {
                            log(sheetName, rowNum, 'Warning', `Some units not found: ${notFoundUnits.join(', ')}. Make sure units are imported before agreements.`, row);
                        }
                    }

                    if (clientId && projectId) {
                        const missing = validateRecord(row, ['agreementNumber', 'sellingPrice']);
                        if (missing.length > 0) {
                            const errorMsg = generateErrorWithSuggestions(sheetName, rowNum, row, missing);
                            log(sheetName, rowNum, 'Error', errorMsg, row);
                            continue;
                        }

                        const newPa: ProjectAgreement = {
                            id: generateImportId('pa', index),
                            agreementNumber: row.agreementNumber,
                            clientId, projectId, unitIds,
                            listPrice: parseFloat(row.listPrice),
                            customerDiscount: parseFloat(row.customerDiscount),
                            floorDiscount: parseFloat(row.floorDiscount),
                            lumpSumDiscount: parseFloat(row.lumpSumDiscount),
                            miscDiscount: parseFloat(row.miscDiscount),
                            sellingPrice: parseFloat(row.sellingPrice),
                            rebateAmount: parseFloat(row.rebateAmount),
                            rebateBrokerId,
                            issueDate: new Date(row.issueDate).toISOString(),
                            status: row.status,
                            description: row.description,
                            cancellationDetails: safeJsonParse(row.cancellationDetails),
                            // Category mappings (by category name) - matches ProjectAgreementForm fields
                            listPriceCategoryId: resolveId(maps.categories, row, 'listPriceCategoryName', 'ListPriceCategoryName'),
                            customerDiscountCategoryId: resolveId(maps.categories, row, 'customerDiscountCategoryName', 'CustomerDiscountCategoryName'),
                            floorDiscountCategoryId: resolveId(maps.categories, row, 'floorDiscountCategoryName', 'FloorDiscountCategoryName'),
                            lumpSumDiscountCategoryId: resolveId(maps.categories, row, 'lumpSumDiscountCategoryName', 'LumpSumDiscountCategoryName'),
                            miscDiscountCategoryId: resolveId(maps.categories, row, 'miscDiscountCategoryName', 'MiscDiscountCategoryName'),
                            sellingPriceCategoryId: resolveId(maps.categories, row, 'sellingPriceCategoryName', 'SellingPriceCategoryName'),
                            rebateCategoryId: resolveId(maps.categories, row, 'rebateCategoryName', 'RebateCategoryName')
                        };
                        tempState.projectAgreements.push(newPa);
                        maps.projectAgreements.set(normalizeNameForComparison(newPa.agreementNumber), newPa.id);
                        log(sheetName, rowNum, 'Success', `Added PA: ${newPa.agreementNumber}`);
                    } else {
                        const invalidRefs: { field: string; value: string; suggestions?: string[] }[] = [];
                        if (!clientId) {
                            const clientValue = row.ownerName || row.owner || row.clientName || row.client || '';
                            invalidRefs.push({
                                field: 'Owner/Client',
                                value: clientValue,
                                suggestions: findSimilarNames(clientValue, maps.contacts)
                            });
                        }
                        if (!projectId) {
                            const projectValue = row.projectName || row.project || '';
                            invalidRefs.push({
                                field: 'Project',
                                value: projectValue,
                                suggestions: findSimilarNames(projectValue, maps.projects)
                            });
                        }
                        const errorMsg = generateErrorWithSuggestions(sheetName, rowNum, row, [], invalidRefs);
                        log(sheetName, rowNum, 'Error', errorMsg, row);
                    }
                }

                // --- CONTRACTS ---
                else if (sheetName === 'Contracts') {
                    const contractNumber = row.contractNumber;
                    if (!contractNumber) {
                        const errorMsg = generateErrorWithSuggestions(sheetName, rowNum, row, ['contractNumber']);
                        log(sheetName, rowNum, 'Error', errorMsg, row);
                        continue;
                    }

                    const normContractNumber = normalizeNameForComparison(contractNumber);
                    if (maps.contracts.has(normContractNumber)) {
                        log(sheetName, rowNum, 'Skipped', `Contract already exists (${contractNumber}).`, row);
                        continue;
                    }

                    const projectId = resolveId(maps.projects, row, 'projectName', 'ProjectName', 'project', 'Project');
                    const vendorId = resolveId(maps.contacts, row, 'vendorName', 'VendorName', 'vendor', 'Vendor', 'contactName', 'ContactName', 'contact', 'Contact');

                    const invalidRefs: { field: string; value: string; suggestions?: string[] }[] = [];
                    if (!projectId) {
                        const projectValue = row.projectName || row.ProjectName || row.project || row.Project || '';
                        invalidRefs.push({
                            field: 'Project',
                            value: projectValue,
                            suggestions: findSimilarNames(projectValue, maps.projects)
                        });
                    }
                    if (!vendorId) {
                        const vendorValue = row.vendorName || row.VendorName || row.vendor || row.Vendor || row.contactName || row.ContactName || '';
                        invalidRefs.push({
                            field: 'Vendor',
                            value: vendorValue,
                            suggestions: findSimilarNames(vendorValue, maps.contacts)
                        });
                    }
                    if (invalidRefs.length > 0) {
                        const errorMsg = generateErrorWithSuggestions(sheetName, rowNum, row, [], invalidRefs);
                        log(sheetName, rowNum, 'Error', errorMsg, row);
                        continue;
                    }

                    const missing = validateRecord(row, ['contractNumber', 'name', 'totalAmount', 'startDate', 'endDate']);
                    if (missing.length > 0) {
                        const errorMsg = generateErrorWithSuggestions(sheetName, rowNum, row, missing);
                        log(sheetName, rowNum, 'Error', errorMsg, row);
                        continue;
                    }

                    const status = Object.values(ContractStatus).includes(row.status)
                        ? (row.status as ContractStatus)
                        : ContractStatus.ACTIVE;

                    // Optional: parse category names to IDs if provided
                    const categoryIds: string[] = [];
                    const categoryNamesRaw = row.categoryNames || row.CategoryNames || row.categoryName || row.CategoryName;
                    if (categoryNamesRaw) {
                        String(categoryNamesRaw)
                            .split(',')
                            .map((s: string) => s.trim())
                            .filter(Boolean)
                            .forEach((name: string) => {
                                const id = maps.categories.get(normalizeNameForComparison(name));
                                if (id) categoryIds.push(id);
                            });
                    }

                    // Parse expenseCategoryItems from separate columns (new format) or JSON (old format)
                    const expenseCategoryItems = parseExpenseCategoryItems(row, maps, normalizeNameForComparison);

                    const contractId = generateImportId('ctr', index);
                    const newContract: Contract = {
                        id: contractId,
                        contractNumber,
                        name: row.name,
                        projectId: projectId!,
                        vendorId: vendorId!,
                        totalAmount: parseFloat(row.totalAmount),
                        area: row.area !== undefined ? parseFloat(row.area) : undefined,
                        rate: row.rate !== undefined ? parseFloat(row.rate) : undefined,
                        startDate: new Date(row.startDate).toISOString(),
                        endDate: new Date(row.endDate).toISOString(),
                        status,
                        categoryIds,
                        expenseCategoryItems,
                        paymentTerms: row.paymentTerms || row.PaymentTerms,
                        termsAndConditions: row.termsAndConditions,
                        description: row.description
                    };

                    // Ensure array exists (defensive for older state shapes)
                    (tempState.contracts ||= []);
                    tempState.contracts.push(newContract);
                    maps.contracts.set(normContractNumber, contractId);
                    log(sheetName, rowNum, 'Success', `Added Contract: ${newContract.contractNumber}`, row);
                }

                // --- INVOICES & BILLS ---
                else if (sheetName === 'Invoices') {
                    if (maps.invoices.has(normalizeNameForComparison(row.invoiceNumber))) continue;
                    const contactId = resolveId(maps.contacts, row, 'contactName', 'ContactName', 'contact', 'Contact');
                    const projectId = resolveId(maps.projects, row, 'projectName', 'ProjectName', 'project', 'Project');
                    const buildingId = resolveId(maps.buildings, row, 'buildingName', 'BuildingName', 'building', 'Building'); // Often derived but explicit is better
                    const propertyId = resolveId(maps.properties, row, 'propertyName', 'PropertyName', 'property', 'Property');
                    const unitId = resolveId(maps.units, row, 'unitName', 'UnitName', 'unit', 'Unit');
                    const categoryId = resolveId(maps.categories, row, 'categoryName', 'CategoryName', 'category', 'Category');
                    const agreementId =
                        resolveId(maps.rentalAgreements, row, 'agreementNumber', 'AgreementNumber') ||
                        resolveId(maps.projectAgreements, row, 'agreementNumber', 'AgreementNumber');

                    if (contactId) {
                        const missing = validateRecord(row, ['invoiceNumber', 'amount', 'issueDate']);
                        if (missing.length > 0) {
                            const errorMsg = generateErrorWithSuggestions(sheetName, rowNum, row, missing);
                            log(sheetName, rowNum, 'Error', errorMsg, row);
                            continue;
                        }

                        const invoiceId = generateImportId('inv', index);
                        // Transaction ID is system-generated only (used for logging)
                        const transactionId = generateTransactionId('invoice', row.invoiceNumber, invoiceId);

                        const newInv: Invoice = {
                            id: invoiceId,
                            invoiceNumber: row.invoiceNumber,
                            contactId, projectId, buildingId, propertyId, unitId, categoryId, agreementId,
                            amount: parseFloat(row.amount),
                            paidAmount: 0, // Recalculated later
                            status: InvoiceStatus.UNPAID,
                            issueDate: new Date(row.issueDate).toISOString(),
                            dueDate: new Date(row.dueDate).toISOString(),
                            invoiceType: row.invoiceType,
                            description: row.description,
                            securityDepositCharge: parseFloat(row.securityDepositCharge),
                            serviceCharges: parseFloat(row.serviceCharges),
                            rentalMonth: row.rentalMonth
                        };
                        tempState.invoices.push(newInv);
                        maps.invoices.set(normalizeNameForComparison(newInv.invoiceNumber), newInv.id);
                        log(sheetName, rowNum, 'Success', `Added Invoice: ${newInv.invoiceNumber} (Transaction ID: ${transactionId})`);
                    } else {
                        const contactValue = row.contactName || row.contact || '';
                        const invalidRefs = [{
                            field: 'Contact',
                            value: contactValue,
                            suggestions: findSimilarNames(contactValue, maps.contacts)
                        }];
                        const errorMsg = generateErrorWithSuggestions(sheetName, rowNum, row, [], invalidRefs);
                        log(sheetName, rowNum, 'Error', errorMsg, row);
                    }
                }
                else if (sheetName === 'Bills') {
                    if (maps.bills.has(normalizeNameForComparison(row.billNumber))) continue;
                    const contactId = resolveId(maps.contacts, row, 'contactName', 'ContactName', 'contact', 'Contact');
                    const categoryId = resolveId(maps.categories, row, 'categoryName', 'CategoryName', 'category', 'Category');
                    const projectId = resolveId(maps.projects, row, 'projectName', 'ProjectName', 'project', 'Project');
                    const buildingId = resolveId(maps.buildings, row, 'buildingName', 'BuildingName', 'building', 'Building');
                    const propertyId = resolveId(maps.properties, row, 'propertyName', 'PropertyName', 'property', 'Property');
                    const contractId = resolveId(maps.contracts, row, 'ContractNumber');
                    const agreementId = resolveId(maps.projectAgreements, row, 'agreementNumber', 'AgreementNumber');

                    if (contactId) {
                        const missing = validateRecord(row, ['billNumber', 'amount', 'issueDate']);
                        if (missing.length > 0) {
                            const errorMsg = generateErrorWithSuggestions(sheetName, rowNum, row, missing);
                            log(sheetName, rowNum, 'Error', errorMsg, row);
                            continue;
                        }

                        const billId = generateImportId('bill', index);
                        // Transaction ID is system-generated only (used for logging)
                        const transactionId = generateTransactionId('bill', row.billNumber, billId);

                        const expenseCategoryItems = parseExpenseCategoryItems(row, maps, normalizeNameForComparison);

                        const newBill: Bill = {
                            id: billId,
                            billNumber: row.billNumber,
                            contactId, categoryId, projectId, buildingId, propertyId, contractId,
                            projectAgreementId: agreementId,
                            amount: parseFloat(row.amount),
                            paidAmount: 0,
                            status: InvoiceStatus.UNPAID,
                            issueDate: new Date(row.issueDate).toISOString(),
                            dueDate: row.dueDate ? new Date(row.dueDate).toISOString() : undefined,
                            description: row.description,
                            expenseCategoryItems
                        };
                        tempState.bills.push(newBill);
                        maps.bills.set(normalizeNameForComparison(newBill.billNumber), newBill.id);
                        log(sheetName, rowNum, 'Success', `Added Bill: ${newBill.billNumber} (Transaction ID: ${transactionId})`);
                    } else {
                        const contactValue = row.contactName || row.contact || '';
                        const invalidRefs = [{
                            field: 'Contact',
                            value: contactValue,
                            suggestions: findSimilarNames(contactValue, maps.contacts)
                        }];
                        const errorMsg = generateErrorWithSuggestions(sheetName, rowNum, row, [], invalidRefs);
                        log(sheetName, rowNum, 'Error', errorMsg, row);
                    }
                }

                // --- PROJECT BILLS (Split) ---
                else if (sheetName === 'ProjectBills') {
                    if (maps.bills.has(normalizeNameForComparison(row.billNumber))) continue;

                    const contactId = resolveId(maps.contacts, row, 'contactName', 'ContactName', 'contact', 'Contact');
                    const categoryId = resolveId(maps.categories, row, 'categoryName', 'CategoryName', 'category', 'Category');
                    const projectId = resolveId(maps.projects, row, 'projectName', 'ProjectName', 'project', 'Project');
                    const contractId = resolveId(maps.contracts, row, 'contractNumber', 'ContractNumber', 'contract', 'Contract');
                    const projectAgreementId = resolveId(maps.projectAgreements, row, 'agreementNumber', 'AgreementNumber', 'projectAgreementId');

                    const invalidRefs: { field: string; value: string; suggestions?: string[] }[] = [];
                    if (!contactId) {
                        const contactValue = row.contactName || row.ContactName || row.contact || row.Contact || '';
                        invalidRefs.push({ field: 'Contact', value: contactValue, suggestions: findSimilarNames(contactValue, maps.contacts) });
                    }
                    if (!projectId) {
                        const projectValue = row.projectName || row.ProjectName || row.project || row.Project || '';
                        invalidRefs.push({ field: 'Project', value: projectValue, suggestions: findSimilarNames(projectValue, maps.projects) });
                    }
                    if (invalidRefs.length > 0) {
                        const errorMsg = generateErrorWithSuggestions(sheetName, rowNum, row, [], invalidRefs);
                        log(sheetName, rowNum, 'Error', errorMsg, row);
                        continue;
                    }

                    const missing = validateRecord(row, ['billNumber', 'amount', 'issueDate']);
                    if (missing.length > 0) {
                        const errorMsg = generateErrorWithSuggestions(sheetName, rowNum, row, missing);
                        log(sheetName, rowNum, 'Error', errorMsg, row);
                        continue;
                    }

                    const billId = generateImportId('pbill', index);
                    // Transaction ID is system-generated only (used for logging)
                    const transactionId = generateTransactionId('bill', row.billNumber, billId);

                    const expenseCategoryItems = parseExpenseCategoryItems(row, maps, normalizeNameForComparison);

                    const newBill: Bill = {
                        id: billId,
                        billNumber: row.billNumber,
                        contactId: contactId!,
                        categoryId,
                        projectId: projectId!,
                        contractId,
                        projectAgreementId,
                        amount: parseFloat(row.amount),
                        paidAmount: 0,
                        status: InvoiceStatus.UNPAID,
                        issueDate: new Date(row.issueDate).toISOString(),
                        dueDate: row.dueDate ? new Date(row.dueDate).toISOString() : undefined,
                        description: row.description,
                        expenseCategoryItems
                    };
                    tempState.bills.push(newBill);
                    maps.bills.set(normalizeNameForComparison(newBill.billNumber), newBill.id);
                    log(sheetName, rowNum, 'Success', `Added Project Bill: ${newBill.billNumber} (Transaction ID: ${transactionId})`);
                }

                // --- RENTAL BILLS (Split) ---
                else if (sheetName === 'RentalBills') {
                    if (maps.bills.has(normalizeNameForComparison(row.billNumber))) continue;

                    const vendorId = resolveId(maps.vendors, row, 'contactName', 'ContactName', 'contact', 'Contact') || resolveId(maps.contacts, row, 'contactName', 'ContactName', 'contact', 'Contact');
                    const categoryId = resolveId(maps.categories, row, 'categoryName', 'CategoryName', 'category', 'Category');
                    const buildingId = resolveId(maps.buildings, row, 'buildingName', 'BuildingName', 'building', 'Building');
                    const propertyId = resolveId(maps.properties, row, 'propertyName', 'PropertyName', 'property', 'Property');
                    const staffId = resolveId(maps.contacts, row, 'staffName', 'StaffName', 'staff', 'Staff', 'staffId');

                    const invalidRefs: { field: string; value: string; suggestions?: string[] }[] = [];
                    if (!vendorId) {
                        const contactValue = row.contactName || row.ContactName || row.contact || row.Contact || '';
                        invalidRefs.push({ field: 'Vendor/Contact', value: contactValue, suggestions: findSimilarNames(contactValue, maps.vendors) });
                    }
                    // For rental bills, at least one context is recommended; we don't hard-require it but we resolve if present.
                    if (invalidRefs.length > 0) {
                        const errorMsg = generateErrorWithSuggestions(sheetName, rowNum, row, [], invalidRefs);
                        log(sheetName, rowNum, 'Error', errorMsg, row);
                        continue;
                    }

                    const missing = validateRecord(row, ['billNumber', 'amount', 'issueDate']);
                    if (missing.length > 0) {
                        const errorMsg = generateErrorWithSuggestions(sheetName, rowNum, row, missing);
                        log(sheetName, rowNum, 'Error', errorMsg, row);
                        continue;
                    }

                    const billId = generateImportId('rbill', index);
                    // Transaction ID is system-generated only (used for logging)
                    const transactionId = generateTransactionId('bill', row.billNumber, billId);

                    const expenseCategoryItems = parseExpenseCategoryItems(row, maps, normalizeNameForComparison);

                    const expenseBearerType = (row.expenseBearerType && ['owner', 'building', 'tenant'].includes(String(row.expenseBearerType).toLowerCase()))
                        ? String(row.expenseBearerType).toLowerCase() as 'owner' | 'building' | 'tenant' : undefined;

                    const newBill: Bill = {
                        id: billId,
                        billNumber: row.billNumber,
                        vendorId: vendorId!,
                        categoryId,
                        buildingId,
                        propertyId,
                        staffId,
                        expenseBearerType,
                        amount: parseFloat(row.amount),
                        paidAmount: 0,
                        status: InvoiceStatus.UNPAID,
                        issueDate: new Date(row.issueDate).toISOString(),
                        dueDate: row.dueDate ? new Date(row.dueDate).toISOString() : undefined,
                        description: row.description,
                        expenseCategoryItems
                    };
                    tempState.bills.push(newBill);
                    maps.bills.set(normalizeNameForComparison(newBill.billNumber), newBill.id);
                    log(sheetName, rowNum, 'Success', `Added Rental Bill: ${newBill.billNumber} (Transaction ID: ${transactionId})`);
                }

                // --- RECURRING TEMPLATES ---
                else if (sheetName === 'RecurringTemplates') {
                    const contactId = resolveId(maps.contacts, row, 'contactName', 'ContactName', 'contact', 'Contact');
                    const propertyId = resolveId(maps.properties, row, 'propertyName', 'PropertyName', 'property', 'Property');

                    if (contactId && propertyId) {
                        const t: RecurringInvoiceTemplate = {
                            id: generateImportId('rec', index),
                            contactId, propertyId,
                            buildingId: resolveId(maps.buildings, row, 'buildingName', 'BuildingName', 'building', 'Building') || '',
                            amount: parseFloat(row.amount),
                            descriptionTemplate: row.descriptionTemplate,
                            dayOfMonth: parseInt(row.dayOfMonth),
                            nextDueDate: new Date(row.nextDueDate).toISOString().split('T')[0],
                            active: row.active === true || String(row.active).toLowerCase() === 'true',
                            agreementId: resolveId(maps.rentalAgreements, row, 'agreementNumber', 'AgreementNumber', 'agreementId'),
                            invoiceType: (row.invoiceType as InvoiceType) || InvoiceType.RENTAL
                        };

                        tempState.recurringInvoiceTemplates.push(t);
                        log(sheetName, rowNum, 'Success', `Added Template`);
                    }
                }

                // --- BUDGETS ---
                else if (sheetName === 'Budgets') {
                    // IDs are no longer imported, so skip duplicate check by ID

                    // Support either categoryId (advanced) or categoryName (friendly)
                    const categoryId =
                        (row.categoryId && String(row.categoryId).trim()) ||
                        resolveId(maps.categories, row, 'categoryName', 'CategoryName');

                    // Support either projectId (advanced) or projectName (friendly)
                    const projectId =
                        (row.projectId && String(row.projectId).trim()) ||
                        resolveId(maps.projects, row, 'projectName', 'ProjectName', 'project', 'Project');

                    const missing: string[] = [];
                    if (!categoryId) missing.push('categoryName');
                    missing.push(...validateRecord(row, ['amount']));

                    if (missing.length > 0) {
                        const invalidRefs: { field: string; value: string; suggestions?: string[] }[] = [];
                        if (!categoryId && (row.categoryName || row.CategoryName)) {
                            invalidRefs.push({
                                field: 'Category',
                                value: String(row.categoryName || row.CategoryName),
                                suggestions: findSimilarNames(String(row.categoryName || row.CategoryName), maps.categories)
                            });
                        }
                        if (projectId === undefined && (row.projectName || row.ProjectName)) {
                            invalidRefs.push({
                                field: 'Project',
                                value: String(row.projectName || row.ProjectName),
                                suggestions: findSimilarNames(String(row.projectName || row.ProjectName), maps.projects)
                            });
                        }
                        const errorMsg = generateErrorWithSuggestions(sheetName, rowNum, row, missing, invalidRefs as any);
                        log(sheetName, rowNum, 'Error', errorMsg, row);
                        continue;
                    }

                    // De-dupe by category + projectId (projectId can be undefined for general budgets)
                    const normKey = projectId ? `${categoryId}::${projectId}` : `${categoryId}::`;
                    const existing = tempState.budgets.find(b => {
                        const bKey = b.projectId ? `${b.categoryId}::${b.projectId}` : `${b.categoryId}::`;
                        return bKey === normKey;
                    });
                    if (existing) {
                        const projectInfo = projectId ? ` for project` : '';
                        log(sheetName, rowNum, 'Skipped', `Duplicate entry: Budget already exists for this category${projectInfo}.`, row);
                        continue;
                    }

                    const newBudget: Budget = {
                        id: generateImportId('bud', index),
                        categoryId: String(categoryId),
                        amount: parseFloat(row.amount) || 0,
                        projectId: projectId || undefined
                    };
                    tempState.budgets.push(newBudget);
                    // Get project name for logging
                    const projectName = projectId ? (tempState.projects.find(p => p.id === projectId)?.name || '') : '';
                    const projectInfo = projectName ? ` (Project: ${projectName})` : '';
                    log(sheetName, rowNum, 'Success', `Added Budget${projectInfo}`, row);
                }

                // --- TRANSACTIONS ---
                else if ([
                    'Transactions',
                    'RentalInvoicePayments',
                    'ProjectInvoicePayments',
                    'RentalBillPayments',
                    'ProjectBillPayments',
                    'LoanTransactions',
                    'EquityTransactions',
                    'TransferTransactions',
                    'IncomeTransactions',
                    'ExpenseTransactions'
                ].includes(sheetName)) {
                    // --- Transaction split handling ---
                    // Determine implied type based on sheet (allows minimal templates without a "type" column)
                    const impliedTypeBySheet: Record<string, TransactionType | undefined> = {
                        RentalInvoicePayments: TransactionType.INCOME,
                        ProjectInvoicePayments: TransactionType.INCOME,
                        RentalBillPayments: TransactionType.EXPENSE,
                        ProjectBillPayments: TransactionType.EXPENSE,
                        LoanTransactions: TransactionType.LOAN,
                        EquityTransactions: TransactionType.TRANSFER,
                        TransferTransactions: TransactionType.TRANSFER,
                        IncomeTransactions: TransactionType.INCOME,
                        ExpenseTransactions: TransactionType.EXPENSE,
                    };

                    const txType: TransactionType | string =
                        impliedTypeBySheet[sheetName] || (row.type ? String(row.type).trim() : '');

                    // Minimal required fields (date/amount always)
                    const missing = validateRecord(row, ['amount', 'date']);
                    if (!txType) missing.push('type');
                    if (missing.length > 0) {
                        const errorMsg = generateErrorWithSuggestions(sheetName, rowNum, row, missing);
                        log(sheetName, rowNum, 'Error', errorMsg, row);
                        continue;
                    }

                    // Resolve invoice/bill by number (accept camelCase + TitleCase)
                    const invoiceId = resolveId(maps.invoices, row, 'invoiceNumber', 'InvoiceNumber');
                    const billId = resolveId(maps.bills, row, 'billNumber', 'BillNumber');

                    // Helpers to classify invoice/bill context (rental vs project)
                    const getInvoiceKind = (invId: string | undefined): 'rental' | 'project' | 'unknown' => {
                        if (!invId) return 'unknown';
                        const inv = tempState.invoices.find(i => i.id === invId);
                        if (!inv) return 'unknown';
                        // Strong signals
                        if (inv.invoiceType === InvoiceType.INSTALLMENT) return 'project';
                        if (inv.invoiceType === InvoiceType.RENTAL || inv.invoiceType === InvoiceType.SECURITY_DEPOSIT || inv.invoiceType === InvoiceType.SERVICE_CHARGE) return 'rental';
                        // Agreement linkage
                        if (inv.agreementId) {
                            if (tempState.rentalAgreements.some(a => a.id === inv.agreementId)) return 'rental';
                            if (tempState.projectAgreements.some(a => a.id === inv.agreementId)) return 'project';
                        }
                        // Field heuristics
                        if (inv.propertyId || inv.buildingId) return 'rental';
                        if (inv.projectId || inv.unitId) return 'project';
                        return 'unknown';
                    };

                    const getBillKind = (bId: string | undefined): 'rental' | 'project' | 'unknown' => {
                        if (!bId) return 'unknown';
                        const b = tempState.bills.find(x => x.id === bId);
                        if (!b) return 'unknown';
                        if (b.projectId || b.contractId || b.projectAgreementId) return 'project';
                        if (b.buildingId || b.propertyId || b.staffId) return 'rental';
                        return 'unknown';
                    };

                    // Enforce split selection by ImportType
                    const txImportType = importType;
                    const invoiceKind = getInvoiceKind(invoiceId);
                    const billKind = getBillKind(billId);

                    const shouldProcess = (() => {
                        switch (txImportType) {
                            case ImportType.RENTAL_INVOICE_PAYMENTS:
                                return txType === TransactionType.INCOME && !!invoiceId && invoiceKind === 'rental';
                            case ImportType.PROJECT_INVOICE_PAYMENTS:
                                return txType === TransactionType.INCOME && !!invoiceId && invoiceKind === 'project';
                            case ImportType.RENTAL_BILL_PAYMENTS:
                                return txType === TransactionType.EXPENSE && !!billId && billKind === 'rental';
                            case ImportType.PROJECT_BILL_PAYMENTS:
                                return txType === TransactionType.EXPENSE && !!billId && billKind === 'project';
                            case ImportType.LOAN_TRANSACTIONS:
                                return txType === TransactionType.LOAN;
                            case ImportType.EQUITY_TRANSACTIONS:
                                // Equity transactions are TRANSFER type from EquityTransactions sheet
                                return txType === TransactionType.TRANSFER && sheetName === 'EquityTransactions';
                            case ImportType.TRANSFER_TRANSACTIONS:
                                // Regular transfers from TransferTransactions sheet (equity transactions are in separate sheet)
                                return txType === TransactionType.TRANSFER && sheetName === 'TransferTransactions';
                            case ImportType.INCOME_TRANSACTIONS:
                                return txType === TransactionType.INCOME && !invoiceId;
                            case ImportType.EXPENSE_TRANSACTIONS:
                                return txType === TransactionType.EXPENSE && !billId;
                            case ImportType.PAYMENTS:
                            case ImportType.FULL:
                                return true;
                            default:
                                return true;
                        }
                    })();

                    if (!shouldProcess) {
                        log(sheetName, rowNum, 'Skipped', 'Row not applicable for selected import type.', row);
                        continue;
                    }

                    // Build account context
                    let accountId: string | undefined = undefined;
                    let fromAccountId: string | undefined = undefined;
                    let toAccountId: string | undefined = undefined;

                    if (txType === TransactionType.TRANSFER) {
                        fromAccountId = resolveId(maps.accounts, row, 'fromAccountName', 'FromAccountName');
                        toAccountId = resolveId(maps.accounts, row, 'toAccountName', 'ToAccountName');
                        if (!fromAccountId || !toAccountId) {
                            const invalidRefs = [];
                            if (!fromAccountId) invalidRefs.push({ field: 'FromAccount', value: row.fromAccountName || row.FromAccountName || '', suggestions: findSimilarNames(row.fromAccountName || row.FromAccountName || '', maps.accounts) });
                            if (!toAccountId) invalidRefs.push({ field: 'ToAccount', value: row.toAccountName || row.ToAccountName || '', suggestions: findSimilarNames(row.toAccountName || row.ToAccountName || '', maps.accounts) });
                            const errorMsg = generateErrorWithSuggestions(sheetName, rowNum, row, [], invalidRefs);
                            log(sheetName, rowNum, 'Error', errorMsg, row);
                            continue;
                        }
                        // accountId is required by model; store fromAccountId as accountId for transfers
                        accountId = fromAccountId;
                    } else {
                        accountId = resolveId(maps.accounts, row, 'accountName', 'AccountName', 'account', 'Account');
                        if (!accountId) {
                            const accountValue = row.accountName || row.AccountName || row.account || row.Account || '';
                            const invalidRefs = [{
                                field: 'Account',
                                value: accountValue,
                                suggestions: findSimilarNames(accountValue, maps.accounts)
                            }];
                            const errorMsg = generateErrorWithSuggestions(sheetName, rowNum, row, [], invalidRefs);
                            log(sheetName, rowNum, 'Error', errorMsg, row);
                            continue;
                        }
                    }

                    // Generate transaction ID first (needed for duplicate detection)
                    const transactionId = generateImportId('tx', index);
                    let txId: string;

                    // Dependencies + overpayment for invoice/bill payments
                    if (txType === TransactionType.INCOME && invoiceId) {
                        const invoice = tempState.invoices.find(i => i.id === invoiceId);
                        if (!invoice) {
                            const invoiceValue = row.invoiceNumber || row.InvoiceNumber || '';
                            log(sheetName, rowNum, 'Error', `Cannot import payment: Invoice "${invoiceValue}" not found. Please import invoices first.`, row);
                            continue;
                        }

                        // Generate unique transaction ID automatically (system-generated only)
                        // Append unique suffix to ensure each payment to the same invoice gets a unique transaction ID
                        const baseTxId = generateTransactionId('invoice', invoice.invoiceNumber, invoice.id);
                        txId = `${baseTxId}_${index}`;
                        if (transactionIds.has(txId)) {
                            log(sheetName, rowNum, 'Skipped', `Duplicate transaction detected (Transaction ID: ${txId}). This payment was already imported.`, row);
                            continue;
                        }

                        const paymentAmount = parseFloat(row.amount);
                        const currentPaid = invoice.paidAmount || 0;
                        const totalAfterPayment = currentPaid + paymentAmount;
                        if (totalAfterPayment > invoice.amount + 0.01) {
                            const overpayment = totalAfterPayment - invoice.amount;
                            log(sheetName, rowNum, 'Error', `Overpayment detected: Payment amount ${paymentAmount} would exceed invoice amount ${invoice.amount}. Current paid: ${currentPaid}, Overpayment: ${overpayment.toFixed(2)}`, row);
                            continue;
                        }
                        transactionIds.add(txId);
                    } else if (txType === TransactionType.EXPENSE && billId) {
                        const bill = tempState.bills.find(b => b.id === billId);
                        if (!bill) {
                            const billValue = row.billNumber || row.BillNumber || '';
                            log(sheetName, rowNum, 'Error', `Cannot import payment: Bill "${billValue}" not found. Please import bills first.`, row);
                            continue;
                        }

                        // Generate unique transaction ID automatically (system-generated only)
                        // Append unique suffix to ensure each payment to the same bill gets a unique transaction ID
                        const baseTxId = generateTransactionId('bill', bill.billNumber, bill.id);
                        txId = `${baseTxId}_${index}`;
                        if (transactionIds.has(txId)) {
                            log(sheetName, rowNum, 'Skipped', `Duplicate transaction detected (Transaction ID: ${txId}). This payment was already imported.`, row);
                            continue;
                        }

                        const paymentAmount = parseFloat(row.amount);
                        const currentPaid = bill.paidAmount || 0;
                        const totalAfterPayment = currentPaid + paymentAmount;
                        if (totalAfterPayment > bill.amount + 0.01) {
                            const overpayment = totalAfterPayment - bill.amount;
                            log(sheetName, rowNum, 'Error', `Overpayment detected: Payment amount ${paymentAmount} would exceed bill amount ${bill.amount}. Current paid: ${currentPaid}, Overpayment: ${overpayment.toFixed(2)}`, row);
                            continue;
                        }
                        transactionIds.add(txId);
                    } else {
                        // Generate unique transaction ID automatically (system-generated only)
                        txId = generateStandaloneTransactionId(String(txType), transactionId);
                        if (transactionIds.has(txId)) {
                            log(sheetName, rowNum, 'Skipped', `Duplicate transaction detected (Transaction ID: ${txId}). This transaction was already imported.`, row);
                            continue;
                        }
                        transactionIds.add(txId);
                    }

                    // Resolve contact/category context (may be derived from invoice/bill)
                    let contactId = resolveId(maps.contacts, row, 'contactName', 'ContactName', 'contact', 'Contact');
                    if (!contactId && invoiceId) {
                        const inv = tempState.invoices.find(i => i.id === invoiceId);
                        if (inv?.contactId) contactId = inv.contactId;
                    }
                    if (!contactId && billId) {
                        const b = tempState.bills.find(x => x.id === billId);
                        if (b?.contactId) contactId = b.contactId;
                    }

                    const categoryId = resolveId(maps.categories, row, 'categoryName', 'CategoryName', 'category', 'Category');

                    // Resolve contractId - prefer from row, otherwise inherit from bill
                    let resolvedContractId = resolveId(maps.contracts, row, 'contractNumber', 'ContractNumber');
                    if (!resolvedContractId && billId) {
                        const b = tempState.bills.find(x => x.id === billId);
                        if (b?.contractId) resolvedContractId = b.contractId;
                    }

                    const tx: Transaction = {
                        id: transactionId,
                        type: txType as TransactionType,
                        subtype: row.subtype,
                        amount: parseFloat(row.amount),
                        date: new Date(row.date).toISOString(),
                        description: row.description,
                        accountId: accountId!,
                        fromAccountId,
                        toAccountId,
                        contactId,
                        projectId: (() => {
                            const directId = row.projectId && String(row.projectId).trim();
                            if (directId && tempState.projects.find(p => p.id === directId)) {
                                return directId;
                            }
                            return resolveId(maps.projects, row, 'projectName', 'ProjectName', 'project', 'Project');
                        })(),
                        buildingId: resolveId(maps.buildings, row, 'buildingName', 'BuildingName', 'building', 'Building'),
                        propertyId: resolveId(maps.properties, row, 'propertyName', 'PropertyName', 'property', 'Property'),
                        categoryId,
                        invoiceId,
                        billId,
                        contractId: resolvedContractId,
                        agreementId: resolveId(maps.rentalAgreements, row, 'agreementNumber', 'AgreementNumber') || resolveId(maps.projectAgreements, row, 'agreementNumber', 'AgreementNumber'),
                        unitId: resolveId(maps.units, row, 'unitName', 'UnitName')
                    };

                    // Loan validation (subtype)
                    if (txType === TransactionType.LOAN && (!tx.subtype || !Object.values(LoanSubtype).includes(tx.subtype))) {
                        const valid = Object.values(LoanSubtype).join(', ');
                        log(sheetName, rowNum, 'Error', `Invalid or missing Loan subtype. Valid values: ${valid}`, row);
                        continue;
                    }

                    tempState.transactions.push(tx);
                    log(sheetName, rowNum, 'Success', `Added Transaction: ${tx.amount}${txId ? ` (Transaction ID: ${txId})` : ''}`);
                }

            } catch (e) {
                log(sheetName, rowNum, 'Error', `Critical error: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
    }

    // If any errors were logged (e.g., schema/header issues), halt import and do NOT save
    if (summary.errors > 0) {
        const msg = 'Import halted: fix the listed header/field errors in Excel and retry.';
        progress.errorProgress(msg);
        dispatch({ type: 'ADD_ERROR_LOG', payload: { message: msg, stack: '' } });
        return summary;
    }

    // --- RECALCULATE BALANCES ---
    progress.updateProgress(95, 'Recalculating balances...');
    await new Promise(res => setTimeout(res, 50));

    // Reset
    tempState.accounts.forEach(a => a.balance = 0);
    tempState.invoices.forEach(i => { i.paidAmount = 0; i.status = InvoiceStatus.UNPAID; });
    tempState.bills.forEach(b => { b.paidAmount = 0; b.status = InvoiceStatus.UNPAID; });

    const arAccount = tempState.accounts.find(a => a.name === 'Accounts Receivable');
    const apAccount = tempState.accounts.find(a => a.name === 'Accounts Payable');

    // Initial AR/AP from Documents
    if (arAccount) arAccount.balance = tempState.invoices.reduce((sum, i) => sum + i.amount, 0);
    if (apAccount) apAccount.balance = tempState.bills.reduce((sum, b) => sum + b.amount, 0);

    // Apply Transactions
    tempState.transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).forEach(tx => {
        const { type, amount, accountId, fromAccountId, toAccountId, invoiceId, billId, contractId } = tx;

        if (type === TransactionType.INCOME) {
            const acc = tempState.accounts.find(a => a.id === accountId);
            if (acc) acc.balance += amount;
            if (invoiceId && arAccount) arAccount.balance -= amount;

            if (invoiceId) {
                const inv = tempState.invoices.find(i => i.id === invoiceId);
                if (inv) {
                    inv.paidAmount += amount;
                    if (inv.paidAmount >= inv.amount - 0.1) inv.status = InvoiceStatus.PAID;
                    else inv.status = InvoiceStatus.PARTIALLY_PAID;
                }
            }
        } else if (type === TransactionType.EXPENSE) {
            const acc = tempState.accounts.find(a => a.id === accountId);
            if (acc) acc.balance -= amount;
            if (billId && apAccount) apAccount.balance -= amount;

            if (billId) {
                const bill = tempState.bills.find(b => b.id === billId);
                if (bill) {
                    bill.paidAmount += amount;
                    if (bill.paidAmount >= bill.amount - 0.1) bill.status = InvoiceStatus.PAID;
                    else bill.status = InvoiceStatus.PARTIALLY_PAID;
                }
            }
        } else if (type === TransactionType.TRANSFER) {
            const from = tempState.accounts.find(a => a.id === fromAccountId);
            const to = tempState.accounts.find(a => a.id === toAccountId);
            if (from) from.balance -= amount;
            if (to) to.balance += amount;
        } else if (type === TransactionType.LOAN) {
            const acc = tempState.accounts.find(a => a.id === accountId);
            if (acc) acc.balance += (tx.subtype === LoanSubtype.RECEIVE ? amount : -amount);
        }
    });

    // Update Contract Statuses based on transactions
    if (tempState.contracts && tempState.contracts.length > 0) {
        tempState.contracts.forEach(contract => {
            if (contract.status === ContractStatus.TERMINATED) return;

            // Calculate total paid from transactions linked to this contract
            const totalPaid = tempState.transactions
                .filter(t => t.contractId === contract.id)
                .reduce((sum, t) => sum + t.amount, 0);

            const isFullyPaid = totalPaid >= (contract.totalAmount - 1.0);

            // Update contract status based on payment status
            if (isFullyPaid && contract.status === ContractStatus.ACTIVE) {
                contract.status = ContractStatus.COMPLETED;
            } else if (!isFullyPaid && contract.status === ContractStatus.COMPLETED) {
                contract.status = ContractStatus.ACTIVE;
            }
        });
    }

    // Save to database
    progress.updateProgress(96, 'Initializing database...');
    const { getDatabaseService } = await import('./database/databaseService');

    // Ensure database is initialized before saving
    const dbService = getDatabaseService();
    try {
        await dbService.initialize();
    } catch (dbError) {
        const errorMsg = dbError instanceof Error ? dbError.message : String(dbError);
        throw new Error(`Failed to initialize database: ${errorMsg}`);
    }

    progress.updateProgress(98, 'Saving to database...');
    const appStateRepo = new AppStateRepository();
    await appStateRepo.saveState(tempState);

    // Also dispatch to update UI
    dispatch({ type: 'SET_STATE', payload: tempState });
    return summary;
};

