
import * as XLSX from 'xlsx';
import { BaseAdapter, AdapterResult, AdapterConfig } from './baseAdapter';

/**
 * QuickBooks column mappings
 */
const QUICKBOOKS_COLUMN_MAPPINGS: Record<string, string> = {
    // Accounts
    'Account': 'name',
    'Account Type': 'type',
    'Balance': 'balance',
    'Description': 'description',
    
    // Contacts/Vendors/Customers
    'Name': 'name',
    'Company Name': 'companyName',
    'Contact': 'contactNo',
    'Phone': 'contactNo',
    'Email': 'email',
    'Address': 'address',
    'Vendor': 'name',
    'Customer': 'name',
    
    // Transactions
    'Date': 'date',
    'Amount': 'amount',
    'Description': 'description',
    'Memo': 'description',
    'Account Name': 'accountName',
    'Type': 'type',
    'Category': 'categoryName',
    
    // Invoices/Bills
    'Invoice Number': 'invoiceNumber',
    'Bill Number': 'billNumber',
    'Due Date': 'dueDate',
    'Issue Date': 'issueDate',
    'Total': 'amount',
    'Paid': 'paidAmount',
    'Status': 'status',
    
    // Projects/Jobs
    'Job': 'projectName',
    'Project': 'projectName',
    'Customer:Job': 'projectName',
};

/**
 * QuickBooks adapter for importing data from QuickBooks exports
 * Handles common QuickBooks export formats (CSV, Excel)
 */
export class QuickBooksAdapter extends BaseAdapter {
    private readonly quickBooksColumnMappings: Record<string, string> = QUICKBOOKS_COLUMN_MAPPINGS;

    constructor(config: AdapterConfig = {}) {
        super({
            ...config,
            customMappings: { ...config.customMappings, ...QUICKBOOKS_COLUMN_MAPPINGS }
        });
    }

    canHandle(file: File): boolean {
        const name = file.name.toLowerCase();
        // QuickBooks exports are often CSV or Excel with specific naming patterns
        return name.includes('quickbooks') || 
               name.includes('qb') ||
               name.includes('quick') ||
               (name.endsWith('.csv') && this.looksLikeQuickBooksCSV(file)) ||
               (name.endsWith('.xlsx') && this.looksLikeQuickBooksExcel(file));
    }

    private looksLikeQuickBooksCSV(file: File): boolean {
        // QuickBooks CSV files typically have specific headers
        // This is a heuristic check - in real implementation, you'd read first few lines
        return true; // Simplified - would check file content
    }

    private looksLikeQuickBooksExcel(file: File): boolean {
        // QuickBooks Excel exports often have specific sheet names
        return true; // Simplified - would check sheet names
    }

    getName(): string {
        return 'QuickBooks';
    }

    getDescription(): string {
        return 'Imports data from QuickBooks exports (CSV, Excel). Automatically maps QuickBooks columns to our system format.';
    }

    getExampleFormat(): string {
        return 'QuickBooks export files (.csv, .xlsx) with standard QuickBooks column names like "Account", "Date", "Amount", etc.';
    }

    async parse(file: File): Promise<AdapterResult> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = e.target?.result;
                    let sheets: { [key: string]: any[] } = {};
                    const warnings: string[] = [];
                    let totalRecords = 0;

