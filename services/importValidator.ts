
import { AppState } from '../types';
import { IMPORT_SCHEMAS, ImportSchema, ImportMaps } from './importSchemas';

export interface ValidationError {
    sheet: string;
    row: number;
    field?: string;
    message: string;
    severity: 'error' | 'warning';
    data?: any;
}

export interface PreviewRow {
    sheet: string;
    rowIndex: number;
    originalData: any;
    errors: string[];
    warnings: string[];
}

export interface ImportValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationError[];
    preview: PreviewRow[];
    stats: {
        totalRows: number;
        validRows: number;
        invalidRows: number;
        skippedRows: number;
    };
}

// Helper for name normalization
const normalizeNameForComparison = (name: string): string => {
    if (!name) return '';
    return String(name).trim().replace(/\s+/g, ' ').toLowerCase();
};

// Helper to normalize field names for comparison
const normalizeKey = (key: string) => key.toString().trim().replace(/\s+/g, '').replace(/_/g, '').toLowerCase();

/**
 * Validates import data without modifying state
 * Returns validation results and preview of what would be imported
 */
export const validateImport = (
    sheets: { [key: string]: any[] },
    currentState: AppState
): ImportValidationResult => {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const preview: PreviewRow[] = [];
    
    let totalRows = 0;
    let validRows = 0;
    let invalidRows = 0;
    let skippedRows = 0;
    
    // Build maps from current state
    const maps: ImportMaps = {
        accounts: new Map(currentState.accounts.map(a => [normalizeNameForComparison(a.name), a.id])),
        contacts: new Map(currentState.contacts.map(c => [normalizeNameForComparison(c.name), c.id])),
        categories: new Map(currentState.categories.map(c => [normalizeNameForComparison(c.name), c.id])),
        projects: new Map(currentState.projects.map(p => [normalizeNameForComparison(p.name), p.id])),
        buildings: new Map(currentState.buildings.map(b => [normalizeNameForComparison(b.name), b.id])),
        properties: new Map(currentState.properties.map(p => [normalizeNameForComparison(p.name), p.id])),
        units: new Map(currentState.units.map(u => [normalizeNameForComparison(u.name), u.id])),
        rentalAgreements: new Map(currentState.rentalAgreements.map(a => 
            [normalizeNameForComparison(a.agreementNumber), a.id])),
        projectAgreements: new Map(currentState.projectAgreements.map(a => 
            [normalizeNameForComparison(a.agreementNumber), a.id])),
        invoices: new Map(currentState.invoices.map(i => 
            [normalizeNameForComparison(i.invoiceNumber), i.id])),
        bills: new Map(currentState.bills.map(b => 
            [normalizeNameForComparison(b.billNumber), b.id])),
        contracts: new Map((currentState.contracts || []).map(c => 
            [normalizeNameForComparison(c.contractNumber), c.id])),
        salaryComponents: new Map(currentState.salaryComponents.map(sc => 
            [normalizeNameForComparison(sc.name), sc.id])),
    };
    
    // Build normalized allowed fields maps for each sheet
    const allowedFieldsNormalized: Record<string, Map<string, string>> = {};
    Object.entries(IMPORT_SCHEMAS).forEach(([sheetName, schema]) => {
        const map = new Map<string, string>();
        schema.allowedFields.forEach(field => {
            const normalized = normalizeKey(field);
            map.set(normalized, field);
        });
        allowedFieldsNormalized[sheetName] = map;
    });
    
    // Validate each sheet
    Object.entries(sheets).forEach(([sheetName, rows]) => {
        const schema = IMPORT_SCHEMAS[sheetName];
        
        if (!schema) {
            warnings.push({
                sheet: sheetName,
                row: 0,
                message: `Unknown sheet "${sheetName}" - will be skipped during import`,
                severity: 'warning'
            });
            skippedRows += rows.length;
            return;
        }
        
        const normalizedFieldsMap = allowedFieldsNormalized[sheetName];
        
        rows.forEach((row, index) => {
            totalRows++;
            const rowErrors: string[] = [];
            const rowWarnings: string[] = [];
            const rowNum = index + 2; // Excel row number (1-indexed + header)
            
            // Check for unknown fields
            const unknownFields: string[] = [];
            Object.keys(row).forEach(key => {
                const normalized = normalizeKey(key);
                if (!normalizedFieldsMap.has(normalized)) {
                    unknownFields.push(key);
                }
            });
            
            if (unknownFields.length > 0) {
                warnings.push({
                    sheet: sheetName,
                    row: rowNum,
                    message: `Unknown columns: ${unknownFields.join(', ')} - will be ignored`,
                    severity: 'warning',
                    data: row
                });
                rowWarnings.push(`Unknown columns: ${unknownFields.join(', ')}`);
            }
            
            // Check required fields
            schema.requiredFields.forEach(field => {
                // Check various case variations
                const value = row[field] || 
                             row[field.toLowerCase()] || 
                             row[field.charAt(0).toUpperCase() + field.slice(1)] ||
                             row[field.toUpperCase()];
                
                if (!value || String(value).trim() === '') {
                    const errorMsg = `Required field "${field}" is missing or empty`;
                    errors.push({
                        sheet: sheetName,
                        row: rowNum,
                        field,
                        message: errorMsg,
                        severity: 'error',
                        data: row
                    });
                    rowErrors.push(errorMsg);
                }
            });
            
            // Validate numeric fields
            const numericFields = ['amount', 'totalAmount', 'paidAmount', 'balance', 'salePrice', 'monthlyRent', 'basicSalary'];
            numericFields.forEach(field => {
                const value = row[field] || row[field.charAt(0).toUpperCase() + field.slice(1)];
                if (value !== undefined && value !== null && value !== '' && isNaN(parseFloat(String(value)))) {
                    const errorMsg = `Field "${field}" must be a valid number`;
                    errors.push({
                        sheet: sheetName,
                        row: rowNum,
                        field,
                        message: errorMsg,
                        severity: 'error',
                        data: row
                    });
                    rowErrors.push(errorMsg);
                }
            });
            
            // Validate date fields
            const dateFields = ['date', 'startDate', 'endDate', 'issueDate', 'dueDate', 'joiningDate'];
            dateFields.forEach(field => {
                const value = row[field] || row[field.charAt(0).toUpperCase() + field.slice(1)];
                if (value !== undefined && value !== null && value !== '') {
                    const dateValue = new Date(String(value));
                    if (isNaN(dateValue.getTime())) {
                        const errorMsg = `Field "${field}" must be a valid date`;
                        errors.push({
                            sheet: sheetName,
                            row: rowNum,
                            field,
                            message: errorMsg,
                            severity: 'error',
                            data: row
                        });
                        rowErrors.push(errorMsg);
                    }
                }
            });
            
            // Run schema-specific validation if available
            if (schema.validate) {
                try {
                    const result = schema.validate(row, maps, normalizeNameForComparison);
                    result.errors.forEach(error => {
                        errors.push({
                            sheet: sheetName,
                            row: rowNum,
                            message: error,
                            severity: 'error',
                            data: row
                        });
                        rowErrors.push(error);
                    });
                    result.warnings.forEach(warning => {
                        warnings.push({
                            sheet: sheetName,
                            row: rowNum,
                            message: warning,
                            severity: 'warning',
                            data: row
                        });
                        rowWarnings.push(warning);
                    });
                } catch (e) {
                    const errorMsg = `Validation error: ${e instanceof Error ? e.message : String(e)}`;
                    errors.push({
                        sheet: sheetName,
                        row: rowNum,
                        message: errorMsg,
                        severity: 'error',
                        data: row
                    });
                    rowErrors.push(errorMsg);
                }
            }
            
            // Add to preview
            preview.push({
                sheet: sheetName,
                rowIndex: index,
                originalData: row,
                errors: rowErrors,
                warnings: rowWarnings
            });
            
            // Update stats
            if (rowErrors.length === 0) {
                validRows++;
            } else {
                invalidRows++;
            }
        });
    });
    
    return {
        valid: errors.length === 0,
        errors,
        warnings,
        preview,
        stats: {
            totalRows,
            validRows,
            invalidRows,
            skippedRows
        }
    };
};

