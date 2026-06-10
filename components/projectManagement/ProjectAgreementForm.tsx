
import { useDispatchOnly, useProjectReportAppState } from '../../hooks/useSelectiveState';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
import { ProjectAgreement, ContactType, ProjectAgreementStatus, Invoice, InvoiceStatus, InvoiceType, Project, InstallmentFrequency } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import Textarea from '../ui/Textarea';
import FormSectionCard from '../ui/FormSectionCard';
import { useNotification } from '../../context/NotificationContext';
import { usePrintContext } from '../../context/PrintContext';
import type { AgreementPrintData } from '../print/AgreementLayout';
import InstallmentConfigForm from '../settings/InstallmentConfigForm';
import Modal from '../ui/Modal';
import { CURRENCY, ICONS } from '../../constants';
import {
    AlertCircle,
    Calendar,
    CheckCircle2,
    FileCheck,
    FileText,
    Info,
    Loader2,
    Save,
    User,
    Wallet,
    X,
} from 'lucide-react';
import { getFormBackgroundColorStyle } from '../../utils/formColorUtils';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { formatApiErrorMessage } from '../../services/api/client';
import { ProjectAgreementsApiRepository } from '../../services/api/repositories/projectAgreementsApi';
import { useRecordLock, isAdminRole } from '../../hooks/useRecordLock';
import RecordLockBanner from '../recordLock/RecordLockBanner';
import RecordLockConflictModal from '../recordLock/RecordLockConflictModal';
import { parseStoredDateToYyyyMmDdInput, toLocalDateString } from '../../utils/dateUtils';
import { isActiveInvoice } from '../../utils/invoiceActive';

/** Active invoices tied to a project agreement (by agreement_id or legacy unit+project installment link). */
function getLinkedInvoicesForProjectAgreement(agreement: ProjectAgreement, invoices: Invoice[] | undefined): Invoice[] {
    const list = invoices ?? [];
    return list.filter((inv) => {
        if (!isActiveInvoice(inv)) return false;
        if (inv.agreementId === agreement.id) return true;
        if (
            inv.invoiceType === InvoiceType.INSTALLMENT &&
            inv.projectId === agreement.projectId &&
            inv.unitId &&
            agreement.unitIds?.includes(inv.unitId)
        ) {
            return true;
        }
        return false;
    });
}

function numCloseEnough(a: number, b: number, eps = 0.005): boolean {
    return Math.abs(a - b) < eps;
}

function normId(id: string | undefined | null): string | undefined {
    const t = (id ?? '').trim();
    return t || undefined;
}

function sameUnitIds(a: string[] | undefined, b: string[]): boolean {
    const sa = [...(a ?? [])].map((x) => String(x)).sort();
    const sb = [...b].map((x) => String(x)).sort();
    if (sa.length !== sb.length) return false;
    return sa.every((v, i) => v === sb[i]);
}

