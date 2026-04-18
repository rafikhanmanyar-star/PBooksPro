
import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Contact, TransactionType, Transaction, AccountType, Category } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import DatePicker from '../ui/DatePicker';
import Button from '../ui/Button';
import { CURRENCY, ICONS } from '../../constants';
import ComboBox from '../ui/ComboBox';
import { useNotification } from '../../context/NotificationContext';
import { WhatsAppService, sendOrOpenWhatsApp } from '../../services/whatsappService';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { parseStoredDateToYyyyMmDdInput, toLocalDateString } from '../../utils/dateUtils';

export interface PropertyBalanceItem {
    propertyId: string;
    propertyName: string;
    balanceDue: number;
}

interface OwnerPayoutRow {
    propertyId: string;
    propertyName: string;
    buildingId: string;
    buildingName: string;
    balanceDue: number;
    paymentAmount: number;
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
    const [securityAllocations, setSecurityAllocations] = useState<{ owner: number; tenant: number; adjust: number }>({ owner: 0, tenant: 0, adjust: 0 });

    const userSelectableAccounts = useMemo(() => state.accounts.filter(a => a.type === AccountType.BANK && a.name !== 'Internal Clearing'), [state.accounts]);
    const buildingsForOwner = useMemo(() => {
        if (!owner) return [];
        const ownerPropertyBuildingIds = new Set(
            state.properties.filter(p => p.ownerId === owner.id).map(p => p.buildingId)
        );
        return state.buildings.filter(b => ownerPropertyBuildingIds.has(b.id));
    }, [owner, state.properties, state.buildings]);

