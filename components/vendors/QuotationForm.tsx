import { useDispatchOnly, useFinancialReportAppState } from '../../hooks/useSelectiveState';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNotification } from '../../context/NotificationContext';
import { Quotation, QuotationItem, Contact, TransactionType, Document, ProcurementSettings } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import LoadingButton from '../ui/LoadingButton';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import Select from '../ui/Select';
import { ICONS } from '../../constants';
import { documentService } from '../../services/documentService';
import { fromPickerDateToYyyyMmDd, todayLocalYyyyMmDd } from '../../utils/dateUtils';
import { useEntityFormModal, EntityFormModal } from '../../hooks/useEntityFormModal';

interface QuotationFormProps {
    onClose: () => void;
    quotationToEdit?: Quotation;
    vendorId: string;
    vendorName: string;
    procurementSettings?: ProcurementSettings;
}

const QuotationForm: React.FC<QuotationFormProps> = ({ onClose, quotationToEdit, vendorId, vendorName, procurementSettings }) => {
    const state = useFinancialReportAppState();
    const { categories } = state;
    const dispatch = useDispatchOnly();
    const { showToast, showAlert } = useNotification();
    const entityFormModal = useEntityFormModal();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [name, setName] = useState(vendorName);
    const [quotationNumber, setQuotationNumber] = useState(quotationToEdit?.quotationNumber || '');
    const [date, setDate] = useState(todayLocalYyyyMmDd());
    const [expiryDate, setExpiryDate] = useState(quotationToEdit?.expiryDate || '');
    const [enablePriceValidation, setEnablePriceValidation] = useState(
        quotationToEdit?.enablePriceValidation !== false
    );
    const [validationScope, setValidationScope] = useState<'CATEGORY' | 'ITEM'>(
        quotationToEdit?.validationScope === 'ITEM' ? 'ITEM' : 'CATEGORY'
    );
    const [isActive, setIsActive] = useState(quotationToEdit?.isActive !== false);
    const [items, setItems] = useState<QuotationItem[]>([]);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [documentId, setDocumentId] = useState<string | undefined>(quotationToEdit?.documentId);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const expenseCategories = useMemo(() => 
        categories.filter(c => c.type === TransactionType.EXPENSE),
        [categories]
    );

    useEffect(() => {
        if (quotationToEdit) {
            setName(quotationToEdit.name);
            setQuotationNumber(quotationToEdit.quotationNumber || '');
            setDate(quotationToEdit.date);
            setExpiryDate(quotationToEdit.expiryDate || '');
            setEnablePriceValidation(quotationToEdit.enablePriceValidation !== false);
            setValidationScope(quotationToEdit.validationScope === 'ITEM' ? 'ITEM' : 'CATEGORY');
            setIsActive(quotationToEdit.isActive !== false);
            setItems(quotationToEdit.items || []);
            setDocumentId(quotationToEdit.documentId);
        }
    }, [quotationToEdit]);

    const addItem = () => {
        setItems([...items, {
            id: Date.now().toString(),
            categoryId: '',
            quantity: 0,
            pricePerQuantity: 0,
            unit: ''
        }]);
    };

    const removeItem = (itemId: string) => {
        setItems(items.filter(item => item.id !== itemId));
    };

    const updateItem = (itemId: string, field: keyof QuotationItem, value: any) => {
        setItems(items.map(item => 
            item.id === itemId ? { ...item, [field]: value } : item
        ));
    };

    const totalAmount = useMemo(() => {
        return items.reduce((sum, item) => {
            return sum + (item.quantity * item.pricePerQuantity);
        }, 0);
    }, [items]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            // Check file size (limit to 10MB)
            if (file.size > 10 * 1024 * 1024) {
                showAlert('File size must be less than 10MB');
                return;
            }
            setSelectedFile(file);
        }
    };

    const handleSubmit = async () => {
        if (isSubmitting) return;
        if (!name.trim()) {
            showAlert('Please enter vendor name');
            return;
        }

        if (!date) {
            showAlert('Please select a date');
            return;
        }

        if (items.length === 0) {
            showAlert('Please add at least one item');
            return;
        }

        // Validate items
        for (const item of items) {
            if (!item.categoryId) {
                showAlert('Please select a category for all items');
                return;
            }
            if (item.quantity <= 0) {
                showAlert('Quantity must be greater than 0');
                return;
            }
            if (item.pricePerQuantity <= 0) {
                showAlert('Price per quantity must be greater than 0');
                return;
            }
        }

        setIsSubmitting(true);
        try {

        const quotationId = quotationToEdit?.id || Date.now().toString();
        let finalQuotationNumber = quotationNumber.trim();
        if (!finalQuotationNumber && procurementSettings?.quotationNumberSettings) {
            const { prefix, nextNumber, padding } = procurementSettings.quotationNumberSettings;
            finalQuotationNumber = `${prefix}${String(nextNumber).padStart(padding, '0')}`;
            dispatch({
                type: 'UPDATE_PROCUREMENT_SETTINGS',
                payload: {
                    ...procurementSettings,
                    quotationNumberSettings: {
                        ...procurementSettings.quotationNumberSettings,
                        nextNumber: nextNumber + 1,
                    },
                },
            });
        }

        let finalDocumentId = documentId;

        // Save document if file is selected
        if (selectedFile) {
            try {
                const doc: Document = {
                    id: Date.now().toString(),
                    name: `Quotation - ${name} - ${date}`,
                    type: 'quotation',
                    entityId: quotationId,
                    entityType: 'quotation',
                    fileData: '', // Will be set by documentService
                    fileName: selectedFile.name,
                    fileSize: selectedFile.size,
                    mimeType: selectedFile.type || 'application/pdf',
                    uploadedAt: new Date().toISOString()
                };

                await documentService.saveDocument(doc, selectedFile);
                finalDocumentId = doc.id;
            } catch (error) {
                showAlert('Failed to save document. Please try again.');
                console.error('Document save error:', error);
                return;
            }
        }

        const quotation: Quotation = {
            id: quotationId,
            vendorId,
            name: name.trim(),
            quotationNumber: finalQuotationNumber || undefined,
            date,
            expiryDate: expiryDate || undefined,
            enablePriceValidation,
            validationScope,
            isActive,
            items,
            documentId: finalDocumentId,
            totalAmount,
            createdAt: quotationToEdit?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (quotationToEdit) {
            dispatch({ type: 'UPDATE_QUOTATION', payload: quotation });
            showToast('Quotation updated successfully!', 'success');
        } else {
            dispatch({ type: 'ADD_QUOTATION', payload: quotation });
            showToast('Quotation added successfully!', 'success');
        }

        onClose();
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Input
                    id="quotation-vendor-name"
                    name="quotation-vendor-name"
                    label="Vendor Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                />
                <Input
                    id="quotation-number"
                    name="quotation-number"
                    label="Quotation No."
                    value={quotationNumber}
                    onChange={(e) => setQuotationNumber(e.target.value)}
                    placeholder="Auto-generated if empty"
                />
                <DatePicker
                    id="quotation-date"
                    name="quotation-date"
                    label="Quotation Date"
                    value={date}
                    onChange={(d) => setDate(fromPickerDateToYyyyMmDd(d))}
                    required
                />
                <DatePicker
                    id="quotation-expiry-date"
                    name="quotation-expiry-date"
                    label="Expiry Date (Optional)"
                    value={expiryDate}
                    onChange={(d) => setExpiryDate(fromPickerDateToYyyyMmDd(d))}
                />
                <Select
                    label="Validation Scope"
                    value={validationScope}
                    onChange={(e) => setValidationScope(e.target.value as 'CATEGORY' | 'ITEM')}
                >
                    <option value="CATEGORY">Category — all items in category</option>
                    <option value="ITEM">Item — category + unit</option>
                </Select>
            </div>

            <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={enablePriceValidation}
                        onChange={(e) => setEnablePriceValidation(e.target.checked)}
                    />
                    Enable Price Validation
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={isActive}
                        onChange={(e) => setIsActive(e.target.checked)}
                    />
                    Active Quotation
                </label>
            </div>

            <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-slate-800">Items</h3>
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={addItem}
                        size="sm"
                    >
                        <div className="w-4 h-4 mr-2">{ICONS.plus}</div>
                        Add Item
                    </Button>
                </div>

                {items.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                        <p>No items added yet. Click "Add Item" to start.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {items.map((item, index) => (
                            <div key={item.id} className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-sm font-semibold text-slate-700">Item {index + 1}</span>
                                    <button
                                        type="button"
                                        onClick={() => removeItem(item.id)}
                                        className="text-rose-500 hover:text-rose-700 text-sm font-medium"
                                    >
                                        Remove
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                                    <div className="lg:col-span-2">
                                        <ComboBox
                                            id={`quotation-item-${item.id}-category`}
                                            name={`quotation-item-${item.id}-category`}
                                            label="Category"
                                            items={expenseCategories}
                                            selectedId={item.categoryId}
                                            onSelect={(selected) => updateItem(item.id, 'categoryId', selected?.id || '')}
                                            placeholder="Select category"
                                            entityType="category"
                                            onAddNew={(_entityType, name) => {
                                                entityFormModal.openForm('category', name, undefined, TransactionType.EXPENSE, (newId) => {
                                                    updateItem(item.id, 'categoryId', newId);
                                                });
                                            }}
                                            required
                                        />
                                    </div>
                                    <Input
                                        id={`quotation-item-${item.id}-quantity`}
                                        name={`quotation-item-${item.id}-quantity`}
                                        label="Quantity"
                                        type="number"
                                        value={item.quantity.toString()}
                                        onChange={(e) => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                                        required
                                        min="0"
                                        step="0.01"
                                    />
                                    <Input
                                        id={`quotation-item-${item.id}-unit`}
                                        name={`quotation-item-${item.id}-unit`}
                                        label="Unit (Optional)"
                                        value={item.unit || ''}
                                        onChange={(e) => updateItem(item.id, 'unit', e.target.value)}
                                        placeholder="e.g., sq ft, numbers"
                                    />
                                    <Input
                                        id={`quotation-item-${item.id}-price`}
                                        name={`quotation-item-${item.id}-price`}
                                        label="Price per Unit"
                                        type="number"
                                        value={item.pricePerQuantity.toString()}
                                        onChange={(e) => updateItem(item.id, 'pricePerQuantity', parseFloat(e.target.value) || 0)}
                                        required
                                        min="0"
                                        step="0.01"
                                    />
                                </div>
                                <div className="mt-2 text-right">
                                    <span className="text-sm text-slate-600">
                                        Subtotal: <span className="font-semibold">
                                            {(item.quantity * item.pricePerQuantity).toLocaleString('en-US', {
                                                style: 'currency',
                                                currency: 'PKR'
                                            })}
                                        </span>
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {items.length > 0 && (
                    <div className="mt-4 p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                        <div className="flex justify-between items-center">
                            <span className="text-lg font-semibold text-indigo-900">Total Amount:</span>
                            <span className="text-2xl font-bold text-indigo-900">
                                {totalAmount.toLocaleString('en-US', {
                                    style: 'currency',
                                    currency: 'PKR'
                                })}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            <div className="border-t border-slate-200 pt-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                    Upload Quotation Document (Optional)
                </label>
                <div className="flex items-center gap-3">
                    <input
                        id="quotation-file-upload"
                        name="quotation-file-upload"
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    />
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <div className="w-4 h-4 mr-2">{ICONS.upload}</div>
                        {selectedFile ? 'Change File' : 'Select File'}
                    </Button>
                    {selectedFile && (
                        <span className="text-sm text-slate-600">{selectedFile.name}</span>
                    )}
                    {quotationToEdit?.documentId && !selectedFile && (
                        <span className="text-sm text-emerald-600">Document already uploaded</span>
                    )}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                    Supported formats: PDF, JPG, PNG, DOC, DOCX (Max 10MB)
                </p>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <Button
                    type="button"
                    variant="secondary"
                    onClick={onClose}
                    disabled={isSubmitting}
                >
                    Cancel
                </Button>
                <LoadingButton
                    type="button"
                    onClick={() => void handleSubmit()}
                    loading={isSubmitting}
                    loadingText="Saving..."
                    className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                    {quotationToEdit ? 'Update Quotation' : 'Save Quotation'}
                </LoadingButton>
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
        </div>
    );
};

export default QuotationForm;

