
import { useDispatchOnly, useProjectReportAppState } from '../../hooks/useSelectiveState';
import React, { useState, useMemo, useEffect } from 'react';
import { Contract, ContractExpenseCategoryItem, ContactType, ContractStatus, TransactionType } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import LoadingButton from '../ui/LoadingButton';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import { useNotification } from '../../context/NotificationContext';
import { CURRENCY, ICONS } from '../../constants';
import { useEntityFormModal, EntityFormModal } from '../../hooks/useEntityFormModal';
import { getFormBackgroundColorStyle } from '../../utils/formColorUtils';
import { uploadEntityDocument, openDocumentById } from '../../services/documentUploadService';
import { toLocalDateString } from '../../utils/dateUtils';
import { useQuotationRateValidator, resolveBillVendorId } from '../../hooks/useQuotationValidation';
import {
  QuotationPriceIndicator,
  QuotationPriceAlertModal,
  QuotationReferencePanel,
} from '../procurement/QuotationValidationUI';
import { collectQuotationViolations } from '../../utils/quotationValidationFlow';
import { buildOverridePayload, recordQuotationPriceOverrideApi } from '../../services/quotationValidationApi';
import type { QuotationValidationResult } from '../../shared/quotation-validation/types';
import {
  ContractRetentionControls,
  retentionPayloadFromState,
  retentionStateFromContract,
  type ContractRetentionFormState,
} from './ContractRetentionUI';
import ContractActivitySidebar from './ContractActivitySidebar';

interface ProjectContractFormProps {
    onClose: () => void;
    contractToEdit?: Contract | null;
}

