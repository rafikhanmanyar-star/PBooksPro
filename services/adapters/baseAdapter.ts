
import { AppState } from '../../types';
import { ImportValidationResult } from '../importValidator';

/**
 * Base interface for all external system adapters
 * Adapters convert external data formats to our internal schema format
 */
export interface AdapterResult {
    sheets: { [key: string]: any[] };
    metadata: {
        sourceSystem: string;
        sourceFormat: string;
        recordCount: number;
        sheets: string[];
        warnings: string[];
    };
}

export interface AdapterConfig {
    skipEmptyRows?: boolean;
    skipHeaderRow?: boolean;
    dateFormat?: string;
    customMappings?: Record<string, string>;
}

/**
 * Base adapter class that all specific adapters extend
 */
export abstract class BaseAdapter {
    protected config: AdapterConfig;

    constructor(config: AdapterConfig = {}) {
        this.config = {
            skipEmptyRows: true,
            skipHeaderRow: true,
            dateFormat: 'YYYY-MM-DD',
            ...config
        };
    }

    /**
     * Detect if this adapter can handle the given file
     */
    abstract canHandle(file: File): boolean;

    /**
     * Parse the file and convert to our internal format
     */
    abstract parse(file: File): Promise<AdapterResult>;

    /**
     * Get the adapter name for display
     */
    abstract getName(): string;

    /**
     * Get description of what this adapter handles
     */
    abstract getDescription(): string;

    /**
     * Get example file format or structure
     */
    abstract getExampleFormat(): string;

    /**
     * Validate the parsed data against our schemas
     */
    async validate(result: AdapterResult, currentState: AppState): Promise<ImportValidationResult> {
        // Import dynamically to avoid circular dependencies
        const { validateImport } = await import('../importValidator');
        return validateImport(result.sheets, currentState);
    }

    /**
     * Helper to normalize date strings
     */
    protected normalizeDate(dateValue: any, format?: string): string {
        if (!dateValue) return '';
        
        // If already ISO string, return as-is
        if (typeof dateValue === 'string' && dateValue.match(/^\d{4}-\d{2}-\d{2}/)) {
            return dateValue;
        }

        // Try to parse as date
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
        }

        // Try common date formats
        const formats = [
            /(\d{2})\/(\d{2})\/(\d{4})/, // MM/DD/YYYY
            /(\d{4})-(\d{2})-(\d{2})/,   // YYYY-MM-DD
            /(\d{2})-(\d{2})-(\d{4})/,   // MM-DD-YYYY
        ];

        for (const regex of formats) {
            const match = String(dateValue).match(regex);
            if (match) {
                if (regex === formats[0] || regex === formats[2]) {
                    // MM/DD/YYYY or MM-DD-YYYY
                    const [, month, day, year] = match;
                    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                } else {
                    // YYYY-MM-DD
                    return match[0];
                }
            }
        }

        return String(dateValue);
    }

    /**
     * Helper to normalize numeric values
     */
    protected normalizeNumber(value: any): number {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
            // Remove currency symbols, commas, etc.
            const cleaned = value.replace(/[^\d.-]/g, '');
            const parsed = parseFloat(cleaned);
            return isNaN(parsed) ? 0 : parsed;
        }
        return 0;
    }

    /**
     * Helper to normalize text values
     */
    protected normalizeText(value: any): string {
        if (value === null || value === undefined) return '';
        return String(value).trim();
    }
}

