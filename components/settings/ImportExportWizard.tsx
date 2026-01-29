import React, { useState, useRef, useCallback } from 'react';
import { getApiBaseUrl } from '../../config/apiUrl';
import { useAppContext } from '../../context/AppContext';
import { ICONS } from '../../constants';
import Button from '../ui/Button';
import { apiClient } from '../../services/api/client';
import { getAppStateApiService } from '../../services/api/appStateApi';

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
  { name: 'RentalInvoices', dependencies: ['RentalAgreements', 'Contacts', 'Properties'], description: 'Import rental invoices (depends on Rental Agreements, Contacts, and Properties)' }
];

const ImportExportWizard: React.FC = () => {
  const { dispatch, state } = useAppContext();
  const [currentStep, setCurrentStep] = useState<WizardStep>('choose');
  const [stepHistory, setStepHistory] = useState<WizardStep[]>(['choose']);
  const [actionType, setActionType] = useState<ActionType>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [importedSheets, setImportedSheets] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const goBack = () => dispatch({ type: 'SET_PAGE', payload: 'settings' });

  const goToStep = (step: WizardStep) => {
    setStepHistory(prev => [...prev, step]);
    setCurrentStep(step);
  };

  const goToPreviousStep = () => {
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
      a.download = `export-data-${new Date().toISOString().split('T')[0]}.xlsx`;
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
          const apiState = await apiService.loadState();
          
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
          if (apiState.invoices) updates.invoices = mergeById(currentState.invoices, apiState.invoices);

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
                Just make sure your Excel file has sheets named: <strong>Contacts, Projects, Buildings, Properties, Units, Categories, Accounts</strong> 
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
              <p className="text-sm text-blue-800">
                The template includes sheets for: Contacts, Projects, Buildings, Properties, Units, Categories, and Accounts.
                Each sheet contains column headers. Fill in your data and import the file.
              </p>
            </div>

            <Button
              onClick={() => handleDownloadTemplate()}
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? 'Downloading...' : 'Download Template'}
            </Button>
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

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">
            {/* Sheet Selection List */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Select Sheet to Import</h3>
              <div className="space-y-2">
                {IMPORT_ORDER.map((sheet, idx) => {
                  const isSelected = selectedSheet === sheet.name;
                  const isImported = importedSheets.has(sheet.name);
                  const hasUnmetDependencies = sheet.dependencies.length > 0 && !sheet.dependencies.every(dep => importedSheets.has(dep));
                  const unmetDeps = sheet.dependencies.filter(dep => !importedSheets.has(dep));

                  return (
                    <div
                      key={idx}
                      onClick={() => !isImported && handleSheetSelect(sheet.name)}
                      className={`flex items-center p-3 rounded-lg border transition-all ${
                        isImported
                          ? 'bg-green-50 border-green-300 cursor-default'
                          : isSelected
                          ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-400 cursor-pointer'
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100 cursor-pointer'
                      }`}
                    >
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mr-3 font-semibold text-sm ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : isImported
                          ? 'bg-green-600 text-white'
                          : 'bg-slate-400 text-white'
                      }`}>
                        {isImported ? '✓' : idx + 1}
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-slate-800">{sheet.name}</div>
                        <div className="text-xs text-slate-600">{sheet.description}</div>
                        {sheet.dependencies.length > 0 && (
                          <div className={`text-xs mt-1 ${
                            hasUnmetDependencies ? 'text-amber-600' : 'text-green-600'
                          }`}>
                            Depends on: {sheet.dependencies.join(', ')}
                            {hasUnmetDependencies && (
                              <span className="text-amber-700 font-semibold ml-1">
                                ⚠️ Warning: {unmetDeps.join(', ')} not imported yet
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      {isImported && (
                        <div className="text-green-600 font-semibold text-sm">✓ Done</div>
                      )}
                      {isSelected && !isImported && (
                        <div className="text-blue-600 font-semibold text-sm">Selected</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected Sheet Info */}
            {selectedSheetData && (
              <>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <h3 className="font-semibold text-blue-900 mb-2">Selected: {selectedSheetData.name}</h3>
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
                    {isLoading ? 'Downloading...' : `Download ${selectedSheetData.name} Template`}
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
            )}

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
                  {isLoading ? 'Importing...' : `Import ${selectedSheetData?.name || selectedSheet}`}
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
                      className={`border rounded-lg p-4 ${
                        sheetResult.success
                          ? 'bg-green-50 border-green-200'
                          : 'bg-red-50 border-red-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-slate-800">{sheetResult.sheet}</h4>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            sheetResult.success
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