const ProjectContractForm: React.FC<ProjectContractFormProps> = ({ onClose, contractToEdit }) => {
    const state = useProjectReportAppState();
    const dispatch = useDispatchOnly();
    const { showToast, showAlert, showConfirm } = useNotification();
    const entityFormModal = useEntityFormModal();

    const generateContractNumber = () => {
        const prefix = 'CONT-';
        let maxNum = 0;
        (state.contracts || []).forEach(c => {
            if (c.contractNumber && c.contractNumber.startsWith(prefix)) {
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
        return toLocalDateString(new Date());
    };

    const [startDate, setStartDate] = useState(getInitialStartDate());
    const [endDate, setEndDate] = useState(contractToEdit?.endDate || '');

    // Save date to preserved date when changed (if option is enabled)
    const handleStartDateChange = (date: Date) => {
        const dateStr = toLocalDateString(date);
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
    const [documentId, setDocumentId] = useState(contractToEdit?.documentId || '');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [priceAlert, setPriceAlert] = useState<{
        open: boolean;
        result: QuotationValidationResult;
        itemId: string;
        pendingSubmit: boolean;
    } | null>(null);
    const [reviewItemId, setReviewItemId] = useState<string | null>(null);
    const [retentionState, setRetentionState] = useState<ContractRetentionFormState>(() =>
        retentionStateFromContract(contractToEdit)
    );

    const { validate, getReference } = useQuotationRateValidator(
        state.quotations ?? [],
        state.procurementSettings,
        { vendorId, contactId: undefined, vendors: state.vendors, contacts: state.contacts }
    );
    const contractVendorId = resolveBillVendorId(vendorId, undefined, state);

    // Expense Category Items - new tracking system
    const [expenseCategoryItems, setExpenseCategoryItems] = useState<ContractExpenseCategoryItem[]>(
        contractToEdit?.expenseCategoryItems || []
    );

    // Sync expense categories when contractToEdit changes (e.g. modal opened with contract from state)
    useEffect(() => {
        if (contractToEdit?.id) {
            const items = contractToEdit.expenseCategoryItems ?? (contractToEdit as any).expense_category_items;
            if (items) {
                const parsed = typeof items === 'string' && items.trim().length > 0
                    ? (() => { try { return JSON.parse(items); } catch { return []; } })()
                    : Array.isArray(items) ? items : [];
                setExpenseCategoryItems(parsed.length ? parsed : []);
            } else {
                setExpenseCategoryItems([]);
            }
        }
    }, [contractToEdit?.id, contractToEdit?.expenseCategoryItems]);

    const vendors = useMemo(() => {
        const list = state.vendors || [];
        return list.filter(v => v.isActive !== false || v.id === vendorId);
    }, [state.vendors, vendorId]);
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
                setEndDate(toLocalDateString(d));
            }
        }
    }, [expenseCategoryItems]);

    const selectedReferenceCategoryId = useMemo(() => {
        if (reviewItemId) {
            return expenseCategoryItems.find((i) => i.id === reviewItemId)?.categoryId;
        }
        return expenseCategoryItems[0]?.categoryId;
    }, [expenseCategoryItems, reviewItemId]);

    const quotationReference = useMemo(() => {
        if (!vendorId || !selectedReferenceCategoryId) return null;
        const cat = expenseCategories.find((c) => c.id === selectedReferenceCategoryId);
        const vendor = vendors.find((v) => v.id === vendorId);
        const item = expenseCategoryItems.find((i) => i.categoryId === selectedReferenceCategoryId);
        return getReference(
            {
                vendorId: contractVendorId,
                categoryId: selectedReferenceCategoryId,
                unit: item?.unit,
            },
            { vendorName: vendor?.name, categoryName: cat?.name }
        );
    }, [contractVendorId, selectedReferenceCategoryId, expenseCategoryItems, expenseCategories, vendors, getReference]);

    const persistContract = async (contractId: string, finalDocumentId?: string) => {
        const payload: Contract = {
            id: contractId,
            contractNumber,
            name,
            projectId,
            vendorId,
            totalAmount: totalGrossValue,
            startDate,
            endDate,
            status,
            categoryIds: [],
            expenseCategoryItems,
            termsAndConditions,
            paymentTerms,
            documentPath: documentPath || undefined,
            documentId: finalDocumentId,
            ...retentionPayloadFromState(retentionState, totalGrossValue),
        };

        if (contractToEdit) {
            dispatch({ type: 'UPDATE_CONTRACT', payload });
            showToast('Contract updated successfully.');
        } else {
            dispatch({ type: 'ADD_CONTRACT', payload });
            showToast('Contract created successfully.');
        }
        onClose();
    };

    const recordOverridesForContract = async (contractId: string) => {
        const violations = collectQuotationViolations(expenseCategoryItems, contractVendorId, validate);
        for (const { item, result } of violations) {
            await recordQuotationPriceOverrideApi(
                buildOverridePayload(result, {
                    sourceType: 'contract',
                    sourceId: contractId,
                    lineItemId: item.id,
                    vendorId: contractVendorId,
                    categoryId: item.categoryId,
                    projectId,
                })
            );
        }
    };

    const finalizeSubmit = async () => {
        const contractId = contractToEdit?.id || Date.now().toString();
        let finalDocumentId = documentId || undefined;
        if (documentFile) {
            try {
                finalDocumentId = await uploadEntityDocument(
                    documentFile,
                    'contract',
                    contractId,
                    dispatch,
                    state.currentUser?.id
                );
            } catch (err) {
                await showAlert(err instanceof Error ? err.message : 'Failed to upload document.');
                return;
            }
        }

        await recordOverridesForContract(contractId);
        await persistContract(contractId, finalDocumentId);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        if (!name || !projectId || !vendorId) {
            await showAlert("Please fill in all required fields.");
            return;
        }

        if (expenseCategoryItems.length === 0) {
            await showAlert("Please add at least one expense category item.");
            return;
        }

        const violations = collectQuotationViolations(expenseCategoryItems, contractVendorId, validate);
        if (violations.length > 0 && state.procurementSettings?.enableQuotationValidationGlobally !== false) {
            const first = violations[0]!;
            setPriceAlert({
                open: true,
                result: first.result,
                itemId: first.item.id,
                pendingSubmit: true,
            });
            return;
        }

        setIsSubmitting(true);
        try {
            await finalizeSubmit();
        } finally {
            setIsSubmitting(false);
        }
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

    const previewContract = useMemo((): Contract | null => {
        if (!projectId && !contractToEdit) return null;
        return {
            id: contractToEdit?.id ?? 'preview',
            contractNumber,
            name,
            projectId,
            vendorId,
            totalAmount: totalGrossValue,
            startDate,
            endDate,
            status,
            categoryIds: [],
            expenseCategoryItems,
            termsAndConditions,
            paymentTerms,
            retentionReleased: contractToEdit?.retentionReleased,
            retentionBalance: contractToEdit?.retentionBalance,
            ...retentionPayloadFromState(retentionState, totalGrossValue),
        };
    }, [
        contractToEdit,
        contractNumber,
        name,
        projectId,
        vendorId,
        totalGrossValue,
        startDate,
        endDate,
        status,
        expenseCategoryItems,
        termsAndConditions,
        paymentTerms,
        retentionState,
    ]);

    const previewProjectName = state.projects.find((p) => p.id === projectId)?.name;
    const previewVendorName = vendors.find((v) => v.id === vendorId)?.name;

    return (
        <>
            {priceAlert?.open && (
                <QuotationPriceAlertModal
                    isOpen
                    result={priceAlert.result}
                    onReview={() => {
                        setReviewItemId(priceAlert.itemId);
                        setPriceAlert(null);
                    }}
                    onContinue={() => {
                        setPriceAlert(null);
                        if (priceAlert.pendingSubmit) {
                            setIsSubmitting(true);
                            void finalizeSubmit().finally(() => setIsSubmitting(false));
                        }
                    }}
                />
            )}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_320px] gap-4 min-h-0">
            <form onSubmit={handleSubmit} className="space-y-4 min-w-0" style={formBackgroundStyle}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Input label="Contract Number" value={contractNumber} onChange={e => setContractNumber(e.target.value)} required />
                    <Input id="project-contract-title-input" label="Contract Title" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Grey Structure" required disabled={false} autoComplete="off" />
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
                            sessionStorage.setItem('addNewVendor', 'true');
                            dispatch({ type: 'SET_PAGE', payload: 'vendorDirectory' });
                            onClose();
                        }}
                    />
                    <DatePicker label="Start Date" value={startDate} onChange={handleStartDateChange} required />
                    <DatePicker label="End Date (Est.)" value={endDate} onChange={d => setEndDate(toLocalDateString(d))} />
                </div>

                {/* Track Expense Category Section */}
                <div className="border rounded-lg p-4 bg-app-toolbar border-app-border">
                    <div className="flex items-center justify-between mb-3">
                        <label className="block text-sm font-medium text-app-text">Track Expense Category</label>
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
                            <div className="bg-app-card border border-app-border rounded-lg overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-app-table-header border-b border-app-border">
                                            <tr>
                                                <th className="px-3 py-2 text-left font-semibold text-app-text">Expense Category</th>
                                                <th className="px-3 py-2 text-left font-semibold text-app-text">Unit</th>
                                                <th className="px-3 py-2 text-left font-semibold text-app-text">Quantity</th>
                                                <th className="px-3 py-2 text-left font-semibold text-app-text">Price per Unit</th>
                                                <th className="px-3 py-2 text-right font-semibold text-app-text">Net Value</th>
                                                <th className="px-3 py-2 text-center font-semibold text-app-text w-12">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-app-border">
                                            {expenseCategoryItems.map((item) => {
                                                const category = expenseCategories.find(c => c.id === item.categoryId);
                                                return (
                                                    <tr key={item.id} className="hover:bg-app-table-hover">
                                                        <td className="px-3 py-2">
                                                            <span className="font-medium text-app-text">{category?.name || 'Unknown'}</span>
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
                                                            <div className="space-y-1">
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
                                                                {contractVendorId && item.categoryId && item.pricePerUnit > 0 && (
                                                                    <QuotationPriceIndicator
                                                                        compact
                                                                        result={validate({
                                                                            vendorId: contractVendorId,
                                                                            categoryId: item.categoryId,
                                                                            transactionRate: item.pricePerUnit,
                                                                            unit: item.unit,
                                                                        })}
                                                                    />
                                                                )}
                                                            </div>
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
                                                                className="text-slate-400 hover:text-ds-danger transition-colors"
                                                                title="Remove"
                                                            >
                                                                <div className="w-4 h-4">{ICONS.x}</div>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot className="bg-app-table-header border-t-2 border-app-border">
                                            <tr>
                                                <td colSpan={4} className="px-3 py-2 text-right font-bold text-app-text">
                                                    Total Gross Value (Contract Value):
                                                </td>
                                                <td className="px-3 py-2 text-right font-bold text-lg text-app-text">
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
                        <p className="text-sm text-app-muted italic py-4 text-center bg-app-card border border-app-border rounded">
                            No expense categories added. Use the dropdown above to add categories.
                        </p>
                    )}
                </div>

                <ContractRetentionControls
                    contractValue={totalGrossValue}
                    state={retentionState}
                    onChange={(patch) => setRetentionState((prev) => ({ ...prev, ...patch }))}
                />

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
                <div className="border rounded-lg p-4 bg-app-toolbar border-app-border">
                    <label className="block text-sm font-medium text-app-text mb-2">Contract Document</label>
                    <p className="text-xs text-app-muted mb-3">Upload a scanned copy of the contract document.</p>

                    {(documentId || (documentPath && !documentFile)) && (
                        <div className="mb-3 p-3 bg-app-card border border-app-border rounded-lg flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-primary/10 rounded flex items-center justify-center">
                                    <div className="w-4 h-4 text-primary">{ICONS.fileText}</div>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-app-text">Document attached</p>
                                    <p className="text-xs text-app-muted">
                                        {documentId
                                            ? (state.documents?.find(d => d.id === documentId)?.fileName || 'Document')
                                            : documentPath.split('/').pop()}
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={async () => {
                                        if (documentId) {
                                            await openDocumentById(documentId, state.documents, url => window.open(url, '_blank'), showAlert);
                                        } else if (documentPath && (window as any).electronAPI?.openDocumentFile) {
                                            try {
                                                const result = await (window as any).electronAPI.openDocumentFile({ filePath: documentPath });
                                                if (!result?.success) await showAlert(`Failed to open: ${result?.error || 'Unknown'}`);
                                            } catch (error) {
                                                await showAlert(error instanceof Error ? error.message : 'Error opening document');
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
                                        setDocumentId('');
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
                                        setDocumentPath('');
                                        setDocumentId('');
                                    }
                                }}
                                className="hidden"
                            />
                            <div className="cursor-pointer border-2 border-dashed border-app-border rounded-lg p-4 text-center hover:border-primary hover:bg-app-highlight transition-colors">
                                <div className="text-app-muted text-sm">
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
                </div>

                <div className="flex justify-between pt-4 border-t mt-6">
                    <div>
                        {contractToEdit && (
                            <Button type="button" variant="danger" onClick={handleDelete}>Delete</Button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                        <LoadingButton type="submit" loading={isSubmitting} loadingText="Saving...">
                            {contractToEdit ? 'Update' : 'Create Contract'}
                        </LoadingButton>
                    </div>
                </div>
            </form>
            <aside className="space-y-4 min-w-0">
                <ContractActivitySidebar
                    contract={previewContract}
                    bills={state.bills || []}
                    transactions={state.transactions || []}
                    projectName={previewProjectName}
                    vendorName={previewVendorName}
                    mode={contractToEdit ? 'edit' : 'create'}
                />
                {quotationReference && (
                    <QuotationReferencePanel
                        reference={quotationReference}
                        onViewHistory={() => {
                            dispatch({ type: 'SET_PAGE', payload: 'vendorDirectory' });
                            onClose();
                        }}
                    />
                )}
            </aside>
            </div>
            <EntityFormModal
                isOpen={entityFormModal.isFormOpen}
                formType={entityFormModal.formType}
                initialName={entityFormModal.initialName}
                contactType={entityFormModal.contactType}
                categoryType={entityFormModal.categoryType}
                onClose={entityFormModal.closeForm}
                onSubmit={entityFormModal.handleSubmit}
                isSubmitting={entityFormModal.isSubmitting}
            />
        </>
    );
};

export default ProjectContractForm;
