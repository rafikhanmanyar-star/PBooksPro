import { useDispatchOnly, useFinancialReportAppState } from '../../hooks/useSelectiveState';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNotification } from '../../context/NotificationContext';
import {
  Quotation,
  QuotationItem,
  TransactionType,
  Document,
  ProcurementSettings,
  QuotationStatus,
  QuotationType,
} from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import LoadingButton from '../ui/LoadingButton';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import { ICONS, CURRENCY } from '../../constants';
import { documentService } from '../../services/documentService';
import { fromPickerDateToYyyyMmDd, todayLocalYyyyMmDd } from '../../utils/dateUtils';
import { useEntityFormModal, EntityFormModal } from '../../hooks/useEntityFormModal';
import QuotationItemGrid from './QuotationItemGrid';

interface QuotationFormProps {
  onClose: () => void;
  quotationToEdit?: Quotation;
  vendorId: string;
  vendorName: string;
  procurementSettings?: ProcurementSettings;
}

const QUOTATION_TYPES: QuotationType[] = [
  'Material Supply',
  'Labour Only',
  'Material + Labour',
  'Equipment Rental',
  'Subcontractor',
];

const QUOTATION_STATUSES: QuotationStatus[] = ['Draft', 'Active', 'Approved', 'Expired', 'Superseded'];

const PACKAGE_OPTIONS = [
  'Grey Structure',
  'Finishing',
  'Electrical',
  'Plumbing',
  'HVAC',
  'Landscaping',
];

