
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Contract, ContractExpenseCategoryItem, ContactType, ContractStatus, TransactionType } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import { useNotification } from '../../context/NotificationContext';
import { CURRENCY, ICONS } from '../../constants';
import { useEntityFormModal, EntityFormModal } from '../../hooks/useEntityFormModal';
import { getFormBackgroundColorStyle } from '../../utils/formColorUtils';

interface ProjectContractFormProps {
    onClose: () => void;
    contractToEdit?: Contract | null;
}

const ProjectContractForm: React.FC<ProjectContractFormProps> = ({ onClose, contractToEdit }) => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert, showConfirm } = useNotification();
    const entityFormModal = useEntityFormModal();

    const generateContractNumber = () => {
        const prefix = 'CONT-';
        let maxNum = 0;
        (state.contracts || []).forEach(c => {
            if (c.contractNumber.startsWith(prefix)) {
                const part = c.contractNumber.substring(prefix.length);
                const num = parseInt(part, 10);
                if (!isNaN(num) && num > maxNum) maxNum = num;
            }
        });
        return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
    };

    const [contractNumber, setContractNumber] = useState(contractToEdit?.contractNumber || generateContractNumber());
    const [name, setName] = useState(contractToEdit?.name || '');
    const [projectId, setProjectId] = useState(contractToEdit?.projectId || state.defaultProjectId || '');
    const [vendorId, setVendorId] = useState(contractToEdit?.vendorId || '');
    
    // Get initial start date: use preserved date if option is enabled and creating new contract
    const getInitialStartDate = () => {
        if (contractToEdit?.startDate) {
            return contractToEdit.startDate;
        }
        if (state.enableDatePreservation && state.lastPreservedDate && !contractToEdit) {
            return state.lastPreservedDate;
        }
        return new Date().toISOString().split('T')[0];
    };
    
    const [startDate, setStartDate] = useState(getInitialStartDate());
    const [endDate, setEndDate] = useState(contractToEdit?.endDate || '');
    
    // Save date to preserved date when changed (if option is enabled)
    const handleStartDateChange = (date: Date) => {
        const dateStr = date.toISOString().split('T')[0];
        setStartDate(dateStr);
        if (state.enableDatePreservation && !contractToEdit) {
            dispatch({ type: 'UPDATE_PRESERVED_DATE', payload: dateStr });
        }
    };
    const [status, setStatus] = useState<ContractStatus>(contractToEdit?.status || ContractStatus.ACTIVE);
    const [termsAndConditions, setTermsAndConditions] = useState(contractToEdit?.termsAndConditions || '');
    const [paymentTerms, setPaymentTerms] = useState(contractToEdit?.paymentTerms || '');
    const [documentFile, setDocumentFile] = useState<File | null>(null);
    const [documentPath, setDocumentPath] = useState(contractToEdit?.documentPath || '');
    
    // Expense Category Items - new tracking system
    const [expenseCategoryItems, setExpenseCategoryItems] = useState<ContractExpenseCategoryItem[]>(
        contractToEdit?.expenseCategoryItems || []
    );

    const vendors = useMemo(() => state.contacts.filter(c => c.type === ContactType.VENDOR), [state.contacts]);
    const expenseCategories = useMemo(() => state.categories.filter(c => c.type === TransactionType.EXPENSE), [state.categories]);

    // Get available categories (not already used in items)
    const usedCategoryIds = useMemo(() => new Set(expenseCategoryItems.map(item => item.categoryId)), [expenseCategoryItems]);
    const availableCategories = useMemo(() => {
        return expenseCategories.filter(c => !usedCategoryIds.has(c.id));
    }, [expenseCategories, usedCategoryIds]);

    // Calculate total gross value (sum of all net values)
    const totalGrossValue = useMemo(() => {
        return expenseCategoryItems.reduce((sum, item) => sum + (item.netValue || 0), 0);
    }, [expenseCategoryItems]);

    // Add new expense category item
    const handleAddExpenseCategory = (category: { id: string; name: string } | null) => {
        if (!category) return;
        
        const newItem: ContractExpenseCategoryItem = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            categoryId: category.id,
            unit: 'quantity',
            quantity: 1,
            pricePerUnit: 0,
            netValue: 0
        };
        
        setExpenseCategoryItems(prev => [...prev, newItem]);
    };

    // Remove expense category item
    const handleRemoveExpenseCategoryItem = (itemId: string) => {
        setExpenseCategoryItems(prev => prev.filter(item => item.id !== itemId));
    };

    // Update expense category item
    const updateExpenseCategoryItem = (itemId: string, updates: Partial<ContractExpenseCategoryItem>, isNetValueDirectEdit = false) => {
        setExpenseCategoryItems(prev => prev.map(item => {
            if (item.id !== itemId) return item;
            
            const updated = { ...item, ...updates };
            
            if (isNetValueDirectEdit) {
                // Reverse calculation: if net value is edited directly, calculate price per unit
                const netValue = updated.netValue || 0;
                const quantity = updated.quantity || 0;
                if (quantity > 0) {
                    updated.pricePerUnit = netValue / quantity;
                } else {
                    // If quantity is 0, set price per unit to net value (treat as single item)
                    updated.pricePerUnit = netValue;
                    updated.quantity = 1; // Auto-set quantity to 1 if it was 0
                }
            } else {
                // Forward calculation: quantity × price per unit = net value
                const quantity = updated.quantity || 0;
                const pricePerUnit = updated.pricePerUnit || 0;
                updated.netValue = quantity * pricePerUnit;
            }
            
            return updated;
        }));
    };

    // Auto-calculate End Date (1 Year) when Start Date changes (only if creating new or if specifically changing dates)
    useEffect(() => {
        if (!contractToEdit && startDate) {
            const d = new Date(startDate);
            if (!isNaN(d.getTime())) {
                d.setFullYear(d.getFullYear() + 1);
                d.setDate(d.getDate() - 1);
                setEndDate(d.toISOString().split('T')[0]);
            }
        }
    }, [startDate, contractToEdit]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !projectId || !vendorId) {
            await showAlert("Please fill in all required fields.");
            return;
        }

        if (expenseCategoryItems.length === 0) {
            await showAlert("Please add at least one expense category item.");
            return;
        }

        let finalDocumentPath = documentPath;

        // Handle file upload if a new file is selected
        if (documentFile && state.documentStoragePath) {
            try {
                // Convert file to base64
                const reader = new FileReader();
                const base64Data = await new Promise<string>((resolve, reject) => {
                    reader.onload = () => {
                        const result = reader.result as string;
                        // Remove data URL prefix (e.g., "data:application/pdf;base64,")
                        const base64 = result.split(',')[1] || result;
                        resolve(base64);
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(documentFile);
                });

                // Generate file path
                const fileExtension = documentFile.name.split('.').pop() || 'pdf';
                const fileName = `CONTRACT-${contractNumber}-${Date.now()}.${fileExtension}`;
                const filePath = `${state.documentStoragePath}/${fileName}`;

                // Save file via IPC
                if (window.electronAPI && window.electronAPI.saveDocumentFile) {
                    const saveResult = await window.electronAPI.saveDocumentFile({
                        filePath,
                        fileData: base64Data,
                        fileName: documentFile.name
                    });

                    if (saveResult.success) {
                        finalDocumentPath = filePath;
                    } else {
                        await showAlert(`Failed to save document: ${saveResult.error}`);
                        return;
                    }
                } else {
                    await showAlert('File system access not available. Please set document storage folder in settings.');
                    return;
                }
            } catch (error) {
                await showAlert(`Error uploading document: ${error instanceof Error ? error.message : String(error)}`);
                return;
            }
        } else if (documentFile && !state.documentStoragePath) {
            // Document is optional - clear it and continue without blocking submission
            await showAlert('Document storage folder is not set. The document will not be saved. You can set the storage folder in Settings > My Preferences and upload the document later.', { title: 'Document Not Saved' });
            setDocumentFile(null);
            // Continue without document - finalDocumentPath remains as existing documentPath
        }

        const payload: Contract = {
            id: contractToEdit?.id || Date.now().toString(),
            contractNumber,
            name,
            projectId,
            vendorId,
            totalAmount: totalGrossValue, // Use calculated total gross value
            startDate,
            endDate,
            status,
            expenseCategoryItems,
            termsAndConditions,
            paymentTerms,
            documentPath: finalDocumentPath || undefined
        };

        if (contractToEdit) {
            dispatch({ type: 'UPDATE_CONTRACT', payload });
            showToast("Contract updated successfully.");
        } else {
            dispatch({ type: 'ADD_CONTRACT', payload });
            showToast("Contract created successfully.");
        }
        onClose();
    };

    const handleDelete = async () => {
        if (!contractToEdit) return;
        if (await showConfirm("Are you sure you want to delete this contract?")) {
            dispatch({ type: 'DELETE_CONTRACT', payload: contractToEdit.id });
            showToast("Contract deleted.");
            onClose();
        }
    };


    const formBackgroundStyle = useMemo(() => {
        return getFormBackgroundColorStyle(projectId, undefined, state);
    }, [projectId, state]);

    return (
        <>
        <form onSubmit={handleSubmit} className="space-y-4" style={formBackgroundStyle}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input label="Contract Number" value={contractNumber} onChange={e => setContractNumber(e.target.value)} required />
                <Input label="Contract Title" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Grey Structure" required />
                <ComboBox 
                    label="Project" 
                    items={state.projects} 
                    selectedId={projectId} 
                    onSelect={item => setProjectId(item?.id || '')} 
                    placeholder="Select Project"
                    required 
                    allowAddNew={false}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <ComboBox 
                    label="Vendor / Contractor" 
                    items={vendors} 
                    selectedId={vendorId} 
                    onSelect={item => setVendorId(item?.id || '')} 
                    placeholder="Select Vendor"
                    required
                    allowAddNew={true}
                    entityType="contact"
                    onAddNew={(entityType, name) => {
                        entityFormModal.openForm('contact', name, ContactType.VENDOR, undefined, (newId) => {
                            setVendorId(newId);
                        });
                    }}
                />
                <DatePicker label="Start Date" value={startDate} onChange={handleStartDateChange} required />
                <DatePicker label="End Date (Est.)" value={endDate} onChange={d => setEndDate(d.toISOString().split('T')[0])} />
            </div>

            {/* Track Expense Category Section */}
            <div className="border rounded-lg p-4 bg-slate-50 border-slate-200">
                <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-slate-700">Track Expense Category</label>
                    <ComboBox
                        items={availableCategories}
                        selectedId=""
                        onSelect={handleAddExpenseCategory}
                        placeholder="Add expense category..."
                        entityType="category"
                        onAddNew={(entityType, name) => {
                            entityFormModal.openForm('category', name, undefined, TransactionType.EXPENSE, (newId) => {
                                const newCategory = state.categories.find(c => c.id === newId);
                                if (newCategory) {
                                    handleAddExpenseCategory({ id: newId, name: newCategory.name });
                                }
                            });
                        }}
                    />
                </div>

                {expenseCategoryItems.length > 0 ? (
                    <>
                        {/* Data Grid */}
                        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-100 border-b border-slate-200">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-semibold text-slate-700">Expense Category</th>
                                            <th className="px-3 py-2 text-left font-semibold text-slate-700">Unit</th>
                                            <th className="px-3 py-2 text-left font-semibold text-slate-700">Quantity</th>
                                            <th className="px-3 py-2 text-left font-semibold text-slate-700">Price per Unit</th>
                                            <th className="px-3 py-2 text-right font-semibold text-slate-700">Net Value</th>
                                            <th className="px-3 py-2 text-center font-semibold text-slate-700 w-12">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {expenseCategoryItems.map((item) => {
                                            const category = expenseCategories.find(c => c.id === item.categoryId);
                                            return (
                                                <tr key={item.id} className="hover:bg-slate-50">
                                                    <td className="px-3 py-2">
                                                        <span className="font-medium text-slate-800">{category?.name || 'Unknown'}</span>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <Select
                                                            value={item.unit}
                                                            onChange={(e) => updateExpenseCategoryItem(item.id, { unit: e.target.value as ContractExpenseCategoryItem['unit'] })}
                                                            className="text-sm border-slate-300"
                                                        >
                                                            <option value="Cubic Feet">Cubic Feet</option>
                                                            <option value="Square feet">Square feet</option>
                                                            <option value="feet">feet</option>
                                                            <option value="quantity">quantity</option>
                                                        </Select>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            value={item.quantity?.toString() || ''}
                                                            onChange={(e) => {
                                                                const quantity = parseFloat(e.target.value) || 0;
                                                                updateExpenseCategoryItem(item.id, { quantity });
                                                            }}
                                                            className="text-sm w-24"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            value={item.pricePerUnit.toString() || ''}
                                                            onChange={(e) => {
                                                                const pricePerUnit = parseFloat(e.target.value) || 0;
                                                                updateExpenseCategoryItem(item.id, { pricePerUnit });
                                                            }}
                                                            className="text-sm w-32"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            value={item.netValue?.toString() || '0'}
                                                            onChange={(e) => {
                                                                const netValue = parseFloat(e.target.value) || 0;
                                                                updateExpenseCategoryItem(item.id, { netValue }, true);
                                                            }}
                                                            className="text-sm w-32 text-right font-semibold"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2 text-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveExpenseCategoryItem(item.id)}
                                                            className="text-slate-400 hover:text-rose-500 transition-colors"
                                                            title="Remove"
                                                        >
                                                            <div className="w-4 h-4">{ICONS.x}</div>
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot className="bg-slate-100 border-t-2 border-slate-300">
                                        <tr>
                                            <td colSpan={4} className="px-3 py-2 text-right font-bold text-slate-700">
                                                Total Gross Value (Contract Value):
                                            </td>
                                            <td className="px-3 py-2 text-right font-bold text-lg text-slate-800">
                                                {CURRENCY} {totalGrossValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    </>
                ) : (
                    <p className="text-sm text-slate-400 italic py-4 text-center bg-white border border-slate-200 rounded">
                        No expense categories added. Use the dropdown above to add categories.
                    </p>
                )}
            </div>

            <Select label="Status" value={status} onChange={e => setStatus(e.target.value as ContractStatus)}>
                {Object.values(ContractStatus).map(s => (
                    <option key={s} value={s}>{s}</option>
                ))}
            </Select>

            <Textarea 
                label="Terms & Conditions (Scope)" 
                value={termsAndConditions} 
                onChange={e => setTermsAndConditions(e.target.value)} 
                rows={6} 
                placeholder="Enter contract terms, scope of work, and conditions..." 
            />

            <Textarea 
                label="Payment Terms" 
                value={paymentTerms} 
                onChange={e => setPaymentTerms(e.target.value)} 
                rows={4} 
                placeholder="Enter payment terms, milestones, and conditions..." 
            />

            {/* Document Upload Section */}
            <div className="border rounded-lg p-4 bg-slate-50 border-slate-200">
                <label className="block text-sm font-medium text-slate-700 mb-2">Contract Document</label>
                <p className="text-xs text-slate-500 mb-3">Upload a scanned copy of the contract document.</p>
                
                {documentPath && !documentFile && (
                    <div className="mb-3 p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-indigo-100 rounded flex items-center justify-center">
                                <div className="w-4 h-4 text-indigo-600">{ICONS.file}</div>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-slate-800">Document attached</p>
                                <p className="text-xs text-slate-500">{documentPath.split('/').pop()}</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={async () => {
                                    if (window.electronAPI && window.electronAPI.openDocumentFile) {
                                        try {
                                            const result = await window.electronAPI.openDocumentFile({ filePath: documentPath });
                                            if (!result.success) {
                                                await showAlert(`Failed to open document: ${result.error}`);
                                            }
                                        } catch (error) {
                                            await showAlert(`Error opening document: ${error instanceof Error ? error.message : String(error)}`);
                                        }
                                    } else {
                                        await showAlert('File system access not available');
                                    }
                                }}
                            >
                                Open
                            </Button>
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                    setDocumentPath('');
                                    setDocumentFile(null);
                                }}
                            >
                                Remove
                            </Button>
                        </div>
                    </div>
                )}

                <div className="flex gap-2">
                    <label className="flex-1">
                        <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                    setDocumentFile(file);
                                    setDocumentPath(''); // Clear old path when new file is selected
                                }
                            }}
                            className="hidden"
                        />
                        <div className="cursor-pointer border-2 border-dashed border-slate-300 rounded-lg p-4 text-center hover:border-indigo-400 hover:bg-indigo-50 transition-colors">
                            <div className="text-slate-600 text-sm">
                                {documentFile ? documentFile.name : 'Click to upload document'}
                            </div>
                        </div>
                    </label>
                    {documentFile && (
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                                setDocumentFile(null);
                            }}
                        >
                            Clear
                        </Button>
                    )}
                </div>
                {!state.documentStoragePath && (
                    <p className="text-xs text-amber-600 mt-2">
                        ⚠️ Please set document storage folder in Settings &gt; My Preferences
                    </p>
                )}
            </div>

            <div className="flex justify-between pt-4 border-t mt-6">
                <div>
                    {contractToEdit && (
                        <Button type="button" variant="danger" onClick={handleDelete}>Delete</Button>
                    )}
                </div>
                <div className="flex gap-2">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="submit">{contractToEdit ? 'Update' : 'Create Contract'}</Button>
                </div>
            </div>
        </form>
        <EntityFormModal
            isOpen={entityFormModal.isFormOpen}
            formType={entityFormModal.formType}
            initialName={entityFormModal.initialName}
            contactType={entityFormModal.contactType}
            categoryType={entityFormModal.categoryType}
            onClose={entityFormModal.closeForm}
            onSubmit={entityFormModal.handleSubmit}
        />
        </>
    );
};

export default ProjectContractForm;