                    if (file.name.toLowerCase().endsWith('.csv')) {
                        // Parse CSV
                        const text = new TextDecoder().decode(data as ArrayBuffer);
                        const lines = text.split('\n').filter(line => line.trim());
                        
                        if (lines.length === 0) {
                            throw new Error('CSV file is empty');
                        }

                        // Parse CSV header
                        const headers = this.parseCSVLine(lines[0]);
                        const rows: any[] = [];

                        for (let i = 1; i < lines.length; i++) {
                            const values = this.parseCSVLine(lines[i]);
                            if (values.length !== headers.length) {
                                warnings.push(`Row ${i + 1} has ${values.length} columns, expected ${headers.length}`);
                                continue;
                            }

                            const row: any = {};
                            headers.forEach((header, idx) => {
                                const normalizedHeader = this.normalizeQuickBooksHeader(header);
                                row[normalizedHeader] = this.normalizeValue(values[idx], normalizedHeader);
                            });

                            if (this.config.skipEmptyRows && Object.values(row).every(v => !v || String(v).trim() === '')) {
                                continue;
                            }

                            rows.push(row);
                        }

                        // Determine sheet name based on content
                        const sheetName = this.detectQuickBooksSheetType(headers, rows);
                        sheets[sheetName] = rows;
                        totalRecords = rows.length;

                    } else {
                        // Parse Excel
                        const workbook = XLSX.read(data, { type: 'array' });
                        
                        workbook.SheetNames.forEach(sheetName => {
                            const worksheet = workbook.Sheets[sheetName];
                            const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
                            
                            // Map QuickBooks columns to our format
                            const mappedData = jsonData.map((row: any) => {
                                const mapped: any = {};
                                Object.keys(row).forEach(key => {
                                    const normalizedKey = this.normalizeQuickBooksHeader(key);
                                    mapped[normalizedKey] = this.normalizeValue(row[key], normalizedKey);
                                });
                                return mapped;
                            });

                            const filteredData = this.config.skipEmptyRows
                                ? mappedData.filter((row: any) => {
                                    return Object.values(row).some(val => 
                                        val !== null && val !== undefined && String(val).trim() !== ''
                                    );
                                })
                                : mappedData;

                            sheets[sheetName] = filteredData;
                            totalRecords += filteredData.length;
                        });
                    }

                    resolve({
                        sheets,
                        metadata: {
                            sourceSystem: 'QuickBooks',
                            sourceFormat: file.name.toLowerCase().endsWith('.csv') ? 'CSV' : 'XLSX',
                            recordCount: totalRecords,
                            sheets: Object.keys(sheets),
                            warnings
                        }
                    });
                } catch (error) {
                    reject(new Error(`Failed to parse QuickBooks file: ${error instanceof Error ? error.message : String(error)}`));
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsArrayBuffer(file);
        });
    }

    private parseCSVLine(line: string): string[] {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    }

    private normalizeQuickBooksHeader(header: string): string {
        const normalized = header.trim();
        
        // Check custom mappings first
        if (this.config.customMappings && this.config.customMappings[normalized]) {
            return this.config.customMappings[normalized];
        }

        // Check our QuickBooks mappings
        if (this.quickBooksColumnMappings[normalized]) {
            return this.quickBooksColumnMappings[normalized];
        }

        // Try case-insensitive match
        const lower = normalized.toLowerCase();
        for (const [qbKey, ourKey] of Object.entries(this.quickBooksColumnMappings)) {
            if (qbKey.toLowerCase() === lower) {
                return ourKey;
            }
        }

        // Return normalized header (camelCase)
        return normalized
            .replace(/\s+/g, ' ')
            .split(' ')
            .map((word, idx) => idx === 0 
                ? word.toLowerCase() 
                : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join('');
    }

    private normalizeValue(value: any, header: string): any {
        if (value === null || value === undefined || value === '') {
            return '';
        }

        // Date fields
        if (header.includes('date') || header.includes('Date')) {
            return this.normalizeDate(value);
        }

        // Numeric fields
        if (header.includes('amount') || header.includes('balance') || header.includes('price') || 
            header.includes('Amount') || header.includes('Balance') || header.includes('Price')) {
            return this.normalizeNumber(value);
        }

        // Default to text
        return this.normalizeText(value);
    }

    private detectQuickBooksSheetType(headers: string[], rows: any[]): string {
        const headerStr = headers.join(' ').toLowerCase();
        
        if (headerStr.includes('account') && (headerStr.includes('type') || headerStr.includes('balance'))) {
            return 'Accounts';
        }
        if (headerStr.includes('invoice') || headerStr.includes('invoice number')) {
            return 'Invoices';
        }
        if (headerStr.includes('bill') || headerStr.includes('bill number')) {
            return 'Bills';
        }
        if (headerStr.includes('transaction') || (headerStr.includes('date') && headerStr.includes('amount'))) {
            return 'Transactions';
        }
        if (headerStr.includes('vendor') || headerStr.includes('supplier')) {
            return 'Contacts';
        }
        if (headerStr.includes('customer') || headerStr.includes('client')) {
            return 'Contacts';
        }
        
        return 'Data'; // Default sheet name
    }
}