const QuotationForm: React.FC<QuotationFormProps> = ({
  onClose,
  quotationToEdit,
  vendorId,
  vendorName,
  procurementSettings,
}) => {
  const state = useFinancialReportAppState();
  const { categories, projects, buildings, vendors } = state;
  const dispatch = useDispatchOnly();
  const { showToast, showAlert } = useNotification();
  const entityFormModal = useEntityFormModal();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const vendor = vendors?.find((v) => v.id === vendorId);

  const [name, setName] = useState(vendorName);
  const [contactPerson, setContactPerson] = useState('');
  const [contactPhone, setContactPhone] = useState(vendor?.contactNo || '');
  const [contactEmail, setContactEmail] = useState('');
  const [quotationNumber, setQuotationNumber] = useState(quotationToEdit?.quotationNumber || '');
  const [date, setDate] = useState(todayLocalYyyyMmDd());
  const [expiryDate, setExpiryDate] = useState(quotationToEdit?.expiryDate || '');
  const [currency, setCurrency] = useState(quotationToEdit?.currency || 'PKR');
  const [projectId, setProjectId] = useState(quotationToEdit?.projectId || '');
  const [buildingId, setBuildingId] = useState(quotationToEdit?.buildingId || '');
  const [packageName, setPackageName] = useState(quotationToEdit?.packageName || '');
  const [quotationType, setQuotationType] = useState<QuotationType | ''>(
    quotationToEdit?.quotationType || ''
  );
  const [status, setStatus] = useState<QuotationStatus>(quotationToEdit?.status || 'Draft');
  const [enablePriceValidation, setEnablePriceValidation] = useState(
    quotationToEdit?.enablePriceValidation !== false
  );
  const [validationScope, setValidationScope] = useState<'CATEGORY' | 'ITEM'>(
    quotationToEdit?.validationScope === 'ITEM' ? 'ITEM' : 'CATEGORY'
  );
  const [paymentTerms, setPaymentTerms] = useState(quotationToEdit?.paymentTerms || '');
  const [deliveryPeriod, setDeliveryPeriod] = useState(quotationToEdit?.deliveryPeriod || '');
  const [warrantyPeriod, setWarrantyPeriod] = useState(quotationToEdit?.warrantyPeriod || '');
  const [retentionPercent, setRetentionPercent] = useState(
    String(quotationToEdit?.retentionPercent ?? 0)
  );
  const [advancePercent, setAdvancePercent] = useState(String(quotationToEdit?.advancePercent ?? 0));
  const [remarks, setRemarks] = useState(quotationToEdit?.remarks || '');
  const [items, setItems] = useState<QuotationItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentId, setDocumentId] = useState<string | undefined>(quotationToEdit?.documentId);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === TransactionType.EXPENSE),
    [categories]
  );

  const projectBuildings = useMemo(
    () => (projectId ? buildings.filter((b) => b.projectId === projectId) : buildings),
    [buildings, projectId]
  );

  useEffect(() => {
    if (quotationToEdit) {
      setName(quotationToEdit.name);
      setContactPerson(quotationToEdit.contactPerson || '');
      setContactPhone(quotationToEdit.contactPhone || vendor?.contactNo || '');
      setContactEmail(quotationToEdit.contactEmail || '');
      setQuotationNumber(quotationToEdit.quotationNumber || '');
      setDate(quotationToEdit.date);
      setExpiryDate(quotationToEdit.expiryDate || '');
      setCurrency(quotationToEdit.currency || 'PKR');
      setProjectId(quotationToEdit.projectId || '');
      setBuildingId(quotationToEdit.buildingId || '');
      setPackageName(quotationToEdit.packageName || '');
      setQuotationType(quotationToEdit.quotationType || '');
      setStatus(quotationToEdit.status || 'Active');
      setEnablePriceValidation(quotationToEdit.enablePriceValidation !== false);
      setValidationScope(quotationToEdit.validationScope === 'ITEM' ? 'ITEM' : 'CATEGORY');
      setPaymentTerms(quotationToEdit.paymentTerms || '');
      setDeliveryPeriod(quotationToEdit.deliveryPeriod || '');
      setWarrantyPeriod(quotationToEdit.warrantyPeriod || '');
      setRetentionPercent(String(quotationToEdit.retentionPercent ?? 0));
      setAdvancePercent(String(quotationToEdit.advancePercent ?? 0));
      setRemarks(quotationToEdit.remarks || '');
      setItems(quotationToEdit.items || []);
      setDocumentId(quotationToEdit.documentId);
    }
  }, [quotationToEdit, vendor?.contactNo]);

  const totalAmount = useMemo(
    () => items.reduce((sum, item) => sum + (item.quantity || 0) * (item.pricePerQuantity || 0), 0),
    [items]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
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
        showAlert('Unit rate must be greater than 0');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const quotationId = quotationToEdit?.id || `quotation_${Date.now()}`;
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
      if (selectedFile) {
        try {
          const doc: Document = {
            id: `doc_${Date.now()}`,
            name: `Quotation - ${name} - ${date}`,
            type: 'quotation',
            entityId: quotationId,
            entityType: 'quotation',
            fileData: '',
            fileName: selectedFile.name,
            fileSize: selectedFile.size,
            mimeType: selectedFile.type || 'application/pdf',
            uploadedAt: new Date().toISOString(),
          };
          await documentService.saveDocument(doc, selectedFile);
          finalDocumentId = doc.id;
        } catch (error) {
          showAlert('Failed to save document. Please try again.');
          console.error('Document save error:', error);
          return;
        }
      }

      const isActive = status === 'Active' || status === 'Approved';
      const quotation: Quotation = {
        id: quotationId,
        vendorId,
        name: name.trim(),
        contactPerson: contactPerson.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        quotationNumber: finalQuotationNumber || undefined,
        date,
        expiryDate: expiryDate || undefined,
        currency,
        projectId: projectId || undefined,
        buildingId: buildingId || undefined,
        packageName: packageName || undefined,
        quotationType: quotationType || undefined,
        status,
        isActive,
        isApprovedRate: status === 'Approved',
        enablePriceValidation,
        validationScope,
        paymentTerms: paymentTerms || undefined,
        deliveryPeriod: deliveryPeriod || undefined,
        warrantyPeriod: warrantyPeriod || undefined,
        retentionPercent: parseFloat(retentionPercent) || 0,
        advancePercent: parseFloat(advancePercent) || 0,
        remarks: remarks || undefined,
        items,
        documentId: finalDocumentId,
        totalAmount,
        createdAt: quotationToEdit?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: quotationToEdit?.version,
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
    <div className="space-y-6 max-h-[80vh] overflow-y-auto pr-1">
      <section>
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-3">Vendor Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Input label="Vendor" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Contact Person" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
          <Input label="Phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          <Input label="Email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </div>
      </section>

      <section>
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-3">Quotation Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Input
            label="Quotation No."
            value={quotationNumber}
            onChange={(e) => setQuotationNumber(e.target.value)}
            placeholder="Auto-generated if empty"
          />
          <DatePicker label="Quotation Date" value={date} onChange={(d) => setDate(fromPickerDateToYyyyMmDd(d))} required />
          <DatePicker
            label="Valid Until"
            value={expiryDate}
            onChange={(d) => setExpiryDate(fromPickerDateToYyyyMmDd(d))}
          />
          <Input label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)} />
        </div>
      </section>

      <section>
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-3">Scope</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ComboBox
            label="Project"
            items={projects}
            selectedId={projectId}
            onSelect={(p) => {
              setProjectId(p?.id || '');
              setBuildingId('');
            }}
            placeholder="Select project"
            entityType="project"
          />
          <ComboBox
            label="Building"
            items={projectBuildings}
            selectedId={buildingId}
            onSelect={(b) => setBuildingId(b?.id || '')}
            placeholder="Select building"
            entityType="building"
          />
          <Select label="Contract Package" value={packageName} onChange={(e) => setPackageName(e.target.value)}>
            <option value="">Select package</option>
            {PACKAGE_OPTIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
        </div>
      </section>

      <section>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Select
            label="Quotation Type"
            value={quotationType}
            onChange={(e) => setQuotationType(e.target.value as QuotationType | '')}
          >
            <option value="">Select type</option>
            {QUOTATION_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as QuotationStatus)}>
            {QUOTATION_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
          <Select
            label="Validation Scope"
            value={validationScope}
            onChange={(e) => setValidationScope(e.target.value as 'CATEGORY' | 'ITEM')}
          >
            <option value="CATEGORY">Category — all items in category</option>
            <option value="ITEM">Item — category + unit</option>
          </Select>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={enablePriceValidation}
                onChange={(e) => setEnablePriceValidation(e.target.checked)}
              />
              Enable Price Validation
            </label>
          </div>
        </div>
      </section>

      <section>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Input label="Delivery Period" value={deliveryPeriod} onChange={(e) => setDeliveryPeriod(e.target.value)} placeholder="e.g. 15 days" />
          <Input label="Warranty Period" value={warrantyPeriod} onChange={(e) => setWarrantyPeriod(e.target.value)} placeholder="e.g. 12 months" />
          <Input label="Retention %" type="number" value={retentionPercent} onChange={(e) => setRetentionPercent(e.target.value)} min="0" step="0.01" />
          <Input label="Advance %" type="number" value={advancePercent} onChange={(e) => setAdvancePercent(e.target.value)} min="0" step="0.01" />
        </div>
        <div className="mt-4">
          <Textarea label="Payment Terms" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} rows={2} />
        </div>
      </section>

      <section className="border-t border-slate-200 pt-4">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Items</h3>
        <QuotationItemGrid
          items={items}
          vendorId={vendorId}
          expenseCategories={expenseCategories}
          onChange={setItems}
          onAddNewCategory={(name, onCreated) => {
            entityFormModal.openForm('category', name, undefined, TransactionType.EXPENSE, onCreated);
          }}
        />
        {items.length > 0 && (
          <div className="mt-4 p-4 bg-indigo-50 rounded-lg border border-indigo-200">
            <div className="flex justify-between items-center">
              <span className="text-lg font-semibold text-indigo-900">Total Amount:</span>
              <span className="text-2xl font-bold text-indigo-900">
                {totalAmount.toLocaleString('en-US', { style: 'currency', currency: CURRENCY })}
              </span>
            </div>
          </div>
        )}
      </section>

      <section>
        <Textarea label="Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
      </section>

      <section className="border-t border-slate-200 pt-4">
        <label className="block text-sm font-medium text-slate-700 mb-2">Upload Quotation Document (Optional)</label>
        <div className="flex items-center gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          />
          <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
            <div className="w-4 h-4 mr-2">{ICONS.upload}</div>
            {selectedFile ? 'Change File' : 'Select File'}
          </Button>
          {selectedFile && <span className="text-sm text-slate-600">{selectedFile.name}</span>}
          {quotationToEdit?.documentId && !selectedFile && (
            <span className="text-sm text-emerald-600">Document already uploaded</span>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">PDF, JPG, PNG, DOC, DOCX (Max 10MB)</p>
      </section>

      <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 sticky bottom-0 bg-app-card pb-1">
        <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
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
