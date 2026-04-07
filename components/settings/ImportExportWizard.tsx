import React, { useState, useRef, useCallback } from 'react';
import { getApiBaseUrl, isLocalOnlyMode } from '../../config/apiUrl';
import { useAppContext } from '../../context/AppContext';
import { useProgress } from '../../context/ProgressContext';
import { ICONS } from '../../constants';
import Button from '../ui/Button';
import Tabs from '../ui/Tabs';
import { apiClient } from '../../services/api/client';
import { getAppStateApiService } from '../../services/api/appStateApi';
import { exportToExcel } from '../../services/exportService';
import { importFromExcel, runImportProcess, generateImportTemplate } from '../../services/importService';
import { ImportType, ImportLogEntry } from '../../types';
import { toLocalDateString } from '../../utils/dateUtils';

interface SheetResult {
  sheet: string;
  success: boolean;
  imported: number;
  skipped: number;
  errors: number;
  errorDetails?: Array<{
    sheet: string;
    row: number;
    field: string;
    value: any;
    message: string;
  }>;
}

interface ImportResult {
  success: boolean;
  canProceed: boolean;
  validationErrors: Array<{
    sheet: string;
    row: number;
    field: string;
    value: any;
    message: string;
  }>;
  duplicates: Array<{
    sheet: string;
    row: number;
    name: string;
    reason: string;
  }>;
  sheetResults?: SheetResult[];
  imported?: {
    contacts: { count: number; skipped: number };
    projects: { count: number; skipped: number };
    buildings: { count: number; skipped: number };
    properties: { count: number; skipped: number };
    units: { count: number; skipped: number };
    categories: { count: number; skipped: number };
    accounts: { count: number; skipped: number };
    inventoryItems?: { count: number; skipped: number };
    vendors?: { count: number; skipped: number };
    purchaseBills?: { count: number; skipped: number };
    purchaseBillItems?: { count: number; skipped: number };
    invoices?: { count: number; skipped: number };
    rentalInvoicePayments?: { count: number; skipped: number };
    contracts?: { count: number; skipped: number };
    projectBills?: { count: number; skipped: number };
    projectBillPayments?: { count: number; skipped: number };
    budgets?: { count: number; skipped: number };
  };
  summary: {
    totalRows: number;
    validRows: number;
    errorRows: number;
    duplicateRows: number;
    importedRows?: number;
  };
}

type WizardStep = 'choose' | 'template' | 'export' | 'import' | 'results';
type ActionType = 'template' | 'export' | 'import' | null;

// Import order matching backend
const IMPORT_ORDER = [
  { name: 'Accounts', dependencies: [], description: 'Import accounts first' },
  { name: 'Contacts', dependencies: [], description: 'Import contacts (required for Properties, Units, and Rental Agreements)' },
  { name: 'Categories', dependencies: [], description: 'Import categories' },
  { name: 'Projects', dependencies: [], description: 'Import projects (required for Units)' },
  { name: 'Buildings', dependencies: [], description: 'Import buildings (required for Properties)' },
  { name: 'Units', dependencies: ['Projects', 'Contacts'], description: 'Import units (depends on Projects and Contacts)' },
  { name: 'Properties', dependencies: ['Contacts', 'Buildings'], description: 'Import properties (depends on Contacts and Buildings)' },
  { name: 'RentalAgreements', dependencies: ['Properties', 'Contacts'], description: 'Import rental agreements (depends on Properties and Contacts)' },
  { name: 'ProjectSellingAgreements', dependencies: ['Projects', 'Units', 'Contacts'], description: 'Import project selling agreements / installment plans (depends on Projects, Units, and Contacts)' },
  { name: 'RentalInvoices', dependencies: ['RentalAgreements', 'Contacts', 'Properties'], description: 'Import rental invoices (depends on Rental Agreements, Contacts, and Properties)' },
  { name: 'RentalInvoicePayments', dependencies: ['RentalInvoices', 'Accounts'], description: 'Import rental invoice payments (depends on Rental Invoices and Accounts). Data is saved to your local database.' },
  { name: 'LoanTransactions', dependencies: ['Accounts'], description: 'Import loan transactions (Give/Receive/Repay/Collect); bank account required (Bank-type account name). Data is saved to your local database.' },
  { name: 'InventoryItems', dependencies: [], description: 'Import inventory items (name, unit type, price per unit). Supports parent-child hierarchy via parentItemName.' },
  { name: 'Vendors', dependencies: [], description: 'Import vendors (name, contact info, address)' },
  { name: 'PurchaseBills', dependencies: ['Vendors'], description: 'Import purchase bills (depends on Vendors)' },
  { name: 'PurchaseBillItems', dependencies: ['PurchaseBills', 'InventoryItems'], description: 'Import purchase bill line items (depends on Purchase Bills and Inventory Items)' },
  { name: 'Contracts', dependencies: ['Projects', 'Contacts'], description: 'Import project contracts (depends on Projects and Contacts/Vendors)' },
  { name: 'ProjectBills', dependencies: ['Contracts', 'Projects', 'Categories', 'Contacts'], description: 'Import project bills (depends on Contracts, Projects, Categories, and Contacts)' },
  { name: 'ProjectBillPayments', dependencies: ['ProjectBills', 'Accounts'], description: 'Import project bill payments (depends on Project Bills and Accounts)' },
  { name: 'Budgets', dependencies: ['Categories'], description: 'Import budgets by category and optional project' }
];

// Map sheet names to ImportType enum values
const SHEET_TO_IMPORT_TYPE: Record<string, ImportType> = {
  'Accounts': ImportType.ACCOUNTS,
  'Contacts': ImportType.CONTACTS,
  'Categories': ImportType.CATEGORIES,
  'Projects': ImportType.PROJECTS,
  'Buildings': ImportType.BUILDINGS,
  'Properties': ImportType.PROPERTIES,
  'Units': ImportType.UNITS,
  'RentalAgreements': ImportType.RENTAL_AGREEMENTS,
  'ProjectSellingAgreements': ImportType.PROJECT_AGREEMENTS,
  'RentalInvoices': ImportType.RENTAL_INVOICES,
  'RentalInvoicePayments': ImportType.RENTAL_INVOICE_PAYMENTS,
  'LoanTransactions': ImportType.LOAN_TRANSACTIONS,
  'InventoryItems': ImportType.FULL, // Uses FULL import type
  'Vendors': ImportType.VENDORS,
  'PurchaseBills': ImportType.BILLS, // Uses BILLS import type
  'PurchaseBillItems': ImportType.FULL, // Uses FULL import type
  'Contracts': ImportType.CONTRACTS,
  'ProjectBills': ImportType.PROJECT_BILLS,
  'ProjectBillPayments': ImportType.PROJECT_BILL_PAYMENTS,
  'Budgets': ImportType.BUDGETS,
};

