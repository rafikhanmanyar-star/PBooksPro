
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Contact, TransactionType, Transaction, AccountType, Category, Invoice, InvoiceStatus, InvoiceType, RentalAgreementStatus } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import DatePicker from '../ui/DatePicker';
import Button from '../ui/Button';
import { CURRENCY, ICONS } from '../../constants';
import ComboBox from '../ui/ComboBox';
import { useNotification } from '../../context/NotificationContext';
import { WhatsAppService, sendOrOpenWhatsApp } from '../../services/whatsappService';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { parseStoredDateToYyyyMmDdInput, toLocalDateString, formatDate } from '../../utils/dateUtils';

export interface PropertyBalanceItem {
    propertyId: string;
    propertyName: string;
    balanceDue: number;
    /** When set, this row pays out to that owner (Rent mode; former + current on same unit). */
    payeeOwnerId?: string;
    payeeOwnerName?: string;
}

interface OwnerPayoutRow {
    propertyId: string;
    propertyName: string;
    buildingId: string;
    buildingName: string;
    balanceDue: number;
    paymentAmount: number;
    isSelected: boolean;
    payeeOwnerId: string;
    payeeOwnerName: string;
}

interface InvoiceAdjustmentRow {
    invoiceId: string;
    invoiceNumber: string;
    dueDate: string;
    rentalMonth?: string;
    totalAmount: number;
    outstanding: number;
    adjustAmount: number;
    isSelected: boolean;
}

interface OwnerPayoutModalProps {
    isOpen: boolean;
    onClose: () => void;
    owner: Contact | null;
    balanceDue: number;
    payoutType?: 'Rent' | 'Security';
    preSelectedBuildingId?: string;
    transactionToEdit?: Transaction;
    /** Per-property amounts so user can select which property(ies) to pay */
    propertyBreakdown?: PropertyBalanceItem[];
    /** Tenant contact for security refund-to-tenant option */
    tenant?: Contact | null;
    /** Tenant's total unpaid invoice amount for security adjustment option */
    tenantUnpaidAmount?: number;
}