    useEffect(() => {
        if (isOpen) {
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
                }
                if (propertyBreakdown.length > 0) {
                    const sumDue = propertyBreakdown.reduce((s, p) => s + (p.balanceDue || 0), 0);
                    const useTotalForFirst = sumDue < 0.01 && balanceDue > 0.01 && propertyBreakdown.length > 0;
                    const shortfall = balanceDue > sumDue ? balanceDue - sumDue : 0;
                    const newItems: OwnerPayoutRow[] = propertyBreakdown.map((p, idx) => {
                        const prop = state.properties.find(pr => String(pr.id) === String(p.propertyId));
                        const building = prop?.buildingId ? state.buildings.find(b => b.id === prop.buildingId) : null;
                        let due = useTotalForFirst && idx === 0 ? balanceDue : (p.balanceDue || 0);
                        if (idx === 0 && shortfall > 0.01) due += shortfall;
                        const hasDue = due > 0.01;
                        return {
                            propertyId: p.propertyId,
                            propertyName: p.propertyName,
                            buildingId: prop?.buildingId || '',
                            buildingName: building?.name || '—',
                            balanceDue: due,
                            paymentAmount: due,
                            isSelected: hasDue,
                        };
                    });
                    setItems(newItems);
                } else {
                    setItems([]);
                    setAmount(String(balanceDue));
                }
            }
            setError('');
        }
    }, [isOpen, balanceDue, userSelectableAccounts, preSelectedBuildingId, isEditMode, transactionToEdit, propertyBreakdown, state.properties, state.buildings, isSecurityMode]);

    const totalToPay = items.filter(i => i.isSelected).reduce((sum, i) => sum + i.paymentAmount, 0);

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

    const selectAllItems = () => {
        setItems(prev => prev.map(i => ({ ...i, isSelected: true })));
    };

    const clearAllItems = () => {
        setItems(prev => prev.map(i => ({ ...i, isSelected: false })));
    };

    useEffect(() => {
        if (isSecurityMode && !isEditMode) {
            const total = securityAllocations.owner + securityAllocations.tenant + securityAllocations.adjust;
            if (total <= 0) {
                setError('Enter a positive amount for at least one option.');
            } else if (total > balanceDue + 0.01) {
                setError(`Total allocations (${CURRENCY} ${total.toLocaleString()}) exceed the security balance of ${CURRENCY} ${balanceDue.toLocaleString()}.`);
            } else if (securityAllocations.tenant > 0.01 && !tenant) {
                setError('No tenant found for this property to refund.');
            } else if (securityAllocations.adjust > 0.01 && !tenant) {
                setError('No tenant found for invoice adjustment.');
            } else if (securityAllocations.adjust > 0.01 && tenantUnpaidAmount < 0.01) {
                setError('No unpaid invoices to adjust against.');
            } else if (securityAllocations.adjust > tenantUnpaidAmount + 0.01) {
                setError(`Adjustment amount exceeds tenant unpaid balance of ${CURRENCY} ${tenantUnpaidAmount.toLocaleString()}.`);
            } else {
                setError('');
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
    }, [showPropertyTable, items, totalToPay, amount, balanceDue, isEditMode, isSecurityMode, securityAllocations, tenant, tenantUnpaidAmount]);

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

    const securityTotal = securityAllocations.owner + securityAllocations.tenant + securityAllocations.adjust;

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
                    id: `tx-${baseId}-own`,
                });
            }
            if (securityAllocations.tenant > 0.01 && tenant) {
                const cat = getPayoutCategory('tenant');
                if (!cat) { await showAlert("'Security Deposit Refund' category not found."); return; }
                allTxs.push({
                    type: TransactionType.EXPENSE, amount: securityAllocations.tenant, date,
                    description: `Security Deposit Refund to ${tenant.name}${descSuffix}${propLabel}`,
                    accountId: payoutAccount.id, contactId: tenant.id, categoryId: cat.id,
                    buildingId: propBuildingId || undefined, propertyId: singleProp?.propertyId,
                    id: `tx-${baseId}-ten`,
                });
            }
            if (securityAllocations.adjust > 0.01 && tenant) {
                const unpaidInvoices = state.invoices
                    .filter(inv =>
                        inv.propertyId === singleProp?.propertyId &&
                        inv.invoiceType === 'RENTAL' &&
                        inv.status !== 'PAID' && inv.status !== 'DRAFT' &&
                        inv.amount - (inv.paidAmount || 0) > 0.01
                    )
                    .sort((a, b) => new Date(a.dueDate || a.issueDate).getTime() - new Date(b.dueDate || b.issueDate).getTime());

                let remaining = securityAllocations.adjust;
                for (const inv of unpaidInvoices) {
                    if (remaining <= 0.01) break;
                    const outstanding = inv.amount - (inv.paidAmount || 0);
                    const applyAmount = Math.min(remaining, outstanding);
                    remaining -= applyAmount;

                    const secDepCat = state.categories.find(c => c.name === 'Security Deposit');
                    const txCatId = secDepCat?.id || '';
                    allTxs.push({
                        type: TransactionType.INCOME, amount: applyAmount, date,
                        description: `Security deposit adjustment against invoice${descSuffix}${propLabel}`,
                        accountId: payoutAccount.id, contactId: tenant.id, categoryId: txCatId,
                        buildingId: propBuildingId || undefined, propertyId: singleProp?.propertyId,
                        invoiceId: inv.id,
                        id: `tx-${baseId}-adj-${inv.id.slice(-5)}`,
                    });

                    const updatedInv = { ...inv, paidAmount: (inv.paidAmount || 0) + applyAmount };
                    if (updatedInv.paidAmount >= updatedInv.amount - 0.01) {
                        updatedInv.status = 'PAID' as any;
                    } else {
                        updatedInv.status = 'PARTIALLY_PAID' as any;
                    }
                    dispatch({ type: 'UPDATE_INVOICE', payload: updatedInv });
                }

                const refCat = getPayoutCategory('tenant');
                if (refCat) {
                    allTxs.push({
                        type: TransactionType.EXPENSE, amount: securityAllocations.adjust, date,
                        description: `Security deposit adjusted against tenant unpaid invoices${descSuffix}${propLabel}`,
                        accountId: payoutAccount.id, contactId: tenant.id, categoryId: refCat.id,
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
            setShowWhatsAppConfirm(true);
            return;
        }

        const payoutCategory = payoutType === 'Security' ? getPayoutCategory() : state.categories.find(c => c.name === 'Owner Payout');
        if (!payoutCategory) {
            await showAlert("Critical: 'Owner Payout' category not found. Please check Rental Settings.");
            return;
        }

        const baseDescription = `${payoutType === 'Security' ? 'Security Deposit Payout' : 'Owner Payout'} to ${owner.name}`;
        const descriptionSuffix = (notes ? ` - ${notes}` : '') + (reference ? ` (Ref: ${reference})` : '');

        const buildTransaction = (opts: { amount: number; propertyId?: string; buildingId?: string; descriptionExtra?: string; id?: string }): Transaction => {
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
                contactId: owner.id,
                categoryId: payoutCategory.id,
                buildingId: opts.buildingId || undefined,
                propertyId: opts.propertyId,
                id: opts.id ?? `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            };
        };

        if (isEditMode) {
            const payoutTransaction = buildTransaction({
                amount: parseFloat(amount),
                buildingId: buildingId || undefined,
                propertyId: transactionToEdit?.propertyId,
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
                })
            );
            dispatch({ type: 'BATCH_ADD_TRANSACTIONS', payload: transactions });
            showToast(`${payoutType} payout recorded for ${transactions.length} propert${transactions.length === 1 ? 'y' : 'ies'}.`, 'success');
            setLastPaidAmount(transactions.reduce((s, t) => s + t.amount, 0));
            setLastReference(reference);
            setShowWhatsAppConfirm(true);
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
        });
        dispatch({ type: 'ADD_TRANSACTION', payload: payoutTransaction });
        showToast(`${payoutType} payout recorded successfully.`, 'success');
        setLastPaidAmount(parseFloat(amount));
        setLastReference(reference);
        setShowWhatsAppConfirm(true);
    };

    const handleSendWhatsAppConfirmation = () => {
        if (!owner) return;
        const payoutLabel = payoutType === 'Security' ? 'Security Deposit Payout' : 'Owner Income Payout';
        const template = state.whatsAppTemplates.payoutConfirmation || 'Dear {contactName}, a {payoutType} payment of {amount} has been made to you. Reference: {reference}';
        const message = WhatsAppService.generatePayoutConfirmation(
            template, owner, lastPaidAmount, payoutLabel, lastReference
        );
        sendOrOpenWhatsApp(
            { contact: owner, message, phoneNumber: owner.contactNo || undefined },
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
                            {CURRENCY} {lastPaidAmount.toLocaleString()} paid to {owner.name}
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
        <Modal isOpen={isOpen} onClose={onClose} title={isEditMode ? `Edit Payout - ${owner.name} (${payoutType})` : `Pay ${owner.name} (${payoutType})`} size={showPropertyTable ? 'xl' : undefined}>
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
                            <div className={`border rounded-lg p-3 transition-colors ${securityAllocations.tenant > 0.01 ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200'} ${!tenant ? 'opacity-50' : ''}`}>
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="text-sm font-semibold text-slate-800">Refund to Tenant</div>
                                        <div className="text-xs text-slate-500">
                                            {tenant ? `Refund to ${tenant.name}` : 'No active tenant'}
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
                                        disabled={!tenant}
                                        placeholder="0"
                                        aria-label="Amount to refund to tenant"
                                    />
                                </div>
                            </div>

                            {/* Adjust in Unpaid Invoices */}
                            <div className={`border rounded-lg p-3 transition-colors ${securityAllocations.adjust > 0.01 ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200'} ${!tenant || tenantUnpaidAmount < 0.01 ? 'opacity-50' : ''}`}>
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="text-sm font-semibold text-slate-800">Adjust in Unpaid Invoices</div>
                                        <div className="text-xs text-slate-500">
                                            {tenant && tenantUnpaidAmount > 0.01
                                                ? `Apply against ${tenant.name}'s unpaid balance of ${CURRENCY} ${tenantUnpaidAmount.toLocaleString()}`
                                                : tenant ? 'No unpaid invoices' : 'No active tenant'}
                                        </div>
                                    </div>
                                    <input
                                        type="number"
                                        className="w-36 border rounded px-3 py-1.5 text-right text-sm focus:ring-2 focus:ring-amber-500/50 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        value={securityAllocations.adjust || ''}
                                        onChange={e => {
                                            const v = parseFloat(e.target.value) || 0;
                                            setSecurityAllocations(prev => ({ ...prev, adjust: Math.max(0, v) }));
                                        }}
                                        onKeyDown={e => (e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.preventDefault()}
                                        disabled={!tenant || tenantUnpaidAmount < 0.01}
                                        placeholder="0"
                                        aria-label="Amount to adjust against unpaid invoices"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Quick-fill buttons */}
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => setSecurityAllocations({ owner: balanceDue, tenant: 0, adjust: 0 })}
                                className="text-xs text-indigo-600 hover:underline">Full to Owner</button>
                            {tenant && (
                                <>
                                    <span className="text-slate-300">|</span>
                                    <button type="button" onClick={() => setSecurityAllocations({ owner: 0, tenant: balanceDue, adjust: 0 })}
                                        className="text-xs text-emerald-600 hover:underline">Full Refund to Tenant</button>
                                </>
                            )}
                            {tenant && tenantUnpaidAmount > 0.01 && (
                                <>
                                    <span className="text-slate-300">|</span>
                                    <button type="button" onClick={() => {
                                        const adj = Math.min(balanceDue, tenantUnpaidAmount);
                                        const remaining = Math.max(0, balanceDue - adj);
                                        setSecurityAllocations({ owner: remaining, tenant: 0, adjust: adj });
                                    }}
                                        className="text-xs text-amber-600 hover:underline">Adjust Invoices First</button>
                                </>
                            )}
                            <span className="text-slate-300">|</span>
                            <button type="button" onClick={() => setSecurityAllocations({ owner: 0, tenant: 0, adjust: 0 })}
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
                                <div className="col-span-4">Reference (Unit)</div>
                                <div className="col-span-2 text-right">Due</div>
                                <div className="col-span-3 text-right">Pay Now</div>
                            </div>
                            <div className="max-h-60 overflow-y-auto">
                                {items.length > 0 ? (
                                    items.map((row, idx) => (
                                        <div key={row.propertyId} className={`grid grid-cols-12 gap-2 px-4 py-3 border-b text-sm items-center ${row.isSelected ? 'bg-indigo-50' : ''}`}>
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
                                            <div className="col-span-4">
                                                <div className="font-medium text-slate-800 truncate" title={row.propertyName}>
                                                    {row.propertyName}
                                                </div>
                                                <div className="text-xs text-slate-500 truncate" title={row.buildingName}>
                                                    Building: {row.buildingName}
                                                </div>
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
