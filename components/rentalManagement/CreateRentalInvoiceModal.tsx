import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useNotification } from '../../context/NotificationContext';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { Invoice, InvoiceStatus, InvoiceType } from '../../types';
import { WhatsAppService } from '../../services/whatsappService';
import { WhatsAppChatService } from '../../services/whatsappChatService';
import Input from '../ui/Input';
import Button from '../ui/Button';
import DatePicker from '../ui/DatePicker';
import Modal from '../ui/Modal';
import { CURRENCY } from '../../constants';
import { formatDate } from '../../utils/dateUtils';

export type InvoiceTypeChoice = 'rental' | 'security';

interface CreateRentalInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (invoice: Invoice) => void;
  initialInvoiceType?: InvoiceTypeChoice;
}

const CreateRentalInvoiceModal: React.FC<CreateRentalInvoiceModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  initialInvoiceType = 'rental',
}) => {
  const { state, dispatch } = useAppContext();
  const { showToast, showAlert } = useNotification();
  const { openChat } = useWhatsApp();
  const { rentalInvoiceSettings } = state;

  const [selectedAgreementId, setSelectedAgreementId] = useState<string>('');
  const [invoiceTypeChoice, setInvoiceTypeChoice] = useState<InvoiceTypeChoice>(initialInvoiceType);
  const [rentAmount, setRentAmount] = useState('');
  const [securityAmount, setSecurityAmount] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const autoSend = state.rentalInvoiceSettings?.autoSendInvoiceWhatsApp ?? false;
  const [sendWhatsApp, setSendWhatsApp] = useState(false);
  const [whatsAppMode, setWhatsAppMode] = useState<'auto' | 'manual'>('manual');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeAgreements = useMemo(() => {
    return state.rentalAgreements.filter(ra => ra.status === 'Active');
  }, [state.rentalAgreements]);

  const selectedAgreement = useMemo(() => {
    return activeAgreements.find(a => a.id === selectedAgreementId) || null;
  }, [activeAgreements, selectedAgreementId]);

  const property = useMemo(() => {
    return selectedAgreement
      ? state.properties.find(p => p.id === selectedAgreement.propertyId)
      : null;
  }, [selectedAgreement, state.properties]);

  const building = useMemo(() => {
    return property ? state.buildings.find(b => b.id === property.buildingId) : null;
  }, [property, state.buildings]);

  const tenant = useMemo(() => {
    return selectedAgreement
      ? state.contacts.find(c => c.id === selectedAgreement.contactId)
      : null;
  }, [selectedAgreement, state.contacts]);

  const hasSecurityDepositInvoice = useMemo(() => {
    if (!selectedAgreementId || !selectedAgreement) return false;
    const secDep = parseFloat(String(selectedAgreement.securityDeposit || 0)) || 0;
    if (secDep <= 0) return false;
    return state.invoices.some(
      inv =>
        inv.agreementId === selectedAgreementId &&
        inv.invoiceType !== InvoiceType.INSTALLMENT &&
        (inv.invoiceType === InvoiceType.SECURITY_DEPOSIT ||
          ((inv.securityDepositCharge || 0) >= secDep * 0.99 && inv.amount >= secDep * 0.99))
    );
  }, [selectedAgreementId, selectedAgreement, state.invoices]);

  const generateNextInvoiceNumber = useCallback(() => {
    if (!rentalInvoiceSettings) return '';
    const { prefix, nextNumber, padding } = rentalInvoiceSettings;
    let maxNum = nextNumber;
    state.invoices.forEach(inv => {
      if (inv.invoiceNumber?.startsWith(prefix)) {
        const part = inv.invoiceNumber.substring(prefix.length);
        if (/^\d+$/.test(part)) {
          const num = parseInt(part, 10);
          if (num >= maxNum) maxNum = num + 1;
        }
      }
    });
    return `${prefix}${String(maxNum).padStart(padding, '0')}`;
  }, [rentalInvoiceSettings, state.invoices]);

  useEffect(() => {
    if (!isOpen) return;
    setInvoiceTypeChoice(initialInvoiceType);
    if (activeAgreements.length > 0 && !selectedAgreementId) {
      setSelectedAgreementId(activeAgreements[0].id);
    }
    setSendWhatsApp(autoSend);
    setWhatsAppMode(autoSend ? 'auto' : 'manual');
  }, [isOpen, initialInvoiceType, activeAgreements, selectedAgreementId, autoSend]);

  useEffect(() => {
    if (selectedAgreement) {
      setRentAmount(String(selectedAgreement.monthlyRent || 0));
      setSecurityAmount(String(selectedAgreement.securityDeposit || 0));
    }
  }, [selectedAgreement]);

  useEffect(() => {
    const getFirstOfMonth = () => {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    };
    if (invoiceTypeChoice === 'rental') {
      const d = getFirstOfMonth();
      setInvoiceDate(d);
      const due = new Date(d + 'T00:00:00');
      due.setDate(due.getDate() + (selectedAgreement?.rentDueDate || 7));
      setDueDate(due.toISOString().split('T')[0]);
      const dateObj = new Date(d + 'T00:00:00');
      const monthYear = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });
      setDescription(`Rent for ${property?.name || 'Unknown'} - ${monthYear}`);
    } else {
      const startDate = selectedAgreement?.startDate || new Date().toISOString().split('T')[0];
      setInvoiceDate(startDate);
      const due = new Date(startDate + 'T00:00:00');
      due.setDate(due.getDate() + 7);
      setDueDate(due.toISOString().split('T')[0]);
      setDescription(`Security Deposit [Security]`);
    }
  }, [invoiceTypeChoice, selectedAgreement?.startDate, selectedAgreement?.rentDueDate, property?.name]);

  const handleSave = async () => {
    if (!selectedAgreement) {
      await showAlert('Please select an agreement.');
      return;
    }

    if (invoiceTypeChoice === 'security' && hasSecurityDepositInvoice) {
      await showAlert('A security deposit invoice already exists for this agreement.');
      return;
    }

    const secDep = parseFloat(String(selectedAgreement.securityDeposit || 0)) || 0;
    if (invoiceTypeChoice === 'security' && secDep <= 0) {
      await showAlert('This agreement has no security deposit. Cannot create security deposit invoice.');
      return;
    }

    const invoiceNumber = generateNextInvoiceNumber();
    if (!invoiceNumber.trim()) {
      await showAlert('Invoice number could not be generated. Check rental invoice settings.');
      return;
    }

    const isDuplicate = state.invoices.some(
      inv => inv.invoiceNumber?.trim().toLowerCase() === invoiceNumber.trim().toLowerCase()
    );
    if (isDuplicate) {
      await showAlert('This invoice number is already in use.');
      return;
    }

    const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
    const securityDepositCategory = state.categories.find(c => c.name === 'Security Deposit');
    if (!rentalIncomeCategory) {
      await showAlert("'Rental Income' category not found. Please check settings.");
      return;
    }
    if (invoiceTypeChoice === 'security' && !securityDepositCategory) {
      await showAlert("'Security Deposit' category not found. Please check settings.");
      return;
    }

    const amount =
      invoiceTypeChoice === 'rental'
        ? parseFloat(rentAmount) || 0
        : parseFloat(securityAmount) || secDep;

    if (amount <= 0) {
      await showAlert('Amount must be greater than zero.');
      return;
    }

    const newInvoice: Invoice = {
      id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      invoiceNumber,
      contactId: selectedAgreement.contactId,
      amount,
      paidAmount: 0,
      status: InvoiceStatus.UNPAID,
      issueDate: invoiceDate,
      dueDate,
      invoiceType: invoiceTypeChoice === 'security' ? InvoiceType.SECURITY_DEPOSIT : InvoiceType.RENTAL,
      description,
      propertyId: selectedAgreement.propertyId,
      buildingId: building?.id,
      agreementId: selectedAgreement.id,
      categoryId: invoiceTypeChoice === 'security' ? securityDepositCategory!.id : rentalIncomeCategory.id,
      rentalMonth: invoiceTypeChoice === 'rental' ? new Date(invoiceDate + 'T00:00:00').toISOString().slice(0, 7) : undefined,
      securityDepositCharge: invoiceTypeChoice === 'security' ? amount : undefined,
    };

    setIsSubmitting(true);
    try {
      dispatch({ type: 'ADD_INVOICE', payload: newInvoice });

      if (rentalInvoiceSettings && invoiceNumber.startsWith(rentalInvoiceSettings.prefix)) {
        const numPart = parseInt(invoiceNumber.substring(rentalInvoiceSettings.prefix.length));
        if (!isNaN(numPart) && numPart >= rentalInvoiceSettings.nextNumber) {
          dispatch({
            type: 'UPDATE_RENTAL_INVOICE_SETTINGS' as any,
            payload: { ...rentalInvoiceSettings, nextNumber: numPart + 1 },
          });
        }
      }

      if (sendWhatsApp && tenant?.contactNo) {
        const subject = property?.name || 'your invoice';
        const message = WhatsAppService.generateInvoiceReminder(
          state.whatsAppTemplates.invoiceReminder,
          tenant,
          invoiceNumber,
          amount,
          formatDate(dueDate),
          subject,
          property?.name || ''
        );

        if (whatsAppMode === 'auto') {
          try {
            await WhatsAppChatService.sendMessage({
              contactId: tenant.id,
              phoneNumber: tenant.contactNo,
              message,
            });
            showToast('Invoice created and sent via WhatsApp.', 'success');
          } catch (err) {
            showToast('Invoice created. Failed to send via WhatsApp.', 'warning');
          }
        } else {
          openChat(tenant, tenant.contactNo, message);
          showToast('Invoice created. WhatsApp opened for review.', 'success');
        }
      } else {
        showToast('Invoice created successfully.', 'success');
      }

      onCreated?.(newInvoice);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedAgreementId('');
    setInvoiceTypeChoice(initialInvoiceType);
    setRentAmount('');
    setSecurityAmount('');
    setSendWhatsApp(false);
    setWhatsAppMode('manual');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const agreementOptions = activeAgreements.map(ag => {
    const prop = state.properties.find(p => p.id === ag.propertyId);
    const bld = prop ? state.buildings.find(b => b.id === prop.buildingId) : null;
    const contact = state.contacts.find(c => c.id === ag.contactId);
    return {
      id: ag.id,
      label: `${prop?.name || 'Unknown'} - ${contact?.name || 'Unknown'} (${bld?.name || 'N/A'})`,
    };
  });

  if (activeAgreements.length === 0) {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} title="Create Invoice">
        <div className="p-6 text-center text-slate-500">
          <p className="text-sm">No active rental agreements found.</p>
          <p className="text-xs text-slate-400 mt-1">Please create a rental agreement first.</p>
          <Button variant="secondary" onClick={handleClose} className="mt-4">
            Close
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create Invoice" size="lg">
      <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-2">
        {/* Agreement selector */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Select Agreement</label>
          <select
            value={selectedAgreementId}
            onChange={e => setSelectedAgreementId(e.target.value)}
            className="block w-full rounded-lg border border-slate-300 shadow-sm focus:ring-accent focus:border-accent text-sm py-2 px-3 bg-white"
          >
            {agreementOptions.map(opt => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Property & Agreement summary */}
        {selectedAgreement && (
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Agreement Details
            </h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Building</span>
                <span className="font-medium text-slate-800">{building?.name || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Property</span>
                <span className="font-medium text-slate-800">{property?.name || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Tenant</span>
                <span className="font-medium text-slate-800">{tenant?.name || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Monthly Rent</span>
                <span className="font-medium text-slate-800">
                  {CURRENCY} {(selectedAgreement.monthlyRent || 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-1 col-span-2">
                <span className="text-slate-500">Security Deposit</span>
                <span className="font-medium text-slate-800">
                  {selectedAgreement.securityDeposit
                    ? `${CURRENCY} ${(parseFloat(String(selectedAgreement.securityDeposit)) || 0).toLocaleString()}`
                    : '-'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Invoice type */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Invoice Type</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setInvoiceTypeChoice('rental')}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                invoiceTypeChoice === 'rental'
                  ? 'bg-accent text-white ring-2 ring-accent/50'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Rental Invoice
            </button>
            <button
              type="button"
              onClick={() => setInvoiceTypeChoice('security')}
              disabled={hasSecurityDepositInvoice || !(selectedAgreement?.securityDeposit && selectedAgreement.securityDeposit > 0)}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                invoiceTypeChoice === 'security'
                  ? 'bg-accent text-white ring-2 ring-accent/50'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed'
              }`}
            >
              Security Deposit
              {hasSecurityDepositInvoice && ' (exists)'}
            </button>
          </div>
        </div>

        {/* Details form */}
        <div className="space-y-3">
          {invoiceTypeChoice === 'rental' ? (
            <Input
              label="Monthly Rent Amount"
              type="text"
              inputMode="decimal"
              value={rentAmount}
              onChange={e => setRentAmount(e.target.value)}
              required
            />
          ) : (
            <Input
              label="Security Deposit Amount"
              type="text"
              inputMode="decimal"
              value={securityAmount}
              onChange={e => setSecurityAmount(e.target.value)}
              required
            />
          )}

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
            label="Description"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>

        {/* WhatsApp options */}
        <div className="p-4 bg-green-50 rounded-lg border border-green-100">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={sendWhatsApp}
              onChange={e => setSendWhatsApp(e.target.checked)}
              className="rounded text-accent focus:ring-accent h-4 w-4"
            />
            <span className="font-medium text-slate-800">Send invoice to tenant via WhatsApp</span>
          </label>
          {sendWhatsApp && (
            <div className="mt-3 ml-7 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="whatsappMode"
                  checked={whatsAppMode === 'manual'}
                  onChange={() => setWhatsAppMode('manual')}
                  className="text-accent focus:ring-accent"
                />
                <span className="text-sm text-slate-700">Open WhatsApp to review first</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="whatsappMode"
                  checked={whatsAppMode === 'auto'}
                  onChange={() => setWhatsAppMode('auto')}
                  className="text-accent focus:ring-accent"
                />
                <span className="text-sm text-slate-700">Send automatically</span>
              </label>
            </div>
          )}
          {sendWhatsApp && !tenant?.contactNo && (
            <p className="mt-2 ml-7 text-xs text-amber-700">Tenant has no phone number saved.</p>
          )}
        </div>

        {/* Total */}
        <div className="flex justify-between items-center p-3 bg-indigo-50 rounded-lg border border-indigo-100">
          <span className="font-semibold text-slate-700">Total Amount:</span>
          <span className="font-bold text-lg text-indigo-700">
            {CURRENCY}{' '}
            {(invoiceTypeChoice === 'rental'
              ? parseFloat(rentAmount) || 0
              : parseFloat(securityAmount) || parseFloat(String(selectedAgreement?.securityDeposit)) || 0
            ).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-slate-200">
        <Button variant="secondary" onClick={handleClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : 'Create Invoice'}
        </Button>
      </div>
    </Modal>
  );
};

export default CreateRentalInvoiceModal;
