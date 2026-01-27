
import * as XLSX from 'xlsx';
import { BaseAdapter, AdapterResult, AdapterConfig } from './baseAdapter';

/**
 * Generic Excel adapter for standard Excel files
 * Handles .xlsx and .xls files with multiple sheets
 */
export class ExcelAdapter extends BaseAdapter {
    constructor(config: AdapterConfig = {}) {
        super(config);
    }

    canHandle(file: File): boolean {
        const ext = file.name.toLowerCase().split('.').pop();
        return ext === 'xlsx' || ext === 'xls';
    }

    getName(): string {
        return 'Excel (Generic)';
    }

    getDescription(): string {
        return 'Handles standard Excel files (.xlsx, .xls) with multiple sheets. Automatically detects sheet structure.';
    }

    getExampleFormat(): string {
        return 'Standard Excel format with headers in first row. Supports multiple sheets.';
    }

    async parse(file: File): Promise<AdapterResult> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = e.target?.result;
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheets: { [key: string]: any[] } = {};
                    const warnings: string[] = [];
                    let totalRecords = 0;

                    workbook.SheetNames.forEach(sheetName => {
                        const worksheet = workbook.Sheets[sheetName];
                        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                            defval: '',
                            raw: false // Convert all to strings for consistency
                        });

                        if (jsonData.length === 0) {
                            warnings.push(`Sheet "${sheetName}" is empty`);
                            sheets[sheetName] = [];
                            return;
                        }

                        // Filter empty rows if configured
                        const filteredData = this.config.skipEmptyRows
                            ? jsonData.filter((row: any) => {
                                return Object.values(row).some(val => 
                                    val !== null && val !== undefined && String(val).trim() !== ''
                                );
                            })
                            : jsonData;

                        sheets[sheetName] = filteredData;
                        totalRecords += filteredData.length;
                    });

                    resolve({
                        sheets,
                        metadata: {
                            sourceSystem: 'Excel',
                            sourceFormat: file.name.toLowerCase().endsWith('.xlsx') ? 'XLSX' : 'XLS',
                            recordCount: totalRecords,
                            sheets: workbook.SheetNames,
                            warnings
                        }
                    });
                } catch (error) {
                    reject(new Error(`Failed to parse Excel file: ${error instanceof Error ? error.message : String(error)}`));
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsArrayBuffer(file);
        });
    }
}

