
import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useNotification } from '../../context/NotificationContext';
import { RentalAgreement, ContactType, RentalAgreementStatus, Invoice, InvoiceStatus, InvoiceType, RecurringInvoiceTemplate, InvoiceStatus as InvStatus } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import { CURRENCY, ICONS } from '../../constants';
import { getFormBackgroundColorStyle } from '../../utils/formColorUtils';

interface RentalAgreementFormProps {
    onClose: () => void;
    agreementToEdit?: RentalAgreement | null;
    onTerminateRequest?: () => void;
}

const RentalAgreementForm: React.FC<RentalAgreementFormProps> = ({ onClose, agreementToEdit, onTerminateRequest }) => {
    const { state, dispatch } = useAppContext();
    const { showConfirm, showToast, showAlert } = useNotification();
    const { rentalInvoiceSettings } = state;

    // Helper to get unique next Agreement Number
    const getNextAgreementNumber = () => {
        const settings = state.agreementSettings;
        const { prefix, padding, nextNumber } = settings;

        let maxNum = nextNumber;
        state.rentalAgreements.forEach(a => {
            if (a.agreementNumber && a.agreementNumber.startsWith(prefix)) {
                const numPart = parseInt(a.agreementNumber.slice(prefix.length), 10);
                if (!isNaN(numPart) && numPart >= maxNum) maxNum = numPart + 1;
            }
        });
        return `${prefix}${String(maxNum).padStart(padding, '0')}`;
    };

    // Determine initial building based on edited agreement's property
    const initialBuildingId = useMemo(() => {
        if (agreementToEdit?.propertyId) {
            const prop = state.properties.find(p => p.id === agreementToEdit.propertyId);
            return prop?.buildingId || '';
        }
        return '';
    }, [agreementToEdit, state.properties]);

    const [contactId, setContactId] = useState(agreementToEdit?.contactId || '');
    const [buildingId, setBuildingId] = useState(initialBuildingId);
    const [propertyId, setPropertyId] = useState(agreementToEdit?.propertyId || '');

    // Helper for safe date parsing
    const getSafeIsoDate = (dateStr: string | undefined, fallbackDate: Date) => {
        if (!dateStr) return fallbackDate.toISOString().split('T')[0];
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? fallbackDate.toISOString().split('T')[0] : d.toISOString().split('T')[0];
    };

    // Initialize Dates
    // Use preserved date if option is enabled and creating new agreement
    const getDefaultStartDate = () => {
        if (agreementToEdit?.startDate) {
            return new Date(agreementToEdit.startDate);
        }
        if (state.enableDatePreservation && state.lastPreservedDate && !agreementToEdit) {
            return new Date(state.lastPreservedDate);
        }
        return new Date();
    };

    const defaultStart = getDefaultStartDate();
    const defaultEnd = new Date(defaultStart);
    defaultEnd.setFullYear(defaultEnd.getFullYear() + 1);
    defaultEnd.setDate(defaultEnd.getDate() - 1); // Standard 1 year lease ends day before anniversary

    const [startDate, setStartDate] = useState(() => getSafeIsoDate(agreementToEdit?.startDate, defaultStart));
    const [endDate, setEndDate] = useState(() => getSafeIsoDate(agreementToEdit?.endDate, defaultEnd));

    const [monthlyRent, setMonthlyRent] = useState(agreementToEdit?.monthlyRent?.toString() || '');
    const [rentDueDate, setRentDueDate] = useState(agreementToEdit?.rentDueDate?.toString() || '1');
    const [securityDeposit, setSecurityDeposit] = useState(agreementToEdit?.securityDeposit?.toString() || '');
    const [brokerId, setBrokerId] = useState(agreementToEdit?.brokerId || '');
    const [brokerFee, setBrokerFee] = useState(agreementToEdit?.brokerFee?.toString() || '');
    const [description, setDescription] = useState(agreementToEdit?.description || '');

    // Renewal Mode
    const [renewMode, setRenewMode] = useState(false);

    // Filtered Lists
    const tenants = useMemo(() => state.contacts.filter(c => c.type === ContactType.TENANT), [state.contacts]);
    const brokers = useMemo(() => state.contacts.filter(c => c.type === ContactType.BROKER || c.type === ContactType.DEALER), [state.contacts]);
    const buildings = useMemo(() => state.buildings.map(b => ({ id: b.id, name: b.name })), [state.buildings]);

    // Properties: Filtered by Building AND Availability
    const properties = useMemo(() => {
        // Get IDs of properties currently in active agreements
        // When creating a NEW agreement: exclude ALL properties with active agreements
        // When EDITING an existing agreement: exclude properties with active agreements EXCEPT the one being edited
        // Properties with EXPIRED or TERMINATED agreements are available for new agreements
        const occupiedPropertyIds = new Set(
            state.rentalAgreements
                .filter(ra => {
                    // Only consider ACTIVE agreements (not EXPIRED, TERMINATED, or RENEWED)
                    if (ra.status !== RentalAgreementStatus.ACTIVE) return false;
                    // If editing, exclude the current agreement from the filter
                    if (agreementToEdit && ra.id === agreementToEdit.id) return false;
                    return true;
                })
                .map(ra => ra.propertyId)
        );

        return state.properties
            .filter(p => {
                // Filter by Building Selection
                if (buildingId && p.buildingId !== buildingId) return false;
                // Filter by Occupancy: Exclude properties with active agreements
                // Properties with expired/terminated agreements are available
                if (occupiedPropertyIds.has(p.id)) return false;
                return true;
            })
            .map(p => {
                const owner = state.contacts.find(c => c.id === p.ownerId);
                return { id: p.id, name: `${p.name} ${owner ? `(${owner.name})` : ''}` };
            });
    }, [state.properties, state.rentalAgreements, agreementToEdit, state.contacts, buildingId]);

    // Check for existing invoices
    const existingInvoices = useMemo(() =>
        agreementToEdit ? state.invoices.filter(i => i.agreementId === agreementToEdit.id) : []
        , [agreementToEdit, state.invoices]);

    // Check for open invoices (unpaid, partially paid, or overdue) against this agreement
    const openInvoices = useMemo(() => {
        if (!agreementToEdit) return [];
        return state.invoices.filter(inv =>
            inv.agreementId === agreementToEdit.id &&
            inv.status !== InvoiceStatus.PAID
        );
    }, [agreementToEdit, state.invoices]);

    const hasOpenInvoices = openInvoices.length > 0;

    useEffect(() => {
        if (renewMode) {
            // When renewing, pre-fill start date as day after old end date
            if (agreementToEdit?.endDate) {
                const d = new Date(agreementToEdit.endDate);
                if (!isNaN(d.getTime())) {
                    const nextDay = new Date(d);
                    nextDay.setDate(nextDay.getDate() + 1);
                    setStartDate(nextDay.toISOString().split('T')[0]);

                    // Auto-calculate End Date (1 Year Duration) for renewal
                    const end = new Date(nextDay);
                    end.setFullYear(end.getFullYear() + 1);
                    end.setDate(end.getDate() - 1);
                    setEndDate(end.toISOString().split('T')[0]);
                }
            }
        }
    }, [renewMode, agreementToEdit]);

    // Auto-update End Date when Start Date changes
    const handleStartDateChange = (newDate: Date) => {
        const newStart = newDate.toISOString().split('T')[0];
        setStartDate(newStart);

        // Save date to preserved date when changed (if option is enabled)
        if (state.enableDatePreservation && !agreementToEdit) {
            dispatch({ type: 'UPDATE_PRESERVED_DATE', payload: newStart });
        }

        if (newStart) {
            const d = new Date(newStart);
            if (!isNaN(d.getTime())) {
                d.setFullYear(d.getFullYear() + 1);
                d.setDate(d.getDate() - 1); // Standard 1 year lease ends day before anniversary
                setEndDate(d.toISOString().split('T')[0]);
            }
        }
    };

    // Helper to generate unique invoice number
    const getNextInvNumber = (currentNextNum: number, prefix: string, padding: number) => {
        let maxNum = currentNextNum;
        state.invoices.forEach(inv => {
            if (inv.invoiceNumber && inv.invoiceNumber.startsWith(prefix)) {
                const numPart = parseInt(inv.invoiceNumber.slice(prefix.length), 10);
                if (!isNaN(numPart) && numPart >= maxNum) maxNum = numPart + 1;
            }
        });
        return `${prefix}${String(maxNum).padStart(padding, '0')}`;
    };

    // Manual Invoice Generation for Imported/Existing Agreements
    const handleGenerateInitialInvoices = async () => {
        if (!agreementToEdit) return;

        // 1. Validate Data
        const secDep = parseFloat(securityDeposit) || 0;
        const rent = parseFloat(monthlyRent) || 0;

        if (secDep <= 0 && rent <= 0) {
            await showAlert("Rent and Security Deposit are both zero. Nothing to generate.");
            return;
        }

        // 2. Confirm
        const confirmMsg = "This will generate the initial invoices for this agreement:\n" +
            (secDep > 0 ? `1. Security Deposit: ${CURRENCY} ${secDep.toLocaleString()}\n` : "") +
            (rent > 0 ? `2. First Month Rent: ${CURRENCY} ${rent.toLocaleString()}\n3. Recurring Invoice Template` : "");

        if (!(await showConfirm(confirmMsg, { title: "Generate Invoices", confirmLabel: "Generate" }))) return;

        // 3. Prepare Data
        const prefix = rentalInvoiceSettings?.prefix || 'INV-';
        const nextNumSetting = rentalInvoiceSettings?.nextNumber || 1;
        const padding = rentalInvoiceSettings?.padding || 5;
        let currentNextNum = nextNumSetting;

        const property = state.properties.find(p => p.id === propertyId);
        const bId = property?.buildingId; // Local const to avoid conflict with state var

        // 4. Generate Security Deposit Invoice
        if (secDep > 0) {
            const secInvNum = getNextInvNumber(currentNextNum, prefix, padding);
            currentNextNum = parseInt(secInvNum.slice(prefix.length)) + 1;

            const secCat = state.categories.find(c => c.name === 'Security Deposit');

            const secInvoice: Invoice = {
                id: `inv-sec-man-${Date.now()}`,
                invoiceNumber: secInvNum,
                contactId: contactId,
                invoiceType: InvoiceType.RENTAL,
                amount: secDep,
                paidAmount: 0,
                status: InvoiceStatus.UNPAID,
                issueDate: startDate,
                dueDate: startDate,
                description: `Security Deposit [Security]`,
                propertyId: propertyId,
                buildingId: bId,
                categoryId: secCat?.id,
                agreementId: agreementToEdit.id,
                securityDepositCharge: secDep
            };
            dispatch({ type: 'ADD_INVOICE', payload: secInvoice });
        }

        // 5. Generate Rent Invoice & Template
        if (rent > 0) {
            const rentInvNum = getNextInvNumber(currentNextNum, prefix, padding);
            currentNextNum = parseInt(rentInvNum.slice(prefix.length)) + 1;

            const rentCat = state.categories.find(c => c.name === 'Rental Income');
            const monthName = new Date(startDate).toLocaleString('default', { month: 'long', year: 'numeric' });

            const rentInvoice: Invoice = {
                id: `inv-rent-man-${Date.now()}`,
                invoiceNumber: rentInvNum,
                contactId: contactId,
                invoiceType: InvoiceType.RENTAL,
                amount: rent,
                paidAmount: 0,
                status: InvoiceStatus.UNPAID,
                issueDate: startDate,
                dueDate: startDate,
                description: `Rent for ${monthName} [Rental]`,
                propertyId: propertyId,
                buildingId: bId,
                categoryId: rentCat?.id,
                agreementId: agreementToEdit.id,
                rentalMonth: startDate.slice(0, 7)
            };
            dispatch({ type: 'ADD_INVOICE', payload: rentInvoice });

            const nextMonthDate = new Date(startDate);
            nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);

            const recurringTemplate: RecurringInvoiceTemplate = {
                id: `rec-${Date.now()}`,
                contactId: contactId,
                propertyId: propertyId,
                buildingId: bId || '',
                amount: rent,
                descriptionTemplate: "Rent for {Month} [Rental]",
                dayOfMonth: parseInt(rentDueDate) || 1,
                nextDueDate: nextMonthDate.toISOString().split('T')[0],
                active: true,
                agreementId: agreementToEdit.id,
                invoiceType: InvoiceType.RENTAL
            };
            dispatch({ type: 'ADD_RECURRING_TEMPLATE', payload: recurringTemplate });
        }

        // 6. Update Settings
        if (currentNextNum > nextNumSetting) {
            dispatch({ type: 'UPDATE_RENTAL_INVOICE_SETTINGS', payload: { ...rentalInvoiceSettings, nextNumber: currentNextNum } });
        }

        showToast("Initial invoices generated successfully.", "success");
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!contactId || !propertyId || !startDate || !endDate || !monthlyRent) {
            await showAlert("Please fill in all required fields.");
            return;
        }

        // Date Validation
        const startD = new Date(startDate);
        const endD = new Date(endDate);
        if (isNaN(startD.getTime()) || isNaN(endD.getTime())) {
            await showAlert("Invalid Start or End Date selected.");
            return;
        }

        const agreementData = {
            contactId,
            propertyId,
            startDate: startD.toISOString(),
            endDate: endD.toISOString(),
            monthlyRent: parseFloat(monthlyRent) || 0,
            rentDueDate: parseInt(rentDueDate) || 1,
            securityDeposit: parseFloat(securityDeposit) || 0,
            brokerId: brokerId || undefined,
            brokerFee: parseFloat(brokerFee) || undefined,
            description,
            status: RentalAgreementStatus.ACTIVE
        };

        // Invoice Settings
        const prefix = rentalInvoiceSettings?.prefix || 'INV-';
        const nextNumSetting = rentalInvoiceSettings?.nextNumber || 1;
        const padding = rentalInvoiceSettings?.padding || 5;
        let currentNextNum = nextNumSetting;

        // RENEWAL LOGIC
        if (renewMode && agreementToEdit) {

            // Check for open invoices before allowing renewal
            if (hasOpenInvoices) {
                await showAlert(
                    `Cannot renew this agreement.\n\nThere are ${openInvoices.length} open invoice(s) against this agreement. Please ensure all invoices are fully paid before renewing.`,
                    { title: 'Open Invoices Found' }
                );
                return;
            }

            // 1. STOP PREVIOUS RECURRING TEMPLATES
            const activeOldTemplates = state.recurringInvoiceTemplates.filter(t => t.agreementId === agreementToEdit.id && t.active);
            if (activeOldTemplates.length > 0) {
                // Deactivate them
                activeOldTemplates.forEach(t => dispatch({ type: 'UPDATE_RECURRING_TEMPLATE', payload: { ...t, active: false } }));
                // Alert User
                await showAlert(`Notice: The recurring invoice schedule for the previous agreement term has been stopped.`);
            }

            // Mark old as Renewed
            dispatch({
                type: 'UPDATE_RENTAL_AGREEMENT',
                payload: { ...agreementToEdit, status: RentalAgreementStatus.RENEWED }
            });

            // Create New Agreement
            const newAgreementId = Date.now().toString();

            // Generate Unique Agreement Number
            const agreementNumber = getNextAgreementNumber();
            // Update Settings for next time
            const nextSeq = parseInt(agreementNumber.slice(state.agreementSettings.prefix.length)) + 1;
            dispatch({ type: 'UPDATE_AGREEMENT_SETTINGS', payload: { ...state.agreementSettings, nextNumber: nextSeq } });

            const newAgreement: RentalAgreement = {
                id: newAgreementId,
                agreementNumber,
                ...agreementData
            };
            dispatch({ type: 'ADD_RENTAL_AGREEMENT', payload: newAgreement });

            const oldSec = agreementToEdit.securityDeposit || 0;
            const newSec = agreementData.securityDeposit || 0;
            const increment = Math.max(0, newSec - oldSec);
            const rentAmt = agreementData.monthlyRent || 0;

            let confirmMessage = "Agreement renewed successfully.\n\nDo you want to generate invoices for the new term?\n\n";
            let hasItems = false;

            if (increment > 0) {
                confirmMessage += `1. Incremental Security Deposit: ${CURRENCY} ${increment.toLocaleString()}\n`;
                hasItems = true;
            }
            if (rentAmt > 0) {
                confirmMessage += `2. First Month's Rent: ${CURRENCY} ${rentAmt.toLocaleString()}\n   (This will create a NEW recurring invoice template)\n`;
                hasItems = true;
            }

            let shouldGenerate = false;
            if (hasItems) {
                shouldGenerate = await showConfirm(confirmMessage, {
                    title: "Generate Renewal Invoices",
                    confirmLabel: "Yes, Generate",
                    cancelLabel: "No, just save"
                });
            }

            if (shouldGenerate) {
                const property = state.properties.find(p => p.id === propertyId);
                const bId = property?.buildingId;

                if (increment > 0) {
                    const incInvNum = getNextInvNumber(currentNextNum, prefix, padding);
                    currentNextNum = parseInt(incInvNum.slice(prefix.length)) + 1;

                    const secCat = state.categories.find(c => c.name === 'Security Deposit');

                    const incInvoice: Invoice = {
                        id: `inv-sec-inc-${Date.now()}`,
                        invoiceNumber: incInvNum,
                        contactId: agreementData.contactId,
                        invoiceType: InvoiceType.RENTAL,
                        amount: increment,
                        paidAmount: 0,
                        status: InvoiceStatus.UNPAID,
                        issueDate: agreementData.startDate,
                        dueDate: agreementData.startDate,
                        description: `Incremental Security Deposit (Renewal) [Security]`,
                        propertyId: agreementData.propertyId,
                        buildingId: bId,
                        categoryId: secCat?.id,
                        agreementId: newAgreementId,
                        securityDepositCharge: increment
                    };
                    dispatch({ type: 'ADD_INVOICE', payload: incInvoice });
                }

                // Standard Rent Invoice for Renewal
                if (rentAmt > 0) {
                    const rentInvNum = getNextInvNumber(currentNextNum, prefix, padding);
                    currentNextNum = parseInt(rentInvNum.slice(prefix.length)) + 1;

                    const rentCat = state.categories.find(c => c.name === 'Rental Income');
                    const monthName = new Date(agreementData.startDate).toLocaleString('default', { month: 'long', year: 'numeric' });

                    const rentInvoice: Invoice = {
                        id: `inv-rent-renew-${Date.now()}`,
                        invoiceNumber: rentInvNum,
                        contactId: agreementData.contactId,
                        invoiceType: InvoiceType.RENTAL,
                        amount: rentAmt,
                        paidAmount: 0,
                        status: InvoiceStatus.UNPAID,
                        issueDate: agreementData.startDate,
                        dueDate: agreementData.startDate,
                        description: `Rent for ${monthName} (Renewal) [Rental]`,
                        propertyId: agreementData.propertyId,
                        buildingId: bId,
                        categoryId: rentCat?.id,
                        agreementId: newAgreementId,
                        rentalMonth: agreementData.startDate.slice(0, 7)
                    };
                    dispatch({ type: 'ADD_INVOICE', payload: rentInvoice });

                    // Create NEW Recurring Template
                    const nextMonthDate = new Date(agreementData.startDate);
                    nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);

                    const recurringTemplate: RecurringInvoiceTemplate = {
                        id: `rec-${Date.now()}`,
                        contactId: agreementData.contactId,
                        propertyId: agreementData.propertyId,
                        buildingId: bId || '',
                        amount: rentAmt,
                        descriptionTemplate: "Rent for {Month} [Rental]",
                        dayOfMonth: agreementData.rentDueDate,
                        nextDueDate: nextMonthDate.toISOString().split('T')[0],
                        active: true,
                        agreementId: newAgreementId,
                        invoiceType: InvoiceType.RENTAL
                    };
                    dispatch({ type: 'ADD_RECURRING_TEMPLATE', payload: recurringTemplate });

                    showToast("Agreement renewed and invoices generated.", "success");
                }

                // Update settings with latest invoice number
                if (currentNextNum > nextNumSetting) {
                    dispatch({ type: 'UPDATE_RENTAL_INVOICE_SETTINGS', payload: { ...rentalInvoiceSettings, nextNumber: currentNextNum } });
                }

            } else {
                showToast("Agreement renewed successfully.", "success");
            }

        } else if (agreementToEdit) {
            // EDITING EXISTING
            // Check if invoices exist for this agreement
            const hasInvoices = state.invoices.some(inv => inv.agreementId === agreementToEdit.id);
            const isChangingStatusToRenewed = agreementData.status === RentalAgreementStatus.RENEWED && agreementToEdit.status !== RentalAgreementStatus.RENEWED;

            // If invoices exist and status is not Renewed, only allow changing status to Renewed
            if (hasInvoices && agreementToEdit.status !== RentalAgreementStatus.RENEWED) {
                // Allow status change to Renewed
                if (isChangingStatusToRenewed) {
                    // Only update status, keep all other fields unchanged
                    dispatch({ type: 'UPDATE_RENTAL_AGREEMENT', payload: { ...agreementToEdit, status: RentalAgreementStatus.RENEWED } });
                    showToast("Agreement status updated to Renewed.");
                    onClose();
                    return;
                } else {
                    // Prevent other changes
                    await showAlert(
                        'Cannot Edit Agreement\n\n' +
                        'This agreement has invoices associated with it. ' +
                        'To modify the agreement, you must first change its status to "Renewed". ' +
                        'This will mark the current agreement as renewed and allow you to create a new agreement with updated terms.',
                        { title: 'Edit Restricted' }
                    );
                    return;
                }
            }

            dispatch({ type: 'UPDATE_RENTAL_AGREEMENT', payload: { ...agreementToEdit, ...agreementData } });
            showToast("Agreement updated.");
        } else {
            // NEW AGREEMENT
            const id = Date.now().toString();

            // Generate Unique Agreement Number
            const agreementNumber = getNextAgreementNumber();
            // Update Settings for next time
            const nextSeq = parseInt(agreementNumber.slice(state.agreementSettings.prefix.length)) + 1;
            dispatch({ type: 'UPDATE_AGREEMENT_SETTINGS', payload: { ...state.agreementSettings, nextNumber: nextSeq } });

            const newAgreement: RentalAgreement = {
                id,
                agreementNumber,
                ...agreementData
            };
            dispatch({ type: 'ADD_RENTAL_AGREEMENT', payload: newAgreement });

            // === AUTO INVOICE CREATION FOR NEW AGREEMENT ===
            const shouldGenerate = await showConfirm(
                "Agreement created successfully.\n\nDo you want to generate the initial invoices now?\n\n1. Security Deposit Invoice\n2. First Month Rental Invoice\n3. Recurring Invoice Template",
                { title: "Generate Invoices", confirmLabel: "Yes, Generate", cancelLabel: "No, Skip" }
            );

            if (shouldGenerate) {
                const property = state.properties.find(p => p.id === propertyId);
                const bId = property?.buildingId;

                // 1. Security Deposit
                if (agreementData.securityDeposit > 0) {
                    const secInvNum = getNextInvNumber(currentNextNum, prefix, padding);
                    currentNextNum = parseInt(secInvNum.slice(prefix.length)) + 1;

                    const secCat = state.categories.find(c => c.name === 'Security Deposit');

                    const secInvoice: Invoice = {
                        id: `inv-sec-new-${Date.now()}`,
                        invoiceNumber: secInvNum,
                        contactId: agreementData.contactId,
                        invoiceType: InvoiceType.RENTAL,
                        amount: agreementData.securityDeposit,
                        paidAmount: 0,
                        status: InvoiceStatus.UNPAID,
                        issueDate: agreementData.startDate,
                        dueDate: agreementData.startDate,
                        description: `Security Deposit [Security]`,
                        propertyId: agreementData.propertyId,
                        buildingId: bId,
                        categoryId: secCat?.id,
                        agreementId: id,
                        securityDepositCharge: agreementData.securityDeposit
                    };
                    dispatch({ type: 'ADD_INVOICE', payload: secInvoice });
                }

                // 2. First Month Rent + Recurring
                if (agreementData.monthlyRent > 0) {
                    const rentInvNum = getNextInvNumber(currentNextNum, prefix, padding);
                    currentNextNum = parseInt(rentInvNum.slice(prefix.length)) + 1;

                    const rentCat = state.categories.find(c => c.name === 'Rental Income');
                    const monthName = new Date(agreementData.startDate).toLocaleString('default', { month: 'long', year: 'numeric' });

                    const rentInvoice: Invoice = {
                        id: `inv-rent-new-${Date.now()}`,
                        invoiceNumber: rentInvNum,
                        contactId: agreementData.contactId,
                        invoiceType: InvoiceType.RENTAL,
                        amount: agreementData.monthlyRent,
                        paidAmount: 0,
                        status: InvoiceStatus.UNPAID,
                        issueDate: agreementData.startDate,
                        dueDate: agreementData.startDate,
                        description: `Rent for ${monthName} [Rental]`,
                        propertyId: agreementData.propertyId,
                        buildingId: bId,
                        categoryId: rentCat?.id,
                        agreementId: id,
                        rentalMonth: agreementData.startDate.slice(0, 7)
                    };
                    dispatch({ type: 'ADD_INVOICE', payload: rentInvoice });

                    const nextMonthDate = new Date(agreementData.startDate);
                    nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);

                    const recurringTemplate: RecurringInvoiceTemplate = {
                        id: `rec-${Date.now()}`,
                        contactId: agreementData.contactId,
                        propertyId: agreementData.propertyId,
                        buildingId: bId || '',
                        amount: agreementData.monthlyRent,
                        descriptionTemplate: "Rent for {Month} [Rental]",
                        dayOfMonth: agreementData.rentDueDate,
                        nextDueDate: nextMonthDate.toISOString().split('T')[0],
                        active: true,
                        agreementId: id,
                        invoiceType: InvoiceType.RENTAL
                    };
                    dispatch({ type: 'ADD_RECURRING_TEMPLATE', payload: recurringTemplate });
                }

                // Update settings if IDs moved forward
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
    }

    const formBackgroundStyle = useMemo(() => {
        return getFormBackgroundColorStyle(undefined, buildingId, state);
    }, [buildingId, state]);

    return (
        <form onSubmit={handleSubmit} className="flex flex-col h-full min-h-0" style={formBackgroundStyle}>
            {/* Compact two-column layout - matches Project Agreement form */}
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[5fr_3fr] gap-3 lg:gap-4 overflow-y-auto overflow-x-hidden">
                {/* Left Column: Tenant, Building, Property, Dates */}
                <div className="flex flex-col gap-3 min-h-0">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 lg:gap-3">
                        <div className="col-span-2">
                            <ComboBox label="Tenant" items={tenants} selectedId={contactId} onSelect={(item) => setContactId(item?.id || '')} placeholder="Select tenant" required disabled={!!agreementToEdit && !renewMode} />
                        </div>
                        <div className="col-span-2">
                            <ComboBox label="Building" items={buildings} selectedId={buildingId} onSelect={(item) => { setBuildingId(item?.id || ''); setPropertyId(''); }} placeholder="Select building" allowAddNew={false} disabled={!!agreementToEdit && !renewMode} />
                        </div>
                        <div className="col-span-2">
                            <ComboBox label="Property" items={properties} selectedId={propertyId} onSelect={(item) => setPropertyId(item?.id || '')} placeholder="Select property" required disabled={!buildingId || (!!agreementToEdit && !renewMode)} />
                        </div>
                        <DatePicker label="Start Date" value={startDate} onChange={handleStartDateChange} required className="text-sm" />
                        <DatePicker label="End Date" value={endDate} onChange={d => setEndDate(d.toISOString().split('T')[0])} required className="text-sm" />
                    </div>

                    <div className="flex-shrink-0 p-2 rounded-lg bg-slate-50/80 border border-slate-200">
                        <label className="block text-xs font-medium text-slate-600 mb-1">Description / Notes</label>
                        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none" placeholder="Optional notes..." />
                    </div>

                    {/* Open Invoices Warning */}
                    {agreementToEdit && hasOpenInvoices && !renewMode && (
                        <div className="flex-shrink-0 p-2 rounded-lg bg-amber-50 border border-amber-200">
                            <h4 className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                                <div className="w-3.5 h-3.5">{ICONS.alertTriangle}</div> Open Invoices ({openInvoices.length})
                            </h4>
                            <p className="text-[10px] text-amber-600 mt-1">Renewal blocked until paid.</p>
                        </div>
                    )}

                    {/* Initial Invoices Missing */}
                    {agreementToEdit && existingInvoices.length === 0 && !renewMode && (
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

                {/* Right Column: Rent, Broker, Actions */}
                <div className="flex flex-col gap-3 min-h-0">
                    <div className="p-2 rounded-lg bg-slate-50/80 border border-slate-200 flex-shrink-0">
                        <h3 className="text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">Rent Details</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <Input
                                label="Monthly Rent"
                                type="number"
                                value={monthlyRent}
                                onChange={e => setMonthlyRent(e.target.value)}
                                required
                                className="block w-full border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-colors text-sm py-1.5 px-3"
                            />
                            <Input
                                label="Due Day"
                                type="number"
                                min="1"
                                max="31"
                                value={rentDueDate}
                                onChange={e => setRentDueDate(e.target.value)}
                                required
                                className="block w-full border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-colors text-sm py-1.5 px-3"
                            />
                            <Input
                                label="Security"
                                type="number"
                                value={securityDeposit}
                                onChange={e => setSecurityDeposit(e.target.value)}
                                className="block w-full border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-colors text-sm py-1.5 px-3"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 p-2 rounded-lg bg-slate-50/80 border border-slate-200 flex-shrink-0">
                        <div className="flex-1 min-w-0">
                            <ComboBox label="Broker" items={brokers} selectedId={brokerId} onSelect={(item) => setBrokerId(item?.id || '')} placeholder="Select broker" allowAddNew={false} />
                        </div>
                        <div className="w-full sm:w-28 flex-shrink-0">
                            <Input
                                label="Fee"
                                type="number"
                                value={brokerFee}
                                onChange={e => setBrokerFee(e.target.value)}
                                disabled={!brokerId}
                                className="block w-full border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-colors text-sm py-1.5 px-3 disabled:bg-slate-100 disabled:cursor-not-allowed"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Sticky Actions Bar */}
            <div className="flex-shrink-0 pt-3 mt-2 border-t border-slate-200 flex flex-wrap justify-between items-center gap-2">
                <div className="flex gap-2">
                    {agreementToEdit && !renewMode && (
                        <>
                            <Button type="button" variant="danger" onClick={handleDelete} className="!text-xs !py-1.5 !px-3">Delete</Button>
                            {agreementToEdit.status === RentalAgreementStatus.ACTIVE && onTerminateRequest && (
                                <Button type="button" variant="danger" onClick={onTerminateRequest} className="!text-xs !py-1.5 !px-3 bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100">
                                    End Agreement
                                </Button>
                            )}
                            {agreementToEdit.status === RentalAgreementStatus.ACTIVE && (
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={async () => {
                                        if (hasOpenInvoices) {
                                            await showAlert(`Cannot renew. ${openInvoices.length} open invoice(s). Please pay all invoices first.`, { title: 'Open Invoices' });
                                            return;
                                        }
                                        setRenewMode(true);
                                    }}
                                    className="!text-xs !py-1.5 !px-3 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                >
                                    Renew
                                </Button>
                            )}
                        </>
                    )}
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                    <Button type="button" variant="secondary" onClick={onClose} className="!text-xs !py-1.5 !px-3">Cancel</Button>
                    <Button type="submit" className="!text-xs !py-1.5 !px-4">{renewMode ? 'Renew Agreement' : agreementToEdit ? 'Update' : 'Create'}</Button>
                </div>
            </div>
        </form>
    );
};

export default RentalAgreementForm;
