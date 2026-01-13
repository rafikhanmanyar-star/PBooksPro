
import { AppState } from '../types';
import { EXPORT_SCHEMAS, ExportMaps, getSchemasByCategory } from './csvExportSchemas';
import * as XLSX from 'xlsx';

export type ExportFormat = 'csv' | 'excel';

export interface ExportOptions {
    selectedTypes: string[];
    format: ExportFormat;
    filename?: string;
}

// Helper to escape CSV values
const escapeCsvValue = (value: any): string => {
    if (value === null || value === undefined) {
        return '';
    }
    
    const str = String(value);
    
    // If the value contains comma, quote, or newline, wrap it in quotes and escape quotes
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    
    return str;
};

// Convert data to CSV string
const convertToCSV = (headers: string[], rows: any[]): string => {
    const lines: string[] = [];
    
    // Add header row
    lines.push(headers.map(escapeCsvValue).join(','));
    
    // Add data rows
    rows.forEach(row => {
        const values = headers.map(header => {
            const value = row[header];
            return escapeCsvValue(value);
        });
        lines.push(values.join(','));
    });
    
    return lines.join('\n');
};

// Download CSV file
const downloadCSV = (content: string, filename: string): void => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

// Download Excel file
const downloadExcel = (workbook: XLSX.WorkBook, filename: string): void => {
    XLSX.writeFile(workbook, filename);
};

// Build export maps from AppState
const buildExportMaps = (state: AppState): ExportMaps => {
    return {
        accountsById: new Map(state.accounts.map(a => [a.id, a.name])),
        contactsById: new Map(state.contacts.map(c => [c.id, c.name])),
        categoriesById: new Map(state.categories.map(c => [c.id, c.name])),
        projectsById: new Map(state.projects.map(p => [p.id, p.name])),
        buildingsById: new Map(state.buildings.map(b => [b.id, b.name])),
        propertiesById: new Map(state.properties.map(p => [p.id, p.name])),
        unitsById: new Map(state.units.map(u => [u.id, u.name])),
        rentalAgreementNoById: new Map(state.rentalAgreements.map(a => [a.id, a.agreementNumber])),
        projectAgreementNoById: new Map(state.projectAgreements.map(a => [a.id, a.agreementNumber])),
        invoiceNoById: new Map(state.invoices.map(i => [i.id, i.invoiceNumber])),
        billNoById: new Map(state.bills.map(b => [b.id, b.billNumber])),
        contractNoById: new Map((state.contracts || []).map(c => [c.id, c.contractNumber])),
    };
};

// Format date for filename
const formatDateForFilename = (): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}${month}${day}_${hours}${minutes}`;
};

// Export data based on selected types and format
export const exportData = async (
    state: AppState,
    options: ExportOptions,
    onProgress?: (progress: number, message: string) => void
): Promise<void> => {
    const { selectedTypes, format, filename } = options;
    
    if (selectedTypes.length === 0) {
        throw new Error('No data types selected for export');
    }
    
    onProgress?.(0, 'Preparing export...');
    
    const maps = buildExportMaps(state);
    const timestamp = formatDateForFilename();
    
    if (format === 'csv') {
        // Export each selected type as a separate CSV file
        let processed = 0;
        const total = selectedTypes.length;
        
        for (const typeKey of selectedTypes) {
            const schema = EXPORT_SCHEMAS[typeKey];
            if (!schema) {
                console.warn(`Schema not found for type: ${typeKey}`);
                processed++;
                continue;
            }
            
            onProgress?.(
                Math.round((processed / total) * 100),
                `Exporting ${schema.displayName}...`
            );
            
            try {
                const data = schema.getData(state, maps);
                const csvContent = convertToCSV(schema.headers, data);
                const fileExtension = 'csv';
                const exportFilename = filename 
                    ? `${filename}_${schema.displayName.replace(/\s+/g, '_')}.${fileExtension}`
                    : `export_${schema.displayName.replace(/\s+/g, '_')}_${timestamp}.${fileExtension}`;
                
                downloadCSV(csvContent, exportFilename);
                
                // Small delay to allow browser to process download
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error(`Error exporting ${schema.displayName}:`, error);
                throw new Error(`Failed to export ${schema.displayName}: ${error instanceof Error ? error.message : String(error)}`);
            }
            
            processed++;
        }
        
        onProgress?.(100, 'Export completed');
    } else {
        // Export all selected types as sheets in a single Excel file
        const workbook = XLSX.utils.book_new();
        let processed = 0;
        const total = selectedTypes.length;
        
        for (const typeKey of selectedTypes) {
            const schema = EXPORT_SCHEMAS[typeKey];
            if (!schema) {
                console.warn(`Schema not found for type: ${typeKey}`);
                processed++;
                continue;
            }
            
            onProgress?.(
                Math.round((processed / total) * 100),
                `Exporting ${schema.displayName}...`
            );
            
            try {
                const data = schema.getData(state, maps);
                
                // Create worksheet
                const worksheet = data.length > 0
                    ? XLSX.utils.json_to_sheet(data, { header: schema.headers })
                    : XLSX.utils.aoa_to_sheet([schema.headers]);
                
                // Add sheet to workbook (limit sheet name to 31 characters for Excel compatibility)
                const sheetName = schema.displayName.substring(0, 31);
                XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
            } catch (error) {
                console.error(`Error exporting ${schema.displayName}:`, error);
                throw new Error(`Failed to export ${schema.displayName}: ${error instanceof Error ? error.message : String(error)}`);
            }
            
            processed++;
        }
        
        onProgress?.(95, 'Generating Excel file...');
        
        const fileExtension = 'xlsx';
        const exportFilename = filename 
            ? `${filename}.${fileExtension}`
            : `export_${timestamp}.${fileExtension}`;
        
        downloadExcel(workbook, exportFilename);
        
        onProgress?.(100, 'Export completed');
    }
};

// Get available export types grouped by category
export const getExportTypesByCategory = () => {
    return getSchemasByCategory();
};

// Get all available export type keys
export const getAllExportTypeKeys = (): string[] => {
    return Object.keys(EXPORT_SCHEMAS);
};

