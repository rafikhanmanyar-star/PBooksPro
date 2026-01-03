
import { useState, useCallback } from 'react';
import { AppState } from '../types';
import { validateImport, ImportValidationResult } from '../services/importValidator';
import * as XLSX from 'xlsx';

export const useImportValidation = (currentState: AppState) => {
    const [validationResult, setValidationResult] = useState<ImportValidationResult | null>(null);
    const [isValidating, setIsValidating] = useState(false);
    
    const validateFile = useCallback(async (file: File): Promise<ImportValidationResult> => {
        setIsValidating(true);
        try {
            const data = await new Promise<ArrayBuffer>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
                reader.onerror = reject;
                reader.readAsArrayBuffer(file);
            });
            
            const workbook = XLSX.read(data, { type: 'array' });
            const sheets: { [key: string]: any[] } = {};
            
            workbook.SheetNames.forEach(sheetName => {
                const worksheet = workbook.Sheets[sheetName];
                sheets[sheetName] = XLSX.utils.sheet_to_json(worksheet);
            });
            
            const result = validateImport(sheets, currentState);
            setValidationResult(result);
            return result;
        } catch (error) {
            const emptyResult: ImportValidationResult = {
                valid: false,
                errors: [{
                    sheet: 'File',
                    row: 0,
                    message: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
                    severity: 'error'
                }],
                warnings: [],
                preview: [],
                stats: {
                    totalRows: 0,
                    validRows: 0,
                    invalidRows: 0,
                    skippedRows: 0
                }
            };
            setValidationResult(emptyResult);
            return emptyResult;
        } finally {
            setIsValidating(false);
        }
    }, [currentState]);
    
    const clearValidation = useCallback(() => {
        setValidationResult(null);
    }, []);
    
    return {
        validationResult,
        isValidating,
        validateFile,
        clearValidation
    };
};

