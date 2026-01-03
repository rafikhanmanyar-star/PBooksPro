
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
            if (a.agreementNumber.startsWith(prefix)) {
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

    const [tenantId, setTenantId] = useState(agreementToEdit?.tenantId || '');
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
            if (inv.invoiceNumber.startsWith(prefix)) {
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
                contactId: tenantId,
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
                contactId: tenantId,
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
               contactId: tenantId,
               propertyId: propertyId,
               buildingId: bId || '',
               amount: rent,
               descriptionTemplate: "Rent for {Month} [Rental]",
               dayOfMonth: parseInt(rentDueDate) || 1,
               nextDueDate: nextMonthDate.toISOString().split('T')[0],
               active: true,
               agreementId: agreementToEdit.id
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
        
        if (!tenantId || !propertyId || !startDate || !endDate || !monthlyRent) {
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
            tenantId,
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
                        contactId: agreementData.tenantId,
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
                        contactId: agreementData.tenantId,
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
                       contactId: agreementData.tenantId,
                       propertyId: agreementData.propertyId,
                       buildingId: bId || '',
                       amount: rentAmt,
                       descriptionTemplate: "Rent for {Month} [Rental]",
                       dayOfMonth: agreementData.rentDueDate,
                       nextDueDate: nextMonthDate.toISOString().split('T')[0],
                       active: true,
                       agreementId: newAgreementId
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
                        contactId: agreementData.tenantId,
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
                        contactId: agreementData.tenantId,
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
                       contactId: agreementData.tenantId,
                       propertyId: agreementData.propertyId,
                       buildingId: bId || '',
                       amount: agreementData.monthlyRent,
                       descriptionTemplate: "Rent for {Month} [Rental]",
                       dayOfMonth: agreementData.rentDueDate,
                       nextDueDate: nextMonthDate.toISOString().split('T')[0],
                       active: true,
                       agreementId: id
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
        <form onSubmit={handleSubmit} className="space-y-4" style={formBackgroundStyle}>
            <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold text-lg text-slate-700">
                    {renewMode ? 'Renew Agreement' : agreementToEdit ? 'Edit Agreement' : 'New Agreement'}
                </h3>
                <div className="flex gap-2">
                    {agreementToEdit && !renewMode && agreementToEdit.status === RentalAgreementStatus.ACTIVE && (
                         <>
                            <Button type="button" size="sm" onClick={onTerminateRequest} className="bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200">
                                End Agreement
                            </Button>
                            <Button type="button" size="sm" onClick={() => setRenewMode(true)} className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200">
                                Renew
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {agreementToEdit && existingInvoices.length === 0 && !renewMode && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div>
                            <h4 className="text-sm font-bold text-blue-800 flex items-center gap-2">
                                <div className="w-4 h-4">{ICONS.alertTriangle}</div> Initial Invoices Missing
                            </h4>
                            <p className="text-xs text-blue-600 mt-1">
                                This agreement (likely imported) has no linked invoices.
                            </p>
                        </div>
                        <Button type="button" size="sm" onClick={handleGenerateInitialInvoices} className="bg-blue-600 hover:bg-blue-700 text-white border-none shadow-sm">
                            Generate Invoices Now
                        </Button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <ComboBox 
                    label="Tenant" 
                    items={tenants} 
                    selectedId={tenantId} 
                    onSelect={(item) => setTenantId(item?.id || '')} 
                    placeholder="Select Tenant"
                    required
                    disabled={!!agreementToEdit && !renewMode}
                />

                <ComboBox 
                    label="Building" 
                    items={buildings} 
                    selectedId={buildingId} 
                    onSelect={(item) => {
                        setBuildingId(item?.id || '');
                        setPropertyId(''); // Reset property when building changes
                    }} 
                    placeholder="Select Building"
                    allowAddNew={false}
                    disabled={!!agreementToEdit && !renewMode}
                />
                
                <ComboBox 
                    label="Property" 
                    items={properties} 
                    selectedId={propertyId} 
                    onSelect={(item) => setPropertyId(item?.id || '')} 
                    placeholder="Select Property"
                    required
                    disabled={!buildingId || (!!agreementToEdit && !renewMode)}
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <DatePicker label="Start Date" value={startDate} onChange={handleStartDateChange} required />
                <DatePicker label="End Date" value={endDate} onChange={d => setEndDate(d.toISOString().split('T')[0])} required />
            </div>

            <div className="grid grid-cols-3 gap-4">
                <Input label="Monthly Rent" type="number" value={monthlyRent} onChange={e => setMonthlyRent(e.target.value)} required />
                <Input label="Rent Due Day" type="number" min="1" max="31" value={rentDueDate} onChange={e => setRentDueDate(e.target.value)} required />
                <Input label="Security Deposit" type="number" value={securityDeposit} onChange={e => setSecurityDeposit(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <ComboBox 
                    label="Broker (Optional)" 
                    items={brokers} 
                    selectedId={brokerId} 
                    onSelect={(item) => setBrokerId(item?.id || '')} 
                    placeholder="Select Broker"
                    allowAddNew={false}
                />
                <Input label="Broker Fee" type="number" value={brokerFee} onChange={e => setBrokerFee(e.target.value)} disabled={!brokerId} />
            </div>

            <Input label="Description / Notes" value={description} onChange={e => setDescription(e.target.value)} />

            <div className="flex justify-between items-center pt-4">
                <div>
                    {agreementToEdit && !renewMode && (
                        <Button type="button" variant="danger" onClick={handleDelete}>Delete</Button>
                    )}
                </div>
                <div className="flex gap-2">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="submit">{renewMode ? 'Renew Agreement' : agreementToEdit ? 'Update' : 'Create'}</Button>
                </div>
            </div>
        </form>
    );
};

export default RentalAgreementForm;
