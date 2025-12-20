
import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { ProjectAgreement, ContactType, ProjectAgreementStatus, Invoice, InvoiceStatus, InvoiceType, Project } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import { useNotification } from '../../context/NotificationContext';
import InstallmentConfigForm from '../settings/InstallmentConfigForm';
import Modal from '../ui/Modal';
import { ICONS } from '../../constants';

interface ProjectAgreementFormProps {
    onClose: () => void;
    agreementToEdit?: ProjectAgreement | null;
}

const ProjectAgreementForm: React.FC<ProjectAgreementFormProps> = ({ onClose, agreementToEdit }) => {
    const { state, dispatch } = useAppContext();
    const { showConfirm, showToast, showAlert } = useNotification();
    const { projectAgreementSettings, projectInvoiceSettings } = state;

    // Config Mode State
    const [configMode, setConfigMode] = useState(false);
    const [currentProjectForConfig, setCurrentProjectForConfig] = useState<Project | null>(null);
    const [showMissingPlanDialog, setShowMissingPlanDialog] = useState(false);

    const generateNextAgreementNumber = () => {
        if (!projectAgreementSettings) return '';
        const { prefix, nextNumber, padding } = projectAgreementSettings;
        
        let maxExisting = 0;
        // Scan existing agreements to find the highest number for this prefix
        state.projectAgreements.forEach(pa => {
            if (pa.agreementNumber.startsWith(prefix)) {
                const part = pa.agreementNumber.substring(prefix.length);
                if (/^\d+$/.test(part)) {
                    const num = parseInt(part, 10);
                    if (num > maxExisting) maxExisting = num;
                }
            }
        });
        
        // Candidate is either nextNumber from settings OR maxExisting + 1, whichever is higher
        const candidate = Math.max(nextNumber, maxExisting + 1);

        return `${prefix}${String(candidate).padStart(padding, '0')}`;
    };

    const [agreementNumber, setAgreementNumber] = useState(agreementToEdit?.agreementNumber || generateNextAgreementNumber());
    const [clientId, setClientId] = useState(agreementToEdit?.clientId || '');
    const [projectId, setProjectId] = useState(agreementToEdit?.projectId || '');
    const [unitIds, setUnitIds] = useState<string[]>(agreementToEdit?.unitIds || []);
    const [issueDate, setIssueDate] = useState(agreementToEdit?.issueDate ? new Date(agreementToEdit.issueDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
    
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
        if (!agreementNumber.trim()) {
            setAgreementNumberError('Agreement ID is required.');
            return;
        }
        const isDuplicate = state.projectAgreements.some(
            pa => pa.agreementNumber.toLowerCase() === agreementNumber.trim().toLowerCase() && pa.id !== agreementToEdit?.id
        );
        if (isDuplicate) {
            setAgreementNumberError('This Agreement ID is already in use.');
        } else {
            setAgreementNumberError('');
        }
    }, [agreementNumber, state.projectAgreements, agreementToEdit]);

    // Auto-calculate List Price based on selected Units
    useEffect(() => {
        const calculatedListPrice = unitIds.reduce((sum, id) => {
            const unit = state.units.find(u => u.id === id);
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
    }, [unitIds, state.units, agreementToEdit]);

    // Auto-calculate selling price
    useEffect(() => {
        const lp = parseFloat(listPrice) || 0;
        const cd = parseFloat(customerDiscount) || 0;
        const fd = parseFloat(floorDiscount) || 0;
        const lsd = parseFloat(lumpSumDiscount) || 0;
        const md = parseFloat(miscDiscount) || 0;
        const calculatedSellingPrice = lp - cd - fd - lsd - md;
        setSellingPrice(calculatedSellingPrice.toString());
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

    const generateInvoices = (agreement: ProjectAgreement, config: any) => {
        const { durationYears, downPaymentPercentage, frequency } = config;
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
        let maxNum = projectInvoiceSettings.nextNumber;
        const prefix = projectInvoiceSettings.prefix;
        const padding = projectInvoiceSettings.padding;
        
        // Scan to ensure we don't duplicate if settings are lagging
        state.invoices.forEach(inv => {
            if (inv.invoiceNumber.startsWith(prefix)) {
                const part = inv.invoiceNumber.substring(prefix.length);
                if (/^\d+$/.test(part)) {
                    const num = parseInt(part, 10);
                    if (num >= maxNum) maxNum = num + 1;
                }
            }
        });
        
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
                unitId: agreement.unitIds[0],
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
                    unitId: agreement.unitIds[0],
                    categoryId: agreement.sellingPriceCategoryId,
                    agreementId: agreement.id
                };
                invoices.push(instInvoice);
                nextInvNum++;
            }
        }

        invoices.forEach(inv => dispatch({ type: 'ADD_INVOICE', payload: inv }));

        // Update settings to reflect the consumed numbers
        if (nextInvNum > projectInvoiceSettings.nextNumber) {
            dispatch({ 
                type: 'UPDATE_PROJECT_INVOICE_SETTINGS', 
                payload: { ...projectInvoiceSettings, nextNumber: nextInvNum } 
            });
        }

        showToast(`Generated ${invoices.length} invoices successfully.`, 'success');
    };

    const handleManualGenerate = async () => {
        if (!agreementToEdit) return;
        
        const project = state.projects.find(p => p.id === agreementToEdit.projectId);
        if (!project?.installmentConfig) {
             await showAlert("This project does not have an installment plan configured. Please configure it in Project Settings or by clicking 'Config Plan' on the project list.", { title: "No Configuration" });
             return;
        }

        const existingCount = state.invoices.filter(i => i.agreementId === agreementToEdit.id).length;
        if (existingCount > 0) {
            const confirm = await showConfirm(`This agreement already has ${existingCount} invoices. Generating new ones might create duplicates.\n\nDo you want to proceed?`, { title: "Duplicate Warning", confirmLabel: "Generate Anyway", cancelLabel: "Cancel" });
            if (!confirm) return;
        }

        generateInvoices(agreementToEdit, project.installmentConfig);
    };

    const handleConfigSave = (updatedProject: Project) => {
        dispatch({ type: 'UPDATE_PROJECT', payload: updatedProject });
        showToast('Installment plan configured successfully.', 'success');
        onClose(); // Discard agreement changes and close
    };

    const executeSave = async (skipConfigCheck = false) => {
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
        };

        if (agreementToEdit) {
            const updatedAgreement = { ...agreementToEdit, ...agreementData };
            
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
            
            // Warn user if there are linked invoices and any changes are detected
            const hasChanges = 
                agreementToEdit.clientId !== updatedAgreement.clientId ||
                agreementToEdit.projectId !== updatedAgreement.projectId ||
                JSON.stringify(agreementToEdit.unitIds || []) !== JSON.stringify(updatedAgreement.unitIds || []) ||
                agreementToEdit.sellingPriceCategoryId !== updatedAgreement.sellingPriceCategoryId;
            
            if (linkedInvoices.length > 0 && hasChanges) {
                const confirmed = await showConfirm(
                    `This agreement has ${linkedInvoices.length} linked invoice${linkedInvoices.length !== 1 ? 's' : ''}. ` +
                    `Updating the agreement will automatically update the linked invoices to reflect changes in Client/Owner, Project, Unit, or Category.\n\n` +
                    `Do you want to proceed?`,
                    { 
                        title: 'Update Agreement and Linked Invoices',
                        confirmLabel: 'Yes, Update',
                        cancelLabel: 'Cancel'
                    }
                );
                
                if (!confirmed) {
                    return; // User cancelled
                }
            }
            
            // Track what changed for notification
            const changes: string[] = [];
            const updatedInvoiceIds: string[] = [];
            
            // Update linked invoices based on agreement changes
            if (linkedInvoices.length > 0) {
                linkedInvoices.forEach(invoice => {
                    let invoiceUpdated = false;
                    const invoiceUpdates: Partial<Invoice> = {};
                    
                    // Always ensure agreementId is set on the invoice
                    if (invoice.agreementId !== agreementToEdit.id) {
                        invoiceUpdates.agreementId = agreementToEdit.id;
                        invoiceUpdated = true;
                    }
                    
                    // Update contactId if clientId changed or if it doesn't match
                    if (invoice.contactId !== updatedAgreement.clientId) {
                        invoiceUpdates.contactId = updatedAgreement.clientId;
                        invoiceUpdated = true;
                        if (!changes.includes('Client/Owner')) {
                            changes.push('Client/Owner');
                        }
                    }
                    
                    // Update projectId if it changed or if it doesn't match
                    if (invoice.projectId !== updatedAgreement.projectId) {
                        invoiceUpdates.projectId = updatedAgreement.projectId;
                        invoiceUpdated = true;
                        if (!changes.includes('Project')) {
                            changes.push('Project');
                        }
                    }
                    
                    // Update unitId if unitIds changed (use first unit for invoices)
                    const oldFirstUnit = agreementToEdit.unitIds?.[0];
                    const newFirstUnit = updatedAgreement.unitIds?.[0];
                    const currentInvoiceUnit = invoice.unitId;
                    
                    // Check if unitIds array itself changed
                    const oldUnitIdsSet = new Set(agreementToEdit.unitIds || []);
                    const newUnitIdsSet = new Set(updatedAgreement.unitIds || []);
                    const unitIdsChanged = oldUnitIdsSet.size !== newUnitIdsSet.size || 
                                         [...oldUnitIdsSet].some(id => !newUnitIdsSet.has(id));
                    
                    // Update unitId if:
                    // 1. The first unit changed
                    // 2. The unitIds array changed and invoice unit is not in new array
                    // 3. Invoice unitId doesn't match the first unit of agreement
                    if (newFirstUnit && (
                        unitIdsChanged ||
                        oldFirstUnit !== newFirstUnit ||
                        currentInvoiceUnit !== newFirstUnit ||
                        !newUnitIdsSet.has(currentInvoiceUnit || '')
                    )) {
                        invoiceUpdates.unitId = newFirstUnit;
                        invoiceUpdated = true;
                        if (!changes.includes('Unit')) {
                            changes.push('Unit');
                        }
                    }
                    
                    // Update categoryId if sellingPriceCategoryId changed (used for installment invoices)
                    if (updatedAgreement.sellingPriceCategoryId && 
                        invoice.categoryId !== updatedAgreement.sellingPriceCategoryId) {
                        invoiceUpdates.categoryId = updatedAgreement.sellingPriceCategoryId;
                        invoiceUpdated = true;
                        if (!changes.includes('Category')) {
                            changes.push('Category');
                        }
                    }
                    
                    // Apply updates if any changes were made
                    if (invoiceUpdated) {
                        dispatch({ 
                            type: 'UPDATE_INVOICE', 
                            payload: { ...invoice, ...invoiceUpdates } 
                        });
                        updatedInvoiceIds.push(invoice.id);
                    }
                });
                
                // Notify user about invoice updates
                if (updatedInvoiceIds.length > 0) {
                    const invoiceCount = updatedInvoiceIds.length;
                    const changesList = changes.length > 0 ? ` Changes: ${changes.join(', ')}.` : '';
                    showToast(
                        `Updated ${invoiceCount} invoice${invoiceCount !== 1 ? 's' : ''} linked to this agreement.${changesList}`,
                        'info'
                    );
                } else if (linkedInvoices.length > 0) {
                    // Invoices are linked but no updates were needed (already in sync)
                    showToast(
                        `Checked ${linkedInvoices.length} linked invoice${linkedInvoices.length !== 1 ? 's' : ''}. All are already in sync with the agreement.`,
                        'success'
                    );
                }
            }
            
            // Update the agreement
            dispatch({ type: 'UPDATE_PROJECT_AGREEMENT', payload: updatedAgreement });
        } else {
            const project = state.projects.find(p => p.id === projectId);
            
            if (!skipConfigCheck && project && !project.installmentConfig) {
                 setCurrentProjectForConfig(project);
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
            if (projectAgreementSettings && agreementNumber.startsWith(projectAgreementSettings.prefix)) {
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

            // CHECK FOR INSTALLMENT CONFIG
            if (project?.installmentConfig) {
                const confirmGen = await showConfirm(
                    `Project "${project.name}" has an installment plan configured.\n\n` +
                    `Duration: ${project.installmentConfig.durationYears} Years\n` +
                    `Frequency: ${project.installmentConfig.frequency}\n` +
                    `Down Payment: ${project.installmentConfig.downPaymentPercentage}%\n\n` +
                    `Do you want to auto-generate the invoices now?`,
                    { title: 'Auto-Generate Invoices', confirmLabel: 'Generate', cancelLabel: 'Skip' }
                );

                if (confirmGen) {
                    generateInvoices(newAgreement as ProjectAgreement, project.installmentConfig);
                }
            }
        }
        onClose();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (agreementNumberError) return;
        await executeSave(false);
    };

    const handleCreatePlan = () => {
        setShowMissingPlanDialog(false);
        setConfigMode(true);
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
    }

    if (configMode && currentProjectForConfig) {
        return (
            <InstallmentConfigForm 
                project={currentProjectForConfig}
                onSave={handleConfigSave}
                onCancel={onClose}
            />
        );
    }

    return (
        <>
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Top Row: Agreement ID, Date, Owner, Project - 4 cols on lg */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                        <Input label="Agreement ID" value={agreementNumber} onChange={e => setAgreementNumber(e.target.value)} required autoFocus/>
                        {agreementNumberError && <p className="text-red-500 text-xs mt-1">{agreementNumberError}</p>}
                    </div>
                    <DatePicker label="Date" value={issueDate} onChange={d => setIssueDate(d.toISOString().split('T')[0])} required />
                    <ComboBox label="Owner" items={clients} selectedId={clientId} onSelect={item => setClientId(item?.id || '')} placeholder="Select an owner" required allowAddNew={false} />
                    <ComboBox label="Project" items={state.projects} selectedId={projectId} onSelect={item => { setProjectId(item?.id || ''); setUnitIds([]); }} placeholder="Select a project" required allowAddNew={false}/>
                </div>
                
                {/* Units Selection - Replaced Grid with ComboBox + Tag List */}
                <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Units</label>
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 min-h-[4rem]">
                        {/* Selected Units List (Tags) */}
                        <div className="flex flex-wrap gap-2 mb-2">
                            {unitIds.map(id => {
                                const unit = state.units.find(u => u.id === id);
                                if (!unit) return null;
                                return (
                                    <div key={id} className="flex items-center gap-1 bg-white border border-slate-300 text-slate-700 px-2 py-1 rounded-md text-sm shadow-sm animate-fade-in">
                                        <span className="font-medium">{unit.name}</span>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveUnit(id)}
                                            className="text-slate-400 hover:text-rose-500 ml-1 p-0.5 rounded-full transition-colors"
                                        >
                                            <div className="w-3 h-3">{ICONS.x}</div>
                                        </button>
                                    </div>
                                );
                            })}
                            {unitIds.length === 0 && <span className="text-xs text-slate-400 italic py-1.5">No units selected</span>}
                        </div>
                        
                        {/* Unit Search Dropdown */}
                        <ComboBox 
                            items={unitsForSelection} 
                            selectedId="" // Always reset to allow multiple selections
                            onSelect={handleAddUnit} 
                            placeholder={projectId ? "Search and add unit..." : "Select a project first"}
                            disabled={!projectId}
                            allowAddNew={false}
                        />
                    </div>
                </div>

                {/* Pricing Breakdown - Compact Grid */}
                <div className="p-3 border rounded-lg bg-slate-50">
                    <h3 className="font-semibold text-sm text-slate-800 mb-3">Pricing Breakdown</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Input label="List Price" type="text" inputMode="decimal" value={listPrice} onChange={handleAmountChange(setListPrice)} className="text-sm py-1" />
                        <Input label="Cust Disc" type="text" inputMode="decimal" value={customerDiscount} onChange={handleAmountChange(setCustomerDiscount)} className="text-sm py-1" />
                        <Input label="Floor Disc" type="text" inputMode="decimal" value={floorDiscount} onChange={handleAmountChange(setFloorDiscount)} className="text-sm py-1" />
                        <Input label="LumpSum Disc" type="text" inputMode="decimal" value={lumpSumDiscount} onChange={handleAmountChange(setLumpSumDiscount)} className="text-sm py-1" />
                        <Input label="Misc Disc" type="text" inputMode="decimal" value={miscDiscount} onChange={handleAmountChange(setMiscDiscount)} className="text-sm py-1" />
                        <div className="col-span-1 md:col-span-1">
                            <Input
                                label="Selling Price"
                                type="text"
                                inputMode="decimal"
                                value={sellingPrice}
                                required
                                readOnly
                                className="bg-indigo-50 font-bold text-indigo-700 text-sm py-1 border-indigo-200"
                            />
                        </div>
                    </div>
                </div>

                {/* Broker / Rebate - Inline */}
                <div className="flex flex-col md:flex-row gap-4 p-3 border rounded-lg bg-slate-50 items-end">
                     <div className="flex-grow">
                        <ComboBox label="Broker (Rebate)" items={brokers} selectedId={rebateBrokerId} onSelect={item => setRebateBrokerId(item?.id || '')} placeholder="Select broker" allowAddNew={false}/>
                     </div>
                     <div className="w-full md:w-1/3">
                        <Input label="Rebate Amount" type="text" inputMode="decimal" value={rebateAmount} onChange={handleAmountChange(setRebateAmount)} className="text-sm py-1" />
                     </div>
                </div>

                {/* Actions */}
                <div className="flex justify-between items-center pt-2">
                    <div>
                        {agreementToEdit && <Button type="button" variant="danger" onClick={handleDelete}>Delete</Button>}
                    </div>
                    <div className="flex gap-2">
                        {agreementToEdit && (
                            <Button type="button" variant="secondary" onClick={handleManualGenerate} className="bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100">
                                Create Installments
                            </Button>
                        )}
                        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                        <Button type="submit" disabled={!!agreementNumberError}>{agreementToEdit ? 'Update' : 'Save'}</Button>
                    </div>
                </div>
            </form>

            <Modal isOpen={showMissingPlanDialog} onClose={() => setShowMissingPlanDialog(false)} title="Installment Plan Not Configured">
                <div className="space-y-4">
                    <p className="text-slate-600">The selected project does not have an installment plan configured.</p>
                    <p className="text-slate-600 font-medium">Would you like to create a plan now?</p>
                    <p className="text-xs text-slate-500">Creating a plan will discard current agreement changes and redirect you to the configuration screen.</p>
                    
                    <div className="flex flex-col gap-2 pt-2">
                        <Button onClick={handleCreatePlan} className="w-full justify-center">Create Installment Plan</Button>
                        <Button variant="secondary" onClick={handleManualProceed} className="w-full justify-center border-slate-300">Proceed with Manual Installments</Button>
                        <Button variant="ghost" onClick={() => setShowMissingPlanDialog(false)} className="w-full justify-center text-slate-500">Cancel</Button>
                    </div>
                </div>
            </Modal>
        </>
    );
};

export default ProjectAgreementForm;
