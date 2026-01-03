
import React, { useState, useRef, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { GoogleGenAI } from "@google/genai";
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import { ICONS } from '../../constants';
import { useNotification } from '../../context/NotificationContext';
import { useAppContext } from '../../context/AppContext';
import { adapterRegistry, AdapterResult } from '../../services/adapters';
import { validateImport, ImportValidationResult } from '../../services/importValidator';
import { runImportProcess } from '../../services/importService';
import { useProgress } from '../../context/ProgressContext';

interface MigratAIWizardProps {
    onClose: () => void;
}

type WizardStep = 'upload' | 'map' | 'validate' | 'process';

interface FileData {
    name: string;
    headers: string[];
    rows: any[];
}

interface ColumnMapping {
    templateHeader: string;
    sourceHeader: string; // '' if not mapped
    instruction: string; // Natural language instruction
    script: string; // Executable JS
    isGenerating?: boolean;
}

const MigratAIWizard: React.FC<MigratAIWizardProps> = ({ onClose }) => {
    const { showToast, showAlert } = useNotification();
    const { state, dispatch } = useAppContext();
    const progress = useProgress();
    const [step, setStep] = useState<WizardStep>('upload');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isAiMapping, setIsAiMapping] = useState(false);
    const [isValidating, setIsValidating] = useState(false);

    // Data State
    const [sourceFile, setSourceFile] = useState<FileData | null>(null);
    const [templateFile, setTemplateFile] = useState<FileData | null>(null);
    const [mappings, setMappings] = useState<ColumnMapping[]>([]);
    const [recordLimit, setRecordLimit] = useState<string>('');
    const [selectedAdapter, setSelectedAdapter] = useState<string>('');
    const [adapterResult, setAdapterResult] = useState<AdapterResult | null>(null);

    // Validation State
    const [validationResult, setValidationResult] = useState<ImportValidationResult | null>(null);

    // Process Result
    const [processedWorkbook, setProcessedWorkbook] = useState<XLSX.WorkBook | null>(null);
    const [processedCount, setProcessedCount] = useState(0);

    const sourceInputRef = useRef<HTMLInputElement>(null);
    const templateInputRef = useRef<HTMLInputElement>(null);

    // --- File Handling ---

    const parseExcel = (file: File): Promise<FileData> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = e.target?.result;
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

                    if (json.length === 0) throw new Error("File appears empty");

                    const headers = json[0] as string[];
                    const rows = XLSX.utils.sheet_to_json(worksheet); // Standard object array for data

                    resolve({
                        name: file.name,
                        headers: headers.filter(h => h), // Filter empty headers
                        rows: rows
                    });
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'source' | 'template') => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            if (type === 'source') {
                // Try to find an adapter for the source file
                const adapter = adapterRegistry.findAdapter(file);
                if (adapter) {
                    setSelectedAdapter(adapter.getName());
                    const result = await adapter.parse(file);
                    setAdapterResult(result);

                    // Convert adapter result to FileData format for compatibility
                    const firstSheet = Object.keys(result.sheets)[0];
                    const firstSheetData = result.sheets[firstSheet] || [];
                    const headers = firstSheetData.length > 0 ? Object.keys(firstSheetData[0]) : [];

                    setSourceFile({
                        name: file.name,
                        headers,
                        rows: firstSheetData
                    });
                    setRecordLimit(firstSheetData.length.toString());

                    showToast(`File parsed using ${adapter.getName()} adapter`, 'success');
                } else {
                    // Fallback to standard Excel parsing
                    const data = await parseExcel(file);
                    setSourceFile(data);
                    setRecordLimit(data.rows.length.toString());
                }
            } else {
                const data = await parseExcel(file);
                setTemplateFile(data);
                // Initialize default mappings
                const initialMappings = data.headers.map(h => ({
                    templateHeader: h,
                    sourceHeader: '',
                    instruction: '',
                    script: 'return value;'
                }));
                setMappings(initialMappings);
            }
        } catch (error) {
            console.error(error);
            showAlert("Failed to read file. Please ensure it is a valid file format.");
        }
    };

    const handleValidate = async () => {
        if (!adapterResult) {
            // If no adapter was used, validate the processed workbook
            if (!processedWorkbook) {
                showAlert("Please process the migration first before validating.");
                return;
            }

            // Convert workbook to sheets format
            const sheets: { [key: string]: any[] } = {};
            processedWorkbook.SheetNames.forEach(sheetName => {
                const worksheet = processedWorkbook.Sheets[sheetName];
                sheets[sheetName] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
            });

            setIsValidating(true);
            try {
                const result = validateImport(sheets, state);
                setValidationResult(result);
                setStep('validate');
            } finally {
                setIsValidating(false);
            }
            return;
        }

        setIsValidating(true);
        try {
            const result = validateImport(adapterResult.sheets, state);
            setValidationResult(result);
            setStep('validate');
        } catch (error) {
            showAlert(`Validation failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsValidating(false);
        }
    };

    const handleImport = async () => {
        if (!adapterResult && !processedWorkbook) {
            showAlert("No data to import. Please process the migration first.");
            return;
        }

        const sheets = adapterResult
            ? adapterResult.sheets
            : (() => {
                const result: { [key: string]: any[] } = {};
                if (processedWorkbook) {
                    processedWorkbook.SheetNames.forEach(sheetName => {
                        const worksheet = processedWorkbook.Sheets[sheetName];
                        result[sheetName] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
                    });
                }
                return result;
            })();

        setIsProcessing(true);
        progress.startProgress('Importing Data');

        try {
            const summary = await runImportProcess(
                sheets,
                state,
                dispatch,
                progress,
                (entry) => {
                    // Log entries can be handled here if needed
                }
            );

            if (summary.errors === 0) {
                progress.finishProgress(`Import complete! ${summary.success} added, ${summary.skipped} skipped.`);
                showToast(`Successfully imported ${summary.success} records`, 'success');
                onClose();
            } else {
                progress.finishProgress(`Import complete with ${summary.errors} error(s).`);
                showAlert(`Import completed with ${summary.errors} error(s). Check the import log for details.`);
            }
        } catch (error) {
            progress.errorProgress(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
            showAlert(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsProcessing(false);
        }
    };

    // --- AI Auto-Mapping ---

    const handleAutoMap = async () => {
        if (!sourceFile || !templateFile || !process.env.API_KEY) return;

        setIsAiMapping(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

            const prompt = `
                I have two lists of column headers from Excel files. 
                Source Headers: ${JSON.stringify(sourceFile.headers)}
                Template Headers (Target): ${JSON.stringify(templateFile.headers)}
                
                Please match the Source headers to the Template headers based on semantic similarity.
                Return ONLY a JSON object where keys are Template Headers and values are the matching Source Headers.
                If no good match exists for a template header, do not include it in the JSON.
                
                Example output format: { "First Name": "FName", "Address": "Addr Line 1" }
            `;

            const result = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });

            const responseText = result.text || '';
            const jsonStr = responseText.replace(/```json|```/g, '').trim();
            const mapResult = JSON.parse(jsonStr);

            setMappings(prev => prev.map(m => ({
                ...m,
                sourceHeader: mapResult[m.templateHeader] || m.sourceHeader
            })));

            showToast("Auto-mapping complete!", "success");
        } catch (error: any) {
            console.error(error);
            const errString = JSON.stringify(error);
            if (errString.includes('429') || errString.includes('RESOURCE_EXHAUSTED')) {
                showToast("AI quota exceeded. Please map columns manually.", "info");
            } else {
                showToast("AI Auto-mapping failed. Please map manually.", "error");
            }
        } finally {
            setIsAiMapping(false);
        }
    };

    // --- AI Script Generation ---

    const generateScript = async (index: number, instruction: string) => {
        if (!process.env.API_KEY) return;

        // If instruction is empty, reset to default
        if (!instruction.trim()) {
            setMappings(prev => {
                const newMap = [...prev];
                newMap[index] = { ...newMap[index], script: 'return value;', isGenerating: false };
                return newMap;
            });
            return;
        }

        setMappings(prev => {
            const newMap = [...prev];
            newMap[index] = { ...newMap[index], isGenerating: true };
            return newMap;
        });

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const prompt = `
                You are a JavaScript code generator for an Excel migration tool.
                Write a SINGLE JavaScript function body to transform a value based on the user's instruction.
                
                Available variables:
                - \`value\`: The cell value from the source column (may be undefined/null).
                - \`row\`: The entire source row object (key-value pairs).
                - \`index\`: The current row index (0-based integer).
                
                Instruction: "${instruction}"
                
                Requirements:
                - Return the transformed value.
                - Handle null/undefined inputs gracefully.
                - Do not output markdown blocks.
                - Do not output explanation. Only the code.
                
                Examples:
                User: "Convert to uppercase"
                Output: return value ? String(value).toUpperCase() : "";
                
                User: "Add auto number starting from INV-0001"
                Output: return "INV-" + String(index + 1).padStart(4, '0');
                
                User: "Extract between '(' and ')'"
                Output: if (!value) return ""; const s = String(value); const start = s.indexOf('('); const end = s.indexOf(')'); if (start > -1 && end > start) return s.substring(start + 1, end); return value;
                
                User: "Set to 'Active' if empty"
                Output: return value || "Active";
            `;

            const result = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });

            let code = result.text?.trim() || 'return value;';
            // Strip markdown code blocks if present
            if (code.startsWith('```')) {
                code = code.replace(/^```(javascript|js)?\s*/, '').replace(/\s*```$/, '');
            }

            setMappings(prev => {
                const newMap = [...prev];
                newMap[index] = { ...newMap[index], script: code, isGenerating: false };
                return newMap;
            });

        } catch (error: any) {
            console.error("Script generation failed", error);
            setMappings(prev => {
                const newMap = [...prev];
                newMap[index] = { ...newMap[index], isGenerating: false };
                return newMap;
            });

            const errString = JSON.stringify(error);
            if (errString.includes('429') || errString.includes('RESOURCE_EXHAUSTED')) {
                showToast("AI Quota Exceeded. Please enter logic manually.", "error");
            } else {
                showToast("Failed to interpret instruction.", "error");
            }
        }
    };

    const handleInstructionBlur = (index: number) => {
        const mapping = mappings[index];
        // Only generate if instruction is present (or we want to reset)
        generateScript(index, mapping.instruction);
    };

    const updateMapping = (index: number, field: keyof ColumnMapping, value: string) => {
        setMappings(prev => {
            const newMap = [...prev];
            newMap[index] = { ...newMap[index], [field]: value };
            return newMap;
        });
    };

    const getPreviewValue = (mapping: ColumnMapping) => {
        if (!sourceFile || !sourceFile.rows.length) return "No Source Data";

        const sampleRow = sourceFile.rows[0];
        const rawValue = mapping.sourceHeader ? sampleRow[mapping.sourceHeader] : undefined;

        try {
            // Safe-ish execution function
            // We provide 'value', 'row' (full source row), and 'index' to the script
            const func = new Function('value', 'row', 'index', mapping.script);
            const result = func(rawValue, sampleRow, 0);
            return result === undefined || result === null ? '(empty)' : String(result);
        } catch (e) {
            return "Script Error";
        }
    };

    // --- Execution ---

    const runMigration = async () => {
        if (!sourceFile || !templateFile) return;

        const limit = parseInt(recordLimit) || sourceFile.rows.length;
        if (limit > sourceFile.rows.length) {
            await showAlert(`Record limit cannot exceed total source rows (${sourceFile.rows.length}).`);
            return;
        }

        setIsProcessing(true);

        // Allow UI to render loading state
        await new Promise(r => setTimeout(r, 100));

        try {
            const newRows = [];
            const rowsToProcess = sourceFile.rows.slice(0, limit);

            for (let i = 0; i < rowsToProcess.length; i++) {
                const sourceRow = rowsToProcess[i];
                const newRow: Record<string, any> = {};

                mappings.forEach(m => {
                    const rawVal = m.sourceHeader ? sourceRow[m.sourceHeader] : undefined;
                    try {
                        const func = new Function('value', 'row', 'index', m.script);
                        newRow[m.templateHeader] = func(rawVal, sourceRow, i);
                    } catch (e) {
                        newRow[m.templateHeader] = "ERROR";
                    }
                });

                newRows.push(newRow);
            }

            // Create Workbook
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(newRows);
            XLSX.utils.book_append_sheet(wb, ws, "Migrated Data");

            setProcessedWorkbook(wb);
            setProcessedCount(newRows.length);
            setStep('process');

        } catch (e) {
            console.error(e);
            showAlert("An error occurred during migration processing.");
        } finally {
            setIsProcessing(false);
        }
    };

    const downloadFile = () => {
        if (processedWorkbook) {
            XLSX.writeFile(processedWorkbook, `migrated_data_${new Date().toISOString().split('T')[0]}.xlsx`);
        }
    };

    // --- Render Helpers ---

    const renderUploadStep = () => (
        <div className="space-y-8 py-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Source File */}
                <div
                    className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all cursor-pointer hover:bg-slate-50 ${sourceFile ? 'border-emerald-400 bg-emerald-50/30' : 'border-slate-300'}`}
                    onClick={() => sourceInputRef.current?.click()}
                >
                    <input type="file" accept=".xlsx, .xls, .csv" ref={sourceInputRef} className="hidden" onChange={(e) => handleFileUpload(e, 'source')} />
                    <div className={`w-16 h-16 mb-4 rounded-full flex items-center justify-center ${sourceFile ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                        {sourceFile ? <span className="text-2xl">✓</span> : <div className="w-8 h-8">{ICONS.fileText}</div>}
                    </div>
                    <h3 className="font-bold text-slate-700 mb-1">1. Source Data File</h3>
                    <p className="text-sm text-slate-500 max-w-xs">
                        {sourceFile ? sourceFile.name : "Click to upload the file containing your raw data (.xlsx)"}
                    </p>
                    {sourceFile && <span className="mt-2 text-xs font-bold text-emerald-600">{sourceFile.rows.length} rows found</span>}
                </div>

                {/* Template File */}
                <div
                    className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all cursor-pointer hover:bg-slate-50 ${templateFile ? 'border-indigo-400 bg-indigo-50/30' : 'border-slate-300'}`}
                    onClick={() => templateInputRef.current?.click()}
                >
                    <input type="file" accept=".xlsx, .xls" ref={templateInputRef} className="hidden" onChange={(e) => handleFileUpload(e, 'template')} />
                    <div className={`w-16 h-16 mb-4 rounded-full flex items-center justify-center ${templateFile ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                        {templateFile ? <span className="text-2xl">✓</span> : <div className="w-8 h-8">{ICONS.briefcase}</div>}
                    </div>
                    <h3 className="font-bold text-slate-700 mb-1">2. Template File</h3>
                    <p className="text-sm text-slate-500 max-w-xs">
                        {templateFile ? templateFile.name : "Click to upload the file with required column structure (.xlsx)"}
                    </p>
                    {templateFile && <span className="mt-2 text-xs font-bold text-indigo-600">{templateFile.headers.length} columns found</span>}
                </div>
            </div>

            <div className="flex justify-center pt-4">
                <Button
                    onClick={() => setStep('map')}
                    disabled={!sourceFile || !templateFile}
                    className="w-full md:w-auto px-8 py-3 text-lg"
                >
                    Continue to Mapping
                </Button>
            </div>
        </div>
    );

    const renderMappingStep = () => (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex justify-between items-center mb-4 flex-shrink-0">
                <div>
                    <h3 className="text-lg font-bold text-slate-800">Map & Transform Columns</h3>
                    <p className="text-sm text-slate-500">Match source columns to template columns and define transformation rules.</p>
                </div>
                <Button onClick={handleAutoMap} disabled={isAiMapping} variant="secondary" className="border-indigo-200 bg-indigo-50 text-indigo-700">
                    {isAiMapping ? (
                        <span className="flex items-center gap-2"><div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full"></div> AI Mapping...</span>
                    ) : (
                        <span className="flex items-center gap-2">✨ Auto-Map Columns (AI)</span>
                    )}
                </Button>
            </div>

            <div className="flex-grow overflow-y-auto pr-2 space-y-3 pb-4">
                {mappings.map((map, idx) => (
                    <div key={idx} className="bg-slate-50 p-4 rounded-lg border border-slate-200 hover:border-indigo-300 transition-colors">
                        <div className="flex flex-col lg:flex-row gap-4">
                            {/* Target Column (Fixed) */}
                            <div className="w-full lg:w-1/4">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Template Column (Target)</label>
                                <div className="bg-white border border-slate-300 rounded px-3 py-2 text-sm font-bold text-slate-800 shadow-sm">
                                    {map.templateHeader}
                                </div>
                            </div>

                            {/* Source Mapper */}
                            <div className="w-full lg:w-1/4">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Map from Source</label>
                                <select
                                    className="block w-full px-3 py-2 border border-slate-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm"
                                    value={map.sourceHeader}
                                    onChange={(e) => updateMapping(idx, 'sourceHeader', e.target.value)}
                                >
                                    <option value="">(Select Source Column)</option>
                                    <option value="" disabled>---</option>
                                    {sourceFile?.headers.map(h => (
                                        <option key={h} value={h}>{h}</option>
                                    ))}
                                </select>
                            </div>

                            {/* AI Instruction Scripting */}
                            <div className="w-full lg:w-2/4 relative">
                                <div className="flex justify-between items-baseline mb-1">
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Transformation Rules (AI)</label>
                                    <div className="text-[10px] font-mono">
                                        {map.isGenerating ? (
                                            <span className="text-indigo-600 animate-pulse">Generating logic...</span>
                                        ) : (
                                            <span className="text-slate-400">Preview: <span className="text-slate-700 font-bold">{getPreviewValue(map)}</span></span>
                                        )}
                                    </div>
                                </div>
                                <textarea
                                    className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm h-20"
                                    value={map.instruction}
                                    onChange={(e) => updateMapping(idx, 'instruction', e.target.value)}
                                    onBlur={() => handleInstructionBlur(idx)}
                                    placeholder='e.g. "Convert to uppercase", "Add 123 if empty", "Auto number from 100"'
                                    spellCheck={false}
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="border-t pt-4 flex items-center justify-between flex-shrink-0 bg-white">
                <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-slate-700">Rows to Process:</label>
                    <input
                        type="number"
                        value={recordLimit}
                        onChange={(e) => setRecordLimit(e.target.value)}
                        className="w-24 border border-slate-300 rounded px-2 py-1 text-sm text-center"
                        min="1"
                        max={sourceFile?.rows.length}
                    />
                    <span className="text-xs text-slate-400">/ {sourceFile?.rows.length} total</span>
                </div>
                <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setStep('upload')}>Back</Button>
                    <Button
                        onClick={handleValidate}
                        disabled={isValidating}
                        variant="secondary"
                        className="border-amber-200 bg-amber-50 text-amber-700"
                    >
                        {isValidating ? 'Validating...' : 'Validate Data'}
                    </Button>
                    <Button onClick={runMigration} disabled={isProcessing} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                        {isProcessing ? 'Processing...' : 'Run Migration'}
                    </Button>
                </div>
            </div>
        </div>
    );

    const renderValidateStep = () => (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="mb-4 flex-shrink-0">
                <h3 className="text-lg font-bold text-slate-800 mb-2">Validation Results</h3>
                <p className="text-sm text-slate-500">Review validation results before importing data.</p>
            </div>

            {validationResult && (
                <div className="flex-grow overflow-y-auto space-y-4 pb-4">
                    {/* Stats */}
                    <div className="grid grid-cols-4 gap-4">
                        <div className="text-center p-3 bg-slate-50 rounded-lg">
                            <div className="text-2xl font-bold text-slate-700">{validationResult.stats.totalRows}</div>
                            <div className="text-xs text-slate-600">Total Rows</div>
                        </div>
                        <div className="text-center p-3 bg-emerald-50 rounded-lg">
                            <div className="text-2xl font-bold text-emerald-700">{validationResult.stats.validRows}</div>
                            <div className="text-xs text-emerald-600">Valid</div>
                        </div>
                        <div className="text-center p-3 bg-rose-50 rounded-lg">
                            <div className="text-2xl font-bold text-rose-700">{validationResult.stats.invalidRows}</div>
                            <div className="text-xs text-rose-600">Errors</div>
                        </div>
                        <div className="text-center p-3 bg-amber-50 rounded-lg">
                            <div className="text-2xl font-bold text-amber-700">{validationResult.warnings.length}</div>
                            <div className="text-xs text-amber-600">Warnings</div>
                        </div>
                    </div>

                    {/* Errors */}
                    {validationResult.errors.length > 0 && (
                        <div className="border border-rose-200 rounded-lg p-4 bg-rose-50">
                            <h4 className="font-semibold text-rose-800 mb-2">Errors (must be fixed):</h4>
                            <div className="max-h-60 overflow-y-auto space-y-1">
                                {validationResult.errors.slice(0, 50).map((error, idx) => (
                                    <div key={idx} className="text-sm text-rose-700">
                                        <span className="font-medium">{error.sheet}</span> Row {error.row}: {error.message}
                                    </div>
                                ))}
                                {validationResult.errors.length > 50 && (
                                    <div className="text-xs text-rose-600 mt-2">... and {validationResult.errors.length - 50} more errors</div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Warnings */}
                    {validationResult.warnings.length > 0 && (
                        <div className="border border-amber-200 rounded-lg p-4 bg-amber-50">
                            <h4 className="font-semibold text-amber-800 mb-2">Warnings:</h4>
                            <div className="max-h-60 overflow-y-auto space-y-1">
                                {validationResult.warnings.slice(0, 30).map((warning, idx) => (
                                    <div key={idx} className="text-sm text-amber-700">
                                        <span className="font-medium">{warning.sheet}</span> Row {warning.row}: {warning.message}
                                    </div>
                                ))}
                                {validationResult.warnings.length > 30 && (
                                    <div className="text-xs text-amber-600 mt-2">... and {validationResult.warnings.length - 30} more warnings</div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Success Message */}
                    {validationResult.valid && (
                        <div className="border border-emerald-200 rounded-lg p-4 bg-emerald-50">
                            <div className="flex items-center gap-2 text-emerald-800">
                                <span className="text-xl">✓</span>
                                <span className="font-semibold">All validations passed! Ready to import.</span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="border-t pt-4 flex items-center justify-between flex-shrink-0 bg-white">
                <Button variant="secondary" onClick={() => setStep('map')}>Back to Mapping</Button>
                <div className="flex gap-2">
                    {validationResult && validationResult.valid && (
                        <Button onClick={handleImport} disabled={isProcessing} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                            {isProcessing ? 'Importing...' : 'Import Validated Data'}
                        </Button>
                    )}
                    <Button onClick={downloadFile} variant="secondary">
                        <div className="w-4 h-4 mr-2">{ICONS.download}</div>
                        Download Migrated File
                    </Button>
                </div>
            </div>
        </div>
    );

    const renderProcessStep = () => (
        <div className="flex flex-col items-center justify-center h-full py-12">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6 animate-bounce">
                <span className="text-4xl">✓</span>
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-2">Migration Successful!</h3>
            <p className="text-slate-600 mb-8 text-center max-w-md">
                Successfully processed <strong>{processedCount}</strong> records mapped to the template structure.
            </p>

            <div className="flex flex-col gap-4 w-full max-w-xs">
                <Button onClick={downloadFile} className="w-full justify-center py-3 text-lg">
                    <div className="w-5 h-5 mr-2">{ICONS.download}</div>
                    Download Migrated File
                </Button>
                <Button variant="secondary" onClick={onClose} className="w-full justify-center">
                    Close Wizard
                </Button>
            </div>
        </div>
    );

    return (
        <div className="h-full flex flex-col">
            {/* Header Steps */}
            <div className="flex items-center justify-center mb-6 border-b pb-4">
                <div className={`flex items-center gap-2 ${step === 'upload' ? 'text-accent font-bold' : 'text-slate-400'}`}>
                    <div className="w-6 h-6 rounded-full border-2 border-current flex items-center justify-center text-xs">1</div>
                    Upload
                </div>
                <div className="w-12 h-0.5 bg-slate-200 mx-4"></div>
                <div className={`flex items-center gap-2 ${step === 'map' ? 'text-accent font-bold' : 'text-slate-400'}`}>
                    <div className="w-6 h-6 rounded-full border-2 border-current flex items-center justify-center text-xs">2</div>
                    Map & Transform
                </div>
                <div className="w-12 h-0.5 bg-slate-200 mx-4"></div>
                <div className={`flex items-center gap-2 ${step === 'process' ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
                    <div className="w-6 h-6 rounded-full border-2 border-current flex items-center justify-center text-xs">3</div>
                    Download
                </div>
            </div>

            {/* Content */}
            <div className="flex-grow overflow-hidden">
                {step === 'upload' && renderUploadStep()}
                {step === 'map' && renderMappingStep()}
                {step === 'validate' && renderValidateStep()}
                {step === 'process' && renderProcessStep()}
            </div>
        </div>
    );
};

export default MigratAIWizard;
