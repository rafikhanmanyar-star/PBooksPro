
import React, { useState, useMemo } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useAppContext } from '../../context/AppContext';
import { exportData, getExportTypesByCategory, ExportFormat } from '../../services/csvExportService';
import { useProgress } from '../../context/ProgressContext';
import { useNotification } from '../../context/NotificationContext';

interface ExportDataModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const ExportDataModal: React.FC<ExportDataModalProps> = ({ isOpen, onClose }) => {
    const { state } = useAppContext();
    const { startProgress, updateProgress, completeProgress, errorProgress } = useProgress();
    const { showToast, showAlert } = useNotification();
    
    const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
    const [format, setFormat] = useState<ExportFormat>('csv');
    const [isExporting, setIsExporting] = useState(false);
    
    const schemasByCategory = useMemo(() => getExportTypesByCategory(), []);
    
    const categoryLabels: Record<string, string> = {
        financial: 'Financial Documents',
        master: 'Master Data',
        projects: 'Projects & Properties',
        agreements: 'Agreements & Contracts',
        payroll: 'Payroll & HR',
        pm: 'PM Management',
        other: 'Other',
    };
    
    const toggleType = (typeKey: string) => {
        const newSelected = new Set(selectedTypes);
        if (newSelected.has(typeKey)) {
            newSelected.delete(typeKey);
        } else {
            newSelected.add(typeKey);
        }
        setSelectedTypes(newSelected);
    };
    
    const selectAll = () => {
        const allKeys = Object.values(schemasByCategory).flat().map(s => s.key);
        setSelectedTypes(new Set(allKeys));
    };
    
    const deselectAll = () => {
        setSelectedTypes(new Set());
    };
    
    const handleExport = async () => {
        if (selectedTypes.size === 0) {
            await showAlert('Please select at least one data type to export.');
            return;
        }
        
        setIsExporting(true);
        startProgress('Exporting Data');
        
        try {
            await exportData(
                state,
                {
                    selectedTypes: Array.from(selectedTypes),
                    format,
                },
                (progress, message) => {
                    updateProgress(progress, message);
                }
            );
            
            completeProgress();
            await showToast('Export completed successfully!', 'success');
            onClose();
        } catch (error) {
            errorProgress(error instanceof Error ? error.message : 'Export failed');
            await showAlert(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setIsExporting(false);
        }
    };
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Export Data" size="lg">
            <div className="space-y-6">
                {/* Format Selection */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Export Format
                    </label>
                    <div className="flex gap-4">
                        <label className="flex items-center cursor-pointer">
                            <input
                                type="radio"
                                name="format"
                                value="csv"
                                checked={format === 'csv'}
                                onChange={(e) => setFormat(e.target.value as ExportFormat)}
                                className="mr-2"
                                disabled={isExporting}
                            />
                            <span className="text-sm">CSV (Separate files)</span>
                        </label>
                        <label className="flex items-center cursor-pointer">
                            <input
                                type="radio"
                                name="format"
                                value="excel"
                                checked={format === 'excel'}
                                onChange={(e) => setFormat(e.target.value as ExportFormat)}
                                className="mr-2"
                                disabled={isExporting}
                            />
                            <span className="text-sm">Excel (Single file with sheets)</span>
                        </label>
                    </div>
                </div>
                
                {/* Data Type Selection */}
                <div>
                    <div className="flex justify-between items-center mb-3">
                        <label className="block text-sm font-medium text-gray-700">
                            Select Data Types to Export
                        </label>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={selectAll}
                                className="text-xs text-blue-600 hover:text-blue-800 underline"
                                disabled={isExporting}
                            >
                                Select All
                            </button>
                            <span className="text-gray-400">|</span>
                            <button
                                type="button"
                                onClick={deselectAll}
                                className="text-xs text-blue-600 hover:text-blue-800 underline"
                                disabled={isExporting}
                            >
                                Deselect All
                            </button>
                        </div>
                    </div>
                    
                    <div className="border border-gray-200 rounded-lg p-4 max-h-96 overflow-y-auto">
                        {Object.entries(schemasByCategory).map(([category, schemas]) => (
                            schemas.length > 0 && (
                                <div key={category} className="mb-4 last:mb-0">
                                    <h3 className="text-sm font-semibold text-gray-800 mb-2">
                                        {categoryLabels[category] || category}
                                    </h3>
                                    <div className="space-y-1 ml-4">
                                        {schemas.map((schema) => (
                                            <label
                                                key={schema.key}
                                                className="flex items-center cursor-pointer hover:bg-gray-50 p-1 rounded"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedTypes.has(schema.key)}
                                                    onChange={() => toggleType(schema.key)}
                                                    className="mr-2"
                                                    disabled={isExporting}
                                                />
                                                <span className="text-sm text-gray-700">
                                                    {schema.displayName}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )
                        ))}
                    </div>
                    
                    {selectedTypes.size > 0 && (
                        <p className="mt-2 text-xs text-gray-500">
                            {selectedTypes.size} type{selectedTypes.size !== 1 ? 's' : ''} selected
                        </p>
                    )}
                </div>
                
                {/* Actions */}
                <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button
                        variant="secondary"
                        onClick={onClose}
                        disabled={isExporting}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleExport}
                        disabled={isExporting || selectedTypes.size === 0}
                    >
                        {isExporting ? 'Exporting...' : 'Export'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default ExportDataModal;

