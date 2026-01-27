
import { BaseAdapter, AdapterResult, AdapterConfig } from './baseAdapter';

/**
 * Generic CSV adapter for comma-separated value files
 * Handles standard CSV format with headers
 */
export class CSVAdapter extends BaseAdapter {
    constructor(config: AdapterConfig = {}) {
        super(config);
    }

    canHandle(file: File): boolean {
        return file.name.toLowerCase().endsWith('.csv');
    }

    getName(): string {
        return 'CSV (Generic)';
    }

    getDescription(): string {
        return 'Handles standard CSV files with comma-separated values. First row should contain headers.';
    }

    getExampleFormat(): string {
        return 'CSV format with headers in first row, comma-separated values. Supports quoted fields with commas.';
    }

    async parse(file: File): Promise<AdapterResult> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const text = new TextDecoder().decode(e.target?.result as ArrayBuffer);
                    const lines = text.split(/\r?\n/).filter(line => line.trim());
                    
                    if (lines.length === 0) {
                        throw new Error('CSV file is empty');
                    }

                    // Parse header
                    const headers = this.parseCSVLine(lines[0]);
                    const rows: any[] = [];
                    const warnings: string[] = [];

                    // Parse data rows
                    for (let i = 1; i < lines.length; i++) {
                        const values = this.parseCSVLine(lines[i]);
                        
                        if (values.length !== headers.length) {
                            warnings.push(`Row ${i + 1} has ${values.length} columns, expected ${headers.length}. Skipping.`);
                            continue;
                        }

                        const row: any = {};
                        headers.forEach((header, idx) => {
                            const normalizedHeader = this.normalizeHeader(header);
                            row[normalizedHeader] = this.normalizeValue(values[idx], normalizedHeader);
                        });

                        // Skip empty rows if configured
                        if (this.config.skipEmptyRows && Object.values(row).every(v => !v || String(v).trim() === '')) {
                            continue;
                        }

                        rows.push(row);
                    }

                    // Use filename (without extension) as sheet name, or default to 'Data'
                    const sheetName = file.name.replace(/\.csv$/i, '') || 'Data';

                    resolve({
                        sheets: { [sheetName]: rows },
                        metadata: {
                            sourceSystem: 'CSV',
                            sourceFormat: 'CSV',
                            recordCount: rows.length,
                            sheets: [sheetName],
                            warnings
                        }
                    });
                } catch (error) {
                    reject(new Error(`Failed to parse CSV file: ${error instanceof Error ? error.message : String(error)}`));
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
                if (inQuotes && line[i + 1] === '"') {
                    // Escaped quote
                    current += '"';
                    i++; // Skip next quote
                } else {
                    // Toggle quote state
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        // Add last field
        result.push(current.trim());
        
        return result;
    }

    private normalizeHeader(header: string): string {
        return header
            .trim()
            .replace(/\s+/g, ' ')
            .split(' ')
            .map((word, idx) => idx === 0 
                ? word.toLowerCase() 
                : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join('');
    }

    private normalizeValue(value: string, header: string): any {
        if (!value || value.trim() === '') {
            return '';
        }

        // Remove surrounding quotes if present
        const cleaned = value.trim().replace(/^"|"$/g, '');

        // Date fields
        if (header.includes('date') || header.includes('Date')) {
            return this.normalizeDate(cleaned);
        }

        // Numeric fields
        if (header.includes('amount') || header.includes('balance') || header.includes('price') || 
            header.includes('quantity') || header.includes('total') ||
            header.includes('Amount') || header.includes('Balance') || header.includes('Price')) {
            return this.normalizeNumber(cleaned);
        }

        // Boolean fields
        if (header.includes('active') || header.includes('enabled') || header.includes('status')) {
            const lower = cleaned.toLowerCase();
            if (lower === 'true' || lower === 'yes' || lower === '1' || lower === 'active') {
                return true;
            }
            if (lower === 'false' || lower === 'no' || lower === '0' || lower === 'inactive') {
                return false;
            }
        }

        // Default to text
        return this.normalizeText(cleaned);
    }
}

