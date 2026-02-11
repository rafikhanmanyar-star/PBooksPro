
import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useNotification } from '../../context/NotificationContext';
import { RentalAgreement, ContactType, RentalAgreementStatus, Invoice, InvoiceStatus, InvoiceType, RecurringInvoiceTemplate } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import { CURRENCY, ICONS } from '../../constants';
import { getFormBackgroundColorStyle } from '../../utils/formColorUtils';

interface RentalAgreementFormProps {
    onClose: () => void;
    agreementToEdit?: RentalAgreement | null;
}

const STEPS = ['Property', 'Lease Terms', 'Broker & Review'] as const;
type Step = 0 | 1 | 2;

const RentalAgreementForm: React.FC<RentalAgreementFormProps> = ({ onClose, agreementToEdit }) => {
    const { state, dispatch } = useAppContext();
    const { showConfirm, showToast, showAlert } = useNotification();
    const { rentalInvoiceSettings } = state;

    const isEditMode = !!agreementToEdit;
    const [currentStep, setCurrentStep] = useState<Step>(0);

    // --- Agreement Number ---
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

    // --- Form State ---
    const initialBuildingId = useMemo(() => {
        if (agreementToEdit?.propertyId) {
            const prop = state.properties.find(p => p.id === agreementToEdit.propertyId);
            return prop?.buildingId || '';
        }
        return '';
    }, [agreementToEdit, state.properties]);

    const [buildingId, setBuildingId] = useState(initialBuildingId);
    const [propertyId, setPropertyId] = useState(agreementToEdit?.propertyId || '');
    const [contactId, setContactId] = useState(agreementToEdit?.contactId || '');

    const getSafeIsoDate = (dateStr: string | undefined, fallback: Date) => {
        if (!dateStr) return fallback.toISOString().split('T')[0];
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? fallback.toISOString().split('T')[0] : d.toISOString().split('T')[0];
    };

    const getDefaultStartDate = () => {
        if (agreementToEdit?.startDate) return new Date(agreementToEdit.startDate);
        if (state.enableDatePreservation && state.lastPreservedDate && !agreementToEdit) return new Date(state.lastPreservedDate);
        return new Date();
    };

    const defaultStart = getDefaultStartDate();
    const defaultEnd = new Date(defaultStart);
    defaultEnd.setFullYear(defaultEnd.getFullYear() + 1);
    defaultEnd.setDate(defaultEnd.getDate() - 1);

    const [startDate, setStartDate] = useState(() => getSafeIsoDate(agreementToEdit?.startDate, defaultStart));
    const [endDate, setEndDate] = useState(() => getSafeIsoDate(agreementToEdit?.endDate, defaultEnd));
    const [monthlyRent, setMonthlyRent] = useState(agreementToEdit?.monthlyRent?.toString() || '');
    const [rentDueDate, setRentDueDate] = useState(agreementToEdit?.rentDueDate?.toString() || '1');
    const [securityDeposit, setSecurityDeposit] = useState(agreementToEdit?.securityDeposit?.toString() || '');
    const [description, setDescription] = useState(agreementToEdit?.description || '');
    const [brokerId, setBrokerId] = useState(agreementToEdit?.brokerId || '');
    const [brokerFee, setBrokerFee] = useState(agreementToEdit?.brokerFee?.toString() || '');
    const [brokerFeeManuallySet, setBrokerFeeManuallySet] = useState(!!agreementToEdit?.brokerFee);

    // --- Lookups ---
    const tenants = useMemo(() => state.contacts.filter(c => c.type === ContactType.TENANT), [state.contacts]);
    const brokers = useMemo(() => state.contacts.filter(c => c.type === ContactType.BROKER || c.type === ContactType.DEALER), [state.contacts]);
    const buildings = useMemo(() => state.buildings.map(b => ({ id: b.id, name: b.name })), [state.buildings]);

    const selectedProperty = useMemo(() => state.properties.find(p => p.id === propertyId), [propertyId, state.properties]);
    const autoOwner = useMemo(() => selectedProperty ? state.contacts.find(c => c.id === selectedProperty.ownerId) : null, [selectedProperty, state.contacts]);

    // Properties filtered by building + occupancy
    const properties = useMemo(() => {
        const occupiedPropertyIds = new Set(
            state.rentalAgreements
                .filter(ra => {
                    if (ra.status !== RentalAgreementStatus.ACTIVE) return false;
                    if (agreementToEdit && ra.id === agreementToEdit.id) return false;
                    return true;
                })
                .map(ra => ra.propertyId)
        );
        return state.properties
            .filter(p => {
                if (buildingId && p.buildingId !== buildingId) return false;
                if (occupiedPropertyIds.has(p.id)) return false;
                return true;
            })
            .map(p => {
                const owner = state.contacts.find(c => c.id === p.ownerId);
                return { id: p.id, name: `${p.name}${owner ? ` (${owner.name})` : ''}` };
            });
    }, [state.properties, state.rentalAgreements, agreementToEdit, state.contacts, buildingId]);

    // --- Broker Fee Auto-Calculation ---
    useEffect(() => {
        if (!brokerFeeManuallySet && brokerId && monthlyRent) {
            const rent = parseFloat(monthlyRent) || 0;
            const serviceCharge = selectedProperty?.monthlyServiceCharge || 0;
            const auto = Math.max(0, (rent / 2) - serviceCharge);
            setBrokerFee(auto > 0 ? auto.toString() : '');
        }
    }, [monthlyRent, brokerId, selectedProperty, brokerFeeManuallySet]);

    // Auto-update End Date when Start Date changes
    const handleStartDateChange = (newDate: Date) => {
        const newStart = newDate.toISOString().split('T')[0];
        setStartDate(newStart);
        if (state.enableDatePreservation && !agreementToEdit) {
            dispatch({ type: 'UPDATE_PRESERVED_DATE', payload: newStart });
        }
        const d = new Date(newStart);
        if (!isNaN(d.getTime())) {
            d.setFullYear(d.getFullYear() + 1);
            d.setDate(d.getDate() - 1);
            setEndDate(d.toISOString().split('T')[0]);
        }
    };

    // --- Invoice Generation Helper ---
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

    // --- Existing Invoices (for edit mode) ---
    const existingInvoices = useMemo(() =>
        agreementToEdit ? state.invoices.filter(i => i.agreementId === agreementToEdit.id) : [],
        [agreementToEdit, state.invoices]
    );

    // --- Validation per Step ---
    const canGoNext = (step: Step): boolean => {
        if (step === 0) return !!buildingId && !!propertyId;
        if (step === 1) return !!contactId && !!startDate && !!endDate && !!monthlyRent;
        return true;
    };

    // --- Manual Invoice Generation (for imported/existing) ---
    const handleGenerateInitialInvoices = async () => {
        if (!agreementToEdit) return;
        const secDep = parseFloat(securityDeposit) || 0;
        const rent = parseFloat(monthlyRent) || 0;
        if (secDep <= 0 && rent <= 0) { await showAlert("Nothing to generate."); return; }

        const confirmMsg = "Generate initial invoices?\n" +
            (secDep > 0 ? `- Security Deposit: ${CURRENCY} ${secDep.toLocaleString()}\n` : "") +
            (rent > 0 ? `- First Month Rent: ${CURRENCY} ${rent.toLocaleString()}\n- Recurring Template` : "");

        if (!(await showConfirm(confirmMsg, { title: "Generate Invoices", confirmLabel: "Generate" }))) return;

        const prefix = rentalInvoiceSettings?.prefix || 'INV-';
        const nextNumSetting = rentalInvoiceSettings?.nextNumber || 1;
        const padding = rentalInvoiceSettings?.padding || 5;
        let currentNextNum = nextNumSetting;
        const property = state.properties.find(p => p.id === propertyId);
        const bId = property?.buildingId;

        if (secDep > 0) {
            const secInvNum = getNextInvNumber(currentNextNum, prefix, padding);
            currentNextNum = parseInt(secInvNum.slice(prefix.length)) + 1;
            const secCat = state.categories.find(c => c.name === 'Security Deposit');
            const secInvoice: Invoice = {
                id: `inv-sec-man-${Date.now()}`, invoiceNumber: secInvNum, contactId, invoiceType: InvoiceType.RENTAL,
                amount: secDep, paidAmount: 0, status: InvoiceStatus.UNPAID, issueDate: startDate, dueDate: startDate,
                description: `Security Deposit [Security]`, propertyId, buildingId: bId, categoryId: secCat?.id,
                agreementId: agreementToEdit.id, securityDepositCharge: secDep
            };
            dispatch({ type: 'ADD_INVOICE', payload: secInvoice });
        }

        if (rent > 0) {
            const rentInvNum = getNextInvNumber(currentNextNum, prefix, padding);
            currentNextNum = parseInt(rentInvNum.slice(prefix.length)) + 1;
            const rentCat = state.categories.find(c => c.name === 'Rental Income');
            const monthName = new Date(startDate).toLocaleString('default', { month: 'long', year: 'numeric' });
            const rentInvoice: Invoice = {
                id: `inv-rent-man-${Date.now()}`, invoiceNumber: rentInvNum, contactId, invoiceType: InvoiceType.RENTAL,
                amount: rent, paidAmount: 0, status: InvoiceStatus.UNPAID, issueDate: startDate, dueDate: startDate,
                description: `Rent for ${monthName} [Rental]`, propertyId, buildingId: bId, categoryId: rentCat?.id,
                agreementId: agreementToEdit.id, rentalMonth: startDate.slice(0, 7)
            };
            dispatch({ type: 'ADD_INVOICE', payload: rentInvoice });

            const nextMonthDate = new Date(startDate);
            nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
            const recurringTemplate: RecurringInvoiceTemplate = {
                id: `rec-${Date.now()}`, contactId, propertyId, buildingId: bId || '', amount: rent,
                descriptionTemplate: "Rent for {Month} [Rental]", dayOfMonth: parseInt(rentDueDate) || 1,
                nextDueDate: nextMonthDate.toISOString().split('T')[0], active: true, agreementId: agreementToEdit.id,
                invoiceType: InvoiceType.RENTAL, autoGenerate: true, frequency: 'Monthly',
            };
            dispatch({ type: 'ADD_RECURRING_TEMPLATE', payload: recurringTemplate });
        }

        if (currentNextNum > nextNumSetting) {
            dispatch({ type: 'UPDATE_RENTAL_INVOICE_SETTINGS', payload: { ...rentalInvoiceSettings, nextNumber: currentNextNum } });
        }
        showToast("Initial invoices generated.", "success");
    };

    // --- Submit ---
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!contactId || !propertyId || !startDate || !endDate || !monthlyRent) {
            await showAlert("Please fill in all required fields.");
            return;
        }

        const startD = new Date(startDate);
        const endD = new Date(endDate);
        if (isNaN(startD.getTime()) || isNaN(endD.getTime())) {
            await showAlert("Invalid Start or End Date.");
            return;
        }

        const agreementData = {
            contactId, propertyId,
            startDate: startD.toISOString(), endDate: endD.toISOString(),
            monthlyRent: parseFloat(monthlyRent) || 0,
            rentDueDate: parseInt(rentDueDate) || 1,
            securityDeposit: parseFloat(securityDeposit) || 0,
            brokerId: brokerId || undefined,
            brokerFee: parseFloat(brokerFee) || undefined,
            description,
            ownerId: autoOwner?.id || undefined,
            status: RentalAgreementStatus.ACTIVE,
        };

        const prefix = rentalInvoiceSettings?.prefix || 'INV-';
        const nextNumSetting = rentalInvoiceSettings?.nextNumber || 1;
        const padding = rentalInvoiceSettings?.padding || 5;
        let currentNextNum = nextNumSetting;

        if (agreementToEdit) {
            // === EDIT MODE ===
            const hasInvoices = state.invoices.some(inv => inv.agreementId === agreementToEdit.id);
            if (hasInvoices && agreementToEdit.status !== RentalAgreementStatus.RENEWED) {
                await showAlert(
                    'This agreement has invoices. It cannot be edited directly. Use Renew to create updated terms.',
                    { title: 'Edit Restricted' }
                );
                return;
            }
            dispatch({ type: 'UPDATE_RENTAL_AGREEMENT', payload: { ...agreementToEdit, ...agreementData } });
            showToast("Agreement updated.");
        } else {
            // === NEW AGREEMENT ===
            const id = Date.now().toString();
            const agreementNumber = getNextAgreementNumber();
            const nextSeq = parseInt(agreementNumber.slice(state.agreementSettings.prefix.length)) + 1;
            dispatch({ type: 'UPDATE_AGREEMENT_SETTINGS', payload: { ...state.agreementSettings, nextNumber: nextSeq } });

            const newAgreement: RentalAgreement = { id, agreementNumber, ...agreementData };
            dispatch({ type: 'ADD_RENTAL_AGREEMENT', payload: newAgreement });

            const shouldGenerate = await showConfirm(
                "Agreement created!\n\nGenerate initial invoices?\n\n1. Security Deposit Invoice\n2. First Month Rental Invoice\n3. Recurring Invoice Template",
                { title: "Generate Invoices", confirmLabel: "Yes, Generate", cancelLabel: "No, Skip" }
            );

            if (shouldGenerate) {
                const property = state.properties.find(p => p.id === propertyId);
                const bId = property?.buildingId;

                if (agreementData.securityDeposit > 0) {
                    const secInvNum = getNextInvNumber(currentNextNum, prefix, padding);
                    currentNextNum = parseInt(secInvNum.slice(prefix.length)) + 1;
                    const secCat = state.categories.find(c => c.name === 'Security Deposit');
                    const secInvoice: Invoice = {
                        id: `inv-sec-new-${Date.now()}`, invoiceNumber: secInvNum, contactId: agreementData.contactId,
                        invoiceType: InvoiceType.RENTAL, amount: agreementData.securityDeposit, paidAmount: 0,
                        status: InvoiceStatus.UNPAID, issueDate: agreementData.startDate, dueDate: agreementData.startDate,
                        description: `Security Deposit [Security]`, propertyId: agreementData.propertyId,
                        buildingId: bId, categoryId: secCat?.id, agreementId: id, securityDepositCharge: agreementData.securityDeposit
                    };
                    dispatch({ type: 'ADD_INVOICE', payload: secInvoice });
                }

                if (agreementData.monthlyRent > 0) {
                    const rentInvNum = getNextInvNumber(currentNextNum, prefix, padding);
                    currentNextNum = parseInt(rentInvNum.slice(prefix.length)) + 1;
                    const rentCat = state.categories.find(c => c.name === 'Rental Income');
                    const monthName = new Date(agreementData.startDate).toLocaleString('default', { month: 'long', year: 'numeric' });
                    const rentInvoice: Invoice = {
                        id: `inv-rent-new-${Date.now()}`, invoiceNumber: rentInvNum, contactId: agreementData.contactId,
                        invoiceType: InvoiceType.RENTAL, amount: agreementData.monthlyRent, paidAmount: 0,
                        status: InvoiceStatus.UNPAID, issueDate: agreementData.startDate, dueDate: agreementData.startDate,
                        description: `Rent for ${monthName} [Rental]`, propertyId: agreementData.propertyId,
                        buildingId: bId, categoryId: rentCat?.id, agreementId: id, rentalMonth: agreementData.startDate.slice(0, 7)
                    };
                    dispatch({ type: 'ADD_INVOICE', payload: rentInvoice });

                    const nextMonthDate = new Date(agreementData.startDate);
                    nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
                    const recurringTemplate: RecurringInvoiceTemplate = {
                        id: `rec-${Date.now()}`, contactId: agreementData.contactId, propertyId: agreementData.propertyId,
                        buildingId: bId || '', amount: agreementData.monthlyRent, descriptionTemplate: "Rent for {Month} [Rental]",
                        dayOfMonth: agreementData.rentDueDate, nextDueDate: nextMonthDate.toISOString().split('T')[0],
                        active: true, agreementId: id, invoiceType: InvoiceType.RENTAL, autoGenerate: true, frequency: 'Monthly',
                    };
                    dispatch({ type: 'ADD_RECURRING_TEMPLATE', payload: recurringTemplate });
                }

                if (currentNextNum > nextNumSetting) {
                    dispatch({ type: 'UPDATE_RENTAL_INVOICE_SETTINGS', payload: { ...rentalInvoiceSettings, nextNumber: currentNextNum } });
                }
                showToast("Agreement created and invoices generated.", "success");
            } else {
                showToast("Agreement created.");
            }
        }
        onClose();
    };

    const handleDelete = async () => {
        if (!agreementToEdit) return;
        if (await showConfirm("Are you sure you want to delete this agreement?")) {
            dispatch({ type: 'DELETE_RENTAL_AGREEMENT', payload: agreementToEdit.id });
            showToast("Agreement deleted.");
            onClose();
        }
    };

    const formBackgroundStyle = useMemo(() => getFormBackgroundColorStyle(undefined, buildingId, state), [buildingId, state]);

    // === WIZARD VIEW (for new agreements) ===
    if (!isEditMode) {
        return (
            <form onSubmit={handleSubmit} className="flex flex-col h-full min-h-0" style={formBackgroundStyle}>
                {/* Step Indicator */}
                <div className="flex-shrink-0 mb-4">
                    <div className="flex items-center justify-center gap-0">
                        {STEPS.map((label, i) => (
                            <React.Fragment key={label}>
                                {i > 0 && <div className={`h-0.5 w-10 mx-1 rounded ${i <= currentStep ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
                                <button
                                    type="button"
                                    onClick={() => { if (i < currentStep || canGoNext(currentStep)) setCurrentStep(i as Step); }}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                                        i === currentStep ? 'bg-emerald-500 text-white shadow-sm' :
                                        i < currentStep ? 'bg-emerald-100 text-emerald-700 cursor-pointer' :
                                        'bg-slate-100 text-slate-400'
                                    }`}
                                >
                                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                        i === currentStep ? 'bg-white/20 text-white' :
                                        i < currentStep ? 'bg-emerald-200 text-emerald-700' :
                                        'bg-slate-200 text-slate-400'
                                    }`}>{i + 1}</span>
                                    <span className="hidden sm:inline">{label}</span>
                                </button>
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                {/* Step Content */}
                <div className="flex-1 min-h-0 overflow-y-auto">
                    {/* Step 1: Property Selection */}
                    {currentStep === 0 && (
                        <div className="space-y-4 max-w-lg mx-auto">
                            <div className="text-center mb-4">
                                <h3 className="text-sm font-semibold text-slate-700">Select Property</h3>
                                <p className="text-xs text-slate-500 mt-0.5">Choose a building and property for the lease</p>
                            </div>
                            <ComboBox label="Building" items={buildings} selectedId={buildingId} onSelect={item => { setBuildingId(item?.id || ''); setPropertyId(''); }} placeholder="Select building" required allowAddNew={false} />
                            <ComboBox label="Property" items={properties} selectedId={propertyId} onSelect={item => setPropertyId(item?.id || '')} placeholder="Select property" required disabled={!buildingId} />
                            {autoOwner && (
                                <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200/60">
                                    <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Owner</span>
                                    <p className="text-sm font-medium text-emerald-800 mt-0.5">{autoOwner.name}</p>
                                </div>
                            )}
                            {selectedProperty?.monthlyServiceCharge ? (
                                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200/60">
                                    <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Monthly Service Charge</span>
                                    <p className="text-sm font-medium text-blue-800 mt-0.5">{CURRENCY} {selectedProperty.monthlyServiceCharge.toLocaleString()}</p>
                                </div>
                            ) : null}
                        </div>
                    )}

                    {/* Step 2: Lease Terms */}
                    {currentStep === 1 && (
                        <div className="space-y-4 max-w-lg mx-auto">
                            <div className="text-center mb-4">
                                <h3 className="text-sm font-semibold text-slate-700">Lease Terms</h3>
                                <p className="text-xs text-slate-500 mt-0.5">Set tenant, dates, and financial details</p>
                            </div>
                            <ComboBox label="Tenant" items={tenants} selectedId={contactId} onSelect={item => setContactId(item?.id || '')} placeholder="Select tenant" required />
                            <div className="grid grid-cols-2 gap-3">
                                <DatePicker label="Start Date" value={startDate} onChange={handleStartDateChange} required className="text-sm" />
                                <DatePicker label="End Date" value={endDate} onChange={d => setEndDate(d.toISOString().split('T')[0])} required className="text-sm" />
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <Input label="Monthly Rent" type="number" value={monthlyRent} onChange={e => setMonthlyRent(e.target.value)} required />
                                <Input label="Due Day" type="number" min="1" max="31" value={rentDueDate} onChange={e => setRentDueDate(e.target.value)} required />
                                <Input label="Security Deposit" type="number" value={securityDeposit} onChange={e => setSecurityDeposit(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Description / Notes</label>
                                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none" placeholder="Optional notes..." />
                            </div>
                        </div>
                    )}

                    {/* Step 3: Broker & Review */}
                    {currentStep === 2 && (
                        <div className="space-y-4 max-w-lg mx-auto">
                            <div className="text-center mb-4">
                                <h3 className="text-sm font-semibold text-slate-700">Broker & Review</h3>
                                <p className="text-xs text-slate-500 mt-0.5">Optional broker details and final review</p>
                            </div>
                            <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                                <ComboBox label="Broker (Optional)" items={brokers} selectedId={brokerId} onSelect={item => { setBrokerId(item?.id || ''); if (!item) { setBrokerFee(''); setBrokerFeeManuallySet(false); } }} placeholder="Select broker" allowAddNew={false} />
                                <div className="w-32">
                                    <Input label="Broker Fee" type="number" value={brokerFee} onChange={e => { setBrokerFee(e.target.value); setBrokerFeeManuallySet(true); }} disabled={!brokerId} />
                                </div>
                            </div>
                            {brokerId && !brokerFeeManuallySet && brokerFee && (
                                <p className="text-[10px] text-slate-500 -mt-2">Auto-calculated: (Rent/2) - Service Charges = {CURRENCY} {brokerFee}</p>
                            )}

                            {/* Summary Card */}
                            <div className="mt-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">Agreement Summary</h4>
                                <div className="space-y-2 text-xs">
                                    <div className="flex justify-between"><span className="text-slate-500">Building</span><span className="font-medium text-slate-800">{state.buildings.find(b => b.id === buildingId)?.name || '-'}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-500">Property</span><span className="font-medium text-slate-800">{state.properties.find(p => p.id === propertyId)?.name || '-'}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-500">Owner</span><span className="font-medium text-slate-800">{autoOwner?.name || '-'}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-500">Tenant</span><span className="font-medium text-slate-800">{tenants.find(t => t.id === contactId)?.name || '-'}</span></div>
                                    <div className="border-t border-slate-100 pt-2 flex justify-between"><span className="text-slate-500">Lease Period</span><span className="font-medium text-slate-800">{startDate} to {endDate}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-500">Monthly Rent</span><span className="font-bold text-emerald-700">{CURRENCY} {(parseFloat(monthlyRent) || 0).toLocaleString()}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-500">Security Deposit</span><span className="font-medium text-slate-800">{securityDeposit ? `${CURRENCY} ${(parseFloat(securityDeposit) || 0).toLocaleString()}` : '-'}</span></div>
                                    {brokerId && <div className="flex justify-between"><span className="text-slate-500">Broker Fee</span><span className="font-medium text-slate-800">{brokerFee ? `${CURRENCY} ${(parseFloat(brokerFee) || 0).toLocaleString()}` : '-'}</span></div>}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Navigation Actions */}
                <div className="flex-shrink-0 pt-3 mt-2 border-t border-slate-200 flex justify-between items-center gap-2">
                    <div>
                        {currentStep > 0 && (
                            <Button type="button" variant="secondary" onClick={() => setCurrentStep((currentStep - 1) as Step)} className="!text-xs !py-1.5 !px-4">
                                Back
                            </Button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button type="button" variant="secondary" onClick={onClose} className="!text-xs !py-1.5 !px-3">Cancel</Button>
                        {currentStep < 2 ? (
                            <Button type="button" onClick={() => { if (canGoNext(currentStep)) setCurrentStep((currentStep + 1) as Step); }} disabled={!canGoNext(currentStep)} className="!text-xs !py-1.5 !px-4">
                                Next
                            </Button>
                        ) : (
                            <Button type="submit" className="!text-xs !py-1.5 !px-4">
                                Create Agreement
                            </Button>
                        )}
                    </div>
                </div>
            </form>
        );
    }

    // === EDIT VIEW (inline form, not wizard) ===
    return (
        <form onSubmit={handleSubmit} className="flex flex-col h-full min-h-0" style={formBackgroundStyle}>
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[5fr_3fr] gap-3 lg:gap-4 overflow-y-auto overflow-x-hidden">
                {/* Left Column */}
                <div className="flex flex-col gap-3 min-h-0">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 lg:gap-3">
                        <div className="col-span-2">
                            <ComboBox label="Tenant" items={tenants} selectedId={contactId} onSelect={item => setContactId(item?.id || '')} placeholder="Select tenant" required disabled />
                        </div>
                        <div className="col-span-2">
                            <ComboBox label="Building" items={buildings} selectedId={buildingId} onSelect={item => { setBuildingId(item?.id || ''); setPropertyId(''); }} placeholder="Select building" allowAddNew={false} disabled />
                        </div>
                        <div className="col-span-2">
                            <ComboBox label="Property" items={properties} selectedId={propertyId} onSelect={item => setPropertyId(item?.id || '')} placeholder="Select property" required disabled />
                        </div>
                        <DatePicker label="Start Date" value={startDate} onChange={handleStartDateChange} required className="text-sm" />
                        <DatePicker label="End Date" value={endDate} onChange={d => setEndDate(d.toISOString().split('T')[0])} required className="text-sm" />
                    </div>
                    <div className="flex-shrink-0 p-2 rounded-lg bg-slate-50/80 border border-slate-200">
                        <label className="block text-xs font-medium text-slate-600 mb-1">Description / Notes</label>
                        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none" placeholder="Optional notes..." />
                    </div>
                    {/* Missing invoices alert */}
                    {agreementToEdit && existingInvoices.length === 0 && (
                        <div className="flex-shrink-0 p-2 rounded-lg bg-emerald-50/80 border border-emerald-200/60 flex flex-col sm:flex-row justify-between items-start gap-2">
                            <div>
                                <h4 className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                                    <div className="w-3.5 h-3.5">{ICONS.alertTriangle}</div> Initial Invoices Missing
                                </h4>
                                <p className="text-[10px] text-emerald-600 mt-0.5">No linked invoices.</p>
                            </div>
                            <Button type="button" size="sm" onClick={handleGenerateInitialInvoices} className="!text-xs !py-1.5 !px-3 bg-emerald-600 hover:bg-emerald-700 text-white border-none">
                                Generate
                            </Button>
                        </div>
                    )}
                </div>

                {/* Right Column */}
                <div className="flex flex-col gap-3 min-h-0">
                    <div className="p-2 rounded-lg bg-slate-50/80 border border-slate-200 flex-shrink-0">
                        <h3 className="text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">Rent Details</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <Input label="Monthly Rent" type="number" value={monthlyRent} onChange={e => setMonthlyRent(e.target.value)} required />
                            <Input label="Due Day" type="number" min="1" max="31" value={rentDueDate} onChange={e => setRentDueDate(e.target.value)} required />
                            <Input label="Security" type="number" value={securityDeposit} onChange={e => setSecurityDeposit(e.target.value)} />
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 p-2 rounded-lg bg-slate-50/80 border border-slate-200 flex-shrink-0">
                        <div className="flex-1 min-w-0">
                            <ComboBox label="Broker" items={brokers} selectedId={brokerId} onSelect={item => { setBrokerId(item?.id || ''); if (!item) { setBrokerFee(''); setBrokerFeeManuallySet(false); } }} placeholder="Select broker" allowAddNew={false} />
                        </div>
                        <div className="w-full sm:w-28 flex-shrink-0">
                            <Input label="Fee" type="number" value={brokerFee} onChange={e => { setBrokerFee(e.target.value); setBrokerFeeManuallySet(true); }} disabled={!brokerId} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Actions Bar */}
            <div className="flex-shrink-0 pt-3 mt-2 border-t border-slate-200 flex flex-wrap justify-between items-center gap-2">
                <div className="flex gap-2">
                    {agreementToEdit && (
                        <Button type="button" variant="danger" onClick={handleDelete} className="!text-xs !py-1.5 !px-3">Delete</Button>
                    )}
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                    <Button type="button" variant="secondary" onClick={onClose} className="!text-xs !py-1.5 !px-3">Cancel</Button>
                    <Button type="submit" className="!text-xs !py-1.5 !px-4">Update</Button>
                </div>
            </div>
        </form>
    );
};

export default RentalAgreementForm;
