
import React, { useState, useMemo, useEffect } from 'react';
import { Project, TransactionType } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Select from '../ui/Select';
import ComboBox from '../ui/ComboBox';
import { useAppContext } from '../../context/AppContext';
import { useNotification } from '../../context/NotificationContext';
import { ICONS } from '../../constants';

interface ProjectPMConfigFormProps {
    isOpen: boolean;
    onClose: () => void;
    project: Project;
    onSave: (project: Project) => void;
}

const ProjectPMConfigForm: React.FC<ProjectPMConfigFormProps> = ({ isOpen, onClose, project, onSave }) => {
    const { state } = useAppContext();
    const { showConfirm, showToast } = useNotification();
    const [rate, setRate] = useState(project.pmConfig?.rate?.toString() || '0');
    const [frequency, setFrequency] = useState<'Monthly' | 'Weekly' | 'Yearly'>(project.pmConfig?.frequency || 'Monthly');
    const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set(project.pmConfig?.excludedCategoryIds || []));
    const [vendorId, setVendorId] = useState<string>(project.pmConfig?.vendorId || '');
    const [searchQuery, setSearchQuery] = useState('');

    // Check if there are existing PM allocations or payments for this project
    const hasExistingData = useMemo(() => {
        const pmCostCategory = state.categories.find(c => c.name === 'Project Management Cost');
        if (!pmCostCategory) return false;

        // Check for allocation transactions (system transactions with PM allocation markers)
        const hasAllocations = state.transactions.some(tx => {
            if (tx.projectId !== project.id) return false;
            if (!tx.isSystem) return false;
            if (!tx.description) return false;
            return tx.description.includes('[PM-ALLOC-') || tx.description.includes('PM Fee Allocation');
        });

        // Check for payment transactions
        const hasPayments = state.transactions.some(tx => {
            if (tx.projectId !== project.id) return false;
            if (tx.type === TransactionType.EXPENSE && tx.categoryId === pmCostCategory.id) return true;
            if (tx.type === TransactionType.TRANSFER && 
                (tx.description?.toLowerCase().includes('pm fee') || tx.description?.toLowerCase().includes('pm payout'))) {
                return true;
            }
            return false;
        });

        return hasAllocations || hasPayments;
    }, [state.transactions, state.categories, project.id]);

    // Categories available for exclusion (Expenses only)
    const expenseCategories = useMemo(() => {
        return state.categories
            .filter(c => c.type === TransactionType.EXPENSE)
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [state.categories]);

    // Vendors from vendor directory (for PM bill vendor)
    const vendorOptions = useMemo(() => {
        return (state.vendors || [])
            .filter(v => v.isActive !== false || v.id === vendorId)
            .map(v => ({ id: v.id, name: v.companyName ? `${v.name} (${v.companyName})` : v.name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [state.vendors, vendorId]);

    // Sync form when project or modal opens
    useEffect(() => {
        if (isOpen) {
            setRate(project.pmConfig?.rate?.toString() || '0');
            setFrequency(project.pmConfig?.frequency || 'Monthly');
            setExcludedIds(new Set(project.pmConfig?.excludedCategoryIds || []));
            setVendorId(project.pmConfig?.vendorId || '');
        }
    }, [isOpen, project.id, project.pmConfig?.rate, project.pmConfig?.frequency, project.pmConfig?.excludedCategoryIds, project.pmConfig?.vendorId]);

    // Initialize defaults if not set (Legacy behavior migration)
    useEffect(() => {
        if (!project.pmConfig?.excludedCategoryIds) {
            // Default legacy exclusions if never configured
            const legacyDefaults = expenseCategories.filter(c => 
                ['Broker Fee', 'Rebate Amount', 'Owner Payout', 'Project Management Cost'].includes(c.name) ||
                ['Customer Discount', 'Floor Discount', 'Lump Sum Discount', 'Misc Discount'].includes(c.name)
            ).map(c => c.id);
            setExcludedIds(new Set(legacyDefaults));
        }
    }, [project.pmConfig, expenseCategories]);

    const handleToggleCategory = (id: string) => {
        const newSet = new Set(excludedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setExcludedIds(newSet);
    };

    const handleSubmit = async (e?: React.MouseEvent) => {
        // Prevent any default form submission
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        const numRate = parseFloat(rate);
        if (isNaN(numRate) || numRate < 0) {
            return;
        }

        if (!vendorId?.trim()) {
            showToast('Please select a vendor that belongs to Project management.', 'error');
            return;
        }

        // Check if configuration has changed
        const rateChanged = project.pmConfig?.rate !== numRate;
        const frequencyChanged = project.pmConfig?.frequency !== frequency;
        const excludedChanged = JSON.stringify(Array.from(excludedIds).sort()) !== 
                                JSON.stringify((project.pmConfig?.excludedCategoryIds || []).sort());
        const vendorChanged = (project.pmConfig?.vendorId || '') !== (vendorId || '');

        // If there's existing data and config changed, show warning
        if (hasExistingData && (rateChanged || frequencyChanged || excludedChanged || vendorChanged)) {
            const message = `Data has been recorded in the past using the current configuration.\n\n` +
                          `Changing the configuration will:\n` +
                          `• Affect future calculations\n` +
                          `• May cause inconsistencies with historical data\n\n` +
                          `Are you sure you want to change the configuration?`;
            
            const confirmResult = await showConfirm(
                message,
                { 
                    title: "⚠️ Configuration Change Warning", 
                    confirmLabel: "Yes, Change Configuration", 
                    cancelLabel: "Cancel" 
                }
            );
            
            // If user cancels (false or undefined), do not proceed with save
            if (confirmResult !== true) {
                return; // Exit early, do not save
            }
        }

        // Only save if user confirmed or no warning was needed (vendorId is required)
        const updatedProject: Project = {
            ...project,
            pmConfig: {
                rate: numRate,
                frequency,
                excludedCategoryIds: Array.from(excludedIds),
                vendorId: vendorId.trim()
            }
        };
        onSave(updatedProject);
    };

    const filteredCategories = expenseCategories.filter(c => 
        c.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const vendorSummaryLabel = useMemo(() => {
        if (!vendorId) return '—';
        const v = (state.vendors || []).find((x) => x.id === vendorId);
        if (!v) return '—';
        return v.companyName ? `${v.name} (${v.companyName})` : v.name;
    }, [vendorId, state.vendors]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`PM Configuration: ${project.name}`}>
            <div className="space-y-6">
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm bg-app-card border border-app-border rounded-lg px-4 py-3">
                    <span>
                        <span className="text-app-muted font-medium">Fee rate: </span>
                        <span className="font-bold text-app-text">{rate || '0'}%</span>
                    </span>
                    <span className="text-app-border hidden sm:inline">|</span>
                    <span>
                        <span className="text-app-muted font-medium">Cycle: </span>
                        <span className="font-bold text-app-text">{frequency}</span>
                    </span>
                    <span className="text-app-border hidden sm:inline">|</span>
                    <span className="min-w-0">
                        <span className="text-app-muted font-medium">Vendor: </span>
                        <span className="font-bold text-app-text break-words">{vendorSummaryLabel}</span>
                    </span>
                </div>
                <div className="bg-app-toolbar/60 p-4 rounded-lg border border-app-border">
                    <p className="text-sm text-app-text mb-4">
                        Define the Project Management fee structure.
                    </p>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Input 
                                label="Fee Percentage (%)" 
                                type="number" 
                                min="0" 
                                step="0.1" 
                                value={rate} 
                                onChange={e => setRate(e.target.value)} 
                                required
                            />
                        </div>
                        <div>
                            <Select 
                                label="Calculation Frequency" 
                                value={frequency} 
                                onChange={e => setFrequency(e.target.value as any)}
                            >
                                <option value="Monthly">Monthly</option>
                                <option value="Weekly">Weekly</option>
                                <option value="Yearly">Yearly</option>
                            </Select>
                        </div>
                    </div>
                    <div className="mt-4">
                        <ComboBox
                            label="Vendor (for PM bills)"
                            items={vendorOptions}
                            selectedId={vendorId}
                            onSelect={(item) => setVendorId(item?.id || '')}
                            placeholder="Select vendor from directory"
                            allowAddNew={false}
                        />
                        <p className="text-xs text-app-muted mt-1">Please select vendor belongs to Project management.</p>
                    </div>
                </div>

                <div className="border border-app-border rounded-lg overflow-hidden">
                    <div className="bg-app-toolbar p-3 border-b border-app-border">
                        <label className="block text-sm font-bold text-app-text mb-1">Excluded Cost Categories</label>
                        <p className="text-xs text-app-muted mb-2">Select expense categories that should NOT contribute to the PM Fee calculation.</p>
                        <div className="relative">
                            <input 
                                type="text" 
                                placeholder="Search categories..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="ds-input-field w-full pl-8 pr-3 py-1.5 text-sm rounded-lg placeholder:text-app-muted"
                            />
                            <div className="absolute left-2.5 top-1.5 text-app-muted">
                                <div className="w-4 h-4">{ICONS.search}</div>
                            </div>
                        </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto p-2 bg-app-card">
                        {filteredCategories.map(cat => (
                            <label key={cat.id} className="flex items-center p-2 hover:bg-app-toolbar/60 rounded cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={excludedIds.has(cat.id)} 
                                    onChange={() => handleToggleCategory(cat.id)}
                                    className="rounded text-primary focus:ring-primary h-4 w-4 border-app-border bg-app-input"
                                />
                                <span className="ml-3 text-sm text-app-text">{cat.name}</span>
                            </label>
                        ))}
                        {filteredCategories.length === 0 && (
                            <p className="text-center text-xs text-app-muted py-4">No categories found.</p>
                        )}
                    </div>
                    <div className="bg-app-toolbar p-2 text-right border-t border-app-border">
                        <span className="text-xs font-semibold text-primary">
                            {excludedIds.size} categories excluded
                        </span>
                    </div>
                </div>

                <div className="flex justify-end gap-2 border-t pt-4">
                    <Button variant="secondary" onClick={onClose} type="button">Cancel</Button>
                    <Button onClick={handleSubmit} type="button">Save Configuration</Button>
                </div>
            </div>
        </Modal>
    );
};

export default ProjectPMConfigForm;