function installmentPlanEqual(
    a: ProjectAgreement['installmentPlan'],
    b: ProjectAgreement['installmentPlan']
): boolean {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * True when the save payload differs from the stored agreement on any field other than
 * broker/rebate broker and rebate amount (those may be updated while installment invoices exist).
 */
function hasNonBrokerProjectAgreementChanges(
    prev: ProjectAgreement,
    data: {
        agreementNumber: string;
        clientId: string;
        projectId: string;
        unitIds: string[];
        issueDate: string;
        listPrice: number;
        customerDiscount: number;
        floorDiscount: number;
        lumpSumDiscount: number;
        miscDiscount: number;
        sellingPrice: number;
        description: string;
        listPriceCategoryId: string;
        customerDiscountCategoryId: string;
        floorDiscountCategoryId: string;
        lumpSumDiscountCategoryId: string;
        miscDiscountCategoryId: string;
        sellingPriceCategoryId: string;
        rebateCategoryId: string;
        status: ProjectAgreementStatus;
        installmentPlan?: ProjectAgreement['installmentPlan'];
    }
): boolean {
    if (prev.agreementNumber.trim() !== data.agreementNumber.trim()) return true;
    if (normId(prev.clientId) !== normId(data.clientId)) return true;
    if (normId(prev.projectId) !== normId(data.projectId)) return true;
    if (!sameUnitIds(prev.unitIds, data.unitIds)) return true;
    const prevIssue = parseStoredDateToYyyyMmDdInput(prev.issueDate);
    if (prevIssue !== data.issueDate) return true;

    if (!numCloseEnough(prev.listPrice ?? 0, data.listPrice)) return true;
    if (!numCloseEnough(prev.customerDiscount ?? 0, data.customerDiscount)) return true;
    if (!numCloseEnough(prev.floorDiscount ?? 0, data.floorDiscount)) return true;
    if (!numCloseEnough(prev.lumpSumDiscount ?? 0, data.lumpSumDiscount)) return true;
    if (!numCloseEnough(prev.miscDiscount ?? 0, data.miscDiscount)) return true;
    if (!numCloseEnough(prev.sellingPrice ?? 0, data.sellingPrice)) return true;

    if ((prev.description ?? '').trim() !== data.description.trim()) return true;

    if (normId(prev.listPriceCategoryId) !== normId(data.listPriceCategoryId)) return true;
    if (normId(prev.customerDiscountCategoryId) !== normId(data.customerDiscountCategoryId)) return true;
    if (normId(prev.floorDiscountCategoryId) !== normId(data.floorDiscountCategoryId)) return true;
    if (normId(prev.lumpSumDiscountCategoryId) !== normId(data.lumpSumDiscountCategoryId)) return true;
    if (normId(prev.miscDiscountCategoryId) !== normId(data.miscDiscountCategoryId)) return true;
    if (normId(prev.sellingPriceCategoryId) !== normId(data.sellingPriceCategoryId)) return true;
    if (normId(prev.rebateCategoryId) !== normId(data.rebateCategoryId)) return true;

    if (prev.status !== data.status) return true;
    if (!installmentPlanEqual(prev.installmentPlan, data.installmentPlan)) return true;

    return false;
}

interface ProjectAgreementFormProps {
    onClose: () => void;
    agreementToEdit?: ProjectAgreement | null;
    onCancelRequest?: (agreement: ProjectAgreement) => void;
    onSubmittingChange?: (submitting: boolean) => void;
}

const ProjectAgreementForm: React.FC<ProjectAgreementFormProps> = ({ onClose, agreementToEdit, onCancelRequest, onSubmittingChange }) => {
    const state = useProjectReportAppState();
    const dispatch = useDispatchOnly();
    const { showConfirm, showToast, showAlert, showProgress, hideProgress } = useNotification();
    const { print: triggerPrint } = usePrintContext();
    const { projectAgreementSettings, projectInvoiceSettings } = state;

    const recordLock = useRecordLock({
        recordType: 'agreement',
        recordId: agreementToEdit?.id,
        enabled: Boolean(agreementToEdit?.id) && !isLocalOnlyMode(),
        currentUserId: state.currentUser?.id,
        currentUserName: state.currentUser?.name,
        userRole: state.currentUser?.role,
    });

    const handleForceRecordLock = async () => {
        const ok = await showConfirm(
            'Take over editing? The other user may lose unsaved changes.',
            { title: 'Force edit' }
        );
        if (ok) await recordLock.forceTakeover();
    };

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
            return parseStoredDateToYyyyMmDdInput(agreementToEdit.issueDate);
        }
        if (state.enableDatePreservation && state.lastPreservedDate && !agreementToEdit) {
            return state.lastPreservedDate;
        }
        return toLocalDateString(new Date());
    };
    
    const [issueDate, setIssueDate] = useState(getInitialIssueDate());
    
    // Save date to preserved date when changed (if option is enabled)
    const handleIssueDateChange = (date: Date) => {
        const dateStr = toLocalDateString(date);
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
    const [isSaving, setIsSaving] = useState(false);
    useEffect(() => {
        onSubmittingChange?.(isSaving);
    }, [isSaving, onSubmittingChange]);
    const [agreementNumberError, setAgreementNumberError] = useState('');
    const [status, setStatus] = useState<ProjectAgreementStatus>(agreementToEdit?.status || ProjectAgreementStatus.ACTIVE);
    const [installmentPlan, setInstallmentPlan] = useState<{ durationYears: number; downPaymentPercentage: number; frequency: InstallmentFrequency; optionalInstallment?: boolean; optionalInstallmentName?: string } | undefined>(agreementToEdit?.installmentPlan);

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

    const linkedInvoicesForEdit = useMemo(() => {
        if (!agreementToEdit) return [];
        return getLinkedInvoicesForProjectAgreement(agreementToEdit, state.invoices);
    }, [agreementToEdit, state.invoices]);

    /** Installment invoices exist: lock agreement financials / plan; broker (rebate) fields stay editable. */
    const invoiceLockedLayout = Boolean(agreementToEdit) && linkedInvoicesForEdit.length > 0;
    const agreementFieldsDisabled = recordLock.viewOnly || invoiceLockedLayout;
    const brokerFieldsDisabled = recordLock.viewOnly;

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

    /** New agreement only: avoid overwriting manual list price when `state.units` re-renders (sync). */
    const prevNewAgreementUnitIdsKeyRef = useRef<string | null>(null);
    /** True after user edits List Price; cleared when unit selection changes. */
    const userEditedListPriceRef = useRef(false);

    useEffect(() => {
        if (!agreementToEdit) {
            userEditedListPriceRef.current = false;
            prevNewAgreementUnitIdsKeyRef.current = null;
        }
    }, [agreementToEdit]);

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
            // New agreement: sync from unit sale prices when selection changes, or when unit
            // master data updates — unless the user has already typed a list price (do not wipe).
            const unitIdsKey = unitIds.slice().sort().join(',');
            const selectionChanged =
                prevNewAgreementUnitIdsKeyRef.current === null ||
                prevNewAgreementUnitIdsKeyRef.current !== unitIdsKey;
            prevNewAgreementUnitIdsKeyRef.current = unitIdsKey;

            if (selectionChanged) {
                userEditedListPriceRef.current = false;
                setListPrice(calculatedListPrice.toString());
            } else if (!userEditedListPriceRef.current) {
                setListPrice(calculatedListPrice.toString());
            }
        }
        } catch (error) {
            console.error('Error calculating list price:', error);
        }
    }, [unitIds, state.units, agreementToEdit]);

    // Auto-calculate selling price and round up to nearest 1,000 (contract value; balances with total invoices)
    useEffect(() => {
        try {
            const lp = parseFloat(listPrice) || 0;
            const cd = parseFloat(customerDiscount) || 0;
            const fd = parseFloat(floorDiscount) || 0;
            const lsd = parseFloat(lumpSumDiscount) || 0;
            const md = parseFloat(miscDiscount) || 0;
            const calculated = lp - cd - fd - lsd - md;
            const roundedSellingPrice = calculated <= 0 ? 0 : Math.ceil(calculated / 1000) * 1000;
            setSellingPrice(roundedSellingPrice.toString());
        } catch (error) {
            console.error('Error calculating selling price:', error);
        }
    }, [listPrice, customerDiscount, floorDiscount, lumpSumDiscount, miscDiscount]);


    const handleAddUnit = (item: { id: string, name: string } | null) => {
        if (invoiceLockedLayout) return;
        if (item) {
            setUnitIds(prev => [...prev, item.id]);
        }
    };

    const handleRemoveUnit = (idToRemove: string) => {
        if (invoiceLockedLayout) return;
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

    const generateInvoices = async (
        agreement: ProjectAgreement,
        plan: {
            durationYears: number;
            downPaymentPercentage: number;
            frequency: InstallmentFrequency;
            optionalInstallment?: boolean;
            optionalInstallmentName?: string;
        }
    ): Promise<boolean> => {
        try {
            if (!agreement.unitIds?.length) {
                await showAlert(
                    'Cannot generate invoices: this agreement must have at least one unit before generating installments.',
                    { title: 'Missing unit' }
                );
                return false;
            }
            const sp = agreement.sellingPrice ?? 0;
            if (!Number.isFinite(sp) || sp <= 0) {
                await showAlert('Cannot generate invoices: final price (selling price) must be greater than zero.', {
                    title: 'Invalid price',
                });
                return false;
            }
            // Use fallback so we still generate if settings weren't loaded yet (e.g. fresh DB)
            const settings = projectInvoiceSettings || { prefix: 'P-INV-', nextNumber: 1, padding: 5 };
            if (!projectInvoiceSettings) {
                showAlert('Project invoice settings are not configured. Using default (P-INV-). You can configure them in Settings.', { title: 'Using Default Settings' });
            }

            let idSeq = 0;
            const mkInvoiceId = () =>
                `inv_${Date.now()}_${idSeq++}_${Math.random().toString(36).slice(2, 10)}`;

            const ROUND_TO = 10_000;
            const roundToNearest = (value: number, to: number) => Math.round(value / to) * to;

            const { durationYears, downPaymentPercentage, frequency, optionalInstallment, optionalInstallmentName } = plan;
            const totalAmount = agreement.sellingPrice;
            const downPaymentRaw = totalAmount * (downPaymentPercentage / 100);
            const downPayment = downPaymentRaw > 0 ? roundToNearest(downPaymentRaw, ROUND_TO) : 0;
            const remaining = totalAmount - downPayment;

            let freqMonths = 1;
            if (frequency === 'Quarterly') freqMonths = 3;
            if (frequency === 'Yearly') freqMonths = 12;

            const totalRegular = Math.round((durationYears * 12) / freqMonths);
            const includeOptional = !!optionalInstallment;
            const totalSlots = totalRegular + (includeOptional ? 1 : 0);
            // Equal amounts for all slots, rounded to 10k; last slot gets remainder rounded up to 1,000 so total = agreement value
            const baseInstallmentAmount = totalSlots > 0 ? remaining / totalSlots : 0;
            const roundUpToNearest1000 = (value: number) => Math.ceil(value / 1000) * 1000;
            const installmentAmounts: number[] = [];
            if (totalSlots > 0) {
                let allocated = 0;
                for (let i = 0; i < totalSlots; i++) {
                    if (i === totalSlots - 1) {
                        const remainder = remaining - allocated;
                        installmentAmounts.push(roundUpToNearest1000(remainder));
                    } else {
                        const rounded = roundToNearest(baseInstallmentAmount, ROUND_TO);
                        installmentAmounts.push(rounded);
                        allocated += rounded;
                    }
                }
            }

            const invoices: Invoice[] = [];
            
            // determine next invoice number starting point
            let maxNum = settings.nextNumber || 1;
            const prefix = settings.prefix || 'P-INV-';
            const padding = settings.padding || 5;

            // In API mode, client state may omit invoices that exist in PostgreSQL (import, other sessions).
            // Merge server list with local state so numeric suffixes never collide with (tenant_id, invoice_number).
            let invoicesForNumberScan: Invoice[] = state.invoices || [];
            if (!isLocalOnlyMode()) {
                try {
                    const { InvoicesApiRepository } = await import('../../services/api/repositories/invoicesApi');
                    const serverInvoices = await new InvoicesApiRepository().findAll({ includeDeleted: true });
                    const byId = new Map<string, Invoice>();
                    for (const inv of state.invoices || []) {
                        byId.set(inv.id, inv);
                    }
                    for (const inv of serverInvoices) {
                        if (!byId.has(inv.id)) byId.set(inv.id, inv);
                    }
                    invoicesForNumberScan = Array.from(byId.values());
                } catch (fetchErr) {
                    console.warn('Could not load invoices from API for number scan; using local state only.', fetchErr);
                }
            }
            
            // Scan to ensure we don't duplicate if settings are lagging
            if (invoicesForNumberScan && Array.isArray(invoicesForNumberScan)) {
                invoicesForNumberScan.forEach(inv => {
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

            // 2. Regular installments (equal amounts, rounded to 10k; count = totalRegular)
            const baseDate = new Date(agreement.issueDate);
            const originalDay = baseDate.getDate();
            const optionalLabel = (optionalInstallmentName?.trim() || 'On Possession').replace(/\s+/g, ' ');

            for (let i = 1; i <= totalRegular; i++) {
                const amount = installmentAmounts[i - 1] ?? 0;
                if (amount <= 0) continue;

                const targetDate = new Date(baseDate);
                targetDate.setMonth(baseDate.getMonth() + (i * freqMonths));
                if (targetDate.getDate() !== originalDay) targetDate.setDate(0);

                const invNum = `${prefix}${String(nextInvNum).padStart(padding, '0')}`;
                const invDate = toLocalDateString(targetDate);

                invoices.push({
                    id: mkInvoiceId(),
                    invoiceNumber: invNum,
                    contactId: agreement.clientId,
                    invoiceType: InvoiceType.INSTALLMENT,
                    amount,
                    paidAmount: 0,
                    status: InvoiceStatus.UNPAID,
                    issueDate: invDate,
                    dueDate: invDate,
                    description: `Installment ${i}/${totalSlots} - ${agreement.description || ''}`,
                    projectId: agreement.projectId,
                    unitId: agreement.unitIds?.[0],
                    categoryId: agreement.sellingPriceCategoryId,
                    agreementId: agreement.id
                });
                nextInvNum++;
            }

            // 3. Optional installment (e.g. On Possession) – one period after last regular; gets remainder so total = agreement value
            if (includeOptional && (installmentAmounts[totalRegular] ?? 0) > 0) {
                const targetDate = new Date(baseDate);
                targetDate.setMonth(baseDate.getMonth() + ((totalRegular + 1) * freqMonths));
                if (targetDate.getDate() !== originalDay) targetDate.setDate(0);
                const invNum = `${prefix}${String(nextInvNum).padStart(padding, '0')}`;
                const invDate = toLocalDateString(targetDate);
                invoices.push({
                    id: mkInvoiceId(),
                    invoiceNumber: invNum,
                    contactId: agreement.clientId,
                    invoiceType: InvoiceType.INSTALLMENT,
                    amount: installmentAmounts[totalRegular],
                    paidAmount: 0,
                    status: InvoiceStatus.UNPAID,
                    issueDate: invDate,
                    dueDate: invDate,
                    description: `${optionalLabel} - ${agreement.description || ''}`,
                    projectId: agreement.projectId,
                    unitId: agreement.unitIds?.[0],
                    categoryId: agreement.sellingPriceCategoryId,
                    agreementId: agreement.id
                });
                nextInvNum++;
            }

            if (invoices.length === 0) {
                showAlert(
                    'No invoices were generated. Check selling price, installment plan (duration / frequency), and that remaining balance produces at least one installment.',
                    { title: 'Nothing to create' }
                );
                return false;
            }

            if (isLocalOnlyMode()) {
                invoices.forEach(inv => dispatch({ type: 'ADD_INVOICE', payload: inv }));
            } else {
                const { getAppStateApiService } = await import('../../services/api/appStateApi');
                const api = getAppStateApiService();
                for (const inv of invoices) {
                    const saved = await api.saveInvoice(inv);
                    if (!saved?.id) {
                        throw new Error('Server did not return an invoice id. Check API logs and network.');
                    }
                    dispatch({ type: 'ADD_INVOICE', payload: saved, _isRemote: true } as any);
                }
            }

            // Update settings to reflect the consumed numbers
            if (nextInvNum > (settings.nextNumber || 1) && projectInvoiceSettings) {
                dispatch({ 
                    type: 'UPDATE_PROJECT_INVOICE_SETTINGS', 
                    payload: { ...projectInvoiceSettings, nextNumber: nextInvNum } 
                });
            } else if (nextInvNum > (settings.nextNumber || 1)) {
                dispatch({ 
                    type: 'UPDATE_PROJECT_INVOICE_SETTINGS', 
                    payload: { ...settings, nextNumber: nextInvNum } 
                });
            }

            if (isLocalOnlyMode()) {
                showToast(
                    `Saved ${invoices.length} invoice(s) to the local database on this device. They are not written to PostgreSQL. For API/Postgres, set VITE_LOCAL_ONLY=false, run the backend, and sign in.`,
                    'success'
                );
            } else {
                showToast(`Created ${invoices.length} installment invoice(s) on the server.`, 'success');
            }
            return true;
        } catch (error) {
            console.error('Error generating invoices:', error);
            showAlert(`Failed to generate invoices. ${formatApiErrorMessage(error)}`, { title: 'Error' });
            return false;
        }
    };

    const handleManualGenerate = async () => {
        if (!agreementToEdit) return;
        if (recordLock.viewOnly) {
            await showAlert('This agreement is open in view-only mode.', { title: 'Cannot generate' });
            return;
        }

        // Prefer form state: user may have updated installment config but not clicked Update yet.
        // Stale agreementToEdit.installmentPlan (e.g. 10-year plan) would otherwise produce wrong counts.
        const plan = installmentPlan ?? agreementToEdit.installmentPlan;
        if (!plan) {
             await showAlert("Installment plan is not configured for this agreement. Please configure it in the Installment Configuration section above.", { title: "No Configuration" });
             return;
        }

        const existingCount = state.invoices.filter(i => i.agreementId === agreementToEdit.id).length;
        if (existingCount > 0) {
            const confirm = await showConfirm(`This agreement already has ${existingCount} invoices. Generating new ones might create duplicates.\n\nDo you want to proceed?`, { title: "Duplicate Warning", confirmLabel: "Generate Anyway", cancelLabel: "Cancel" });
            if (!confirm) return;
        }

        await generateInvoices(agreementToEdit, plan);
    };

    const handleConfigSave = (config: { durationYears: number; downPaymentPercentage: number; frequency: InstallmentFrequency; optionalInstallment?: boolean; optionalInstallmentName?: string }) => {
        try {
            if (invoiceLockedLayout) {
                void showAlert(
                    'Installment plan cannot be changed while installment invoices exist for this agreement.',
                    { title: 'Plan locked' }
                );
                return;
            }
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

    const validateMandatoryAgreementFields = async (): Promise<boolean> => {
        const sellingPriceNum = parseFloat(sellingPrice) || 0;
        if (!clientId.trim()) {
            await showAlert('Please select an owner.', { title: 'Required fields' });
            return false;
        }
        if (!projectId.trim()) {
            await showAlert('Please select a project.', { title: 'Required fields' });
            return false;
        }
        if (unitIds.length === 0) {
            await showAlert('Please add at least one unit.', { title: 'Required fields' });
            return false;
        }
        if (sellingPriceNum <= 0) {
            await showAlert('Final price (selling price) must be greater than zero.', { title: 'Required fields' });
            return false;
        }
        return true;
    };

    const executeSave = async (skipConfigCheck = false) => {
        try {
            if (agreementToEdit && recordLock.viewOnly) {
                await showAlert('This agreement is open in view-only mode.', { title: 'Cannot save' });
                return;
            }
            const ok = await validateMandatoryAgreementFields();
            if (!ok) return;
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
            if (linkedInvoicesForEdit.length > 0) {
                if (hasNonBrokerProjectAgreementChanges(agreementToEdit, agreementData)) {
                    await showAlert(
                        'This agreement already has installment invoices. Only broker name and rebate amount (broker fee) can be updated. Remove invoices first if you need to change price, units, dates, or installment plan.',
                        { title: 'Limited editing' }
                    );
                    return;
                }
            }

            const updatedAgreement = { ...agreementToEdit, ...agreementData };

            if (isLocalOnlyMode()) {
                dispatch({ type: 'UPDATE_PROJECT_AGREEMENT', payload: updatedAgreement });
            } else {
                try {
                    const projectApi = new ProjectAgreementsApiRepository();
                    const saved = await projectApi.update(agreementToEdit.id, {
                        ...updatedAgreement,
                        agreementNumber: agreementToEdit.agreementNumber,
                        version: agreementToEdit.version,
                    });
                    dispatch({ type: 'UPDATE_PROJECT_AGREEMENT', payload: saved });
                } catch (err: unknown) {
                    const code =
                        err && typeof err === 'object' && 'code' in err ? String((err as { code?: unknown }).code) : '';
                    if (code === 'LOCK_HELD') {
                        await showAlert('Record modified by another user. Please refresh.', { title: 'Save blocked' });
                        return;
                    }
                    const msg =
                        err && typeof err === 'object' && 'message' in err
                            ? String((err as { message?: unknown }).message)
                            : err instanceof Error
                              ? err.message
                              : 'Failed to update agreement';
                    await showAlert(msg);
                    return;
                }
            }
        } else {
            // Check for installment plan configured for this agreement
            if (!skipConfigCheck && !installmentPlan) {
                 setShowMissingPlanDialog(true);
                 return;
            }

            const id = Date.now().toString();
            let newAgreement: ProjectAgreement;

            if (isLocalOnlyMode()) {
                newAgreement = {
                    ...agreementData,
                    id,
                    status: ProjectAgreementStatus.ACTIVE,
                };
                dispatch({
                    type: 'ADD_PROJECT_AGREEMENT',
                    payload: newAgreement,
                });
            } else {
                try {
                    const projectApi = new ProjectAgreementsApiRepository();
                    newAgreement = await projectApi.create({
                        id,
                        ...agreementData,
                        status: ProjectAgreementStatus.ACTIVE,
                        userId: state.currentUser?.id,
                    });
                    dispatch({
                        type: 'ADD_PROJECT_AGREEMENT',
                        payload: newAgreement,
                    });
                } catch (err: unknown) {
                    const msg =
                        err && typeof err === 'object' && 'message' in err
                            ? String((err as { message?: unknown }).message)
                            : err instanceof Error
                              ? err.message
                              : 'Failed to create agreement';
                    await showAlert(msg);
                    return;
                }
            }

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
                const optionalLine = installmentPlan.optionalInstallment
                    ? `\nOptional: ${installmentPlan.optionalInstallmentName || 'On Possession'}`
                    : '';
                const confirmGen = await showConfirm(
                    `Installment plan is configured for this agreement.\n\n` +
                    `Duration: ${installmentPlan.durationYears} Years\n` +
                    `Frequency: ${installmentPlan.frequency}\n` +
                    `Down Payment: ${installmentPlan.downPaymentPercentage}%${optionalLine}\n\n` +
                    `Do you want to auto-generate the invoices now?`,
                    { title: 'Auto-Generate Invoices', confirmLabel: 'Generate', cancelLabel: 'Skip' }
                );

                if (confirmGen) {
                    // Close form immediately (flush so modal unmounts before progress shows), then progress + invoice creation
                    const agreement = newAgreement;
                    const plan = installmentPlan;
                    flushSync(() => {
                        onClose();
                    });
                    showProgress('Creating invoices');
                    setTimeout(() => {
                        void (async () => {
                            try {
                                const generated = await generateInvoices(agreement, plan);
                                if (!generated) {
                                    showAlert('Failed to generate invoices. You can generate from the agreement later.', { title: 'Invoice Generation' });
                                }
                            } finally {
                                hideProgress();
                            }
                        })();
                    }, 0);
                    return;
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
        if (isSaving) return;
        setIsSaving(true);
        try {
            await executeSave(false);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setDescription(e.target.value.slice(0, 500));
    };

    const formatCurrencyDisplay = (value: string | number) => {
        const num = typeof value === 'string' ? parseFloat(value) || 0 : value;
        return `${CURRENCY} ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const sellingPriceNum = parseFloat(sellingPrice) || 0;
    const isFinalPriceValid = sellingPriceNum > 0;

    const handleCreatePlan = () => {
        setShowMissingPlanDialog(false);
        setShowInstallmentConfig(true);
    };

    const handleManualProceed = () => {
        setShowMissingPlanDialog(false);
        executeSave(true);
    };

    const handleDelete = async () => {
        if (!agreementToEdit) return;
        if (recordLock.viewOnly) {
            await showAlert('This agreement is open in view-only mode.', { title: 'Cannot delete' });
            return;
        }
        const linkedInvoices = getLinkedInvoicesForProjectAgreement(agreementToEdit, state.invoices);
        if (linkedInvoices.length > 0) {
            await showAlert(
                `This agreement has ${linkedInvoices.length} associated invoice${linkedInvoices.length !== 1 ? 's' : ''}. ` +
                `Agreements with invoices cannot be deleted. Delete the associated invoices from the Invoices & Payments section first.`,
                { title: 'Cannot Delete Agreement' }
            );
            return;
        }
        const confirmed = await showConfirm('Are you sure you want to delete this agreement?');
        if (confirmed) {
            if (isLocalOnlyMode()) {
                dispatch({ type: 'DELETE_PROJECT_AGREEMENT', payload: agreementToEdit.id });
            } else {
                try {
                    const projectApi = new ProjectAgreementsApiRepository();
                    await projectApi.delete(agreementToEdit.id, agreementToEdit.version);
                    dispatch({ type: 'DELETE_PROJECT_AGREEMENT', payload: agreementToEdit.id });
                } catch (err: unknown) {
                    const msg =
                        err && typeof err === 'object' && 'message' in err
                            ? String((err as { message?: unknown }).message)
                            : err instanceof Error
                              ? err.message
                              : 'Failed to delete agreement';
                    await showAlert(msg);
                    return;
                }
            }
            onClose();
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

    const inputClass =
        'text-sm rounded-lg border-slate-200 focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400';
    const isEditMode = Boolean(agreementToEdit);
    const modalTitle = isEditMode ? 'Edit Project Agreement' : 'New Project Agreement';
    const modalSubtitle = isEditMode
        ? 'Update agreement details and pricing for this project.'
        : 'Create a new agreement and define pricing details for this project.';

    return (
        <>
            <RecordLockConflictModal
                isOpen={recordLock.showConflictModal}
                lockedByName={recordLock.lockedByName ?? 'Another user'}
                isAdmin={isAdminRole(state.currentUser?.role)}
                onViewOnly={recordLock.chooseViewOnly}
                onForceEdit={handleForceRecordLock}
                onDismiss={recordLock.dismissModal}
            />
            <form
                onSubmit={handleSubmit}
                className="flex flex-col h-full min-h-0"
                style={formBackgroundStyle}
                aria-label={modalTitle}
            >
                {/* Header */}
                <header className="flex-shrink-0 pb-5 border-b border-slate-200/80">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div
                                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600 shadow-sm"
                                aria-hidden="true"
                            >
                                <FileCheck className="h-5 w-5" strokeWidth={2} />
                            </div>
                            <div className="min-w-0 flex-1 space-y-2">
                                <div>
                                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                                        {modalTitle}
                                    </h2>
                                    <p className="mt-0.5 text-sm text-slate-500">{modalSubtitle}</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 shadow-sm">
                                        <span className="text-xs font-medium text-violet-600">Agreement ID</span>
                                        <input
                                            type="text"
                                            value={agreementNumber}
                                            onChange={(e) => setAgreementNumber(e.target.value)}
                                            disabled={agreementFieldsDisabled}
                                            autoFocus={!isEditMode}
                                            aria-label="Agreement ID"
                                            aria-invalid={Boolean(agreementNumberError)}
                                            aria-describedby={agreementNumberError ? 'agreement-id-error' : undefined}
                                            className="min-w-[5rem] max-w-[10rem] bg-transparent border-0 p-0 text-sm font-semibold text-violet-900 focus:outline-none focus:ring-0 disabled:opacity-60"
                                        />
                                    </div>
                                    {agreementNumberError && (
                                        <p id="agreement-id-error" className="text-xs text-red-600 w-full" role="alert">
                                            {agreementNumberError}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-shrink-0 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 min-w-[44px] min-h-[44px] flex items-center justify-center"
                            aria-label="Close modal"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {(recordLock.bannerMode === 'self' ||
                        recordLock.bannerMode === 'other' ||
                        (invoiceLockedLayout && !recordLock.viewOnly)) && (
                        <div className="mt-4 space-y-2">
                            {recordLock.bannerMode === 'self' && (
                                <RecordLockBanner mode="self" currentUserName={state.currentUser?.name} />
                            )}
                            {recordLock.bannerMode === 'other' && (
                                <RecordLockBanner mode="other" otherEditorName={recordLock.lockedByName} />
                            )}
                            {invoiceLockedLayout && !recordLock.viewOnly && (
                                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                    This agreement has installment invoices. Owner, project, pricing, dates, and installment
                                    plan are locked. You can still update the broker and the rebate amount (broker fee),
                                    then save.
                                </p>
                            )}
                        </div>
                    )}
                </header>

                {/* Body — 2×2 card grid on desktop, single column on tablet/mobile */}
                <div
                    className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain py-5 ${
                        recordLock.viewOnly ? 'pointer-events-none opacity-[0.88]' : ''
                    }`}
                >
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6">
                        {/* Column 1 */}
                        <div className="flex flex-col gap-5 lg:gap-6 min-w-0">
                            <FormSectionCard
                                id="agreement-info"
                                title="Agreement Information"
                                icon={<Info className="h-4 w-4" strokeWidth={2} />}
                            >
                                <div className="space-y-4">
                                    <DatePicker
                                        label="Date"
                                        value={issueDate}
                                        onChange={handleIssueDateChange}
                                        required
                                        disabled={agreementFieldsDisabled}
                                        className={inputClass}
                                    />
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <ComboBox
                                            label="Owner"
                                            items={clients}
                                            selectedId={clientId}
                                            onSelect={(item) => setClientId(item?.id || '')}
                                            placeholder="Select owner"
                                            required
                                            disabled={agreementFieldsDisabled}
                                            allowAddNew={false}
                                        />
                                        <ComboBox
                                            label="Project"
                                            items={state.projects}
                                            selectedId={projectId}
                                            onSelect={(item) => {
                                                setProjectId(item?.id || '');
                                                setUnitIds([]);
                                            }}
                                            placeholder="Select project"
                                            required
                                            disabled={agreementFieldsDisabled}
                                            allowAddNew={false}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">
                                            Units <span className="text-red-500" aria-hidden="true">*</span>
                                        </label>
                                        <div
                                            className={`min-h-[5.5rem] rounded-xl border p-4 transition-colors ${
                                                projectId
                                                    ? 'border-slate-200 bg-white focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-500/20'
                                                    : 'border-slate-200 bg-slate-50/80 opacity-80'
                                            }`}
                                        >
                                            <div className="flex flex-wrap gap-2 mb-2">
                                                {unitIds.map((id) => {
                                                    const unit = state.units.find((u) => u.id === id);
                                                    if (!unit) return null;
                                                    return (
                                                        <span
                                                            key={id}
                                                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm font-medium text-slate-700"
                                                        >
                                                            {unit.name}
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveUnit(id)}
                                                                disabled={agreementFieldsDisabled}
                                                                className="rounded p-0.5 text-slate-400 transition-colors hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/50 disabled:opacity-40 disabled:pointer-events-none"
                                                                aria-label={`Remove unit ${unit.name}`}
                                                            >
                                                                <X className="h-3.5 w-3.5" />
                                                            </button>
                                                        </span>
                                                    );
                                                })}
                                                {unitIds.length === 0 && (
                                                    <span className="text-sm italic text-slate-400">No units selected</span>
                                                )}
                                            </div>
                                            {!projectId && (
                                                <p className="text-xs text-slate-400 mb-2">
                                                    Select project first to choose units
                                                </p>
                                            )}
                                            <ComboBox
                                                items={unitsForSelection}
                                                selectedId=""
                                                onSelect={handleAddUnit}
                                                placeholder={projectId ? 'Add unit...' : 'Select project first'}
                                                disabled={!projectId || agreementFieldsDisabled}
                                                allowAddNew={false}
                                            />
                                        </div>
                                    </div>
                                    {agreementToEdit && (
                                        <div>
                                            <label htmlFor="agreement-status" className="block text-sm font-medium text-slate-700 mb-2">
                                                Status
                                            </label>
                                            <select
                                                id="agreement-status"
                                                value={status}
                                                onChange={(e) => setStatus(e.target.value as ProjectAgreementStatus)}
                                                disabled={agreementFieldsDisabled}
                                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 disabled:cursor-not-allowed disabled:bg-slate-100"
                                            >
                                                <option value={ProjectAgreementStatus.ACTIVE}>Active</option>
                                                <option value={ProjectAgreementStatus.CANCELLED}>Cancelled</option>
                                                <option value={ProjectAgreementStatus.COMPLETED}>Completed</option>
                                            </select>
                                            {status === ProjectAgreementStatus.CANCELLED &&
                                                agreementToEdit.status !== ProjectAgreementStatus.CANCELLED && (
                                                    <p className="mt-1.5 text-xs text-amber-600">
                                                        Use &quot;Cancel Agreement&quot; below for proper processing.
                                                    </p>
                                                )}
                                        </div>
                                    )}
                                </div>
                            </FormSectionCard>

                            <FormSectionCard
                                id="additional-details"
                                title="Additional Details"
                                icon={<FileText className="h-4 w-4" strokeWidth={2} />}
                            >
                                <div>
                                    <Textarea
                                        label="Notes / Remarks"
                                        value={description}
                                        onChange={handleDescriptionChange}
                                        disabled={agreementFieldsDisabled}
                                        placeholder="Add any additional notes or remarks about this agreement..."
                                        rows={4}
                                        maxLength={500}
                                    />
                                    <p
                                        className="mt-1.5 text-right text-xs text-slate-400 tabular-nums"
                                        aria-live="polite"
                                    >
                                        {description.length} / 500
                                    </p>
                                </div>
                            </FormSectionCard>
                        </div>

                        {/* Column 2 */}
                        <div className="flex flex-col gap-5 lg:gap-6 min-w-0">
                            <FormSectionCard
                                id="pricing-summary"
                                title="Pricing Summary"
                                icon={<Wallet className="h-4 w-4" strokeWidth={2} />}
                            >
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                                        <Input
                                            label="List Price"
                                            type="text"
                                            inputMode="decimal"
                                            value={listPrice}
                                            onChange={(e) => {
                                                userEditedListPriceRef.current = true;
                                                handleAmountChange(setListPrice)(e);
                                            }}
                                            disabled={agreementFieldsDisabled}
                                            className={inputClass}
                                        />
                                        <Input
                                            label="Customer Discount"
                                            type="text"
                                            inputMode="decimal"
                                            value={customerDiscount}
                                            onChange={handleAmountChange(setCustomerDiscount)}
                                            disabled={agreementFieldsDisabled}
                                            className={inputClass}
                                        />
                                        <Input
                                            label="Floor Discount"
                                            type="text"
                                            inputMode="decimal"
                                            value={floorDiscount}
                                            onChange={handleAmountChange(setFloorDiscount)}
                                            disabled={agreementFieldsDisabled}
                                            className={inputClass}
                                        />
                                        <Input
                                            label="Lump Sum"
                                            type="text"
                                            inputMode="decimal"
                                            value={lumpSumDiscount}
                                            onChange={handleAmountChange(setLumpSumDiscount)}
                                            disabled={agreementFieldsDisabled}
                                            className={inputClass}
                                        />
                                        <Input
                                            label="Misc"
                                            type="text"
                                            inputMode="decimal"
                                            value={miscDiscount}
                                            onChange={handleAmountChange(setMiscDiscount)}
                                            disabled={agreementFieldsDisabled}
                                            className={`${inputClass} sm:col-span-2`}
                                        />
                                    </div>

                                    <div className="border-t border-slate-200 pt-4">
                                        <label className="block text-sm font-medium text-slate-700 mb-2">
                                            Final Price (Selling Price){' '}
                                            <span className="text-red-500" aria-hidden="true">*</span>
                                        </label>
                                        <div
                                            className={`rounded-xl border-2 px-4 py-3.5 transition-colors ${
                                                isFinalPriceValid
                                                    ? 'border-emerald-300 bg-emerald-50/80'
                                                    : 'border-amber-300 bg-amber-50/80'
                                            }`}
                                            role="status"
                                            aria-live="polite"
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <span
                                                    className={`text-xl sm:text-2xl font-bold tabular-nums ${
                                                        isFinalPriceValid ? 'text-emerald-700' : 'text-amber-700'
                                                    }`}
                                                >
                                                    {formatCurrencyDisplay(sellingPrice)}
                                                </span>
                                                {isFinalPriceValid ? (
                                                    <CheckCircle2
                                                        className="h-6 w-6 flex-shrink-0 text-emerald-600"
                                                        aria-label="Final price is valid"
                                                    />
                                                ) : (
                                                    <AlertCircle
                                                        className="h-6 w-6 flex-shrink-0 text-amber-600"
                                                        aria-label="Final price must be greater than zero"
                                                    />
                                                )}
                                            </div>
                                            <p className="mt-1 text-xs text-slate-500">
                                                Calculated from list price and discounts; must be greater than zero
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </FormSectionCard>

                            <FormSectionCard
                                id="broker-details"
                                title="Broker Details"
                                icon={<User className="h-4 w-4" strokeWidth={2} />}
                            >
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <ComboBox
                                        label="Broker Name"
                                        items={brokers}
                                        selectedId={rebateBrokerId}
                                        onSelect={(item) => setRebateBrokerId(item?.id || '')}
                                        placeholder="Select broker"
                                        disabled={brokerFieldsDisabled}
                                        allowAddNew={false}
                                    />
                                    <div>
                                        <label htmlFor="rebate-amount" className="block text-sm font-medium text-slate-700 mb-1">
                                            Rebate Amount
                                        </label>
                                        <div className="relative flex rounded-lg border border-slate-200 bg-white focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-500/30">
                                            <input
                                                id="rebate-amount"
                                                type="text"
                                                inputMode="decimal"
                                                value={rebateAmount}
                                                onChange={handleAmountChange(setRebateAmount)}
                                                disabled={brokerFieldsDisabled}
                                                className="block w-full rounded-l-lg border-0 bg-transparent px-3 py-2.5 text-sm tabular-nums focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:bg-slate-100"
                                                aria-label="Rebate amount"
                                            />
                                            <span className="inline-flex items-center rounded-r-lg border-l border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-500">
                                                {CURRENCY}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </FormSectionCard>
                        </div>
                    </div>

                    {/* Installment Plan — full width below grid */}
                    {projectId && clientId && (
                        <div className="mt-5 lg:mt-6">
                            <FormSectionCard
                                id="installment-plan"
                                title="Installment Plan"
                                icon={<Calendar className="h-4 w-4" strokeWidth={2} />}
                                headerAction={
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        onClick={() => setShowInstallmentConfig(!showInstallmentConfig)}
                                        disabled={recordLock.viewOnly || invoiceLockedLayout}
                                        className="!text-xs !py-1.5 !px-3 rounded-lg border-slate-200"
                                    >
                                        {showInstallmentConfig ? 'Hide' : installmentPlan ? 'Edit Plan' : 'Configure'}
                                    </Button>
                                }
                                className={showInstallmentConfig ? 'min-h-[420px]' : ''}
                            >
                                {installmentPlan && !showInstallmentConfig && (
                                    <div className="flex flex-wrap gap-2">
                                        <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700">
                                            {installmentPlan.durationYears} Years
                                        </span>
                                        <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700">
                                            {installmentPlan.downPaymentPercentage}% Down Payment
                                        </span>
                                        <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700">
                                            {installmentPlan.frequency} Installments
                                        </span>
                                        {installmentPlan.optionalInstallment && (
                                            <span className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800">
                                                + {installmentPlan.optionalInstallmentName || 'On Possession'}
                                            </span>
                                        )}
                                    </div>
                                )}
                                {!installmentPlan && !showInstallmentConfig && (
                                    <p className="text-sm text-slate-500">
                                        No installment plan configured. Click Configure to set up payment terms.
                                    </p>
                                )}
                                {showInstallmentConfig && (
                                    <div className="mt-2 min-h-[320px] overflow-y-auto overflow-x-hidden rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                                        <InstallmentConfigForm
                                            config={installmentPlan}
                                            onSave={handleConfigSave}
                                            onCancel={() => setShowInstallmentConfig(false)}
                                        />
                                    </div>
                                )}
                            </FormSectionCard>
                        </div>
                    )}
                </div>

                {/* Sticky footer */}
                <footer className="flex-shrink-0 border-t border-slate-200/80 bg-white/95 backdrop-blur-sm pt-4 mt-auto pointer-events-auto">
                    <div className="mb-4 flex items-center gap-2 rounded-lg border border-violet-100 bg-violet-50/80 px-3 py-2.5 text-sm text-violet-800">
                        <Info className="h-4 w-4 flex-shrink-0 text-violet-600" aria-hidden="true" />
                        <span>Fields marked with * are required.</span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-2">
                            {agreementToEdit && (
                                <Button
                                    type="button"
                                    variant="danger"
                                    onClick={handleDelete}
                                    disabled={recordLock.viewOnly || isSaving}
                                    className="!text-sm !py-2 !px-4 rounded-lg"
                                >
                                    Delete
                                </Button>
                            )}
                            {agreementToEdit &&
                                agreementToEdit.status === ProjectAgreementStatus.ACTIVE &&
                                onCancelRequest && (
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        onClick={() => onCancelRequest(agreementToEdit)}
                                        disabled={recordLock.viewOnly || isSaving}
                                        className="!text-sm !py-2 !px-4 rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50"
                                    >
                                        Cancel Agreement
                                    </Button>
                                )}
                        </div>
                        <div className="flex flex-wrap gap-2 justify-end ml-auto">
                            {agreementToEdit && (
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={handleManualGenerate}
                                    disabled={recordLock.viewOnly || invoiceLockedLayout || isSaving}
                                    className="!text-sm !py-2 !px-4 rounded-lg"
                                >
                                    Create Installments
                                </Button>
                            )}
                            {agreementToEdit && agreementPrintData && (
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => triggerPrint('AGREEMENT', agreementPrintData)}
                                    disabled={isSaving}
                                    className="!text-sm !py-2 !px-4 rounded-lg flex items-center gap-2"
                                >
                                    {ICONS.print && (
                                        <span className="w-4 h-4 [&>svg]:w-full [&>svg]:h-full">{ICONS.print}</span>
                                    )}
                                    Print
                                </Button>
                            )}
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={onClose}
                                disabled={isSaving}
                                className="!text-sm !py-2 !px-4 rounded-lg border-slate-200"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={
                                    !!agreementNumberError ||
                                    (Boolean(agreementToEdit) && recordLock.viewOnly) ||
                                    isSaving
                                }
                                className="!text-sm !py-2.5 !px-5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white border-0 shadow-sm"
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                        <span>Saving…</span>
                                    </>
                                ) : (
                                    <>
                                        <Save className="h-4 w-4" aria-hidden="true" />
                                        <span>{agreementToEdit ? 'Update Agreement' : 'Save Agreement'}</span>
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </footer>
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
