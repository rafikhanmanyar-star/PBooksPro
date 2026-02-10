
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useNotification } from '../../context/NotificationContext';
import { Invoice, InvoiceStatus, InvoiceType } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import DatePicker from '../ui/DatePicker';
import { CURRENCY } from '../../constants';

interface CreateRentInvoiceFormProps {
  propertyId: string;
  onClose: () => void;
}

const CreateRentInvoiceForm: React.FC<CreateRentInvoiceFormProps> = ({ propertyId, onClose }) => {
  const { state, dispatch } = useAppContext();
  const { showToast, showAlert } = useNotification();
  const { rentalInvoiceSettings } = state;

  // --- Resolve property and related data ---
  const property = useMemo(() => state.properties.find(p => p.id === propertyId), [propertyId, state.properties]);
  const building = useMemo(() => property ? state.buildings.find(b => b.id === property.buildingId) : null, [property, state.buildings]);
  const owner = useMemo(() => property?.ownerId ? state.contacts.find(c => c.id === property.ownerId) : null, [property, state.contacts]);

  // Find active agreement for this property
  const agreement = useMemo(() => {
    return state.rentalAgreements.find(ra => ra.propertyId === propertyId && ra.status === 'Active');
  }, [propertyId, state.rentalAgreements]);

  const tenant = useMemo(() => agreement ? state.contacts.find(c => c.id === agreement.contactId) : null, [agreement, state.contacts]);

  // --- Generate next invoice number ---
  const generateNextInvoiceNumber = () => {
    if (!rentalInvoiceSettings) return '';
    const { prefix, nextNumber, padding } = rentalInvoiceSettings;
    let maxNum = nextNumber;
    state.invoices.forEach(inv => {
      if (inv.invoiceNumber && inv.invoiceNumber.startsWith(prefix)) {
        const part = inv.invoiceNumber.substring(prefix.length);
        if (/^\d+$/.test(part)) {
          const num = parseInt(part, 10);
          if (num >= maxNum) maxNum = num + 1;
        }
      }
    });
    return `${prefix}${String(maxNum).padStart(padding, '0')}`;
  };

  // --- Default date: 1st of current month ---
  const getFirstOfMonth = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  };

  // --- Form state ---
  const [invoiceNumber] = useState(generateNextInvoiceNumber());
  const [rentAmount, setRentAmount] = useState(agreement?.monthlyRent?.toString() || '0');
  const [invoiceDate, setInvoiceDate] = useState(getFirstOfMonth());
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(getFirstOfMonth());
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });

  // Auto-generate description
  const description = useMemo(() => {
    const dateObj = new Date(invoiceDate + 'T00:00:00');
    if (isNaN(dateObj.getTime())) return '';
    const monthYear = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });
    return `Rent for ${property?.name || 'Unknown'} - ${monthYear}`;
  }, [invoiceDate, property]);

  // Update due date when invoice date changes (+7 days)
  useEffect(() => {
    const d = new Date(invoiceDate + 'T00:00:00');
    if (!isNaN(d.getTime())) {
      const dueDateObj = new Date(d);
      dueDateObj.setDate(dueDateObj.getDate() + 7);
      setDueDate(dueDateObj.toISOString().split('T')[0]);
    }
  }, [invoiceDate]);

  // --- Save handler ---
  const handleSave = async () => {
    if (!agreement) {
      await showAlert('No active agreement found for this property.');
      return;
    }
    if (!invoiceNumber.trim()) {
      await showAlert('Invoice number is required.');
      return;
    }

    // Check duplicate invoice number
    const isDuplicate = state.invoices.some(
      inv => inv.invoiceNumber && inv.invoiceNumber.trim().toLowerCase() === invoiceNumber.trim().toLowerCase()
    );
    if (isDuplicate) {
      await showAlert('This invoice number is already in use.');
      return;
    }

    // Find Rental Income category
    const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
    if (!rentalIncomeCategory) {
      await showAlert("'Rental Income' category not found. Please check settings.");
      return;
    }

    const finalAmount = parseFloat(rentAmount) || 0;

    const newInvoice: Invoice = {
      id: Date.now().toString(),
      invoiceNumber,
      contactId: agreement.contactId,
      amount: finalAmount,
      paidAmount: 0,
      status: InvoiceStatus.UNPAID,
      issueDate: invoiceDate,
      dueDate,
      invoiceType: InvoiceType.RENTAL,
      description,
      propertyId,
      buildingId: building?.id,
      agreementId: agreement.id,
      categoryId: rentalIncomeCategory.id,
      rentalMonth: new Date(invoiceDate + 'T00:00:00').toISOString().slice(0, 7),
    };

    dispatch({ type: 'ADD_INVOICE', payload: newInvoice });

    // Update settings next number
    if (rentalInvoiceSettings && invoiceNumber.startsWith(rentalInvoiceSettings.prefix)) {
      const numPart = parseInt(invoiceNumber.substring(rentalInvoiceSettings.prefix.length));
      if (!isNaN(numPart) && numPart >= rentalInvoiceSettings.nextNumber) {
        dispatch({
          type: 'UPDATE_RENTAL_INVOICE_SETTINGS' as any,
          payload: { ...rentalInvoiceSettings, nextNumber: numPart + 1 }
        });
      }
    }

    showToast('Invoice created successfully');
    onClose();
  };

  // --- Error states ---
  if (!property) {
    return (
      <div className="p-6 text-center text-slate-500">
        <p className="text-sm">Property not found. Please select a valid property from the tree.</p>
        <Button variant="secondary" onClick={onClose} className="mt-4">Close</Button>
      </div>
    );
  }

  if (!agreement) {
    return (
      <div className="p-6 text-center text-slate-500">
        <p className="text-sm">No active rental agreement found for <span className="font-semibold">{property.name}</span>.</p>
        <p className="text-xs text-slate-400 mt-1">Please create a rental agreement first.</p>
        <Button variant="secondary" onClick={onClose} className="mt-4">Close</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Read-only property details */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Property & Agreement Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
            <span className="text-xs text-slate-500">Building</span>
            <span className="text-sm font-medium text-slate-800">{building?.name || 'N/A'}</span>
          </div>
          <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
            <span className="text-xs text-slate-500">Unit / Property</span>
            <span className="text-sm font-medium text-slate-800">{property.name}</span>
          </div>
          <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
            <span className="text-xs text-slate-500">Owner</span>
            <span className="text-sm font-medium text-slate-800">{owner?.name || 'N/A'}</span>
          </div>
          <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
            <span className="text-xs text-slate-500">Tenant</span>
            <span className="text-sm font-medium text-slate-800">{tenant?.name || 'N/A'}</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-slate-500">Agreement</span>
            <span className="text-sm font-medium text-slate-800">{agreement.agreementNumber}</span>
          </div>
        </div>
      </div>

      {/* Editable fields */}
      <div className="space-y-3">
        <Input
          label="Monthly Rent Amount"
          type="text"
          inputMode="decimal"
          value={rentAmount}
          onChange={e => setRentAmount(e.target.value)}
          required
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <DatePicker
            label="Invoice Date"
            value={invoiceDate}
            onChange={d => setInvoiceDate(d.toISOString().split('T')[0])}
            required
          />
          <DatePicker
            label="Due Date"
            value={dueDate}
            onChange={d => setDueDate(d.toISOString().split('T')[0])}
            required
          />
        </div>

        <Input
          label="Invoice Number"
          value={invoiceNumber}
          disabled
        />

        <Input
          label="Description"
          value={description}
          disabled
        />
      </div>

      {/* Total */}
      <div className="flex justify-between items-center p-3 bg-indigo-50 rounded-lg border border-indigo-100">
        <span className="font-semibold text-slate-700">Total Amount:</span>
        <span className="font-bold text-lg text-indigo-700">
          {CURRENCY} {(parseFloat(rentAmount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave}>Save</Button>
      </div>
    </div>
  );
};

export default CreateRentInvoiceForm;
