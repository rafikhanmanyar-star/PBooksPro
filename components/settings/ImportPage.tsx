/**
 * @deprecated This component is deprecated. Use ImportExportWizard instead.
 * This file is kept for reference only. The new import/export system provides:
 * - Wizard-style UI
 * - All-or-nothing validation
 * - Better error handling
 * - Unified template/export/import flow
 * 
 * To use the new system, navigate to Settings > Data Management > Import/Export
 * or use the 'import' page which now loads ImportExportWizard.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Page, ImportLogEntry } from '../../types';
import { ICONS } from '../../constants';
import { useAppContext } from '../../context/AppContext';
import { exportLogToExcel } from '../../services/exportService';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import { useProgress } from '../../context/ProgressContext';
import { useImportValidation } from '../../hooks/useImportValidation';
import { 
    runImportProcess, 
    importFromExcel, 
    ImportType, 
    generateImportTemplate,
    runImportAccounts,
    runImportContacts,
    runImportVendors,
    runImportCategories,
    runImportProjects,
    runImportBuildings,
    runImportProperties,
    runImportUnits,
    runImportStaff,
    runImportAgreements,
    runImportRentalAgreements,
    runImportProjectAgreements,
    runImportContracts,
    runImportInvoices, 
    runImportBills, 
    runImportProjectBills,
    runImportRentalBills,
    runImportPayments,
    runImportRentalInvoicePayments,
    runImportProjectInvoicePayments,
    runImportRentalBillPayments,
    runImportProjectBillPayments,
    runImportLoanTransactions,
    runImportEquityTransactions,
    runImportTransferTransactions,
    runImportIncomeTransactions,
    runImportExpenseTransactions,
    runImportRecurringTemplates,
    runImportPayslips,
    runImportBudgets
} from '../../services/importService';


interface ImportPageProps {
  // goBack prop removed
}

type ImportStatus = 'idle' | 'reading' | 'importing' | 'complete';

const LogEntry: React.FC<{ entry: ImportLogEntry; onClick: (entry: ImportLogEntry) => void }> = ({ entry, onClick }) => {
    const statusColors = {
        Success: 'bg-emerald-100 text-emerald-800',
        Skipped: 'bg-amber-100 text-amber-800',
        Error: 'bg-rose-100 text-rose-800',
    };
    
    const isError = entry.status === 'Error';
    const rowClass = `text-xs border-b border-slate-100 last:border-0 transition-colors cursor-pointer ${
        isError ? 'bg-rose-50/40 hover:bg-rose-100/60' : 'hover:bg-slate-50'
    }`;

    return (
        <tr className={rowClass} onClick={() => onClick(entry)} title="Click to view details">
            <td className="px-2 py-2 whitespace-nowrap">{entry.sheet}</td>
            <td className="px-2 py-2 text-center">{entry.row > 1 ? entry.row : '-'}</td>
            <td className="px-2 py-2">
                <span className={`px-2 py-0.5 font-semibold rounded-full text-[10px] ${statusColors[entry.status]}`}>
                    {entry.status}
                </span>
            </td>
            <td className="px-2 py-2 text-slate-600 truncate max-w-md">{entry.message}</td>
        </tr>
    );
};

const ImportPage: React.FC<ImportPageProps> = () => {
    const { state, dispatch } = useAppContext();
    const [status, setStatus] = useState<ImportStatus>('idle');
    const [fileName, setFileName] = useState<string | null>(null);
    const [log, setLog] = useState<ImportLogEntry[]>([]);
    const [selectedLogEntry, setSelectedLogEntry] = useState<ImportLogEntry | null>(null);
    const [importType, setImportType] = useState<ImportType>(
        (state.initialImportType as ImportType) || ImportType.FULL
    );
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [copyLogButtonText, setCopyLogButtonText] = useState<string>('Copy Log');
    const [copyEntryButtonText, setCopyEntryButtonText] = useState<string>('Copy Entry');
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const progress = useProgress();
    const { validationResult, isValidating, validateFile, clearValidation } = useImportValidation(state);

    const goBack = () => dispatch({ type: 'SET_PAGE', payload: 'settings' });

    // If another page deep-linked into Bulk Import with a preselected type, apply it once.
    useEffect(() => {
        if (state.initialImportType) {
            setImportType(state.initialImportType as ImportType);
            dispatch({ type: 'CLEAR_INITIAL_IMPORT_TYPE' });
        }
    }, [state.initialImportType, dispatch]);

    const handleFileSelectClick = () => {
        fileInputRef.current?.click();
    };
    
    const resetState = () => {
        setStatus('idle');
        setFileName(null);
        setLog([]);
        setSelectedFile(null);
        setImportType(ImportType.FULL);
        clearValidation();
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleLogEntry = useCallback((entry: ImportLogEntry) => {
        setLog(prev => [...prev, entry]);
    }, []);

    const processData = async (data: { [key: string]: any[] }) => {
        setStatus('importing');
        progress.startProgress('Importing Data');
        setLog([]);

        let summary;
        try {
            // Route to appropriate import function based on type
            switch (importType) {
                case ImportType.ACCOUNTS:
                    summary = await runImportAccounts(data, state, dispatch, progress, handleLogEntry);
                    break;
                case ImportType.CONTACTS:
                    summary = await runImportContacts(data, state, dispatch, progress, handleLogEntry);
                    break;
                case ImportType.VENDORS:
                    summary = await runImportVendors(data, state, dispatch, progress, handleLogEntry);
                    break;
                case ImportType.CATEGORIES:
                    summary = await runImportCategories(data, state, dispatch, progress, handleLogEntry);
                    break;
                case ImportType.PROJECTS:
                    summary = await runImportProjects(data, state, dispatch, progress, handleLogEntry);
                    break;
                case ImportType.BUILDINGS:
                    summary = await runImportBuildings(data, state, dispatch, progress, handleLogEntry);
                    break;
                case ImportType.PROPERTIES:
                    summary = await runImportProperties(data, state, dispatch, progress, handleLogEntry);
                    break;
                case ImportType.UNITS:
                    summary = await runImportUnits(data, state, dispatch, progress, handleLogEntry);
                    break;
                case ImportType.STAFF:
                    summary = await runImportStaff(data, state, dispatch, progress, handleLogEntry);
                    break;
                case ImportType.AGREEMENTS:
                    summary = await runImportAgreements(data, state, dispatch, progress, handleLogEntry);
                    break;
                case ImportType.RENTAL_AGREEMENTS:
                    summary = await runImportRentalAgreements(data, state, dispatch, progress, handleLogEntry);
                    break;
                case ImportType.PROJECT_AGREEMENTS:
                    summary = await runImportProjectAgreements(data, state, dispatch, progress, handleLogEntry);
                    break;
                case ImportType.CONTRACTS:
                    summary = await runImportContracts(data, state, dispatch, progress, handleLogEntry);
                    break;
                case ImportType.INVOICES:
                    summary = await runImportInvoices(data, state, dispatch, progress, handleLogEntry);
                    break;
                case ImportType.BILLS:
                    summary = await runImportBills(data, state, dispatch, progress, handleLogEntry);
                    break;
                case ImportType.PROJECT_BILLS:
                    summary = await runImportProjectBills(data, state, dispatch, progress, handleLogEntry);
                    break;
                case ImportType.RENTAL_BILLS:
                    summary = await runImportRentalBills(data, state, dispatch, progress, handleLogEntry);
                    break;
                case ImportType.PAYMENTS:
                    summary = await runImportPayments(data, state, dispatch, progress, handleLogEntry);
                    break;
                case ImportType.RENTAL_INVOICE_PAYMENTS:
                    summary = await runImportRentalInvoicePayments(data, state, dispatch, progress, handleLogEntry);
                    break;
                case ImportType.PROJECT_INVOICE_PAYMENTS:
                    summary = await runImportProjectInvoicePayments(data, state, dispatch, progress, handleLogEntry);
                    break;
                case ImportType.RENTAL_BILL_PAYMENTS:
                    summary = await runImportRentalBillPayments(data, state, dispatch, progress, handleLogEntry);
                    break;
                case ImportType.PROJECT_BILL_PAYMENTS:
                    summary = await runImportProjectBillPayments(data, state, dispatch, progress, handleLogEntry);
                    break;
                case ImportType.LOAN_TRANSACTIONS:
                    summary = await runImportLoanTransactions(data, state, dispatch, progress, handleLogEntry);
                    break;
                case ImportType.EQUITY_TRANSACTIONS:
                    summary = await runImportEquityTransactions(data, state, dispatch, progress, handleLogEntry);
                    break;
                case ImportType.TRANSFER_TRANSACTIONS:
                    summary = await runImportTransferTransactions(data, state, dispatch, progress, handleLogEntry);
                    break;
                case ImportType.INCOME_TRANSACTIONS:
                    summary = await runImportIncomeTransactions(data, state, dispatch, progress, handleLogEntry);
                    break;
                case ImportType.EXPENSE_TRANSACTIONS:
                    summary = await runImportExpenseTransactions(data, state, dispatch, progress, handleLogEntry);
                    break;
                case ImportType.RECURRING_TEMPLATES:
                    summary = await runImportRecurringTemplates(data, state, dispatch, progress, handleLogEntry);
                    break;
                case ImportType.PAYSLIPS:
                    summary = await runImportPayslips(data, state, dispatch, progress, handleLogEntry);
                    break;
                case ImportType.BUDGETS:
                    summary = await runImportBudgets(data, state, dispatch, progress, handleLogEntry);
                    break;
                default:
                    summary = await runImportProcess(data, state, dispatch, progress, handleLogEntry, ImportType.FULL);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "Import failed";
            handleLogEntry({ timestamp: new Date().toISOString(), sheet: 'Import', row: 0, status: 'Error', message });
            progress.errorProgress(`Import failed: ${message}`);
            setStatus('complete');
            return;
        }
        
        setStatus('complete');
        if (summary.errors === 0) {
            progress.finishProgress(`Import complete! ${summary.success} added, ${summary.skipped} skipped.`);
        } else {
            progress.finishProgress(`Import complete with ${summary.errors} error(s). Check the log for details.`);
        }
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setFileName(file.name);
        setSelectedFile(file);
        setStatus('idle');
        setLog([]);
        clearValidation();
    };

    const handleValidate = async () => {
        if (!selectedFile) return;
        await validateFile(selectedFile);
    };

    const handleImportAfterValidation = async () => {
        if (!selectedFile) return;

        setStatus('reading');
        setLog([]);

        try {
            const importedData = await importFromExcel(selectedFile);
            await processData(importedData);

        } catch (error) {
            const message = error instanceof Error ? error.message : "A critical error occurred while reading the file.";
            handleLogEntry({ timestamp: new Date().toISOString(), sheet: 'File', row: 0, status: 'Error', message });
            dispatch({ type: 'ADD_ERROR_LOG', payload: { message: `Excel Import Error: ${message}`, stack: error instanceof Error ? error.stack : String(error) } });
            progress.errorProgress(`Import failed: ${message}`);
            setStatus('complete');
        }
    };
    
    const onDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        const files = event.dataTransfer.files;
        if (files && files.length > 0) {
            const file = files[0];
            setFileName(file.name);
            setSelectedFile(file);
            setStatus('idle');
            setLog([]);
            clearValidation();
        }
    }, [clearValidation]);

    const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
    };

    const handleExportLog = () => {
        const date = new Date().toISOString().split('T')[0];
        exportLogToExcel(log, `import-log-${date}.xlsx`);
    };

    const handleCopyLog = async () => {
        try {
            const logText = log.map(entry => {
                const timestamp = new Date(entry.timestamp).toLocaleString();
                const rowInfo = entry.row > 0 ? `Row ${entry.row}` : 'N/A';
                let text = `[${timestamp}] ${entry.status} - ${entry.sheet} ${rowInfo}\n${entry.message}`;
                if (entry.data) {
                    text += `\nData: ${JSON.stringify(entry.data, null, 2)}`;
                }
                return text;
            }).join('\n\n');
            
            await navigator.clipboard.writeText(logText);
            // Show a brief success message
            setCopyLogButtonText('Copied!');
            setTimeout(() => {
                setCopyLogButtonText('Copy Log');
            }, 2000);
        } catch (error) {
            console.error('Failed to copy log:', error);
            dispatch({ type: 'ADD_ERROR_LOG', payload: { message: 'Failed to copy log to clipboard', stack: '' } });
        }
    };

    const handleCopyLogEntry = async (entry: ImportLogEntry) => {
        try {
            const timestamp = new Date(entry.timestamp).toLocaleString();
            const rowInfo = entry.row > 0 ? `Row ${entry.row}` : 'N/A';
            let text = `[${timestamp}] ${entry.status} - ${entry.sheet} ${rowInfo}\n${entry.message}`;
            if (entry.data) {
                text += `\n\nRow Data:\n${JSON.stringify(entry.data, null, 2)}`;
            }
            
            await navigator.clipboard.writeText(text);
            // Show a brief success message
            setCopyEntryButtonText('Copied!');
            setTimeout(() => {
                setCopyEntryButtonText('Copy Entry');
            }, 2000);
        } catch (error) {
            console.error('Failed to copy log entry:', error);
            dispatch({ type: 'ADD_ERROR_LOG', payload: { message: 'Failed to copy log entry to clipboard', stack: '' } });
        }
    };

    const summary = {
        success: log.filter(e => e.status === 'Success').length,
        skipped: log.filter(e => e.status === 'Skipped').length,
        errors: log.filter(e => e.status === 'Error').length,
    };

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-2 mb-4">
                <button onClick={goBack} className="p-1 rounded-full hover:bg-slate-100 text-slate-600 transition-colors" aria-label="Go back">
                    <div className="w-6 h-6">{ICONS.chevronLeft}</div>
                </button>
                <h2 className="text-2xl font-bold">Import Data from Excel</h2>
            </div>

            <div className="bg-white rounded-lg shadow-lg border border-slate-200/80 p-6">
                {status === 'idle' && (
                    <div className="space-y-4">
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label htmlFor="import-type-select" className="block text-sm font-semibold text-slate-700">Select Import Type</label>
                                {importType !== ImportType.FULL && (
                                    <button
                                        onClick={() => generateImportTemplate(importType)}
                                        className="text-xs text-accent hover:text-accent-dark font-medium flex items-center gap-1"
                                        title="Download template Excel file for this import type"
                                    >
                                        <div className="w-4 h-4">{ICONS.download}</div>
                                        Download Template
                                    </button>
                                )}
                            </div>
                            <select
                                id="import-type-select"
                                name="importType"
                                value={importType}
                                onChange={(e) => setImportType(e.target.value as ImportType)}
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent bg-white text-slate-700"
                            >
                                <optgroup label="Full Import">
                                    <option value={ImportType.FULL}>Full Import (All Data)</option>
                                </optgroup>
                                <optgroup label="Master Data">
                                    <option value={ImportType.ACCOUNTS}>Accounts</option>
                                    <option value={ImportType.CONTACTS}>Contacts</option>
                                    <option value={ImportType.VENDORS}>Vendors</option>
                                    <option value={ImportType.CATEGORIES}>Categories</option>
                                </optgroup>
                                <optgroup label="Projects & Properties">
                                    <option value={ImportType.PROJECTS}>Projects</option>
                                    <option value={ImportType.BUILDINGS}>Buildings</option>
                                    <option value={ImportType.PROPERTIES}>Properties</option>
                                    <option value={ImportType.UNITS}>Units</option>
                                </optgroup>
                                <optgroup label="Agreements & Contracts">
                                    <option value={ImportType.AGREEMENTS}>Agreements (Rental & Project)</option>
                                    <option value={ImportType.RENTAL_AGREEMENTS}>Rental Agreements</option>
                                    <option value={ImportType.PROJECT_AGREEMENTS}>Project Agreements</option>
                                    <option value={ImportType.CONTRACTS}>Contracts</option>
                                </optgroup>
                                <optgroup label="Financial Documents">
                                    <option value={ImportType.INVOICES}>Invoices</option>
                                    <option value={ImportType.PROJECT_BILLS}>Project Bills</option>
                                    <option value={ImportType.RENTAL_BILLS}>Rental Bills</option>
                                    <option value={ImportType.BILLS}>Bills (Legacy / Combined)</option>
                                    <option value={ImportType.RENTAL_INVOICE_PAYMENTS}>Rental Invoice Payments</option>
                                    <option value={ImportType.PROJECT_INVOICE_PAYMENTS}>Project Invoice Payments</option>
                                    <option value={ImportType.RENTAL_BILL_PAYMENTS}>Rental Bill Payments</option>
                                    <option value={ImportType.PROJECT_BILL_PAYMENTS}>Project Bill Payments</option>
                                    <option value={ImportType.TRANSFER_TRANSACTIONS}>Transfer Transactions</option>
                                    <option value={ImportType.EQUITY_TRANSACTIONS}>Equity Transactions</option>
                                    <option value={ImportType.LOAN_TRANSACTIONS}>Loan Transactions</option>
                                    <option value={ImportType.INCOME_TRANSACTIONS}>Income Transactions (No Invoice)</option>
                                    <option value={ImportType.EXPENSE_TRANSACTIONS}>Expense Transactions (No Bill)</option>
                                    <option value={ImportType.PAYMENTS}>Transactions (Legacy / Combined)</option>
                                </optgroup>
                                <optgroup label="Other">
                                    <option value={ImportType.STAFF}>Staff</option>
                                    <option value={ImportType.RECURRING_TEMPLATES}>Recurring Templates</option>
                                    <option value={ImportType.PAYSLIPS}>Payslips</option>
                                    <option value={ImportType.BUDGETS}>Budgets</option>
                                </optgroup>
                            </select>
                            <p className="mt-2 text-xs text-slate-500">
                                {importType === ImportType.PAYMENTS && "⚠️ Ensure invoices/bills are imported first"}
                                {importType === ImportType.RENTAL_INVOICE_PAYMENTS && "⚠️ Import rental invoices first"}
                                {importType === ImportType.PROJECT_INVOICE_PAYMENTS && "⚠️ Import project invoices first"}
                                {importType === ImportType.RENTAL_BILL_PAYMENTS && "⚠️ Import rental bills first"}
                                {importType === ImportType.PROJECT_BILL_PAYMENTS && "⚠️ Import project bills first"}
                                {importType === ImportType.TRANSFER_TRANSACTIONS && "💡 Requires FromAccountName and ToAccountName"}
                                {importType === ImportType.EQUITY_TRANSACTIONS && "💡 Investment management transactions with project"}
                                {importType === ImportType.LOAN_TRANSACTIONS && "💡 Requires subtype (Give/Receive/Repay/Collect Loan)"}
                                {importType === ImportType.INCOME_TRANSACTIONS && "💡 Standalone income (no invoiceNumber)"}
                                {importType === ImportType.EXPENSE_TRANSACTIONS && "💡 Standalone expense (no billNumber)"}
                                {importType === ImportType.BILLS && "⚠️ Import bills before payments"}
                                {importType === ImportType.PROJECT_BILLS && "⚠️ Import projects/contracts/project agreements before project bills"}
                                {importType === ImportType.RENTAL_BILLS && "⚠️ Import buildings/properties/staff before rental bills"}
                                {importType === ImportType.INVOICES && "⚠️ Import invoices before payments"}
                                {importType === ImportType.AGREEMENTS && "⚠️ Import agreements first, then invoices/bills"}
                                {importType === ImportType.RENTAL_AGREEMENTS && "⚠️ Import rental agreements before rental invoices"}
                                {importType === ImportType.PROJECT_AGREEMENTS && "⚠️ Import project agreements before project invoices"}
                                {importType === ImportType.PROPERTIES && "⚠️ Import buildings and contacts (owners) first"}
                                {importType === ImportType.UNITS && "⚠️ Import projects and contacts (owners) first"}
                                {importType === ImportType.VENDORS && "⚠️ Only contacts with type 'Vendor' will be imported"}
                            </p>
                        </div>
                        <div 
                            onClick={handleFileSelectClick}
                            onDrop={onDrop}
                            onDragOver={onDragOver}
                            className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer text-center p-4"
                        >
                            <div className="w-16 h-16 text-slate-400">{ICONS.download}</div>
                            <p className="mt-2 font-semibold text-slate-700">Click to select or drag & drop your file</p>
                            <p className="text-sm text-slate-500">Excel file (.xlsx) format</p>
                            {fileName && (
                                <p className="mt-2 text-sm font-medium text-accent">{fileName}</p>
                            )}
                        </div>
                        
                        {fileName && selectedFile && (
                            <div className="mt-4 flex gap-2">
                                <Button
                                    onClick={handleValidate}
                                    disabled={isValidating}
                                    variant="secondary"
                                >
                                    {isValidating ? 'Validating...' : 'Validate Import'}
                                </Button>
                                {validationResult && validationResult.valid && (
                                    <Button
                                        onClick={handleImportAfterValidation}
                                        variant="primary"
                                    >
                                        Import Validated Data
                                    </Button>
                                )}
                            </div>
                        )}
                        
                        {validationResult && (
                            <div className="mt-4 p-4 border rounded-lg bg-white">
                                <h3 className="font-semibold mb-3 text-lg">Validation Results</h3>
                                <div className="grid grid-cols-4 gap-4 mb-4">
                                    <div className="text-center p-2 bg-slate-50 rounded">
                                        <div className="text-lg font-bold text-slate-700">{validationResult.stats.totalRows}</div>
                                        <div className="text-xs text-slate-600">Total Rows</div>
                                    </div>
                                    <div className="text-center p-2 bg-emerald-50 rounded">
                                        <div className="text-lg font-bold text-emerald-700">{validationResult.stats.validRows}</div>
                                        <div className="text-xs text-emerald-600">Valid</div>
                                    </div>
                                    <div className="text-center p-2 bg-rose-50 rounded">
                                        <div className="text-lg font-bold text-rose-700">{validationResult.stats.invalidRows}</div>
                                        <div className="text-xs text-rose-600">Errors</div>
                                    </div>
                                    <div className="text-center p-2 bg-amber-50 rounded">
                                        <div className="text-lg font-bold text-amber-700">{validationResult.warnings.length}</div>
                                        <div className="text-xs text-amber-600">Warnings</div>
                                    </div>
                                </div>
                                
                                {validationResult.errors.length > 0 && (
                                    <div className="mb-4">
                                        <h4 className="font-semibold text-rose-600 mb-2">Errors (must be fixed before import):</h4>
                                        <div className="max-h-40 overflow-y-auto border border-rose-200 rounded p-2 bg-rose-50">
                                            <ul className="list-disc list-inside space-y-1 text-sm">
                                                {validationResult.errors.slice(0, 20).map((error, idx) => (
                                                    <li key={idx} className="text-rose-800">
                                                        <span className="font-medium">{error.sheet}</span> Row {error.row}: {error.message}
                                                    </li>
                                                ))}
                                            </ul>
                                            {validationResult.errors.length > 20 && (
                                                <p className="text-xs text-rose-600 mt-2">... and {validationResult.errors.length - 20} more errors</p>
                                            )}
                                        </div>
                                    </div>
                                )}
                                
                                {validationResult.warnings.length > 0 && validationResult.errors.length === 0 && (
                                    <div className="mb-4">
                                        <h4 className="font-semibold text-amber-600 mb-2">Warnings (import will continue):</h4>
                                        <div className="max-h-40 overflow-y-auto border border-amber-200 rounded p-2 bg-amber-50">
                                            <ul className="list-disc list-inside space-y-1 text-sm">
                                                {validationResult.warnings.slice(0, 10).map((warning, idx) => (
                                                    <li key={idx} className="text-amber-800">
                                                        <span className="font-medium">{warning.sheet}</span> Row {warning.row}: {warning.message}
                                                    </li>
                                                ))}
                                            </ul>
                                            {validationResult.warnings.length > 10 && (
                                                <p className="text-xs text-amber-600 mt-2">... and {validationResult.warnings.length - 10} more warnings</p>
                                            )}
                                        </div>
                                    </div>
                                )}
                                
                                {validationResult.valid && (
                                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-emerald-800 text-sm">
                                        ✓ All validations passed! Ready to import.
                                    </div>
                                )}
                                
                                {!validationResult.valid && (
                                    <div className="p-3 bg-rose-50 border border-rose-200 rounded text-rose-800 text-sm">
                                        ✗ Please fix the errors above before importing.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {(status === 'reading' || status === 'importing') && !progress.progressState.title.includes('Importing') && (
                    <div className="flex flex-col items-center justify-center w-full h-64 text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
                        <p className="mt-4 font-semibold text-lg text-slate-700 capitalize">{status}...</p>
                        <p className="text-sm text-slate-500 truncate max-w-full">{fileName}</p>
                    </div>
                )}

                {status === 'complete' && (
                    <div className="space-y-4">
                        <h3 className="text-xl font-bold">{summary.errors > 0 ? 'Import Completed with Errors' : 'Import Complete'}</h3>
                        <div className="grid grid-cols-3 gap-4 text-center">
                            <div className="p-3 bg-emerald-50 rounded-lg">
                                <p className="text-2xl font-bold text-emerald-700">{summary.success}</p>
                                <p className="text-sm font-semibold text-emerald-600">Successful</p>
                            </div>
                            <div className="p-3 bg-amber-50 rounded-lg">
                                <p className="text-2xl font-bold text-amber-700">{summary.skipped}</p>
                                <p className="text-sm font-semibold text-amber-600">Skipped</p>
                            </div>
                            <div className="p-3 bg-rose-50 rounded-lg">
                                <p className="text-2xl font-bold text-rose-700">{summary.errors}</p>
                                <p className="text-sm font-semibold text-rose-600">Errors</p>
                            </div>
                        </div>
                        {summary.errors > 0 && (
                             <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                                 <p className="text-center text-amber-800 font-medium mb-2">⚠️ {summary.errors} record(s) had errors and were skipped</p>
                                 <p className="text-sm text-amber-700 text-center">Check the log below for detailed problem descriptions and correction suggestions.</p>
                             </div>
                        )}
                    </div>
                )}
                
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".xlsx, .xls"/>
            </div>

            {log.length > 0 && (
                <div className="mt-6">
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="font-semibold">Import Log</h4>
                        <div className="flex gap-2">
                            <Button variant="secondary" size="sm" onClick={handleCopyLog}>
                                <div className="w-4 h-4 mr-1 inline-block">{ICONS.clipboard}</div>
                                {copyLogButtonText}
                            </Button>
                            <Button variant="secondary" size="sm" onClick={handleExportLog}>Export Log</Button>
                        </div>
                    </div>
                    <div className="bg-white rounded-lg shadow-sm border border-slate-200/80 max-h-96 overflow-y-auto">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50 sticky top-0">
                                <tr>
                                    <th className="px-2 py-2 text-left text-xs font-semibold text-slate-600">Sheet</th>
                                    <th className="px-2 py-2 text-left text-xs font-semibold text-slate-600 w-16">Row</th>
                                    <th className="px-2 py-2 text-left text-xs font-semibold text-slate-600">Status</th>
                                    <th className="px-2 py-2 text-left text-xs font-semibold text-slate-600">Message</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {log.map((entry, index) => <LogEntry key={index} entry={entry} onClick={setSelectedLogEntry} />)}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            
             <div className="mt-6 flex justify-end gap-4">
                {status !== 'idle' && <Button variant="secondary" onClick={resetState}>Start New Import</Button>}
                <Button onClick={goBack}>Back to Settings</Button>
             </div>

             <Modal isOpen={!!selectedLogEntry} onClose={() => setSelectedLogEntry(null)} title="Log Details">
                {selectedLogEntry && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="block text-slate-500 text-xs uppercase tracking-wider">Timestamp</span>
                                <span className="font-medium text-slate-800">{new Date(selectedLogEntry.timestamp).toLocaleString()}</span>
                            </div>
                            <div>
                                <span className="block text-slate-500 text-xs uppercase tracking-wider">Status</span>
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    selectedLogEntry.status === 'Success' ? 'bg-emerald-100 text-emerald-800' :
                                    selectedLogEntry.status === 'Skipped' ? 'bg-amber-100 text-amber-800' :
                                    'bg-rose-100 text-rose-800'
                                }`}>
                                    {selectedLogEntry.status}
                                </span>
                            </div>
                            <div>
                                <span className="block text-slate-500 text-xs uppercase tracking-wider">Sheet</span>
                                <span className="font-medium text-slate-800">{selectedLogEntry.sheet}</span>
                            </div>
                            <div>
                                <span className="block text-slate-500 text-xs uppercase tracking-wider">Row</span>
                                <span className="font-medium text-slate-800">{selectedLogEntry.row > 0 ? selectedLogEntry.row : 'N/A'}</span>
                            </div>
                        </div>
                        <div>
                            <span className="block text-slate-500 text-xs uppercase tracking-wider mb-1.5">Message</span>
                            <div className="p-3 bg-slate-50 rounded-md border border-slate-200 text-sm text-slate-800 whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
                                <pre className="font-mono text-xs leading-relaxed">{selectedLogEntry.message}</pre>
                            </div>
                        </div>
                        {selectedLogEntry.data && (
                            <div>
                                <span className="block text-slate-500 text-xs uppercase tracking-wider mb-1.5">Row Data</span>
                                <div className="p-3 bg-slate-50 rounded-md border border-slate-200 text-xs text-slate-800 font-mono overflow-auto max-h-40 whitespace-pre-wrap">
                                    {JSON.stringify(selectedLogEntry.data, null, 2)}
                                </div>
                            </div>
                        )}
                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="secondary" size="sm" onClick={() => handleCopyLogEntry(selectedLogEntry)}>
                                <div className="w-4 h-4 mr-1 inline-block">{ICONS.clipboard}</div>
                                {copyEntryButtonText}
                            </Button>
                            <Button variant="secondary" onClick={() => setSelectedLogEntry(null)}>Close</Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default ImportPage;
