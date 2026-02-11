
import React, { useState, useMemo, useEffect } from 'react';
import { RentalAgreement, RentalAgreementStatus, Invoice, InvoiceStatus, InvoiceType, RecurringInvoiceTemplate } from '../../types';
import { useAppContext } from '../../context/AppContext';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import DatePicker from '../ui/DatePicker';
import { CURRENCY, ICONS } from '../../constants';
import { useNotification } from '../../context/NotificationContext';
import { formatDate } from '../../utils/dateUtils';

interface RentalAgreementRenewalModalProps {
    isOpen: boolean;
    onClose: () => void;
    agreement: RentalAgreement | null;
}

const RentalAgreementRenewalModal: React.FC<RentalAgreementRenewalModalProps> = ({ isOpen, onClose, agreement }) => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert, showConfirm } = useNotification();
    const { rentalInvoiceSettings } = state;

    // --- Form State ---
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [monthlyRent, setMonthlyRent] = useState('');
    const [securityDeposit, setSecurityDeposit] = useState('');
    const [rentDueDate, setRentDueDate] = useState('1');
    const [brokerFee, setBrokerFee] = useState('');
    const [description, setDescription] = useState('');

    // --- Open Invoices Check ---
    const openInvoices = useMemo(() => {
        if (!agreement) return [];
        return state.invoices.filter(inv =>
            inv.agreementId === agreement.id && inv.status !== InvoiceStatus.PAID
        );
    }, [agreement, state.invoices]);
    const hasOpenInvoices = openInvoices.length > 0;

    // --- Reset form on open ---
    useEffect(() => {
        if (isOpen && agreement) {
            // Start date = day after old end date
            const oldEnd = new Date(agreement.endDate);
            if (!isNaN(oldEnd.getTime())) {
                const nextDay = new Date(oldEnd);
                nextDay.setDate(nextDay.getDate() + 1);
                const newStart = nextDay.toISOString().split('T')[0];
                setStartDate(newStart);

                // End date = +1 year - 1 day
                const newEnd = new Date(nextDay);
                newEnd.setFullYear(newEnd.getFullYear() + 1);
                newEnd.setDate(newEnd.getDate() - 1);
                setEndDate(newEnd.toISOString().split('T')[0]);
            }
            setMonthlyRent(agreement.monthlyRent?.toString() || '');
            setSecurityDeposit(agreement.securityDeposit?.toString() || '');
            setRentDueDate(agreement.rentDueDate?.toString() || '1');
            setBrokerFee(agreement.brokerFee?.toString() || '');
            setDescription('');
        }
    }, [isOpen, agreement]);

    // --- Auto-update End Date ---
    const handleStartDateChange = (newDate: Date) => {
        const newStart = newDate.toISOString().split('T')[0];
        setStartDate(newStart);
        const d = new Date(newStart);
        if (!isNaN(d.getTime())) {
            d.setFullYear(d.getFullYear() + 1);
            d.setDate(d.getDate() - 1);
            setEndDate(d.toISOString().split('T')[0]);
        }
    };

    // --- Computed ---
    const oldSecDep = agreement?.securityDeposit || 0;
    const newSecDep = parseFloat(securityDeposit) || 0;
    const incrementalDeposit = Math.max(0, newSecDep - oldSecDep);
    const newRent = parseFloat(monthlyRent) || 0;
    const rentChange = agreement ? newRent - (agreement.monthlyRent || 0) : 0;

    // --- Invoice number helper ---
    const getNextInvNumber = (currentNextNum: number, prefix: string, padding: number) => {
        let maxNum = currentNextNum;
        state.invoices.forEach(inv => {
            if (inv.invoiceNumber?.startsWith(prefix)) {
                const numPart = parseInt(inv.invoiceNumber.slice(prefix.length), 10);
                if (!isNaN(numPart) && numPart >= maxNum) maxNum = numPart + 1;
            }
        });
        return `${prefix}${String(maxNum).padStart(padding, '0')}`;
    };

    const getNextAgreementNumber = () => {
        const settings = state.agreementSettings;
        const { prefix, padding, nextNumber } = settings;
        let maxNum = nextNumber;
        state.rentalAgreements.forEach(a => {
            if (a.agreementNumber?.startsWith(prefix)) {
                const numPart = parseInt(a.agreementNumber.slice(prefix.length), 10);
                if (!isNaN(numPart) && numPart >= maxNum) maxNum = numPart + 1;
            }
        });
        return `${prefix}${String(maxNum).padStart(padding, '0')}`;
    };

    // --- Submit ---
    const handleSubmit = async (e: React.FormEvent, generateInvoices: boolean) => {
        e.preventDefault();
        if (!agreement) return;

        if (hasOpenInvoices) {
            await showAlert(`Cannot renew. ${openInvoices.length} open invoice(s). Please pay all invoices first.`, { title: 'Open Invoices' });
            return;
        }

        if (!startDate || !endDate || !monthlyRent) {
            await showAlert("Please fill in all required fields.");
            return;
        }

        // 1. Stop old recurring templates
        const activeOldTemplates = state.recurringInvoiceTemplates.filter(t => t.agreementId === agreement.id && t.active);
        activeOldTemplates.forEach(t => dispatch({ type: 'UPDATE_RECURRING_TEMPLATE', payload: { ...t, active: false } }));

        // 2. Mark old as Renewed
        dispatch({ type: 'UPDATE_RENTAL_AGREEMENT', payload: { ...agreement, status: RentalAgreementStatus.RENEWED } });

        // 3. Create new agreement
        const newAgreementId = Date.now().toString();
        const agreementNumber = getNextAgreementNumber();
        const nextSeq = parseInt(agreementNumber.slice(state.agreementSettings.prefix.length)) + 1;
        dispatch({ type: 'UPDATE_AGREEMENT_SETTINGS', payload: { ...state.agreementSettings, nextNumber: nextSeq } });

        const property = state.properties.find(p => p.id === agreement.propertyId);

        const newAgreement: RentalAgreement = {
            id: newAgreementId,
            agreementNumber,
            contactId: agreement.contactId,
            propertyId: agreement.propertyId,
            startDate: new Date(startDate).toISOString(),
            endDate: new Date(endDate).toISOString(),
            monthlyRent: newRent,
            rentDueDate: parseInt(rentDueDate) || 1,
            status: RentalAgreementStatus.ACTIVE,
            securityDeposit: newSecDep || undefined,
            brokerId: agreement.brokerId,
            brokerFee: parseFloat(brokerFee) || undefined,
            description: description || agreement.description,
            ownerId: agreement.ownerId || property?.ownerId,
            previousAgreementId: agreement.id,
        };
        dispatch({ type: 'ADD_RENTAL_AGREEMENT', payload: newAgreement });

        // 4. Generate invoices if requested
        if (generateInvoices) {
            const prefix = rentalInvoiceSettings?.prefix || 'INV-';
            const nextNumSetting = rentalInvoiceSettings?.nextNumber || 1;
            const padding = rentalInvoiceSettings?.padding || 5;
            let currentNextNum = nextNumSetting;
            const bId = property?.buildingId;

            // a. Incremental Security Deposit
            if (incrementalDeposit > 0) {
                const invNum = getNextInvNumber(currentNextNum, prefix, padding);
                currentNextNum = parseInt(invNum.slice(prefix.length)) + 1;
                const secCat = state.categories.find(c => c.name === 'Security Deposit');
                const secInvoice: Invoice = {
                    id: `inv-sec-ren-${Date.now()}`, invoiceNumber: invNum, contactId: agreement.contactId,
                    invoiceType: InvoiceType.RENTAL, amount: incrementalDeposit, paidAmount: 0,
                    status: InvoiceStatus.UNPAID, issueDate: startDate, dueDate: startDate,
                    description: `Incremental Security Deposit (Renewal) [Security]`,
                    propertyId: agreement.propertyId, buildingId: bId, categoryId: secCat?.id,
                    agreementId: newAgreementId, securityDepositCharge: incrementalDeposit
                };
                dispatch({ type: 'ADD_INVOICE', payload: secInvoice });
            }

            // b. First Month Rent
            if (newRent > 0) {
                const invNum = getNextInvNumber(currentNextNum, prefix, padding);
                currentNextNum = parseInt(invNum.slice(prefix.length)) + 1;
                const rentCat = state.categories.find(c => c.name === 'Rental Income');
                const monthName = new Date(startDate).toLocaleString('default', { month: 'long', year: 'numeric' });
                const rentInvoice: Invoice = {
                    id: `inv-rent-ren-${Date.now()}`, invoiceNumber: invNum, contactId: agreement.contactId,
                    invoiceType: InvoiceType.RENTAL, amount: newRent, paidAmount: 0,
                    status: InvoiceStatus.UNPAID, issueDate: startDate, dueDate: startDate,
                    description: `Rent for ${monthName} (Renewal) [Rental]`,
                    propertyId: agreement.propertyId, buildingId: bId, categoryId: rentCat?.id,
                    agreementId: newAgreementId, rentalMonth: startDate.slice(0, 7)
                };
                dispatch({ type: 'ADD_INVOICE', payload: rentInvoice });

                // c. Recurring template
                const nextMonth = new Date(startDate);
                nextMonth.setMonth(nextMonth.getMonth() + 1);
                const recurringTemplate: RecurringInvoiceTemplate = {
                    id: `rec-ren-${Date.now()}`, contactId: agreement.contactId, propertyId: agreement.propertyId,
                    buildingId: bId || '', amount: newRent, descriptionTemplate: "Rent for {Month} [Rental]",
                    dayOfMonth: parseInt(rentDueDate) || 1, nextDueDate: nextMonth.toISOString().split('T')[0],
                    active: true, agreementId: newAgreementId, invoiceType: InvoiceType.RENTAL,
                    autoGenerate: true, frequency: 'Monthly',
                };
                dispatch({ type: 'ADD_RECURRING_TEMPLATE', payload: recurringTemplate });
            }

            if (currentNextNum > nextNumSetting) {
                dispatch({ type: 'UPDATE_RENTAL_INVOICE_SETTINGS', payload: { ...rentalInvoiceSettings, nextNumber: currentNextNum } });
            }
            showToast("Agreement renewed and invoices generated.", "success");
        } else {
            showToast("Agreement renewed successfully.", "success");
        }

        onClose();
    };

    if (!agreement) return null;

    const tenantName = state.contacts.find(c => c.id === agreement.contactId)?.name || 'Unknown';
    const propertyName = state.properties.find(p => p.id === agreement.propertyId)?.name || 'Unknown';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Renew Agreement #${agreement.agreementNumber}`} size="lg">
            <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-4 p-1">
                {/* Open invoices warning */}
                {hasOpenInvoices && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg">
                        <div className="flex items-start gap-2">
                            <div className="text-rose-500 flex-shrink-0 mt-0.5"><div className="w-4 h-4">{ICONS.alertTriangle}</div></div>
                            <div>
                                <h4 className="text-xs font-bold text-rose-800">Cannot Renew - Open Invoices</h4>
                                <p className="text-[10px] text-rose-600 mt-0.5">
                                    {openInvoices.length} unpaid invoice(s). All must be paid before renewal.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Previous Agreement Summary */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Previous Term</h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                        <div className="flex justify-between"><span className="text-slate-500">Tenant</span><span className="font-medium text-slate-800">{tenantName}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Property</span><span className="font-medium text-slate-800">{propertyName}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Period</span><span className="font-medium text-slate-800">{formatDate(agreement.startDate)} - {formatDate(agreement.endDate)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Rent</span><span className="font-medium text-slate-800">{CURRENCY} {(agreement.monthlyRent || 0).toLocaleString()}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Security</span><span className="font-medium text-slate-800">{CURRENCY} {(agreement.securityDeposit || 0).toLocaleString()}</span></div>
                    </div>
                </div>

                {/* New Term Fields */}
                <div className="p-3 bg-white rounded-lg border border-emerald-200 space-y-3">
                    <h4 className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">New Term</h4>

                    <div className="grid grid-cols-2 gap-3">
                        <DatePicker label="New Start Date" value={startDate} onChange={handleStartDateChange} required className="text-sm" />
                        <DatePicker label="New End Date" value={endDate} onChange={d => setEndDate(d.toISOString().split('T')[0])} required className="text-sm" />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <Input label="Monthly Rent" type="number" value={monthlyRent} onChange={e => setMonthlyRent(e.target.value)} required />
                            {rentChange !== 0 && (
                                <span className={`text-[10px] mt-0.5 block ${rentChange > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {rentChange > 0 ? '+' : ''}{CURRENCY} {rentChange.toLocaleString()}
                                </span>
                            )}
                        </div>
                        <Input label="Due Day" type="number" min="1" max="31" value={rentDueDate} onChange={e => setRentDueDate(e.target.value)} />
                        <div>
                            <Input label="Security Deposit" type="number" value={securityDeposit} onChange={e => setSecurityDeposit(e.target.value)} />
                            {incrementalDeposit > 0 && (
                                <span className="text-[10px] text-emerald-600 mt-0.5 block">+{CURRENCY} {incrementalDeposit.toLocaleString()} increment</span>
                            )}
                        </div>
                    </div>

                    <Input label="Broker Fee" type="number" value={brokerFee} onChange={e => setBrokerFee(e.target.value)} />

                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none" placeholder="Renewal notes..." />
                    </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="secondary" onClick={onClose} className="!text-xs !py-1.5 !px-3">Cancel</Button>
                    <Button type="button" variant="secondary" onClick={(e: any) => handleSubmit(e, false)} disabled={hasOpenInvoices} className="!text-xs !py-1.5 !px-3">
                        Renew Only
                    </Button>
                    <Button type="button" onClick={(e: any) => handleSubmit(e, true)} disabled={hasOpenInvoices} className="!text-xs !py-1.5 !px-4">
                        Renew & Generate Invoices
                    </Button>
                </div>
            </form>
        </Modal>
    );
};

export default RentalAgreementRenewalModal;
