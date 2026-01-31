
import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { ProjectAgreement, ContactType, ProjectAgreementStatus, Invoice, InvoiceStatus, InvoiceType, Project, InstallmentFrequency } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import { useNotification } from '../../context/NotificationContext';
import { usePrintContext } from '../../context/PrintContext';
import type { AgreementPrintData } from '../print/AgreementLayout';
import InstallmentConfigForm from '../settings/InstallmentConfigForm';
import Modal from '../ui/Modal';
import { ICONS } from '../../constants';
import { getFormBackgroundColorStyle } from '../../utils/formColorUtils';

interface ProjectAgreementFormProps {
    onClose: () => void;
    agreementToEdit?: ProjectAgreement | null;
    onCancelRequest?: (agreement: ProjectAgreement) => void;
}

const ProjectAgreementForm: React.FC<ProjectAgreementFormProps> = ({ onClose, agreementToEdit, onCancelRequest }) => {
    const { state, dispatch } = useAppContext();
    const { showConfirm, showToast, showAlert } = useNotification();
    const { print: triggerPrint } = usePrintContext();
    const { projectAgreementSettings, projectInvoiceSettings } = state;

    // Config Mode State
    const [showMissingPlanDialog, setShowMissingPlanDialog] = useState(false);
    const [showInstallmentConfig, setShowInstallmentConfig] = useState(false);

    const generateNextAgreementNumber = () => {
        try {
            if (!projectAgreementSettings) return '';
            const { prefix, nextNumber, padding } = projectAgreementSettings;
            
            let maxExisting = 0;
            // Scan existing agreements to find the highest number for this prefix
            if (state.projectAgreements && Array.isArray(state.projectAgreements)) {
                state.projectAgreements.forEach(pa => {
                    if (pa.agreementNumber && pa.agreementNumber.startsWith(prefix)) {
                        const part = pa.agreementNumber.substring(prefix.length);
                        if (/^\d+$/.test(part)) {
                            const num = parseInt(part, 10);
                            if (num > maxExisting) maxExisting = num;
                        }
                    }
                });
            }
            
            // Candidate is either nextNumber from settings OR maxExisting + 1, whichever is higher
            const candidate = Math.max(nextNumber || 1, maxExisting + 1);

            return `${prefix}${String(candidate).padStart(padding || 4, '0')}`;
        } catch (error) {
            console.error('Error generating agreement number:', error);
            return '';
        }
    };

    const [agreementNumber, setAgreementNumber] = useState(agreementToEdit?.agreementNumber || generateNextAgreementNumber());
    const [clientId, setClientId] = useState(agreementToEdit?.clientId || '');
    const [projectId, setProjectId] = useState(agreementToEdit?.projectId || state.defaultProjectId || '');
    const [unitIds, setUnitIds] = useState<string[]>(agreementToEdit?.unitIds || []);
    
    // Get initial date: use preserved date if option is enabled and creating new agreement
    const getInitialIssueDate = () => {
        if (agreementToEdit?.issueDate) {
            return new Date(agreementToEdit.issueDate).toISOString().split('T')[0];
        }
        if (state.enableDatePreservation && state.lastPreservedDate && !agreementToEdit) {
            return state.lastPreservedDate;
        }
        return new Date().toISOString().split('T')[0];
    };
    
    const [issueDate, setIssueDate] = useState(getInitialIssueDate());
    
    // Save date to preserved date when changed (if option is enabled)
    const handleIssueDateChange = (date: Date) => {
        const dateStr = date.toISOString().split('T')[0];
        setIssueDate(dateStr);
        if (state.enableDatePreservation && !agreementToEdit) {
            dispatch({ type: 'UPDATE_PRESERVED_DATE', payload: dateStr });
        }
    };
    
    const [listPrice, setListPrice] = useState(agreementToEdit?.listPrice?.toString() || '0');
    const [customerDiscount, setCustomerDiscount] = useState(agreementToEdit?.customerDiscount?.toString() || '0');
    const [floorDiscount, setFloorDiscount] = useState(agreementToEdit?.floorDiscount?.toString() || '0');
    const [lumpSumDiscount, setLumpSumDiscount] = useState(agreementToEdit?.lumpSumDiscount?.toString() || '0');
    const [miscDiscount, setMiscDiscount] = useState(agreementToEdit?.miscDiscount?.toString() || '0');
    const [sellingPrice, setSellingPrice] = useState(agreementToEdit?.sellingPrice?.toString() || '0');
    const [rebateAmount, setRebateAmount] = useState(agreementToEdit?.rebateAmount?.toString() || '0');
    const [rebateBrokerId, setRebateBrokerId] = useState(agreementToEdit?.rebateBrokerId || '');

    const [description, setDescription] = useState(agreementToEdit?.description || '');
    const [agreementNumberError, setAgreementNumberError] = useState('');
    const [status, setStatus] = useState<ProjectAgreementStatus>(agreementToEdit?.status || ProjectAgreementStatus.ACTIVE);
    const [installmentPlan, setInstallmentPlan] = useState<{ durationYears: number; downPaymentPercentage: number; frequency: InstallmentFrequency } | undefined>(agreementToEdit?.installmentPlan);

    // Category Mapping State
    const [listPriceCatId, setListPriceCatId] = useState(agreementToEdit?.listPriceCategoryId || '');
    const [customerDiscCatId, setCustomerDiscCatId] = useState(agreementToEdit?.customerDiscountCategoryId || '');
    const [floorDiscCatId, setFloorDiscCatId] = useState(agreementToEdit?.floorDiscountCategoryId || '');
    const [lumpSumDiscCatId, setLumpSumDiscCatId] = useState(agreementToEdit?.lumpSumDiscountCategoryId || '');
    const [miscDiscCatId, setMiscDiscCatId] = useState(agreementToEdit?.miscDiscountCategoryId || '');
    const [sellingPriceCatId, setSellingPriceCatId] = useState(agreementToEdit?.sellingPriceCategoryId || '');
    const [rebateCatId, setRebateCatId] = useState(agreementToEdit?.rebateCategoryId || '');

    // Merged Client/Owner list for "Global Owner" concept
    const clients = state.contacts.filter(c => c.type === ContactType.OWNER || c.type === ContactType.CLIENT);
    // Unified Brokers list (Broker + legacy Dealer)
    const brokers = state.contacts.filter(c => c.type === ContactType.BROKER || c.type === ContactType.DEALER);

    // Filter units for the dropdown (Available and not yet selected)
    const unitsForSelection = useMemo(() => {
        if (!projectId) return [];
        return state.units.filter(u => {
            const matchesProject = u.projectId === projectId;
            if (!matchesProject) return false;

            // Exclude already selected units
            if (unitIds.includes(u.id)) return false;

            const isAvailable = !u.contactId;
            const belongsToClient = clientId && u.contactId === clientId;
            // Allow selecting units that were originally part of this agreement (though they are already in unitIds, so filtered out by above check, but logic holds for valid pool)
            const isOriginal = agreementToEdit?.unitIds?.includes(u.id) ?? false;
            
            return isAvailable || belongsToClient || isOriginal;
        }).map(u => ({ id: u.id, name: u.name }));
    }, [projectId, clientId, state.units, agreementToEdit, unitIds]);
    
    // Set Default Categories for New Agreement
    useEffect(() => {
        if (!agreementToEdit) {
            const findCat = (name: string) => state.categories.find(c => c.name === name)?.id || '';
            if(!listPriceCatId) setListPriceCatId(findCat('Project Listed Income'));
            if(!customerDiscCatId) setCustomerDiscCatId(findCat('Customer Discount'));
            if(!floorDiscCatId) setFloorDiscCatId(findCat('Floor Discount'));
            if(!lumpSumDiscCatId) setLumpSumDiscCatId(findCat('Lump Sum Discount'));
            if(!miscDiscCatId) setMiscDiscCatId(findCat('Misc Discount'));
            if(!sellingPriceCatId) setSellingPriceCatId(findCat('Unit Selling Income'));
            if(!rebateCatId) setRebateCatId(findCat('Broker Fee'));
        }
    }, [agreementToEdit, state.categories]);

    useEffect(() => {
        try {
            if (!agreementNumber.trim()) {
                setAgreementNumberError('Agreement ID is required.');
                return;
            }
            const isDuplicate = state.projectAgreements?.some(
                pa => pa.agreementNumber && pa.agreementNumber.toLowerCase() === agreementNumber.trim().toLowerCase() && pa.id !== agreementToEdit?.id
            ) || false;
            if (isDuplicate) {
                setAgreementNumberError('This Agreement ID is already in use.');
            } else {
                setAgreementNumberError('');
            }
        } catch (error) {
            console.error('Error validating agreement number:', error);
            setAgreementNumberError('');
        }
    }, [agreementNumber, state.projectAgreements, agreementToEdit]);

    // Auto-calculate List Price based on selected Units
    useEffect(() => {
        try {
            const calculatedListPrice = unitIds.reduce((sum, id) => {
                const unit = state.units?.find(u => u.id === id);
                // Default to 0 if salePrice is not defined in settings
                return sum + (unit?.salePrice || 0);
            }, 0);

        if (agreementToEdit) {
            // Check if unit selection differs from the original agreement
            const originalUnits = new Set(agreementToEdit.unitIds);
            const currentUnits = new Set(unitIds);
            const hasChanged = originalUnits.size !== currentUnits.size || 
                               [...currentUnits].some(id => !originalUnits.has(id));
            
            if (hasChanged) {
                setListPrice(calculatedListPrice.toString());
            }
        } else {
            // New agreement: always sync
            setListPrice(calculatedListPrice.toString());
        }
        } catch (error) {
            console.error('Error calculating list price:', error);
        }
    }, [unitIds, state.units, agreementToEdit]);

    // Auto-calculate selling price
    useEffect(() => {
        try {
            const lp = parseFloat(listPrice) || 0;
            const cd = parseFloat(customerDiscount) || 0;
            const fd = parseFloat(floorDiscount) || 0;
            const lsd = parseFloat(lumpSumDiscount) || 0;
            const md = parseFloat(miscDiscount) || 0;
            const calculatedSellingPrice = lp - cd - fd - lsd - md;
            setSellingPrice(calculatedSellingPrice.toString());
        } catch (error) {
            console.error('Error calculating selling price:', error);
        }
    }, [listPrice, customerDiscount, floorDiscount, lumpSumDiscount, miscDiscount]);


    const handleAddUnit = (item: { id: string, name: string } | null) => {
        if (item) {
            setUnitIds(prev => [...prev, item.id]);
        }
    };

    const handleRemoveUnit = (idToRemove: string) => {
        setUnitIds(prev => prev.filter(id => id !== idToRemove));
    };
    
    // Generic handler for amount fields to allow only numbers and one decimal
    const handleAmountChange = (setter: React.Dispatch<React.SetStateAction<string>>) => (e: React.ChangeEvent<HTMLInputElement>) => {
        let { value } = e.target;
        // Allow only numbers and one decimal point.
        value = value.replace(/[^0-9.]/g, '');
        const parts = value.split('.');
        if (parts.length > 2) {
            value = parts[0] + '.' + parts.slice(1).join('');
        }
        setter(value);
    };

    const generateInvoices = (agreement: ProjectAgreement, plan: { durationYears: number; downPaymentPercentage: number; frequency: InstallmentFrequency }) => {
        try {
            if (!projectInvoiceSettings) {
                showAlert('Project invoice settings are not configured. Please configure them in Settings.', { title: 'Configuration Error' });
                return;
            }

            const { durationYears, downPaymentPercentage, frequency } = plan;
            const totalAmount = agreement.sellingPrice;
            const downPayment = totalAmount * (downPaymentPercentage / 100);
            const remaining = totalAmount - downPayment;
            
            let freqMonths = 1;
            if (frequency === 'Quarterly') freqMonths = 3;
            if (frequency === 'Yearly') freqMonths = 12;
            
            const totalInstallments = Math.round((durationYears * 12) / freqMonths);
            const installmentAmount = totalInstallments > 0 ? remaining / totalInstallments : 0;

            const invoices: Invoice[] = [];
            
            // determine next invoice number starting point
            let maxNum = projectInvoiceSettings.nextNumber || 1;
            const prefix = projectInvoiceSettings.prefix || 'P-INV-';
            const padding = projectInvoiceSettings.padding || 5;
            
            // Scan to ensure we don't duplicate if settings are lagging
            if (state.invoices && Array.isArray(state.invoices)) {
                state.invoices.forEach(inv => {
                    if (inv.invoiceNumber && inv.invoiceNumber.startsWith(prefix)) {
                        const part = inv.invoiceNumber.substring(prefix.length);
                        if (/^\d+$/.test(part)) {
                            const num = parseInt(part, 10);
                            if (num >= maxNum) maxNum = num + 1;
                        }
                    }
                });
            }
            
            let nextInvNum = maxNum;

            // 1. Down Payment Invoice
            if (downPayment > 0) {
                const invNum = `${prefix}${String(nextInvNum).padStart(padding, '0')}`;
                const dpInvoice: Invoice = {
                    id: `inv-gen-${Date.now()}-dp`,
                    invoiceNumber: invNum,
                    contactId: agreement.clientId,
                    invoiceType: InvoiceType.INSTALLMENT,
                    amount: downPayment,
                    paidAmount: 0,
                    status: InvoiceStatus.UNPAID,
                    issueDate: agreement.issueDate,
                    dueDate: agreement.issueDate,
                    description: `Down Payment (${downPaymentPercentage}%) - ${agreement.description || ''}`,
                    projectId: agreement.projectId,
                    unitId: agreement.unitIds?.[0],
                    categoryId: agreement.sellingPriceCategoryId,
                    agreementId: agreement.id
                };
                invoices.push(dpInvoice);
                nextInvNum++;
            }

            // 2. Installments
            if (installmentAmount > 0) {
                const baseDate = new Date(agreement.issueDate);
                const originalDay = baseDate.getDate();
                
                for (let i = 1; i <= totalInstallments; i++) {
                    const targetDate = new Date(baseDate);
                    targetDate.setMonth(baseDate.getMonth() + (i * freqMonths));
                    
                    // Adjust for month end overflow (e.g. Jan 31 -> Feb 28/29)
                    if (targetDate.getDate() !== originalDay) {
                        targetDate.setDate(0); 
                    }
                    
                    const invNum = `${prefix}${String(nextInvNum).padStart(padding, '0')}`;
                    const invDate = targetDate.toISOString().split('T')[0];
                    
                    const instInvoice: Invoice = {
                        id: `inv-gen-${Date.now()}-${i}`,
                        invoiceNumber: invNum,
                        contactId: agreement.clientId,
                        invoiceType: InvoiceType.INSTALLMENT,
                        amount: installmentAmount,
                        paidAmount: 0,
                        status: InvoiceStatus.UNPAID,
                        issueDate: invDate,
                        dueDate: invDate,
                        description: `Installment ${i}/${totalInstallments} - ${agreement.description || ''}`,
                        projectId: agreement.projectId,
                        unitId: agreement.unitIds?.[0],
                        categoryId: agreement.sellingPriceCategoryId,
                        agreementId: agreement.id
                    };
                    invoices.push(instInvoice);
                    nextInvNum++;
                }
            }

            invoices.forEach(inv => dispatch({ type: 'ADD_INVOICE', payload: inv }));

            // Update settings to reflect the consumed numbers
            if (nextInvNum > (projectInvoiceSettings.nextNumber || 1)) {
                dispatch({ 
                    type: 'UPDATE_PROJECT_INVOICE_SETTINGS', 
                    payload: { ...projectInvoiceSettings, nextNumber: nextInvNum } 
                });
            }

            showToast(`Generated ${invoices.length} invoices successfully.`, 'success');
        } catch (error) {
            console.error('Error generating invoices:', error);
            showAlert('Failed to generate invoices. Please try again.', { title: 'Error' });
        }
    };

    const handleManualGenerate = async () => {
        if (!agreementToEdit) return;
        
        const plan = agreementToEdit.installmentPlan || installmentPlan;
        if (!plan) {
             await showAlert("Installment plan is not configured for this agreement. Please configure it in the Installment Configuration section above.", { title: "No Configuration" });
             return;
        }

        const existingCount = state.invoices.filter(i => i.agreementId === agreementToEdit.id).length;
        if (existingCount > 0) {
            const confirm = await showConfirm(`This agreement already has ${existingCount} invoices. Generating new ones might create duplicates.\n\nDo you want to proceed?`, { title: "Duplicate Warning", confirmLabel: "Generate Anyway", cancelLabel: "Cancel" });
            if (!confirm) return;
        }

        generateInvoices(agreementToEdit, plan);
    };

    const handleConfigSave = (config: { durationYears: number; downPaymentPercentage: number; frequency: InstallmentFrequency }) => {
        try {
            if (!projectId || !clientId) {
                showAlert('Please select both Owner and Project before configuring installment plan.', { title: 'Missing Information' });
                return;
            }

            setInstallmentPlan(config);
            showToast('Installment plan configured. Save the agreement to persist it.', 'success');
            setShowInstallmentConfig(false);
        } catch (error) {
            console.error('Error saving installment config:', error);
            showAlert('Failed to save installment configuration. Please try again.', { title: 'Error' });
        }
    };

    const executeSave = async (skipConfigCheck = false) => {
        try {
            const agreementData = {
            agreementNumber: agreementNumber.trim(),
            clientId,
            projectId,
            unitIds,
            issueDate,
            listPrice: parseFloat(listPrice) || 0,
            customerDiscount: parseFloat(customerDiscount) || 0,
            floorDiscount: parseFloat(floorDiscount) || 0,
            lumpSumDiscount: parseFloat(lumpSumDiscount) || 0,
            miscDiscount: parseFloat(miscDiscount) || 0,
            sellingPrice: parseFloat(sellingPrice) || 0,
            rebateAmount: parseFloat(rebateAmount) || 0,
            rebateBrokerId: rebateBrokerId || undefined,
            description,
            // Category Links
            listPriceCategoryId: listPriceCatId,
            customerDiscountCategoryId: customerDiscCatId,
            floorDiscountCategoryId: floorDiscCatId,
            lumpSumDiscountCategoryId: lumpSumDiscCatId,
            miscDiscountCategoryId: miscDiscCatId,
            sellingPriceCategoryId: sellingPriceCatId,
            rebateCategoryId: rebateCatId,
            status: status,
            installmentPlan: installmentPlan,
        };

        if (agreementToEdit) {
            // Find all invoices linked to this agreement
            // Include invoices that:
            // 1. Have agreementId matching this agreement
            // 2. OR have unitId matching any unit in this agreement AND projectId matching (for invoices that might not have agreementId set)
            const linkedInvoices = state.invoices.filter(inv => {
                // Direct link via agreementId
                if (inv.agreementId === agreementToEdit.id) return true;
                
                // Indirect link via unitId and projectId (for invoices that might not have agreementId)
                if (inv.invoiceType === InvoiceType.INSTALLMENT && 
                    inv.projectId === agreementToEdit.projectId &&
                    inv.unitId && 
                    agreementToEdit.unitIds?.includes(inv.unitId)) {
                    return true;
                }
                
                return false;
            });
            
            // Block editing if there are associated invoices
            if (linkedInvoices.length > 0) {
                await showAlert(
                    `This sales agreement has ${linkedInvoices.length} associated invoice${linkedInvoices.length !== 1 ? 's' : ''} created. ` +
                    `To edit this agreement, please delete the associated invoices first.\n\n` +
                    `You can delete invoices from the Invoices & Payments section.`,
                    { 
                        title: 'Cannot Edit Agreement',
                    }
                );
                return; // Prevent editing
            }
            
            const updatedAgreement = { ...agreementToEdit, ...agreementData };
            
            // Update the agreement
            dispatch({ type: 'UPDATE_PROJECT_AGREEMENT', payload: updatedAgreement });
        } else {
            // Check for installment plan configured for this agreement
            if (!skipConfigCheck && !installmentPlan) {
                 setShowMissingPlanDialog(true);
                 return;
            }

            const newAgreement = {
                ...agreementData,
                id: Date.now().toString(),
                status: ProjectAgreementStatus.ACTIVE,
            };
            dispatch({
                type: 'ADD_PROJECT_AGREEMENT',
                payload: newAgreement,
            });

            // Update Next Number in Settings if this number pushes the counter forward
            if (projectAgreementSettings && agreementNumber && agreementNumber.startsWith(projectAgreementSettings.prefix)) {
                 const numPart = parseInt(agreementNumber.substring(projectAgreementSettings.prefix.length));
                 if (!isNaN(numPart)) {
                     if (numPart >= projectAgreementSettings.nextNumber) {
                         dispatch({
                             type: 'UPDATE_PROJECT_AGREEMENT_SETTINGS',
                             payload: { ...projectAgreementSettings, nextNumber: numPart + 1 }
                         });
                     }
                 }
            }

            // CHECK FOR INSTALLMENT PLAN IN AGREEMENT
            if (installmentPlan) {
                const confirmGen = await showConfirm(
                    `Installment plan is configured for this agreement.\n\n` +
                    `Duration: ${installmentPlan.durationYears} Years\n` +
                    `Frequency: ${installmentPlan.frequency}\n` +
                    `Down Payment: ${installmentPlan.downPaymentPercentage}%\n\n` +
                    `Do you want to auto-generate the invoices now?`,
                    { title: 'Auto-Generate Invoices', confirmLabel: 'Generate', cancelLabel: 'Skip' }
                );

                if (confirmGen) {
                    generateInvoices(newAgreement as ProjectAgreement, installmentPlan);
                }
            }
        }
        
        onClose();
        } catch (error) {
            console.error('Error saving agreement:', error);
            showAlert('Failed to save agreement. Please try again.', { title: 'Error' });
            // Don't close the form on error
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        // Prevent submission if the nested installment config form is open
        if (showInstallmentConfig) return;
        if (agreementNumberError) return;
        await executeSave(false);
    };

    const handleCreatePlan = () => {
        setShowMissingPlanDialog(false);
        setShowInstallmentConfig(true);
    };

    const handleManualProceed = () => {
        setShowMissingPlanDialog(false);
        executeSave(true);
    };

    const handleDelete = async () => {
        if (agreementToEdit) {
            const confirmed = await showConfirm('Are you sure you want to delete this agreement?');
            if (confirmed) {
                dispatch({ type: 'DELETE_PROJECT_AGREEMENT', payload: agreementToEdit.id });
                onClose();
            }
        }
    };

    /** Data for print: build from current form / agreement */
    const agreementPrintData = useMemo((): AgreementPrintData | null => {
        const client = state.contacts.find(c => c.id === clientId);
        const project = state.projects.find(p => p.id === projectId);
        const unitNames = unitIds.map(uid => state.units.find(u => u.id === uid)?.name).filter(Boolean).join(', ');
        const parties = [
            client ? `Buyer: ${client.name}${client.address ? `\n${client.address}` : ''}` : '',
            project ? `Project: ${project.name}` : '',
            unitNames ? `Unit(s): ${unitNames}` : '',
        ].filter(Boolean).join('\n\n');
        const listPriceNum = parseFloat(listPrice) || 0;
        const sellingPriceNum = parseFloat(sellingPrice) || 0;
        return {
            title: 'Project Agreement',
            agreementNumber: agreementNumber.trim() || undefined,
            parties: parties || undefined,
            effectiveDate: agreementToEdit?.issueDate ? new Date(agreementToEdit.issueDate).toLocaleDateString() : undefined,
            clauses: [
                { id: '1', title: 'Summary', body: `List Price: ${listPriceNum.toLocaleString()}\nSelling Price: ${sellingPriceNum.toLocaleString()}\nIssue Date: ${agreementToEdit?.issueDate ? new Date(agreementToEdit.issueDate).toLocaleDateString() : '—'}\nStatus: ${status}` },
                ...(description?.trim() ? [{ id: '2', title: 'Terms & Description', body: description.trim() }] : []),
            ],
            footerNote: 'This is a printed copy of the project agreement.',
        };
    }, [agreementNumber, clientId, projectId, unitIds, listPrice, sellingPrice, description, status, agreementToEdit?.issueDate, state.contacts, state.projects, state.units]);

    const formBackgroundStyle = useMemo(() => {
        return getFormBackgroundColorStyle(projectId, undefined, state);
    }, [projectId, state]);

    return (
        <>
            <form onSubmit={handleSubmit} className="flex flex-col h-full min-h-0" style={formBackgroundStyle}>
                {/* Compact two-column layout: fits viewport, scroll only when needed */}
                <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[5fr_3fr] gap-3 lg:gap-4 overflow-y-auto overflow-x-hidden">
                    {/* Left Column: Agreement Basics + Units + Status */}
                    <div className="flex flex-col gap-3 min-h-0">
                        <div className="grid grid-cols-2 lg:grid-cols-2 gap-2 lg:gap-3">
                            <div>
                                <Input label="Agreement ID" value={agreementNumber} onChange={e => setAgreementNumber(e.target.value)} required autoFocus className="text-sm" />
                                {agreementNumberError && <p className="text-red-500 text-xs mt-0.5">{agreementNumberError}</p>}
                            </div>
                            <DatePicker label="Date" value={issueDate} onChange={handleIssueDateChange} required className="text-sm" />
                            <div className="col-span-2">
                                <ComboBox label="Owner" items={clients} selectedId={clientId} onSelect={item => setClientId(item?.id || '')} placeholder="Select owner" required allowAddNew={false} />
                            </div>
                            <div className="col-span-2">
                                <ComboBox label="Project" items={state.projects} selectedId={projectId} onSelect={item => { setProjectId(item?.id || ''); setUnitIds([]); }} placeholder="Select project" required allowAddNew={false}/>
                            </div>
                        </div>

                        {/* Units - compact */}
                        <div className="flex-shrink-0">
                            <label className="block text-xs font-medium text-slate-600 mb-1">Units</label>
                            <div className="p-2 bg-slate-50/80 rounded-lg border border-slate-200 min-h-[2.5rem]">
                                <div className="flex flex-wrap gap-1.5 mb-1.5">
                                    {unitIds.map(id => {
                                        const unit = state.units.find(u => u.id === id);
                                        if (!unit) return null;
                                        return (
                                            <span key={id} className="inline-flex items-center gap-1 bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded text-xs font-medium">
                                                {unit.name}
                                                <button type="button" onClick={() => handleRemoveUnit(id)} className="text-slate-400 hover:text-rose-500 p-0.5 rounded transition-colors" aria-label="Remove">
                                                    <div className="w-2.5 h-2.5">{ICONS.x}</div>
                                                </button>
                                            </span>
                                        );
                                    })}
                                    {unitIds.length === 0 && <span className="text-xs text-slate-400 italic">No units</span>}
                                </div>
                                <ComboBox items={unitsForSelection} selectedId="" onSelect={handleAddUnit} placeholder={projectId ? "Add unit..." : "Select project first"} disabled={!projectId} allowAddNew={false} />
                            </div>
                        </div>

                        {/* Status - only when editing */}
                        {agreementToEdit && (
                            <div className="flex-shrink-0 p-2 rounded-lg bg-slate-50/80 border border-slate-200">
                                <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                                <select value={status} onChange={(e) => setStatus(e.target.value as ProjectAgreementStatus)} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
                                    <option value={ProjectAgreementStatus.ACTIVE}>Active</option>
                                    <option value={ProjectAgreementStatus.CANCELLED}>Cancelled</option>
                                    <option value={ProjectAgreementStatus.COMPLETED}>Completed</option>
                                </select>
                                {status === ProjectAgreementStatus.CANCELLED && agreementToEdit.status !== ProjectAgreementStatus.CANCELLED && (
                                    <p className="text-[10px] text-amber-600 mt-1">Use "Cancel Agreement" below for proper processing.</p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Right Column: Pricing + Broker + Installment */}
                    <div className="flex flex-col gap-3 min-h-0">
                        {/* Pricing - dense grid */}
                        <div className="p-2 rounded-lg bg-slate-50/80 border border-slate-200 flex-shrink-0">
                            <h3 className="text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">Pricing</h3>
                            <div className="grid grid-cols-3 gap-2">
                                <Input label="List" type="text" inputMode="decimal" value={listPrice} onChange={handleAmountChange(setListPrice)} className="text-sm !py-1 !text-xs" />
                                <Input label="Cust Disc" type="text" inputMode="decimal" value={customerDiscount} onChange={handleAmountChange(setCustomerDiscount)} className="text-sm !py-1 !text-xs" />
                                <Input label="Floor Disc" type="text" inputMode="decimal" value={floorDiscount} onChange={handleAmountChange(setFloorDiscount)} className="text-sm !py-1 !text-xs" />
                                <Input label="LumpSum" type="text" inputMode="decimal" value={lumpSumDiscount} onChange={handleAmountChange(setLumpSumDiscount)} className="text-sm !py-1 !text-xs" />
                                <Input label="Misc" type="text" inputMode="decimal" value={miscDiscount} onChange={handleAmountChange(setMiscDiscount)} className="text-sm !py-1 !text-xs" />
                                <Input label="Selling" type="text" inputMode="decimal" value={sellingPrice} required readOnly className="!py-1 !text-xs bg-emerald-50 font-bold text-emerald-700 border-emerald-200" />
                            </div>
                        </div>

                        {/* Broker */}
                        <div className="flex gap-2 p-2 rounded-lg bg-slate-50/80 border border-slate-200 flex-shrink-0">
                            <div className="flex-1 min-w-0">
                                <ComboBox label="Broker" items={brokers} selectedId={rebateBrokerId} onSelect={item => setRebateBrokerId(item?.id || '')} placeholder="Broker" allowAddNew={false}/>
                            </div>
                            <div className="w-28 flex-shrink-0">
                                <Input label="Rebate" type="text" inputMode="decimal" value={rebateAmount} onChange={handleAmountChange(setRebateAmount)} className="text-sm !py-1 !text-xs" />
                            </div>
                        </div>

                        {/* Installment - compact collapsible */}
                        {projectId && clientId && (
                            <div className="flex-1 min-h-0 flex flex-col p-2 rounded-lg bg-emerald-50/30 border border-emerald-200/60 flex-shrink-0">
                                <div className="flex items-center justify-between gap-2">
                                    <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Installment Plan</h3>
                                    <Button type="button" variant="secondary" onClick={() => setShowInstallmentConfig(!showInstallmentConfig)} className="!text-xs !px-2 !py-1">
                                        {showInstallmentConfig ? 'Hide' : installmentPlan ? 'Edit' : 'Configure'}
                                    </Button>
                                </div>
                                {installmentPlan && !showInstallmentConfig && (
                                    <div className="text-xs text-slate-600 bg-white/80 p-2 rounded mt-1 flex gap-4">
                                        <span><strong>{installmentPlan.durationYears}y</strong></span>
                                        <span><strong>{installmentPlan.downPaymentPercentage}%</strong> down</span>
                                        <span><strong>{installmentPlan.frequency}</strong></span>
                                    </div>
                                )}
                                {showInstallmentConfig && (
                                    <div className="mt-2 bg-white p-2 rounded border border-slate-200 overflow-auto max-h-32">
                                        <InstallmentConfigForm config={installmentPlan} onSave={handleConfigSave} onCancel={() => setShowInstallmentConfig(false)} />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Sticky Actions Bar */}
                <div className="flex-shrink-0 pt-3 mt-2 border-t border-slate-200 flex flex-wrap justify-between items-center gap-2">
                    <div>{agreementToEdit && <Button type="button" variant="danger" onClick={handleDelete} className="!text-xs !py-1.5 !px-3">Delete</Button>}</div>
                    <div className="flex flex-wrap gap-2 justify-end">
                        {agreementToEdit && agreementToEdit.status === ProjectAgreementStatus.ACTIVE && onCancelRequest && (
                            <Button type="button" variant="danger" onClick={() => onCancelRequest(agreementToEdit)} className="!text-xs !py-1.5 !px-3 bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100">
                                Cancel Agreement
                            </Button>
                        )}
                        {agreementToEdit && <Button type="button" variant="secondary" onClick={handleManualGenerate} className="!text-xs !py-1.5 !px-3 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100">Create Installments</Button>}
                        {agreementToEdit && agreementPrintData && (
                            <Button type="button" variant="secondary" onClick={() => triggerPrint('AGREEMENT', agreementPrintData)} className="!text-xs !py-1.5 !px-3 flex items-center gap-1 bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200">
                                {ICONS.print && <span className="w-3.5 h-3.5 [&>svg]:w-full [&>svg]:h-full">{ICONS.print}</span>} Print
                            </Button>
                        )}
                        <Button type="button" variant="secondary" onClick={onClose} className="!text-xs !py-1.5 !px-3">Cancel</Button>
                        <Button type="submit" disabled={!!agreementNumberError} className="!text-xs !py-1.5 !px-4">{agreementToEdit ? 'Update' : 'Save'}</Button>
                    </div>
                </div>
            </form>

            <Modal isOpen={showMissingPlanDialog} onClose={() => setShowMissingPlanDialog(false)} title="Installment Plan Not Configured">
                <div className="space-y-4">
                    <p className="text-slate-600">Installment plan is not configured for this owner and project.</p>
                    <p className="text-slate-600 font-medium">Would you like to configure it now?</p>
                    <p className="text-xs text-slate-500">This configuration will be saved as organizational data and synced across all users.</p>
                    
                    <div className="flex flex-col gap-2 pt-2">
                        <Button onClick={handleCreatePlan} className="w-full justify-center">Configure Installment Plan</Button>
                        <Button variant="secondary" onClick={handleManualProceed} className="w-full justify-center border-slate-300">Proceed with Manual Installments</Button>
                        <Button variant="ghost" onClick={() => setShowMissingPlanDialog(false)} className="w-full justify-center text-slate-500">Cancel</Button>
                    </div>
                </div>
            </Modal>
        </>
    );
};

export default ProjectAgreementForm;