// UI grouping for Import Data page (Existing = wired to current import; New = Phase 2)
interface ImportCategoryItem {
  label: string;
  sheetName: string | null; // null for New (Phase 2)
  existing: boolean;
}
const IMPORT_CATEGORIES: { title: string; items: ImportCategoryItem[] }[] = [
  {
    title: 'Rental',
    items: [
      { label: 'Properties', sheetName: 'Properties', existing: true },
      { label: 'Rental agreements', sheetName: 'RentalAgreements', existing: true },
      { label: 'Rental invoices', sheetName: 'RentalInvoices', existing: true },
      { label: 'Invoice payments', sheetName: 'RentalInvoicePayments', existing: true },
      { label: 'Rental Bills', sheetName: null, existing: false },
      { label: 'Rental bills payments', sheetName: null, existing: false },
    ],
  },
  {
    title: 'Project construction',
    items: [
      { label: 'Project contracts', sheetName: 'Contracts', existing: true },
      { label: 'Project bills', sheetName: 'ProjectBills', existing: true },
      { label: 'Project bills payment', sheetName: 'ProjectBillPayments', existing: true },
      { label: 'Budget', sheetName: 'Budgets', existing: true },
    ],
  },
  {
    title: 'Project selling',
    items: [
      { label: 'Units', sheetName: 'Units', existing: true },
      { label: 'Project agreements', sheetName: null, existing: false },
      { label: 'Project invoices', sheetName: null, existing: false },
      { label: 'Project payment', sheetName: null, existing: false },
    ],
  },
  {
    title: 'General',
    items: [
      { label: 'Accounts', sheetName: 'Accounts', existing: true },
      { label: 'Contacts', sheetName: 'Contacts', existing: true },
      { label: 'Categories', sheetName: 'Categories', existing: true },
      { label: 'Vendors', sheetName: 'Vendors', existing: true },
      { label: 'Projects', sheetName: 'Projects', existing: true },
      { label: 'Buildings', sheetName: 'Buildings', existing: true },
      { label: 'Loan transaction', sheetName: 'LoanTransactions', existing: true },
      { label: 'Transfer transactions (Account to Account transfer)', sheetName: null, existing: false },
    ],
  },
];

export interface ImportExportWizardProps {
  /** When true, wizard is embedded (e.g. in Settings Backup & Restore). No full-page chrome. */
  embedded?: boolean;
  /** When true with embedded, start directly at the Import Data step. */
  startAtImport?: boolean;
  /** Called when user clicks Back on the import step while embedded (e.g. switch tab). */
  onBack?: () => void;
}