const OwnerPayoutModal: React.FC<OwnerPayoutModalProps> = ({ isOpen, onClose, owner, balanceDue, payoutType = 'Rent', preSelectedBuildingId, transactionToEdit, propertyBreakdown = [], tenant, tenantUnpaidAmount = 0 }) => {
    const { state, dispatch } = useAppContext();
    const { showAlert, showToast } = useNotification();
    const { openChat } = useWhatsApp();

    const isEditMode = !!transactionToEdit;
    const showPropertyTable = propertyBreakdown.length > 0 && !isEditMode;
    const isSecurityMode = payoutType === 'Security';

    const [items, setItems] = useState<OwnerPayoutRow[]>([]);
    const [amount, setAmount] = useState('0');
    const [date, setDate] = useState(toLocalDateString(new Date()));
    const [accountId, setAccountId] = useState('');
    const [buildingId, setBuildingId] = useState('');
    const [reference, setReference] = useState('');
    const [notes, setNotes] = useState('');
    const [error, setError] = useState('');
    const [showWhatsAppConfirm, setShowWhatsAppConfirm] = useState(false);
    const [lastPaidAmount, setLastPaidAmount] = useState(0);
    const [lastReference, setLastReference] = useState('');
    const [whatsAppPayee, setWhatsAppPayee] = useState<Contact | null>(null);
    const [securityAllocations, setSecurityAllocations] = useState<{ owner: number; tenant: number; adjust: number }>({ owner: 0, tenant: 0, adjust: 0 });
    const [invoiceAdjustments, setInvoiceAdjustments] = useState<InvoiceAdjustmentRow[]>([]);

    const userSelectableAccounts = useMemo(() => state.accounts.filter(a => a.type === AccountType.BANK && a.name !== 'Internal Clearing'), [state.accounts]);
    const buildingsForOwner = useMemo(() => {
        if (!owner) return [];
        const ownerPropertyBuildingIds = new Set(
            state.properties.filter(p => p.ownerId === owner.id).map(p => p.buildingId)
        );
        return state.buildings.filter(b => ownerPropertyBuildingIds.has(b.id));
    }, [owner, state.properties, state.buildings]);

    const singlePropertyId = useMemo(() => {
        return propertyBreakdown.length === 1 ? propertyBreakdown[0].propertyId : undefined;
    }, [propertyBreakdown]);

    /** When parent omits `tenant`, infer tenant from active agreement, unpaid rental invoices, or latest lease on the unit. */
    const effectiveTenant = useMemo((): Contact | null => {
        if (tenant) return tenant;
        if (!isSecurityMode || !singlePropertyId) return null;
        const pid = String(singlePropertyId);

        const activeAgreement = state.rentalAgreements.find(
            ra => String(ra.propertyId) === pid && ra.status === RentalAgreementStatus.ACTIVE
        );
        if (activeAgreement) {
            return state.contacts.find(c => c.id === activeAgreement.contactId) ?? null;
        }

        const outstandingByContact = new Map<string, number>();
        for (const inv of state.invoices) {
            if (String(inv.propertyId) !== pid) continue;
            if (inv.invoiceType !== InvoiceType.RENTAL) continue;
            if (inv.securityDepositCharge && inv.securityDepositCharge > 0) continue;
            if (inv.status === InvoiceStatus.PAID || inv.status === InvoiceStatus.DRAFT) continue;
            const out = inv.amount - (inv.paidAmount || 0);
            if (out <= 0.01) continue;
            outstandingByContact.set(inv.contactId, (outstandingByContact.get(inv.contactId) || 0) + out);
        }
        if (outstandingByContact.size >= 1) {
            let bestId = '';
            let bestAmt = 0;
            outstandingByContact.forEach((amt, id) => {
                if (amt > bestAmt) {
                    bestAmt = amt;
                    bestId = id;
                }
            });
            if (bestId) return state.contacts.find(c => c.id === bestId) ?? null;
        }

        const forProperty = state.rentalAgreements.filter(ra => String(ra.propertyId) === pid);
        const candidates = forProperty.filter(ra => ra.status !== RentalAgreementStatus.RENEWED);
        const pool = candidates.length > 0 ? candidates : forProperty;
        if (pool.length === 0) return null;
        const sorted = [...pool].sort((a, b) => {
            const ta = new Date(a.endDate || a.startDate).getTime();
            const tb = new Date(b.endDate || b.startDate).getTime();
            return tb - ta;
        });
        const latest = sorted[0];
        return latest ? state.contacts.find(c => c.id === latest.contactId) ?? null : null;
    }, [tenant, isSecurityMode, singlePropertyId, state.rentalAgreements, state.invoices, state.contacts]);

    const unpaidPropertyInvoices = useMemo(() => {
        if (!isOpen || !singlePropertyId) return [];
        return state.invoices
            .filter(inv =>
                String(inv.propertyId) === String(singlePropertyId) &&
                inv.invoiceType === InvoiceType.RENTAL &&
                !(inv.securityDepositCharge && inv.securityDepositCharge > 0) &&
                inv.status !== InvoiceStatus.PAID &&
                inv.status !== InvoiceStatus.DRAFT &&
                inv.amount - (inv.paidAmount || 0) > 0.01
            )
            .sort((a, b) => new Date(a.dueDate || a.issueDate).getTime() - new Date(b.dueDate || b.issueDate).getTime());
    }, [isOpen, singlePropertyId, state.invoices]);

    const computedUnpaidRentalTotal = useMemo(
        () => unpaidPropertyInvoices.reduce((s, inv) => s + (inv.amount - (inv.paidAmount || 0)), 0),
        [unpaidPropertyInvoices]
    );
    const effectiveTenantUnpaidAmount = tenantUnpaidAmount > 0.01 ? tenantUnpaidAmount : computedUnpaidRentalTotal;

    const prevIsOpenRef = useRef(false);
    useEffect(() => {
        if (isOpen && !prevIsOpenRef.current) {
            setShowWhatsAppConfirm(false);
            setWhatsAppPayee(null);
        }
        prevIsOpenRef.current = isOpen;
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        if (isEditMode && transactionToEdit) {
                setAmount(String(transactionToEdit.amount));
                setDate(parseStoredDateToYyyyMmDdInput(transactionToEdit.date));
                setAccountId(transactionToEdit.accountId || '');
                setBuildingId(transactionToEdit.buildingId || preSelectedBuildingId || '');
                setItems([]);
                const desc = transactionToEdit.description || '';
                const refMatch = desc.match(/\(Ref:\s*([^)]+)\)/);
                if (refMatch) setReference(refMatch[1].trim());
                const notesMatch = desc.match(/-\s*([^-]+?)(?:\s*\(Ref:|$)/);
                if (notesMatch) setNotes(notesMatch[1].trim());
                else {
                    const prefixMatch = desc.match(/^(?:Owner Payout|Security Deposit Payout)\s+to\s+[^-]+/);
                    if (prefixMatch) {
                        const remaining = desc.substring(prefixMatch[0].length).trim();
                        if (remaining && !remaining.startsWith('(') && !remaining.startsWith('[')) setNotes(remaining);
                    }
                }
            } else {
                setDate(toLocalDateString(new Date()));
                const cashAccount = userSelectableAccounts.find(a => a.name === 'Cash');
                setAccountId(cashAccount?.id || userSelectableAccounts[0]?.id || '');
                setBuildingId(preSelectedBuildingId || '');
                setReference('');
                setNotes('');
                if (isSecurityMode) {
                    setSecurityAllocations({ owner: balanceDue, tenant: 0, adjust: 0 });
                    setInvoiceAdjustments(unpaidPropertyInvoices.map(inv => ({
                        invoiceId: inv.id,
                        invoiceNumber: inv.invoiceNumber,
                        dueDate: inv.dueDate,
                        rentalMonth: inv.rentalMonth,
                        totalAmount: inv.amount,
                        outstanding: inv.amount - (inv.paidAmount || 0),
                        adjustAmount: 0,
                        isSelected: false,
                    })));
                }
                if (propertyBreakdown.length > 0 && owner) {
                    const sumDue = propertyBreakdown.reduce((s, p) => s + (p.balanceDue || 0), 0);
                    const useTotalForFirst = sumDue < 0.01 && balanceDue > 0.01 && propertyBreakdown.length > 0;
                    const shortfall = balanceDue > sumDue ? balanceDue - sumDue : 0;
                    let shortfallApplied = false;
                    const newItems: OwnerPayoutRow[] = propertyBreakdown.map((p, idx) => {
                        const prop = state.properties.find(pr => String(pr.id) === String(p.propertyId));
                        const building = prop?.buildingId ? state.buildings.find(b => b.id === prop.buildingId) : null;
                        const payeeOwnerId = p.payeeOwnerId ?? owner.id;
                        const payeeOwnerName = p.payeeOwnerName ?? owner.name;
                        let due = useTotalForFirst && idx === 0 ? balanceDue : (p.balanceDue || 0);
                        if (shortfall > 0.01 && !shortfallApplied && payeeOwnerId === owner.id) {
                            due += shortfall;
                            shortfallApplied = true;
                        }
                        const hasDue = due > 0.01;
                        const multiPayeeRow = !!(p.payeeOwnerId && p.payeeOwnerId !== owner.id);
                        const defaultSelected = hasDue && (multiPayeeRow || payeeOwnerId === owner.id);
                        return {
                            propertyId: p.propertyId,
                            propertyName: p.propertyName,
                            buildingId: prop?.buildingId || '',
                            buildingName: building?.name || '—',
                            balanceDue: due,
                            paymentAmount: due,
                            isSelected: payoutType === 'Rent' ? defaultSelected : hasDue,
                            payeeOwnerId,
                            payeeOwnerName,
                        };
                    });
                    setItems(newItems);
                } else {
                    setItems([]);
                    setAmount(String(balanceDue));
                }
            }
            setError('');
    }, [isOpen, balanceDue, userSelectableAccounts, preSelectedBuildingId, isEditMode, transactionToEdit, propertyBreakdown, state.properties, state.buildings, isSecurityMode, unpaidPropertyInvoices, payoutType, owner]);

    const totalToPay = items.filter(i => i.isSelected).reduce((sum, i) => sum + i.paymentAmount, 0);
    const invoiceAdjustTotal = invoiceAdjustments.filter(r => r.isSelected).reduce((s, r) => s + r.adjustAmount, 0);

    useEffect(() => {
        if (isSecurityMode && !isEditMode) {
            setSecurityAllocations(prev => {
                if (Math.abs(prev.adjust - invoiceAdjustTotal) > 0.001) {
                    return { ...prev, adjust: invoiceAdjustTotal };
                }
                return prev;
            });
        }
    }, [invoiceAdjustTotal, isSecurityMode, isEditMode]);

    const handleToggle = (index: number) => {
        const newItems = [...items];
        newItems[index].isSelected = !newItems[index].isSelected;
        setItems(newItems);
    };

    const handleAmountChange = (index: number, val: string) => {
        const newItems = [...items];
        const num = parseFloat(val);
        newItems[index].paymentAmount = isNaN(num) ? 0 : Math.max(0, num);
        setItems(newItems);
    };

    const handleInvoiceToggle = (idx: number) => {
        setInvoiceAdjustments(prev => {
            const updated = [...prev];
            const row = { ...updated[idx] };
            row.isSelected = !row.isSelected;
            if (row.isSelected && row.adjustAmount === 0) {
                const currentTotal = updated.filter((r, i) => i !== idx && r.isSelected).reduce((s, r) => s + r.adjustAmount, 0);
                const remainingSecurity = Math.max(0, balanceDue - securityAllocations.owner - securityAllocations.tenant - currentTotal);
                row.adjustAmount = Math.min(row.outstanding, remainingSecurity);
            } else if (!row.isSelected) {
                row.adjustAmount = 0;
            }
            updated[idx] = row;
            return updated;
        });
    };

    const handleInvoiceAmountChange = (idx: number, val: string) => {
        setInvoiceAdjustments(prev => {
            const updated = [...prev];
            const row = { ...updated[idx] };
            const num = parseFloat(val);
            row.adjustAmount = isNaN(num) ? 0 : Math.max(0, Math.min(num, row.outstanding));
            if (row.adjustAmount > 0 && !row.isSelected) row.isSelected = true;
            if (row.adjustAmount === 0 && row.isSelected) row.isSelected = false;
            updated[idx] = row;
            return updated;
        });
    };

    const autoFillInvoiceAdjustments = () => {
        let remaining = Math.min(balanceDue - securityAllocations.owner - securityAllocations.tenant, effectiveTenantUnpaidAmount);
        if (remaining <= 0.01) return;
        setInvoiceAdjustments(prev => prev.map(row => {
            if (remaining <= 0.01) return { ...row, adjustAmount: 0, isSelected: false };
            const apply = Math.min(remaining, row.outstanding);
            remaining -= apply;
            return { ...row, adjustAmount: apply, isSelected: true };
        }));
    };

    const clearInvoiceAdjustments = () => {
        setInvoiceAdjustments(prev => prev.map(row => ({ ...row, adjustAmount: 0, isSelected: false })));
    };

    const selectAllItems = () => {
        setItems(prev => prev.map(i => ({ ...i, isSelected: true })));
    };

    const clearAllItems = () => {
        setItems(prev => prev.map(i => ({ ...i, isSelected: false })));
    };

    useEffect(() => {
        if (isSecurityMode && !isEditMode) {
            const total = securityAllocations.owner + securityAllocations.tenant + invoiceAdjustTotal;
            if (total <= 0) {
                setError('Enter a positive amount for at least one option.');
            } else if (total > balanceDue + 0.01) {
                setError(`Total allocations (${CURRENCY} ${total.toLocaleString()}) exceed the security balance of ${CURRENCY} ${balanceDue.toLocaleString()}.`);
            } else if (securityAllocations.tenant > 0.01 && !effectiveTenant) {
                setError('No tenant found for this property to refund.');
            } else if (invoiceAdjustTotal > 0.01 && !effectiveTenant) {
                setError('No tenant found for invoice adjustment.');
            } else if (invoiceAdjustTotal > 0.01 && unpaidPropertyInvoices.length === 0) {
                setError('No unpaid invoices to adjust against.');
            } else {
                const overAllocated = invoiceAdjustments.find(r => r.adjustAmount > r.outstanding + 0.01);
                if (overAllocated) {
                    setError(`Amount for invoice ${overAllocated.invoiceNumber} exceeds its outstanding balance.`);
                } else {
                    setError('');
                }
            }
        } else if (showPropertyTable) {
            if (items.filter(i => i.isSelected).length === 0) {
                setError('Select at least one property to pay.');
            } else if (totalToPay <= 0) {
                setError('Enter a positive amount in Pay Now for at least one selected property.');
            } else {
                setError('');
            }
        } else if (!isEditMode) {
            const numericAmount = parseFloat(amount) || 0;
            if (numericAmount > balanceDue + 0.01) setError(`Amount cannot exceed the balance of ${CURRENCY} ${balanceDue.toLocaleString()}.`);
            else if (numericAmount <= 0) setError('Amount must be positive.');
            else setError('');
        }
    }, [showPropertyTable, items, totalToPay, amount, balanceDue, isEditMode, isSecurityMode, securityAllocations, effectiveTenant, tenantUnpaidAmount, invoiceAdjustTotal, invoiceAdjustments, unpaidPropertyInvoices]);

    const getPayoutCategory = (mode?: 'owner' | 'tenant' | 'adjust'): Category | null => {
        if (payoutType === 'Security') {
            if (mode === 'tenant') {
                let refCat = state.categories.find(c => c.name === 'Security Deposit Refund');
                if (!refCat) {
                    const newCat: Category = {
                        id: `cat-sec-dep-ref-${Date.now()}`,
                        name: 'Security Deposit Refund',
                        type: TransactionType.EXPENSE,
                        isPermanent: true,
                        isRental: true,
                        description: 'Refund of security deposit to tenant.'
                    };
                    dispatch({ type: 'ADD_CATEGORY', payload: newCat });
                    refCat = newCat;
                }
                return refCat;
            }
            let secCat = state.categories.find(c => c.name === 'Owner Security Payout');
            if (!secCat) {
                const newCat: Category = {
                    id: `cat-own-sec-pay-${Date.now()}`,
                    name: 'Owner Security Payout',
                    type: TransactionType.EXPENSE,
                    isPermanent: true,
                    isRental: true,
                    description: 'Payout of held security deposits to property owners.'
                };
                dispatch({ type: 'ADD_CATEGORY', payload: newCat });
                secCat = newCat;
            }
            return secCat;
        }
        return state.categories.find(c => c.name === 'Owner Payout') || null;
    };

    const securityTotal = securityAllocations.owner + securityAllocations.tenant + invoiceAdjustTotal;

    const handleSubmit = async () => {
        if (error || !owner) return;

        const payoutAccount = state.accounts.find(a => a.id === accountId);
        if (!payoutAccount) {
            await showAlert(`Error: Please select a valid account to pay from.`);
            return;
        }

        // --- Security mode: create separate transactions per allocation ---
        if (isSecurityMode && !isEditMode) {
            const allTxs: Transaction[] = [];
            const baseId = Date.now();
            const descSuffix = (notes ? ` - ${notes}` : '') + (reference ? ` (Ref: ${reference})` : '');
            const singleProp = propertyBreakdown.length === 1 ? propertyBreakdown[0] : null;
            const prop = singleProp ? state.properties.find(p => p.id === singleProp.propertyId) : null;
            const propBuildingId = prop?.buildingId || buildingId || preSelectedBuildingId || '';
            const propLabel = singleProp ? ` [${singleProp.propertyName}]` : '';

            if (securityAllocations.owner > 0.01) {
                const cat = getPayoutCategory('owner');
                if (!cat) { await showAlert("'Owner Security Payout' category not found."); return; }
                allTxs.push({
                    type: TransactionType.EXPENSE, amount: securityAllocations.owner, date,
                    description: `Security Deposit Payout to ${owner.name}${descSuffix}${propLabel}`,
                    accountId: payoutAccount.id, contactId: owner.id, categoryId: cat.id,
                    buildingId: propBuildingId || undefined, propertyId: singleProp?.propertyId,
                    ownerId: owner.id,
                    id: `tx-${baseId}-own`,
                });
            }
            if (securityAllocations.tenant > 0.01 && effectiveTenant) {
                const cat = getPayoutCategory('tenant');
                if (!cat) { await showAlert("'Security Deposit Refund' category not found."); return; }
                allTxs.push({
                    type: TransactionType.EXPENSE, amount: securityAllocations.tenant, date,
                    description: `Security Deposit Refund to ${effectiveTenant.name}${descSuffix}${propLabel}`,
                    accountId: payoutAccount.id, contactId: effectiveTenant.id, categoryId: cat.id,
                    buildingId: propBuildingId || undefined, propertyId: singleProp?.propertyId,
                    id: `tx-${baseId}-ten`,
                });
            }
            if (invoiceAdjustTotal > 0.01 && effectiveTenant) {
                const selectedAdjustments = invoiceAdjustments.filter(r => r.isSelected && r.adjustAmount > 0.01);
                const rentCat = state.categories.find(c => c.name === 'Rent' || c.name === 'Rental Income');
                const secDepCat = state.categories.find(c => c.name === 'Security Deposit');
                const rentCatId = rentCat?.id || secDepCat?.id || '';

                for (const adj of selectedAdjustments) {
                    const inv = state.invoices.find(i => i.id === adj.invoiceId);
                    if (!inv) continue;

                    const monthLabel = adj.rentalMonth || formatDate(adj.dueDate);
                    allTxs.push({
                        type: TransactionType.INCOME, amount: adj.adjustAmount, date,
                        description: `Rent payment (from security deposit) for ${monthLabel} — Invoice ${adj.invoiceNumber}${descSuffix}${propLabel}`,
                        accountId: payoutAccount.id, contactId: effectiveTenant.id, categoryId: rentCatId,
                        buildingId: propBuildingId || undefined, propertyId: singleProp?.propertyId,
                        invoiceId: inv.id,
                        id: `tx-${baseId}-adj-${inv.id.slice(-5)}`,
                    });

                    const updatedInv = { ...inv, paidAmount: (inv.paidAmount || 0) + adj.adjustAmount };
                    if (updatedInv.paidAmount >= updatedInv.amount - 0.01) {
                        updatedInv.status = InvoiceStatus.PAID;
                    } else {
                        updatedInv.status = InvoiceStatus.PARTIALLY_PAID;
                    }
                    dispatch({ type: 'UPDATE_INVOICE', payload: updatedInv });
                }

                const refCat = getPayoutCategory('tenant');
                if (refCat) {
                    allTxs.push({
                        type: TransactionType.EXPENSE, amount: invoiceAdjustTotal, date,
                        description: `Security deposit used for rent payment — ${selectedAdjustments.length} invoice(s) adjusted${descSuffix}${propLabel}`,
                        accountId: payoutAccount.id, contactId: effectiveTenant.id, categoryId: refCat.id,
                        buildingId: propBuildingId || undefined, propertyId: singleProp?.propertyId,
                        id: `tx-${baseId}-adj-exp`,
                    });
                }
            }

            if (allTxs.length === 0) {
                await showAlert('Enter a positive amount for at least one payout option.');
                return;
            }
            dispatch({ type: 'BATCH_ADD_TRANSACTIONS', payload: allTxs });
            const totalPaid = allTxs.filter(t => t.type === TransactionType.EXPENSE).reduce((s, t) => s + t.amount, 0);
            showToast(`Security deposit processed (${allTxs.length} transaction${allTxs.length > 1 ? 's' : ''}).`, 'success');
            setLastPaidAmount(totalPaid);
            setLastReference(reference);
            setWhatsAppPayee(owner);
            setShowWhatsAppConfirm(true);
            return;
        }

        const payoutCategory = payoutType === 'Security' ? getPayoutCategory() : state.categories.find(c => c.name === 'Owner Payout');
        if (!payoutCategory) {
            await showAlert("Critical: 'Owner Payout' category not found. Please check Rental Settings.");
            return;
        }

        const descriptionSuffix = (notes ? ` - ${notes}` : '') + (reference ? ` (Ref: ${reference})` : '');

        const buildTransaction = (opts: {
            amount: number;
            propertyId?: string;
            buildingId?: string;
            descriptionExtra?: string;
            id?: string;
            payeeId: string;
            payeeName: string;
        }): Transaction => {
            const baseDescription = `${payoutType === 'Security' ? 'Security Deposit Payout' : 'Owner Payout'} to ${opts.payeeName}`;
            let desc = baseDescription + descriptionSuffix;
            if (opts.descriptionExtra) desc += ` ${opts.descriptionExtra}`;
            else if (opts.buildingId) {
                const bName = state.buildings.find(b => b.id === opts.buildingId)?.name;
                if (bName) desc += ` [${bName}]`;
            }
            return {
                type: TransactionType.EXPENSE,
                amount: opts.amount,
                date,
                description: desc,
                accountId: payoutAccount.id,
                contactId: opts.payeeId,
                categoryId: payoutCategory.id,
                buildingId: opts.buildingId || undefined,
                propertyId: opts.propertyId,
                ownerId: opts.payeeId,
                id: opts.id ?? `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            };
        };

        if (isEditMode) {
            const payoutTransaction = buildTransaction({
                amount: parseFloat(amount),
                buildingId: buildingId || undefined,
                propertyId: transactionToEdit?.propertyId,
                payeeId: owner.id,
                payeeName: owner.name,
            });
            payoutTransaction.id = transactionToEdit!.id;
            dispatch({ type: 'UPDATE_TRANSACTION', payload: payoutTransaction });
            showToast(`${payoutType} payout updated successfully.`, 'success');
            onClose();
            return;
        }

        if (showPropertyTable && items.length > 0) {
            const selectedRows = items.filter(i => i.isSelected && i.paymentAmount > 0);
            if (selectedRows.length === 0) {
                await showAlert('Select at least one property and enter an amount to pay.');
                return;
            }
            const baseId = Date.now();
            const transactions: Transaction[] = selectedRows.map((row, i) =>
                buildTransaction({
                    amount: row.paymentAmount,
                    propertyId: row.propertyId,
                    buildingId: row.buildingId || undefined,
                    descriptionExtra: `[${row.propertyName}]`,
                    id: `tx-${baseId}-${i}`,
                    payeeId: row.payeeOwnerId,
                    payeeName: row.payeeOwnerName,
                })
            );
            dispatch({ type: 'BATCH_ADD_TRANSACTIONS', payload: transactions });
            showToast(`${payoutType} payout recorded for ${transactions.length} propert${transactions.length === 1 ? 'y' : 'ies'}.`, 'success');
            const totalPaid = transactions.reduce((s, t) => s + t.amount, 0);
            setLastPaidAmount(totalPaid);
            setLastReference(reference);
            const distinctPayees = [...new Set(selectedRows.map(r => r.payeeOwnerId))];
            if (distinctPayees.length === 1) {
                const payee = state.contacts.find(c => c.id === distinctPayees[0]) || owner;
                setWhatsAppPayee(payee);
                setShowWhatsAppConfirm(true);
            } else {
                setWhatsAppPayee(null);
                onClose();
            }
            return;
        }

        if (!buildingId && !preSelectedBuildingId) {
            const singleProp = propertyBreakdown.length === 1 ? propertyBreakdown[0] : null;
            const propBuildingId = singleProp ? state.properties.find(p => p.id === singleProp.propertyId)?.buildingId : undefined;
            if (!propBuildingId) {
                await showAlert('Please assign a building to this payout.');
                return;
            }
        }

        const singlePropertyId = propertyBreakdown.length === 1 ? propertyBreakdown[0].propertyId : undefined;
        const singleProp = propertyBreakdown.length === 1 ? state.properties.find(p => p.id === propertyBreakdown[0].propertyId) : null;
        const payoutTransaction = buildTransaction({
            amount: parseFloat(amount),
            buildingId: buildingId || preSelectedBuildingId || singleProp?.buildingId,
            propertyId: singlePropertyId,
            payeeId: owner.id,
            payeeName: owner.name,
        });
        dispatch({ type: 'ADD_TRANSACTION', payload: payoutTransaction });
        showToast(`${payoutType} payout recorded successfully.`, 'success');
        setLastPaidAmount(parseFloat(amount));
        setLastReference(reference);
        setWhatsAppPayee(owner);
        setShowWhatsAppConfirm(true);
    };

    const handleSendWhatsAppConfirmation = () => {
        const payee = whatsAppPayee || owner;
        if (!payee) return;
        const payoutLabel = payoutType === 'Security' ? 'Security Deposit Payout' : 'Owner Income Payout';
        const template = state.whatsAppTemplates.payoutConfirmation || 'Dear {contactName}, a {payoutType} payment of {amount} has been made to you. Reference: {reference}';
        const message = WhatsAppService.generatePayoutConfirmation(
            template, payee, lastPaidAmount, payoutLabel, lastReference
        );
        sendOrOpenWhatsApp(
            { contact: payee, message, phoneNumber: payee.contactNo || undefined },
            () => state.whatsAppMode,
            openChat
        );
        setShowWhatsAppConfirm(false);
        onClose();
    };

    const handleSkipWhatsApp = () => {
        setShowWhatsAppConfirm(false);
        onClose();
    };

    const modalTitle = useMemo(() => {
        if (!owner) return '';
        if (isEditMode) return `Edit Payout - ${owner.name} (${payoutType})`;
        const multiPayee =
            payoutType === 'Rent' &&
            propertyBreakdown.some((p) => p.payeeOwnerId && p.payeeOwnerId !== owner.id);
        if (multiPayee) return `Record owner payouts (${payoutType})`;
        return `Pay ${owner.name} (${payoutType})`;
    }, [owner, isEditMode, payoutType, propertyBreakdown]);
    
    if (!owner) return null;
    
    const accountsWithBalance = userSelectableAccounts.map(acc => ({
        ...acc,
        name: `${acc.name} (${CURRENCY} ${acc.balance.toLocaleString()})`
    }));

    // WhatsApp confirmation step
    if (showWhatsAppConfirm) {
        return (
            <Modal isOpen={isOpen} onClose={handleSkipWhatsApp} title="Payment Recorded">
                <div className="space-y-4">
                    <div className="p-4 bg-emerald-50 rounded-lg text-center">
                        <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                            <div className="w-6 h-6 text-emerald-600">{ICONS.check}</div>
                        </div>
                        <p className="font-semibold text-emerald-800">
                            {CURRENCY} {lastPaidAmount.toLocaleString()} paid to {(whatsAppPayee || owner).name}
                        </p>
                        <p className="text-sm text-emerald-600 mt-1">
                            {payoutType === 'Security' ? 'Security Deposit' : 'Owner Income'} Payout
                        </p>
                    </div>
                    <p className="text-sm text-slate-600 text-center">
                        Would you like to send a payment confirmation via WhatsApp?
                    </p>
                    <div className="flex justify-center gap-3 pt-2">
                        <Button type="button" variant="secondary" onClick={handleSkipWhatsApp}>
                            Skip
                        </Button>
                        <button
                            onClick={handleSendWhatsAppConfirmation}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg text-white bg-green-600 hover:bg-green-700 transition-colors"
                        >
                            <div className="w-4 h-4">{ICONS.whatsapp}</div>
                            Send via WhatsApp
                        </button>
                    </div>
                </div>
            </Modal>
        );
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} size={showPropertyTable ? 'xl' : undefined}>
            <div className="space-y-4">
                {/* Pay From Account + Payment Date — same row as broker modal */}
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-grow">
                        <ComboBox
                            label="Pay From Account"
                            items={accountsWithBalance}
                            selectedId={accountId}
                            onSelect={(item) => setAccountId(item?.id || '')}
                            placeholder="Select an account"
                        />
                    </div>
                    <div className="flex-grow">
                        <DatePicker
                            label="Payment Date"
                            value={date}
                            onChange={d => setDate(toLocalDateString(d))}
                            required
                        />
                    </div>
                </div>

                {/* --- Security Mode: allocation UI --- */}
                {isSecurityMode && !isEditMode ? (
                    <>
                        <div className="p-4 bg-slate-50 rounded-lg">
                            <div className="flex justify-between font-bold text-lg">
                                <span>Security Deposit Balance:</span>
                                <span>{CURRENCY} {balanceDue.toLocaleString()}</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                                Allocate the security deposit across one or more of the options below.
                            </p>
                        </div>

                        <div className="space-y-3">
                            {/* Pay to Owner */}
                            <div className={`border rounded-lg p-3 transition-colors ${securityAllocations.owner > 0.01 ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200'}`}>
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="text-sm font-semibold text-slate-800">Pay to Owner</div>
                                        <div className="text-xs text-slate-500">Transfer security deposit to {owner?.name || 'owner'}</div>
                                    </div>
                                    <input
                                        type="number"
                                        className="w-36 border rounded px-3 py-1.5 text-right text-sm focus:ring-2 focus:ring-indigo-500/50 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        value={securityAllocations.owner || ''}
                                        onChange={e => {
                                            const v = parseFloat(e.target.value) || 0;
                                            setSecurityAllocations(prev => ({ ...prev, owner: Math.max(0, v) }));
                                        }}
                                        onKeyDown={e => (e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.preventDefault()}
                                        placeholder="0"
                                        aria-label="Amount to pay to owner"
                                    />
                                </div>
                            </div>

                            {/* Refund to Tenant */}
                            <div className={`border rounded-lg p-3 transition-colors ${securityAllocations.tenant > 0.01 ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200'} ${!effectiveTenant ? 'opacity-50' : ''}`}>
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="text-sm font-semibold text-slate-800">Refund to Tenant</div>
                                        <div className="text-xs text-slate-500">
                                            {effectiveTenant ? `Refund to ${effectiveTenant.name}` : 'No tenant linked (add agreement or rental invoices for this unit)'}
                                        </div>
                                    </div>
                                    <input
                                        type="number"
                                        className="w-36 border rounded px-3 py-1.5 text-right text-sm focus:ring-2 focus:ring-emerald-500/50 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        value={securityAllocations.tenant || ''}
                                        onChange={e => {
                                            const v = parseFloat(e.target.value) || 0;
                                            setSecurityAllocations(prev => ({ ...prev, tenant: Math.max(0, v) }));
                                        }}
                                        onKeyDown={e => (e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.preventDefault()}
                                        disabled={!effectiveTenant}
                                        placeholder="0"
                                        aria-label="Amount to refund to tenant"
                                    />
                                </div>
                            </div>

                            {/* Adjust in Unpaid Invoices */}
                            <div className={`border rounded-lg transition-colors ${invoiceAdjustTotal > 0.01 ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200'} ${!effectiveTenant || unpaidPropertyInvoices.length === 0 ? 'opacity-50' : ''}`}>
                                <div className="flex items-center justify-between gap-4 p-3">
                                    <div className="flex-1">
                                        <div className="text-sm font-semibold text-slate-800">Adjust in Unpaid Invoices</div>
                                        <div className="text-xs text-slate-500">
                                            {effectiveTenant && unpaidPropertyInvoices.length > 0
                                                ? `Apply deposit against ${effectiveTenant.name}'s unpaid rent on this property (${unpaidPropertyInvoices.length} invoice${unpaidPropertyInvoices.length === 1 ? '' : 's'})`
                                                : effectiveTenant ? 'No unpaid rental invoices for this property' : 'No tenant linked (add agreement or rental invoices for this unit)'}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className={`text-sm font-bold tabular-nums ${invoiceAdjustTotal > 0.01 ? 'text-amber-700' : 'text-slate-400'}`}>
                                            {CURRENCY} {invoiceAdjustTotal.toLocaleString()}
                                        </div>
                                    </div>
                                </div>

                                {effectiveTenant && invoiceAdjustments.length > 0 && (
                                    <div className="border-t border-amber-200/60">
                                        <div className="px-3 py-1.5 bg-amber-50/80 grid grid-cols-12 gap-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                                            <div className="col-span-1 text-center"></div>
                                            <div className="col-span-4">Invoice</div>
                                            <div className="col-span-3 text-right">Outstanding</div>
                                            <div className="col-span-4 text-right">Adjust Amount</div>
                                        </div>
                                        <div className="max-h-48 overflow-y-auto">
                                            {invoiceAdjustments.map((row, idx) => {
                                                const isOverdue = new Date(row.dueDate) < new Date();
                                                return (
                                                    <div key={row.invoiceId} className={`grid grid-cols-12 gap-2 px-3 py-2 border-t border-amber-100/80 text-sm items-center ${row.isSelected ? 'bg-amber-50/60' : ''}`}>
                                                        <div className="col-span-1 text-center">
                                                            <input
                                                                type="checkbox"
                                                                checked={row.isSelected}
                                                                onChange={() => handleInvoiceToggle(idx)}
                                                                className="w-3.5 h-3.5 text-amber-600 rounded focus:ring-amber-500"
                                                                aria-label={`Adjust invoice ${row.invoiceNumber}`}
                                                            />
                                                        </div>
                                                        <div className="col-span-4 min-w-0">
                                                            <div className="text-xs font-medium text-slate-700 truncate flex items-center gap-1">
                                                                {row.invoiceNumber}
                                                                {isOverdue && (
                                                                    <span className="px-1 py-0.5 rounded text-[8px] font-bold uppercase bg-red-100 text-red-600">Overdue</span>
                                                                )}
                                                            </div>
                                                            <div className="text-[10px] text-slate-400">
                                                                {row.rentalMonth || `Due ${formatDate(row.dueDate)}`}
                                                            </div>
                                                        </div>
                                                        <div className="col-span-3 text-right text-xs text-slate-500 tabular-nums">
                                                            {CURRENCY} {row.outstanding.toLocaleString()}
                                                        </div>
                                                        <div className="col-span-4">
                                                            <input
                                                                type="number"
                                                                className="w-full border rounded px-2 py-1 text-right text-xs focus:ring-2 focus:ring-amber-500/50 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                                value={row.adjustAmount || ''}
                                                                onChange={e => handleInvoiceAmountChange(idx, e.target.value)}
                                                                onKeyDown={e => (e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.preventDefault()}
                                                                disabled={!effectiveTenant}
                                                                placeholder="0"
                                                                aria-label={`Adjust amount for ${row.invoiceNumber}`}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        {invoiceAdjustments.length > 0 && (
                                            <div className="flex gap-2 px-3 py-1.5 border-t border-amber-200/60">
                                                <button type="button" onClick={autoFillInvoiceAdjustments} className="text-[10px] text-amber-600 hover:underline">Auto-fill oldest first</button>
                                                <span className="text-slate-300">|</span>
                                                <button type="button" onClick={clearInvoiceAdjustments} className="text-[10px] text-slate-500 hover:underline">Clear all</button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Quick-fill buttons */}
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => { setSecurityAllocations({ owner: balanceDue, tenant: 0, adjust: 0 }); clearInvoiceAdjustments(); }}
                                className="text-xs text-indigo-600 hover:underline">Full to Owner</button>
                            {effectiveTenant && (
                                <>
                                    <span className="text-slate-300">|</span>
                                    <button type="button" onClick={() => { setSecurityAllocations({ owner: 0, tenant: balanceDue, adjust: 0 }); clearInvoiceAdjustments(); }}
                                        className="text-xs text-emerald-600 hover:underline">Full Refund to Tenant</button>
                                </>
                            )}
                            {effectiveTenant && unpaidPropertyInvoices.length > 0 && (
                                <>
                                    <span className="text-slate-300">|</span>
                                    <button type="button" onClick={() => {
                                        let remaining = Math.min(balanceDue, effectiveTenantUnpaidAmount);
                                        const filled = invoiceAdjustments.map(row => {
                                            if (remaining <= 0.01) return { ...row, adjustAmount: 0, isSelected: false };
                                            const apply = Math.min(remaining, row.outstanding);
                                            remaining -= apply;
                                            return { ...row, adjustAmount: apply, isSelected: true };
                                        });
                                        const adjustedTotal = filled.filter(r => r.isSelected).reduce((s, r) => s + r.adjustAmount, 0);
                                        setInvoiceAdjustments(filled);
                                        setSecurityAllocations({ owner: Math.max(0, balanceDue - adjustedTotal), tenant: 0, adjust: adjustedTotal });
                                    }}
                                        className="text-xs text-amber-600 hover:underline">Adjust Invoices First</button>
                                </>
                            )}
                            <span className="text-slate-300">|</span>
                            <button type="button" onClick={() => { setSecurityAllocations({ owner: 0, tenant: 0, adjust: 0 }); clearInvoiceAdjustments(); }}
                                className="text-xs text-slate-500 hover:underline">Clear All</button>
                        </div>

                        <div className="p-4 bg-slate-50 rounded-lg">
                            <div className="flex justify-between items-center">
                                <span className="font-semibold text-slate-700">Total Allocated:</span>
                                <span className={`font-bold text-xl ${securityTotal > balanceDue + 0.01 ? 'text-red-600' : 'text-emerald-600'}`}>
                                    {CURRENCY} {securityTotal.toLocaleString()}
                                </span>
                            </div>
                            {balanceDue - securityTotal > 0.01 && (
                                <div className="text-xs text-slate-500 text-right mt-1">
                                    Remaining: {CURRENCY} {(balanceDue - securityTotal).toLocaleString()}
                                </div>
                            )}
                        </div>
                    </>
                ) : showPropertyTable ? (
                    <>
                        <div className="border rounded-lg overflow-hidden">
                            <div className="bg-slate-100 px-4 py-2 font-semibold text-sm text-slate-700 grid grid-cols-12 gap-2">
                                <div className="col-span-1 text-center">Select</div>
                                <div className="col-span-3">Reference (Unit)</div>
                                <div className="col-span-3">Pay to (owner)</div>
                                <div className="col-span-2 text-right">Due</div>
                                <div className="col-span-3 text-right">Pay Now</div>
                            </div>
                            <div className="max-h-60 overflow-y-auto">
                                {items.length > 0 ? (
                                    items.map((row, idx) => (
                                        <div key={`${row.propertyId}-${row.payeeOwnerId}`} className={`grid grid-cols-12 gap-2 px-4 py-3 border-b text-sm items-center ${row.isSelected ? 'bg-indigo-50' : ''}`}>
                                            <div className="col-span-1 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={row.isSelected}
                                                    onChange={() => handleToggle(idx)}
                                                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                                    aria-label={`Select ${row.propertyName} for payout`}
                                                    title={`Select ${row.propertyName}`}
                                                />
                                            </div>
                                            <div className="col-span-3">
                                                <div className="font-medium text-slate-800 truncate" title={row.propertyName}>
                                                    {row.propertyName}
                                                </div>
                                                <div className="text-xs text-slate-500 truncate" title={row.buildingName}>
                                                    Building: {row.buildingName}
                                                </div>
                                            </div>
                                            <div className="col-span-3 min-w-0">
                                                <div className="font-medium text-slate-800 truncate" title={row.payeeOwnerName}>
                                                    {row.payeeOwnerName}
                                                </div>
                                                {row.payeeOwnerId !== owner.id && (
                                                    <div className="text-[10px] text-amber-700 font-medium">Other owner on this unit</div>
                                                )}
                                            </div>
                                            <div className="col-span-2 text-right text-slate-600">
                                                {CURRENCY} {row.balanceDue.toLocaleString()}
                                            </div>
                                            <div className="col-span-3">
                                                <input
                                                    type="number"
                                                    className="w-full border rounded px-2 py-1 text-right text-sm focus:ring-2 focus:ring-indigo-500/50 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                    value={row.paymentAmount || ''}
                                                    onChange={(e) => handleAmountChange(idx, e.target.value)}
                                                    onKeyDown={(e) => (e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.preventDefault()}
                                                    disabled={!row.isSelected}
                                                    aria-label={`Pay now amount for ${row.propertyName}`}
                                                    placeholder="0"
                                                />
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-4 text-center text-slate-500">No properties with balance due.</div>
                                )}
                            </div>
                        </div>
                        {items.length > 0 && (
                            <div className="flex gap-2">
                                <button type="button" onClick={selectAllItems} className="text-sm text-indigo-600 hover:underline">Select all</button>
                                <span className="text-slate-300">|</span>
                                <button type="button" onClick={clearAllItems} className="text-sm text-slate-500 hover:underline">Clear</button>
                            </div>
                        )}
                        <div className="p-4 bg-slate-50 rounded-lg flex justify-between items-center">
                            <span className="font-semibold text-slate-700">Total Payment:</span>
                            <span className="font-bold text-xl text-emerald-600">{CURRENCY} {totalToPay.toLocaleString()}</span>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="p-4 bg-slate-50 rounded-lg">
                            <div className="flex justify-between font-bold text-lg">
                                <span>Balance Due:</span>
                                <span>{CURRENCY} {balanceDue.toLocaleString()}</span>
                            </div>
                            {preSelectedBuildingId && (
                                <p className="text-xs text-indigo-600 mt-2 font-medium">
                                    * Filtered by Building: {state.buildings.find(b => b.id === preSelectedBuildingId)?.name}
                                </p>
                            )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input
                                label="Payment Amount"
                                type="text"
                                inputMode="decimal"
                                min="0"
                                max={balanceDue}
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                required
                            />
                            <Input
                                label="Reference"
                                value={reference}
                                onChange={e => setReference(e.target.value)}
                                placeholder="Cheque #, ID..."
                            />
                        </div>
                        {preSelectedBuildingId ? (
                            <Input
                                label="Assigned Building"
                                value={state.buildings.find(b => b.id === preSelectedBuildingId)?.name || ''}
                                disabled
                            />
                        ) : (
                            <ComboBox
                                label="Assign to Building"
                                items={buildingsForOwner}
                                selectedId={buildingId}
                                onSelect={(item) => setBuildingId(item?.id || '')}
                                placeholder="Select a building"
                                allowAddNew={false}
                                required
                            />
                        )}
                    </>
                )}

                <Input
                    label="Notes / Description"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Optional notes..."
                />

                {error && <p className="text-sm text-danger">{error}</p>}

                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="button" onClick={handleSubmit} disabled={!!error || (isSecurityMode && !isEditMode ? securityTotal <= 0 : showPropertyTable ? totalToPay <= 0 : false)}>
                        {isEditMode ? 'Update Payment' : 'Confirm Payment'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default OwnerPayoutModal;