const ImportExportWizard: React.FC<ImportExportWizardProps> = ({ embedded, startAtImport, onBack }) => {
  const { dispatch, state } = useAppContext();
  const progress = useProgress();
  const [currentStep, setCurrentStep] = useState<WizardStep>(embedded && startAtImport ? 'import' : 'choose');
  const [stepHistory, setStepHistory] = useState<WizardStep[]>(embedded && startAtImport ? ['import'] : ['choose']);
  const [actionType, setActionType] = useState<ActionType>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [importedSheets, setImportedSheets] = useState<Set<string>>(new Set());
  const [activeImportTab, setActiveImportTab] = useState<string>(IMPORT_CATEGORIES[0].title);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const goBack = () => dispatch({ type: 'SET_PAGE', payload: 'settings' });

  const goToStep = (step: WizardStep) => {
    setStepHistory(prev => [...prev, step]);
    setCurrentStep(step);
  };

  const goToPreviousStep = () => {
    if (embedded && stepHistory.length <= 1 && onBack) {
      onBack();
      return;
    }
    if (stepHistory.length > 1) {
      const newHistory = [...stepHistory];
      newHistory.pop(); // Remove current step
      const previousStep = newHistory[newHistory.length - 1];
      setStepHistory(newHistory);
      setCurrentStep(previousStep);
    } else {
      goBack(); // If no previous step, go back to settings
    }
  };

  const handleActionSelect = (action: ActionType) => {
    setActionType(action);
    if (action === 'template') {
      goToStep('template');
    } else if (action === 'export') {
      goToStep('export');
    } else if (action === 'import') {
      goToStep('import');
    }
  };

  const getStepTitle = (step: WizardStep): string => {
    switch (step) {
      case 'choose': return 'Choose Action';
      case 'template': return 'Download Template';
      case 'export': return 'Export Data';
      case 'import': return 'Import Data';
      case 'results': return 'Import Results';
      default: return 'Import/Export Data';
    }
  };

  const getBreadcrumb = (): React.ReactNode => {
    const breadcrumbs = stepHistory.map(step => getStepTitle(step));
    return (
      <>
        {breadcrumbs.map((title, index) => (
          <React.Fragment key={index}>
            {index > 0 && <span className="mx-1">›</span>}
            <span>{title}</span>
          </React.Fragment>
        ))}
      </>
    );
  };

  const handleDownloadTemplate = async (sheetName?: string) => {
    try {
      setIsLoading(true);
      if (isLocalOnlyMode()) {
        if (sheetName === 'Vendors') {
          generateImportTemplate(ImportType.VENDORS);
          setIsLoading(false);
          return;
        }
        if (sheetName === 'RentalAgreements') {
          generateImportTemplate(ImportType.RENTAL_AGREEMENTS);
          setIsLoading(false);
          return;
        }
        if (sheetName === 'RentalInvoices') {
          generateImportTemplate(ImportType.RENTAL_INVOICES);
          setIsLoading(false);
          return;
        }
        if (sheetName === 'RentalInvoicePayments') {
          generateImportTemplate(ImportType.RENTAL_INVOICE_PAYMENTS);
          setIsLoading(false);
          return;
        }
        if (sheetName === 'Contracts') {
          generateImportTemplate(ImportType.CONTRACTS);
          setIsLoading(false);
          return;
        }
        if (sheetName === 'ProjectBills') {
          generateImportTemplate(ImportType.PROJECT_BILLS);
          setIsLoading(false);
          return;
        }
        if (sheetName === 'ProjectBillPayments') {
          generateImportTemplate(ImportType.PROJECT_BILL_PAYMENTS);
          setIsLoading(false);
          return;
        }
        if (sheetName === 'Budgets') {
          generateImportTemplate(ImportType.BUDGETS);
          setIsLoading(false);
          return;
        }
        const filename = sheetName
          ? `import-template-${sheetName.toLowerCase()}.xlsx`
          : `import-template-${toLocalDateString(new Date())}.xlsx`;
        exportToExcel(state, filename, progress, dispatch);
        setIsLoading(false);
        return;
      }
      // Use same host as app so works when opened from another PC
      const baseUrl = getApiBaseUrl();
      const token = localStorage.getItem('auth_token') || '';
      const tenantId = localStorage.getItem('tenant_id') || '';

      if (!token || !tenantId) {
        throw new Error('Authentication required. Please login again.');
      }

      const url = sheetName
        ? `${baseUrl}/data-import-export/template?sheet=${encodeURIComponent(sheetName)}`
        : `${baseUrl}/data-import-export/template`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Tenant-ID': tenantId
        }
      });

      if (!response.ok) {
        // Try to parse error message from JSON response
        let errorMessage = 'Failed to download template';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch (e) {
          // If response is not JSON, use status text
          errorMessage = response.statusText || `HTTP ${response.status}`;
        }
        throw new Error(errorMessage);
      }

      const blob = await response.blob();

      // Check if blob is actually an error (sometimes server returns JSON error as blob)
      if (blob.type === 'application/json') {
        const text = await blob.text();
        const errorData = JSON.parse(text);
        throw new Error(errorData.message || errorData.error || 'Failed to download template');
      }

      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = sheetName
        ? `import-template-${sheetName.toLowerCase()}.xlsx`
        : 'import-template.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(a);
    } catch (error: any) {
      console.error('Template download error:', error);
      alert(`Error downloading template: ${error.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportData = async () => {
    try {
      setIsLoading(true);
      if (isLocalOnlyMode()) {
        const filename = `export-data-${toLocalDateString(new Date())}.xlsx`;
        exportToExcel(state, filename, progress, dispatch);
        setIsLoading(false);
        return;
      }
      // Use same host as app so works when opened from another PC
      const baseUrl = getApiBaseUrl();
      const token = localStorage.getItem('auth_token') || '';
      const tenantId = localStorage.getItem('tenant_id') || '';

      if (!token || !tenantId) {
        throw new Error('Authentication required. Please login again.');
      }

      const response = await fetch(`${baseUrl}/data-import-export/export`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Tenant-ID': tenantId
        }
      });

      if (!response.ok) {
        // Try to parse error message from JSON response
        let errorMessage = 'Failed to export data';
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch (e) {
          // If response is not JSON, use status text
          errorMessage = response.statusText || `HTTP ${response.status}`;
        }
        throw new Error(errorMessage);
      }

      const blob = await response.blob();

      // Check if blob is actually an error (sometimes server returns JSON error as blob)
      if (blob.type === 'application/json') {
        const text = await blob.text();
        const errorData = JSON.parse(text);
        throw new Error(errorData.message || errorData.error || 'Failed to export data');
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `export-data-${toLocalDateString(new Date())}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error: any) {
      console.error('Export error:', error);
      alert(`Error exporting data: ${error.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setFileName(file.name);
    }
  };

  const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) {
      setSelectedFile(file);
      setFileName(file.name);
    }
  }, []);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleImport = async () => {
    if (!selectedFile) {
      alert('Please select a file to import');
      return;
    }

    if (!selectedSheet) {
      alert('Please select a sheet to import');
      return;
    }

    const currentSheet = IMPORT_ORDER.find(s => s.name === selectedSheet);
    if (!currentSheet) {
      alert('Invalid sheet selected');
      return;
    }

    try {
      setIsLoading(true);

      if (isLocalOnlyMode()) {
        // Local-only mode: Import directly from Excel file
        progress.startProgress(`Importing ${selectedSheet}...`);
        
        try {
          // Read Excel file
          progress.updateProgress(10, 'Reading Excel file...');
          const sheets = await importFromExcel(selectedFile);
          
          // Get the selected sheet data
          const sheetData = sheets[selectedSheet];
          if (!sheetData || sheetData.length === 0) {
            throw new Error(`Sheet "${selectedSheet}" not found or is empty in the Excel file.`);
          }
          
          // Map sheet name to ImportType
          const importType = SHEET_TO_IMPORT_TYPE[selectedSheet];
          if (!importType) {
            throw new Error(`Import type not supported for sheet "${selectedSheet}".`);
          }
          
          // Filter sheets to only include the selected sheet
          const filteredSheets: { [key: string]: any[] } = {};
          filteredSheets[selectedSheet] = sheetData;
          
          // Create import log callback
          const importLogs: ImportLogEntry[] = [];
          const onLog = (entry: ImportLogEntry) => {
            importLogs.push(entry);
            const progressMsg = entry.status === 'Success' 
              ? `Imported row ${entry.row}...`
              : entry.status === 'Error'
              ? `Error at row ${entry.row}: ${entry.message}`
              : `Skipped row ${entry.row}...`;
            progress.updateProgress(30 + (importLogs.length / sheetData.length) * 60, progressMsg);
          };
          
          // Run import process
          progress.updateProgress(30, 'Processing data...');
          const result = await runImportProcess(
            filteredSheets,
            state,
            dispatch,
            progress,
            onLog,
            importType
          );
          
          // Format result to match API response format
          const formattedResult: ImportResult = {
            success: result.success > 0,
            canProceed: result.errors === 0,
            validationErrors: importLogs
              .filter(log => log.status === 'Error')
              .map(log => ({
                sheet: log.sheet,
                row: log.row,
                field: '',
                value: '',
                message: log.message || 'Unknown error'
              })),
            duplicates: importLogs
              .filter(log => log.status === 'Skipped')
              .map(log => ({
                sheet: log.sheet,
                row: log.row,
                name: '',
                reason: log.message || 'Duplicate or skipped'
              })),
            imported: {
              contacts: { count: (selectedSheet === 'Contacts' || selectedSheet === 'Vendors') ? result.success : 0, skipped: (selectedSheet === 'Contacts' || selectedSheet === 'Vendors') ? result.skipped : 0 },
              projects: { count: selectedSheet === 'Projects' ? result.success : 0, skipped: selectedSheet === 'Projects' ? result.skipped : 0 },
              buildings: { count: selectedSheet === 'Buildings' ? result.success : 0, skipped: selectedSheet === 'Buildings' ? result.skipped : 0 },
              properties: { count: selectedSheet === 'Properties' ? result.success : 0, skipped: selectedSheet === 'Properties' ? result.skipped : 0 },
              units: { count: selectedSheet === 'Units' ? result.success : 0, skipped: selectedSheet === 'Units' ? result.skipped : 0 },
              categories: { count: selectedSheet === 'Categories' ? result.success : 0, skipped: selectedSheet === 'Categories' ? result.skipped : 0 },
              accounts: { count: selectedSheet === 'Accounts' ? result.success : 0, skipped: selectedSheet === 'Accounts' ? result.skipped : 0 },
              inventoryItems: { count: selectedSheet === 'InventoryItems' ? result.success : 0, skipped: selectedSheet === 'InventoryItems' ? result.skipped : 0 },
              vendors: { count: selectedSheet === 'Vendors' ? result.success : 0, skipped: selectedSheet === 'Vendors' ? result.skipped : 0 },
              purchaseBills: { count: selectedSheet === 'PurchaseBills' ? result.success : 0, skipped: selectedSheet === 'PurchaseBills' ? result.skipped : 0 },
              purchaseBillItems: { count: selectedSheet === 'PurchaseBillItems' ? result.success : 0, skipped: selectedSheet === 'PurchaseBillItems' ? result.skipped : 0 },
              invoices: { count: (selectedSheet === 'RentalInvoices' || selectedSheet === 'Invoices') ? result.success : 0, skipped: (selectedSheet === 'RentalInvoices' || selectedSheet === 'Invoices') ? result.skipped : 0 },
              rentalInvoicePayments: { count: selectedSheet === 'RentalInvoicePayments' ? result.success : 0, skipped: selectedSheet === 'RentalInvoicePayments' ? result.skipped : 0 },
              contracts: { count: selectedSheet === 'Contracts' ? result.success : 0, skipped: selectedSheet === 'Contracts' ? result.skipped : 0 },
              projectBills: { count: selectedSheet === 'ProjectBills' ? result.success : 0, skipped: selectedSheet === 'ProjectBills' ? result.skipped : 0 },
              projectBillPayments: { count: selectedSheet === 'ProjectBillPayments' ? result.success : 0, skipped: selectedSheet === 'ProjectBillPayments' ? result.skipped : 0 },
              budgets: { count: selectedSheet === 'Budgets' ? result.success : 0, skipped: selectedSheet === 'Budgets' ? result.skipped : 0 },
            },
            summary: {
              totalRows: sheetData.length,
              validRows: result.success,
              errorRows: result.errors,
              duplicateRows: result.skipped,
              importedRows: result.success
            }
          };
          
          setImportResult(formattedResult);
          
          // Reload state from database to ensure UI reflects saved data
          if (formattedResult.success && formattedResult.canProceed) {
            progress.updateProgress(99, 'Reloading data from database...');
            try {
              const { AppStateRepository } = await import('../../services/database/repositories/index');
              const appStateRepo = new AppStateRepository();
              const reloadedState = await appStateRepo.loadState();
              dispatch({ type: 'SET_STATE', payload: reloadedState });
              console.log('[Import] Reloaded state from database after import:', {
                contacts: reloadedState.contacts?.length || 0,
                accounts: reloadedState.accounts?.length || 0,
                transactions: reloadedState.transactions?.length || 0
              });
            } catch (reloadError) {
              console.error('[Import] Failed to reload state from database:', reloadError);
              // Continue anyway - the dispatch in runImportProcess should have updated the UI
            }
          }
          
          progress.finishProgress('Import completed successfully');
          
          // If successful, mark sheet as imported
          if (formattedResult.success && formattedResult.canProceed) {
            setImportedSheets(prev => new Set([...prev, currentSheet.name]));
            
            // Clear selection and file, show success
            setSelectedFile(null);
            setFileName('');
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
            alert(`✅ ${currentSheet.name} imported successfully! ${result.success} rows imported, ${result.skipped} skipped, ${result.errors} errors.`);
            goToStep('results');
          } else {
            // Show errors
            goToStep('results');
          }
        } catch (error: any) {
          progress.errorProgress(error.message || 'Import failed');
          throw error;
        }
        
        setIsLoading(false);
        return;
      }

      // Cloud mode: Use API
      // Convert file to base64
      const base64Data = await convertFileToBase64(selectedFile);

      // Send to API with sheet name
      const result = await apiClient.post<ImportResult>('/data-import-export/import', {
        file: base64Data,
        sheetName: selectedSheet
      });

      setImportResult(result);

      // If successful, mark sheet as imported
      if (result.success) {
        setImportedSheets(prev => new Set([...prev, currentSheet.name]));

        // Refresh app state to show newly imported data
        try {
          const apiService = getAppStateApiService();
          let apiState: Partial<typeof state>;
          try {
            apiState = await apiService.loadStateBulk();
          } catch {
            apiState = await apiService.loadState();
          }

          // Merge the new data into the current state
          const mergeById = <T extends { id: string }>(current: T[], api: T[]): T[] => {
            if (!api || api.length === 0) return current;
            const apiMap = new Map(api.map(item => [item.id, item]));
            const currentMap = new Map(current.map(item => [item.id, item]));
            const merged = new Map<string, T>();
            current.forEach(item => merged.set(item.id, item));
            api.forEach(item => merged.set(item.id, item));
            return Array.from(merged.values());
          };

          const updates: any = {};
          const currentState = state;

          if (apiState.contacts) updates.contacts = mergeById(currentState.contacts, apiState.contacts);
          if (apiState.accounts) updates.accounts = mergeById(currentState.accounts, apiState.accounts);
          if (apiState.categories) updates.categories = mergeById(currentState.categories, apiState.categories);
          if (apiState.projects) updates.projects = mergeById(currentState.projects, apiState.projects);
          if (apiState.buildings) updates.buildings = mergeById(currentState.buildings, apiState.buildings);
          if (apiState.properties) updates.properties = mergeById(currentState.properties, apiState.properties);
          if (apiState.units) updates.units = mergeById(currentState.units, apiState.units);
          if (apiState.rentalAgreements) updates.rentalAgreements = mergeById(currentState.rentalAgreements, apiState.rentalAgreements);
          if (apiState.installmentPlans) updates.installmentPlans = mergeById(currentState.installmentPlans, apiState.installmentPlans);
          if (apiState.invoices) updates.invoices = mergeById(currentState.invoices, apiState.invoices);
          if (apiState.transactions) updates.transactions = mergeById(currentState.transactions, apiState.transactions);

          if (Object.keys(updates).length > 0) {
            dispatch({
              type: 'SET_STATE',
              payload: updates
            });
          }
        } catch (refreshError) {
          console.error('Failed to refresh data after import:', refreshError);
          // Don't block the import success flow if refresh fails
        }

        // Clear selection and file, show success
        setSelectedFile(null);
        setFileName('');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        alert(`✅ ${currentSheet.name} imported successfully!`);
        goToStep('results');
      } else {
        // Show errors
        goToStep('results');
      }
    } catch (error: any) {
      alert(`Error importing data: ${error.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSheetSelect = (sheetName: string) => {
    setSelectedSheet(sheetName);
    setSelectedFile(null);
    setFileName('');
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleReset = () => {
    setCurrentStep('choose');
    setStepHistory(['choose']);
    setActionType(null);
    setSelectedFile(null);
    setFileName('');
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Step 1: Choose Action
  if (currentStep === 'choose') {
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div className="flex-1">
            <div className="text-sm text-slate-500 mb-1">Settings › Import/Export Data</div>
            <h1 className="text-2xl font-bold text-slate-800">Import/Export Data</h1>
          </div>
          <Button variant="ghost" onClick={goBack}>
            <div className="w-4 h-4">{ICONS.x}</div>
            <span className="hidden sm:inline">Close</span>
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-slate-700 mb-2">Choose an Action</h2>
              <p className="text-slate-600">Select what you would like to do with your data</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <button
                onClick={() => handleActionSelect('template')}
                className="p-6 border-2 border-slate-200 rounded-lg hover:border-green-500 hover:bg-green-50 transition-all text-left"
              >
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                  <div className="w-6 h-6 text-blue-600">{ICONS.download}</div>
                </div>
                <h3 className="font-semibold text-slate-800 mb-2">Download Template (Optional)</h3>
                <p className="text-sm text-slate-600">Get an empty Excel template with all required columns</p>
              </button>

              <button
                onClick={() => handleActionSelect('export')}
                className="p-6 border-2 border-slate-200 rounded-lg hover:border-green-500 hover:bg-green-50 transition-all text-left"
              >
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                  <div className="w-6 h-6 text-green-600">{ICONS.download}</div>
                </div>
                <h3 className="font-semibold text-slate-800 mb-2">Export Current Data</h3>
                <p className="text-sm text-slate-600">Download your existing data for editing and re-import</p>
              </button>

              <button
                onClick={() => handleActionSelect('import')}
                className="p-6 border-2 border-slate-200 rounded-lg hover:border-green-500 hover:bg-green-50 transition-all text-left border-green-500 bg-green-50"
              >
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                  <div className="w-6 h-6 text-purple-600">{ICONS.upload}</div>
                </div>
                <h3 className="font-semibold text-slate-800 mb-2">Import Data</h3>
                <p className="text-sm text-slate-600">Upload Excel file to import new data directly</p>
              </button>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2">💡 Quick Start</h4>
              <p className="text-sm text-blue-800">
                You can <strong>directly import your Excel file</strong> without downloading a template first.
                Just make sure your Excel file has sheets named: <strong>Contacts, Projects, Buildings, Properties, Units, Categories, Accounts, LoanTransactions</strong>
                with the correct column headers. Click "Import Data" to get started.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 2a: Template Download
  if (currentStep === 'template') {
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div className="flex-1">
            <div className="text-sm text-slate-500 mb-1">
              Settings › {getBreadcrumb()}
            </div>
            <h1 className="text-2xl font-bold text-slate-800">Download Template</h1>
          </div>
          <Button variant="ghost" onClick={goToPreviousStep}>
            <div className="w-4 h-4">{ICONS.chevronLeft}</div>
            <span className="hidden sm:inline">Back</span>
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-blue-900 mb-2">Template Information</h3>
              <p className="text-sm text-blue-800 mb-3">
                Download a template to prepare your data, then import it from the Import step.
                <strong> Single-sheet templates</strong> (Vendors, Rental Agreements, Rental Invoices, Rental Invoice Payments, Contracts, Project Bills, Project Bill Payments, Budgets) contain only that sheet with required columns and sample rows. Imported data is saved to your local database.
              </p>
              <p className="text-sm text-blue-800">
                The full template includes all sheets (Contacts, Projects, Buildings, Properties, Units, etc.). For <strong>Loan Transactions</strong>, use <strong>bankAccountName</strong> (Bank-type account required).
              </p>
            </div>

            <div className="space-y-2">
              <Button
                onClick={() => handleDownloadTemplate('Vendors')}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? 'Downloading...' : 'Download Vendors Template'}
              </Button>
              <Button
                onClick={() => handleDownloadTemplate('RentalAgreements')}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? 'Downloading...' : 'Download Rental Agreements Template'}
              </Button>
              <Button
                onClick={() => handleDownloadTemplate('RentalInvoices')}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? 'Downloading...' : 'Download Rental Invoices Template'}
              </Button>
              <Button
                onClick={() => handleDownloadTemplate('RentalInvoicePayments')}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? 'Downloading...' : 'Download Rental Invoice Payments Template'}
              </Button>
              <Button
                onClick={() => handleDownloadTemplate('Contracts')}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? 'Downloading...' : 'Download Contracts Template'}
              </Button>
              <Button
                onClick={() => handleDownloadTemplate('ProjectBills')}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? 'Downloading...' : 'Download Project Bills Template'}
              </Button>
              <Button
                onClick={() => handleDownloadTemplate('ProjectBillPayments')}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? 'Downloading...' : 'Download Project Bill Payments Template'}
              </Button>
              <Button
                onClick={() => handleDownloadTemplate('Budgets')}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? 'Downloading...' : 'Download Budgets Template'}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleDownloadTemplate()}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? 'Downloading...' : 'Download Full Template (all sheets)'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 2b: Export Data
  if (currentStep === 'export') {
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div className="flex-1">
            <div className="text-sm text-slate-500 mb-1">
              Settings › {getBreadcrumb()}
            </div>
            <h1 className="text-2xl font-bold text-slate-800">Export Current Data</h1>
          </div>
          <Button variant="ghost" onClick={goToPreviousStep}>
            <div className="w-4 h-4">{ICONS.chevronLeft}</div>
            <span className="hidden sm:inline">Back</span>
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-green-900 mb-2">Export Information</h3>
              <p className="text-sm text-green-800">
                This will download all your current data in Excel format. You can edit the file and re-import it.
                The file includes one sample entry row for reference.
              </p>
            </div>

            <Button
              onClick={handleExportData}
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? 'Exporting...' : 'Export Data'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Step 2c: Import Data
  if (currentStep === 'import') {
    const selectedSheetData = selectedSheet ? IMPORT_ORDER.find(s => s.name === selectedSheet) : null;

    return (
      <div className="flex flex-col h-full bg-white">
        {!embedded && (
          <div className="flex items-center justify-between p-4 border-b border-slate-200">
            <div className="flex-1">
              <div className="text-sm text-slate-500 mb-1">
                Settings › {getBreadcrumb()}
              </div>
              <h1 className="text-2xl font-bold text-slate-800">Import Data</h1>
            </div>
            <Button variant="ghost" onClick={goToPreviousStep}>
              <div className="w-4 h-4">{ICONS.chevronLeft}</div>
              <span className="hidden sm:inline">Back</span>
            </Button>
          </div>
        )}

        <div className={`flex-1 overflow-y-auto ${embedded ? 'p-4' : 'p-6'}`}>
          <div className="max-w-2xl mx-auto">
            {/* Tabs: one section visible at a time */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Select data type to import</h3>
              <Tabs
                variant="browser"
                tabs={IMPORT_CATEGORIES.map(c => c.title)}
                activeTab={activeImportTab}
                onTabClick={setActiveImportTab}
                className="mb-0"
              />
              <div className="border border-t-0 border-slate-200 rounded-b-lg overflow-hidden bg-white">
                {IMPORT_CATEGORIES.filter(c => c.title === activeImportTab).map((category, catIdx) => (
                  <div key={catIdx} className="divide-y divide-slate-100">
                    {category.items.map((item, itemIdx) => {
                      if (item.existing && item.sheetName) {
                        const sheet = IMPORT_ORDER.find(s => s.name === item.sheetName);
                        const isSelected = selectedSheet === item.sheetName;
                        const isImported = sheet ? importedSheets.has(item.sheetName) : false;
                        const hasUnmetDependencies = sheet && sheet.dependencies.length > 0 && !sheet.dependencies.every(dep => importedSheets.has(dep));
                        const unmetDeps = sheet ? sheet.dependencies.filter(dep => !importedSheets.has(dep)) : [];

                        return (
                          <div
                            key={itemIdx}
                            onClick={() => !isImported && handleSheetSelect(item.sheetName!)}
                            className={`flex items-center p-3 transition-all ${isImported
                              ? 'bg-green-50 cursor-default'
                              : isSelected
                                ? 'bg-blue-50 ring-inset ring-2 ring-blue-400 cursor-pointer'
                                : 'hover:bg-slate-50 cursor-pointer'
                              }`}
                          >
                            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mr-3 font-semibold text-sm ${isSelected
                              ? 'bg-blue-600 text-white'
                              : isImported
                                ? 'bg-green-600 text-white'
                                : 'bg-slate-400 text-white'
                              }`}>
                              {isImported ? '✓' : itemIdx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-slate-800">{item.label}</div>
                              {sheet && (
                                <>
                                  <div className="text-xs text-slate-600">{sheet.description}</div>
                                  {sheet.dependencies.length > 0 && (
                                    <div className={`text-xs mt-1 ${hasUnmetDependencies ? 'text-amber-600' : 'text-green-600'}`}>
                                      Depends on: {sheet.dependencies.join(', ')}
                                      {hasUnmetDependencies && (
                                        <span className="text-amber-700 font-semibold ml-1">
                                          ⚠️ {unmetDeps.join(', ')} not imported yet
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                            {isImported && (
                              <span className="text-green-600 font-semibold text-sm shrink-0">✓ Done</span>
                            )}
                            {isSelected && !isImported && (
                              <span className="text-blue-600 font-semibold text-sm shrink-0">Selected</span>
                            )}
                          </div>
                        );
                      }
                      // New (Phase 2) — show as disabled with badge
                      return (
                        <div
                          key={itemIdx}
                          className="flex items-center p-3 bg-slate-50/80 cursor-not-allowed opacity-80"
                        >
                          <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mr-3 font-semibold text-sm bg-slate-300 text-slate-500">
                            —
                          </div>
                          <div className="flex-1">
                            <div className="font-medium text-slate-600">{item.label}</div>
                            <div className="text-xs text-slate-500">
                              {item.label === 'Budget' ? 'Template and import for budget — Phase 2' : 'Import/export coming in Phase 2'}
                            </div>
                          </div>
                          <span className="text-xs font-medium text-slate-500 bg-slate-200 px-2 py-0.5 rounded shrink-0">Phase 2</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Selected Sheet Info */}
            {selectedSheetData && (() => {
              const displayLabel = IMPORT_CATEGORIES.flatMap(c => c.items).find(
                i => i.existing && i.sheetName === selectedSheetData.name
              )?.label ?? selectedSheetData.name;
              return (
              <>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <h3 className="font-semibold text-blue-900 mb-2">Selected: {displayLabel}</h3>
                  <p className="text-sm text-blue-800 mb-3">
                    {selectedSheetData.description}
                  </p>
                  {selectedSheetData.dependencies.length > 0 && (
                    <div className="text-xs text-amber-700 bg-amber-100 p-2 rounded mb-2">
                      ⚠️ Make sure you have already imported: {selectedSheetData.dependencies.join(', ')}
                    </div>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => handleDownloadTemplate(selectedSheetData.name)}
                    disabled={isLoading}
                    className="w-full"
                  >
                    {isLoading ? 'Downloading...' : `Download ${displayLabel} Template`}
                  </Button>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6">
                  <h3 className="font-semibold text-slate-900 mb-2">Upload Instructions</h3>
                  <p className="text-sm text-slate-700">
                    Upload an Excel file (.xlsx) with the <strong>{selectedSheetData.name}</strong> sheet.
                    The file should match the template format. All data will be validated before import.
                    If any errors are found, no data will be imported.
                  </p>
                </div>
              </>
              );
            })()}

            {!selectedSheet && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-amber-800">
                  Please select a sheet from the list above to begin importing.
                </p>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
              aria-label="Select Excel file to import"
              title="Select Excel file to import"
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleFileDrop}
              onDragOver={handleDragOver}
              className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer text-center p-4 mb-4"
            >
              <div className="w-16 h-16 text-slate-400 mb-4">{ICONS.upload}</div>
              <p className="font-semibold text-slate-700 mb-2">Click to select or drag & drop your file</p>
              <p className="text-sm text-slate-500">Excel file (.xlsx, .xls) format</p>
              {fileName && (
                <p className="mt-4 text-sm font-medium text-green-600">{fileName}</p>
              )}
            </div>

            {selectedSheet && (
              <>
                {selectedSheetData && selectedSheetData.dependencies.length > 0 && !selectedSheetData.dependencies.every(dep => importedSheets.has(dep)) && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                    <p className="text-sm text-amber-800">
                      <strong>⚠️ Warning:</strong> This sheet depends on: {selectedSheetData.dependencies.join(', ')}.
                      Make sure these are imported first, otherwise the import may fail with validation errors.
                    </p>
                  </div>
                )}
                <Button
                  onClick={handleImport}
                  disabled={!selectedFile || isLoading}
                  className="w-full"
                >
                  {isLoading ? 'Importing...' : `Import ${IMPORT_CATEGORIES.flatMap(c => c.items).find(i => i.existing && i.sheetName === selectedSheet)?.label ?? selectedSheetData?.name ?? selectedSheet}`}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Step 3: Results
  if (currentStep === 'results' && importResult) {
    const hasErrors = importResult.validationErrors.length > 0;
    const hasDuplicates = importResult.duplicates.length > 0;

    return (
      <div className="flex flex-col h-full bg-white">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div className="flex-1">
            <div className="text-sm text-slate-500 mb-1">
              Settings › {getBreadcrumb()}
            </div>
            <h1 className="text-2xl font-bold text-slate-800">Import Results</h1>
          </div>
          <Button variant="ghost" onClick={goToPreviousStep}>
            <div className="w-4 h-4">{ICONS.chevronLeft}</div>
            <span className="hidden sm:inline">Back</span>
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            {/* Sheet-wise Results */}
            {importResult.sheetResults && importResult.sheetResults.length > 0 && (
              <div className="mb-6">
                <h3 className="font-semibold text-slate-800 mb-3">Sheet-wise Import Results</h3>
                <div className="space-y-3">
                  {importResult.sheetResults.map((sheetResult, idx) => (
                    <div
                      key={idx}
                      className={`border rounded-lg p-4 ${sheetResult.success
                        ? 'bg-green-50 border-green-200'
                        : 'bg-red-50 border-red-200'
                        }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-slate-800">{sheetResult.sheet}</h4>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${sheetResult.success
                            ? 'bg-green-200 text-green-800'
                            : 'bg-red-200 text-red-800'
                            }`}
                        >
                          {sheetResult.success ? '✓ Success' : '✗ Failed'}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-slate-600">Imported:</span>{' '}
                          <span className="font-semibold text-green-700">{sheetResult.imported}</span>
                        </div>
                        <div>
                          <span className="text-slate-600">Skipped:</span>{' '}
                          <span className="font-semibold text-amber-700">{sheetResult.skipped}</span>
                        </div>
                        <div>
                          <span className="text-slate-600">Errors:</span>{' '}
                          <span className="font-semibold text-red-700">{sheetResult.errors}</span>
                        </div>
                      </div>
                      {sheetResult.errorDetails && sheetResult.errorDetails.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-red-200">
                          <div className="text-xs text-red-700 space-y-1">
                            {sheetResult.errorDetails.map((error, errorIdx) => (
                              <div key={errorIdx}>
                                {error.row > 0 && `Row ${error.row}: `}
                                {error.message}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {hasErrors ? (
              <>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                  <h3 className="font-semibold text-red-900 mb-2">⚠️ Validation Failed</h3>
                  <p className="text-sm text-red-800">
                    <strong>No changes were made to the database.</strong> Please correct the errors below in your Excel file and re-upload.
                  </p>
                </div>

                <div className="mb-6">
                  <h3 className="font-semibold text-slate-800 mb-3">Validation Errors ({importResult.validationErrors.length})</h3>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="max-h-96 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 sticky top-0">
                          <tr>
                            <th className="px-4 py-2 text-left font-semibold text-slate-700">Sheet</th>
                            <th className="px-4 py-2 text-center font-semibold text-slate-700">Row</th>
                            <th className="px-4 py-2 text-left font-semibold text-slate-700">Field</th>
                            <th className="px-4 py-2 text-left font-semibold text-slate-700">Error</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importResult.validationErrors.map((error, idx) => (
                            <tr key={idx} className="border-t border-slate-100">
                              <td className="px-4 py-2">{error.sheet}</td>
                              <td className="px-4 py-2 text-center">{error.row}</td>
                              <td className="px-4 py-2">{error.field}</td>
                              <td className="px-4 py-2 text-red-600">{error.message}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                  <h3 className="font-semibold text-green-900 mb-2">✅ Import Successful</h3>
                  <p className="text-sm text-green-800">
                    Your data has been imported successfully!
                  </p>
                </div>

                {importResult.imported && (
                  <div className="mb-6">
                    <h3 className="font-semibold text-slate-800 mb-3">Import Summary</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-slate-50 rounded-lg p-4">
                        <div className="text-2xl font-bold text-slate-800">
                          {importResult.imported.contacts.count}
                        </div>
                        <div className="text-sm text-slate-600">Contacts</div>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-4">
                        <div className="text-2xl font-bold text-slate-800">
                          {importResult.imported.projects.count}
                        </div>
                        <div className="text-sm text-slate-600">Projects</div>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-4">
                        <div className="text-2xl font-bold text-slate-800">
                          {importResult.imported.buildings.count}
                        </div>
                        <div className="text-sm text-slate-600">Buildings</div>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-4">
                        <div className="text-2xl font-bold text-slate-800">
                          {importResult.imported.properties.count}
                        </div>
                        <div className="text-sm text-slate-600">Properties</div>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-4">
                        <div className="text-2xl font-bold text-slate-800">
                          {importResult.imported.units.count}
                        </div>
                        <div className="text-sm text-slate-600">Units</div>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-4">
                        <div className="text-2xl font-bold text-slate-800">
                          {importResult.imported.categories.count}
                        </div>
                        <div className="text-sm text-slate-600">Categories</div>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-4">
                        <div className="text-2xl font-bold text-slate-800">
                          {importResult.imported.accounts.count}
                        </div>
                        <div className="text-sm text-slate-600">Accounts</div>
                      </div>
                      {importResult.imported.inventoryItems && importResult.imported.inventoryItems.count > 0 && (
                        <div className="bg-slate-50 rounded-lg p-4">
                          <div className="text-2xl font-bold text-slate-800">
                            {importResult.imported.inventoryItems.count}
                          </div>
                          <div className="text-sm text-slate-600">Inventory Items</div>
                        </div>
                      )}
                      {importResult.imported.vendors && importResult.imported.vendors.count > 0 && (
                        <div className="bg-slate-50 rounded-lg p-4">
                          <div className="text-2xl font-bold text-slate-800">
                            {importResult.imported.vendors.count}
                          </div>
                          <div className="text-sm text-slate-600">Vendors</div>
                        </div>
                      )}
                      {importResult.imported.purchaseBills && importResult.imported.purchaseBills.count > 0 && (
                        <div className="bg-slate-50 rounded-lg p-4">
                          <div className="text-2xl font-bold text-slate-800">
                            {importResult.imported.purchaseBills.count}
                          </div>
                          <div className="text-sm text-slate-600">Purchase Bills</div>
                        </div>
                      )}
                      {importResult.imported.purchaseBillItems && importResult.imported.purchaseBillItems.count > 0 && (
                        <div className="bg-slate-50 rounded-lg p-4">
                          <div className="text-2xl font-bold text-slate-800">
                            {importResult.imported.purchaseBillItems.count}
                          </div>
                          <div className="text-sm text-slate-600">Purchase Bill Items</div>
                        </div>
                      )}
                      {importResult.imported.invoices && importResult.imported.invoices.count > 0 && (
                        <div className="bg-slate-50 rounded-lg p-4">
                          <div className="text-2xl font-bold text-slate-800">
                            {importResult.imported.invoices.count}
                          </div>
                          <div className="text-sm text-slate-600">Invoices</div>
                        </div>
                      )}
                      {importResult.imported.rentalInvoicePayments && importResult.imported.rentalInvoicePayments.count > 0 && (
                        <div className="bg-slate-50 rounded-lg p-4">
                          <div className="text-2xl font-bold text-slate-800">
                            {importResult.imported.rentalInvoicePayments.count}
                          </div>
                          <div className="text-sm text-slate-600">Rental Invoice Payments</div>
                        </div>
                      )}
                      {importResult.imported.contracts && importResult.imported.contracts.count > 0 && (
                        <div className="bg-slate-50 rounded-lg p-4">
                          <div className="text-2xl font-bold text-slate-800">
                            {importResult.imported.contracts.count}
                          </div>
                          <div className="text-sm text-slate-600">Contracts</div>
                        </div>
                      )}
                      {importResult.imported.projectBills && importResult.imported.projectBills.count > 0 && (
                        <div className="bg-slate-50 rounded-lg p-4">
                          <div className="text-2xl font-bold text-slate-800">
                            {importResult.imported.projectBills.count}
                          </div>
                          <div className="text-sm text-slate-600">Project Bills</div>
                        </div>
                      )}
                      {importResult.imported.projectBillPayments && importResult.imported.projectBillPayments.count > 0 && (
                        <div className="bg-slate-50 rounded-lg p-4">
                          <div className="text-2xl font-bold text-slate-800">
                            {importResult.imported.projectBillPayments.count}
                          </div>
                          <div className="text-sm text-slate-600">Project Bill Payments</div>
                        </div>
                      )}
                      {importResult.imported.budgets && importResult.imported.budgets.count > 0 && (
                        <div className="bg-slate-50 rounded-lg p-4">
                          <div className="text-2xl font-bold text-slate-800">
                            {importResult.imported.budgets.count}
                          </div>
                          <div className="text-sm text-slate-600">Budgets</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {hasDuplicates && (
              <div className="mb-6">
                <h3 className="font-semibold text-amber-800 mb-3">Skipped Duplicates ({importResult.duplicates.length})</h3>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="max-h-48 overflow-y-auto">
                    <ul className="space-y-2 text-sm">
                      {importResult.duplicates.map((dup, idx) => (
                        <li key={idx} className="text-amber-800">
                          <strong>{dup.sheet}</strong> Row {dup.row}: {dup.name} - {dup.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-4">
              {hasErrors ? (
                <Button onClick={() => setCurrentStep('import')} className="flex-1">
                  Upload Corrected File
                </Button>
              ) : (
                <Button onClick={handleReset} className="flex-1">
                  Import Another File
                </Button>
              )}
              <Button variant="secondary" onClick={goBack} className="flex-1">
                Back to Settings
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default ImportExportWizard;
