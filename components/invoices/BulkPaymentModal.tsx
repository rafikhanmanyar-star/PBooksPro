
import React, { useState, useMemo, useEffect, useCallback, useRef, startTransition } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Invoice, Transaction, TransactionType, AccountType, InvoiceType, ProjectReceivedAsset, ProjectReceivedAssetType, InvoiceStatus } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import { CURRENCY } from '../../constants';
import { useNotification } from '../../context/NotificationContext';
import { getOwnerIdForPropertyOnDate } from '../../services/ownershipHistoryUtils';
import { getOwnershipSharesForPropertyOnDate, primaryOwnerIdFromShares } from '../../services/propertyOwnershipService';
import { buildOwnerRentAllocationTransactions, shouldPostOwnerRentAllocation } from '../../services/rentOwnerAllocation';
import { findProjectAssetCategory } from '../../constants/projectAssetSystemCategories';
import { resolveSystemAccountId } from '../../services/systemEntityIds';
import { normalizeDecimalAmountInput } from '../../utils/amountInputNormalize';
import { toLocalDateString } from '../../utils/dateUtils';
const ASSET_TYPES: { value: ProjectReceivedAssetType; label: string }[] = [
    { value: 'Plot', label: 'Plot' },
    { value: 'Car', label: 'Car' },
    { value: 'Other', label: 'Other' },
];

interface BulkPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedInvoices: Invoice[];
    onPaymentComplete?: () => void;
}

const BulkPaymentModal: React.FC<BulkPaymentModalProps> = ({ isOpen, onClose, selectedInvoices, onPaymentComplete }) => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert } = useNotification();
    const totalAmountInputRef = useRef<HTMLInputElement>(null);

    // State for individual invoice payment amounts
    const [payments, setPayments] = useState<Record<string, string>>({});
    // Total amount to receive: user enters this and we auto-allocate across invoices (remainder on last)
    const [totalAmountToReceive, setTotalAmountToReceive] = useState<string>('');

    const [paymentDate, setPaymentDate] = useState(toLocalDateString(new Date()));
    const [accountId, setAccountId] = useState('');
    const [reference, setReference] = useState('');
    const [bulkPaymentMode, setBulkPaymentMode] = useState<'cash' | 'asset'>('cash');
    const [assetDescription, setAssetDescription] = useState('');
    const [assetType, setAssetType] = useState<ProjectReceivedAssetType>('Other');

    const isProjectContext = useMemo(() => selectedInvoices.some(inv => inv.invoiceType === InvoiceType.INSTALLMENT), [selectedInvoices]);

    // Filter for Bank Accounts Only (exclude Internal Clearing)
    const userSelectableAccounts = useMemo(() => state.accounts.filter(a => a.type === AccountType.BANK && a.name !== 'Internal Clearing'), [state.accounts]);

    // Sort invoices by Due Date for display order
    const sortedInvoices = useMemo(() => {
        return [...selectedInvoices].sort((a, b) => {
            const dateA = new Date(a.dueDate || a.issueDate).getTime();
            const dateB = new Date(b.dueDate || b.issueDate).getTime();
            return dateA - dateB;
        });
    }, [selectedInvoices]);

    const totalDue = useMemo(() => {
        return selectedInvoices.reduce((sum, inv) => sum + (inv.amount - inv.paidAmount), 0);
    }, [selectedInvoices]);

    const totalPaymentAmount = useMemo(() => {
        return Object.keys(payments).reduce((sum, key) => sum + (parseFloat(payments[key]) || 0), 0);
    }, [payments]);

    // Determine if this is a Rental context
    const isRentalContext = useMemo(() => {
        return selectedInvoices.some(inv => inv.invoiceType === InvoiceType.RENTAL || inv.invoiceType === InvoiceType.SECURITY_DEPOSIT);
    }, [selectedInvoices]);

    // Only initialize when modal transitions from closed to open. This prevents the effect from
    // re-running when parent re-renders (e.g. context updates) and resets form state while the
    // user is typing, which caused the "keyboard delay" / fields not editable.
    const didInitForOpenRef = useRef(false);
    useEffect(() => {
        if (isOpen) {
            if (!didInitForOpenRef.current) {
                didInitForOpenRef.current = true;
                const initialPayments: Record<string, string> = {};
                let sum = 0;
                selectedInvoices.forEach(inv => {
                    const remaining = inv.amount - inv.paidAmount;
                    const val = remaining > 0 ? remaining : 0;
                    initialPayments[inv.id] = val.toString();
                    sum += val;
                });
                setPayments(initialPayments);
                setTotalAmountToReceive(sum > 0 ? sum.toString() : '');
                const cashAccount = userSelectableAccounts.find(a => a.name === 'Cash');
                setAccountId(cashAccount?.id || userSelectableAccounts[0]?.id || '');
                setReference('');
            }
        } else {
            didInitForOpenRef.current = false;
        }
    }, [isOpen, selectedInvoices, userSelectableAccounts]);

    // Focus first main input when modal opens so keyboard works reliably (e.g. in Electron)
    useEffect(() => {
        if (!isOpen) return;
        const t = setTimeout(() => {
            totalAmountInputRef.current?.focus();
        }, 100);
        return () => clearTimeout(t);
    }, [isOpen]);

    /** Allocate a total amount across sorted invoices: first invoices get full due, last gets remainder (capped at its due). */
    const allocateFromTotal = useCallback((total: number): Record<string, string> => {
        if (total <= 0 || sortedInvoices.length === 0) return {};
        const next: Record<string, string> = {};
        let remainingToAllocate = total;
        sortedInvoices.forEach((inv) => {
            const due = Math.max(0, inv.amount - inv.paidAmount);
            const amount = Math.min(due, Math.max(0, remainingToAllocate));
            next[inv.id] = amount % 1 === 0 ? amount.toString() : amount.toFixed(2);
            remainingToAllocate -= amount;
        });
        return next;
    }, [sortedInvoices]);

    const handleTotalAmountToReceiveChange = (value: string) => {
        const normalized = normalizeDecimalAmountInput(value);
        if (normalized === '' || /^\d*\.?\d*$/.test(normalized)) {
            setTotalAmountToReceive(normalized);
            const num = parseFloat(normalized);
            if (!Number.isNaN(num) && num > 0) {
                const allocated = allocateFromTotal(num);
                if (Object.keys(allocated).length > 0) {
                    // Defer allocation update so the input stays responsive (avoids keyboard lag)
                    startTransition(() => setPayments(allocated));
                }
            }
        }
    };

    const handleAmountChange = (id: string, value: string) => {
        const normalized = normalizeDecimalAmountInput(value);
        if (normalized === '' || /^\d*\.?\d*$/.test(normalized)) {
            const next = { ...payments, [id]: normalized };
            setPayments(next);
            const newSum = Object.keys(next).reduce((s, k) => s + (parseFloat(next[k]) || 0), 0);
            setTotalAmountToReceive(newSum > 0 ? newSum.toString() : '');
        }
    };

    const handleSubmit = async () => {
        if (totalPaymentAmount <= 0) {
            await showAlert("Total payment amount must be greater than zero.");
            return;
        }
        for (const inv of selectedInvoices) {
            const payAmount = parseFloat(payments[inv.id] || '0');
            const due = inv.amount - inv.paidAmount;
            if (payAmount > due + 0.01) {
                 await showAlert(`Payment for invoice #${inv.invoiceNumber} (${CURRENCY} ${payAmount.toLocaleString()}) exceeds balance due (${CURRENCY} ${due.toLocaleString()}).`);
                 return;
            }
        }

        if (isProjectContext && bulkPaymentMode === 'asset') {
            if (!assetDescription.trim()) {
                await showAlert("Please enter a description for the asset.");
                return;
            }
            const assetReceivedCategory = findProjectAssetCategory(state.categories, 'REVENUE_ASSET_IN_KIND');
            if (!assetReceivedCategory) {
                await showAlert("System category for received assets is not set up.");
                return;
            }
            let projectId = selectedInvoices[0]?.projectId;
            if (!projectId && selectedInvoices[0]?.agreementId) {
                const pa = state.projectAgreements?.find(a => a.id === selectedInvoices[0].agreementId);
                if (pa) projectId = pa.projectId;
            }
            if (!projectId) {
                await showAlert("Could not determine project.");
                return;
            }
            const contactId = selectedInvoices[0]?.contactId;
            const assetId = `asset-bulk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            const asset: ProjectReceivedAsset = {
                id: assetId,
                projectId,
                contactId: contactId || '',
                invoiceId: null,
                description: assetDescription.trim(),
                assetType,
                recordedValue: totalPaymentAmount,
                receivedDate: paymentDate,
            };
            dispatch({ type: 'ADD_PROJECT_RECEIVED_ASSET', payload: asset });
            const batchId = `bulk-asset-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            // Only add transactions; ADD_TRANSACTION's applyTransactionEffect updates each invoice's paidAmount and status
            // (so we must not dispatch UPDATE_INVOICE here, or paidAmount would be double-counted and partial invoices would show as PAID)
            selectedInvoices.forEach(inv => {
                const payAmount = parseFloat(payments[inv.id] || '0');
                if (payAmount > 0) {
                    const incomeTx = {
                        id: `txn-bulk-asset-${Date.now()}-${inv.id}`,
                        type: TransactionType.INCOME,
                        amount: payAmount,
                        date: paymentDate,
                        description: `Bulk Asset: ${assetDescription.trim()} (Inv #${inv.invoiceNumber})`,
                        accountId: receivedAssetsAccountId,
                        categoryId: assetReceivedCategory.id,
                        projectId,
                        contactId: contactId || undefined,
                        projectAssetId: assetId,
                        invoiceId: inv.id,
                        batchId,
                    };
                    dispatch({ type: 'ADD_TRANSACTION', payload: incomeTx });
                }
            });
            showToast(`Recorded asset (${CURRENCY} ${totalPaymentAmount.toLocaleString()}) and applied to ${selectedInvoices.length} invoices.`, 'success');
            onPaymentComplete?.();
            onClose();
            return;
        }

        if (!accountId) {
            await showAlert("Please select a payment account.");
            return;
        }

        // Generate a batch ID to group these transactions
        const batchId = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const label = isRentalContext ? 'Rental' : 'Installment';
        const transactions: Transaction[] = [];

        selectedInvoices.forEach(inv => {
            const payAmount = parseFloat(payments[inv.id] || '0');
            if (payAmount > 0) {
                let pid = inv.projectId;
                let uid = inv.unitId;
                let cid = inv.categoryId;
                if (inv.agreementId) {
                    const pa = state.projectAgreements?.find(a => a.id === inv.agreementId);
                    if (pa) {
                        if (!pid) pid = pa.projectId;
                        if (!uid && pa.unitIds?.length > 0) uid = pa.unitIds[0];
                    }
                }
                if (!cid) {
                    const catName = inv.invoiceType === InvoiceType.INSTALLMENT ? 'Unit Selling Income'
                        : inv.invoiceType === InvoiceType.SERVICE_CHARGE ? 'Service Charge Income'
                        : inv.invoiceType === InvoiceType.SECURITY_DEPOSIT ? 'Security Deposit'
                        : inv.invoiceType === InvoiceType.RENTAL ? 'Rental Income'
                        : null;
                    if (catName) {
                        const cat = state.categories.find(c => c.name === catName && c.type === TransactionType.INCOME);
                        if (cat) cid = cat.id;
                    }
                }

                const property = inv.propertyId ? state.properties.find(p => p.id === inv.propertyId) : null;
                const sharesForDay = inv.propertyId
                    ? getOwnershipSharesForPropertyOnDate(state, inv.propertyId, paymentDate)
                    : [];
                const ownerId =
                    primaryOwnerIdFromShares(sharesForDay) ??
                    (inv.propertyId
                        ? getOwnerIdForPropertyOnDate(
                              inv.propertyId,
                              paymentDate,
                              state.propertyOwnershipHistory || [],
                              property?.ownerId
                          )
                        : undefined);

                const mkId = () =>
                    `txn-bulk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}-${inv.id}`;

                const invLabel = inv.invoiceType === InvoiceType.SECURITY_DEPOSIT
                    ? 'Security Deposit'
                    : label;

                transactions.push({
                    id: mkId(),
                    type: TransactionType.INCOME,
                    amount: payAmount,
                    date: paymentDate,
                    description: `Bulk Payment: ${reference || invLabel} (Inv #${inv.invoiceNumber})`,
                    accountId,
                    contactId: inv.contactId,
                    projectId: pid,
                    buildingId: inv.buildingId,
                    propertyId: inv.propertyId,
                    unitId: uid,
                    categoryId: cid,
                    invoiceId: inv.id,
                    batchId: batchId,
                    ownerId,
                });

                if (
                    inv.invoiceType === InvoiceType.RENTAL &&
                    inv.propertyId &&
                    shouldPostOwnerRentAllocation(state, inv.propertyId, paymentDate)
                ) {
                    const allocBatch = `${batchId}-rent-alloc-${inv.id}`;
                    const legs = buildOwnerRentAllocationTransactions(state, {
                        propertyId: inv.propertyId,
                        buildingId: inv.buildingId,
                        paymentDateYyyyMmDd: paymentDate.slice(0, 10),
                        rentAmount: payAmount,
                        accountId,
                        invoiceId: inv.id,
                        baseDescription: `Bulk Payment: ${reference || label} (Inv #${inv.invoiceNumber})`,
                        batchId: allocBatch,
                    }).map((leg) => ({ ...leg, id: mkId() })) as Transaction[];
                    transactions.push(...legs);
                }
            }
        });

        if (transactions.length === 0) {
            await showAlert("No valid payment amounts entered.");
            return;
        }

        dispatch({ type: 'BATCH_ADD_TRANSACTIONS', payload: transactions });
        showToast(`Processed bulk payment for ${transactions.length} invoices.`, 'success');
        
        if (onPaymentComplete) {
            onPaymentComplete();
        } else {
            onClose();
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Receive Bulk Payment`} size="xl">
            <div className="space-y-4">
                {isProjectContext && (
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Payment type</label>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setBulkPaymentMode('cash')}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${bulkPaymentMode === 'cash' ? 'bg-accent text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                            >
                                Cash / Bank
                            </button>
                            <button
                                type="button"
                                onClick={() => setBulkPaymentMode('asset')}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${bulkPaymentMode === 'asset' ? 'bg-accent text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                            >
                                Asset (plot, car, etc.)
                            </button>
                        </div>
                        {bulkPaymentMode === 'asset' && (
                            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                                <Input label="Asset description" value={assetDescription} onChange={e => setAssetDescription(e.target.value)} placeholder="e.g. Plot near Phase 2" />
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Asset type</label>
                                    <select
                                        value={assetType}
                                        onChange={e => setAssetType(e.target.value as ProjectReceivedAssetType)}
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-accent/50"
                                        aria-label="Asset type"
                                    >
                                        {ASSET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>
                )}
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-grow">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Total amount to receive</label>
                        <input
                            ref={totalAmountInputRef}
                            type="text"
                            inputMode="decimal"
                            value={totalAmountToReceive}
                            onChange={(e) => handleTotalAmountToReceiveChange(e.target.value)}
                            placeholder={totalDue > 0 ? totalDue.toString() : '0'}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-lg font-bold text-slate-800 focus:ring-2 focus:ring-accent/50 focus:border-accent"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Amounts are distributed across invoices (first invoices full, remainder on last). Total due for selection: {CURRENCY} {totalDue.toLocaleString()}
                        </p>
                        {totalPaymentAmount > 0 && (
                            <p className="text-xs font-medium text-slate-600 mt-0.5">Current total: {CURRENCY} {totalPaymentAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        )}
                    </div>
                    {bulkPaymentMode !== 'asset' && (
                    <div className="flex-grow">
                        <ComboBox 
                            label="Deposit Account"
                            items={userSelectableAccounts}
                            selectedId={accountId}
                            onSelect={(item) => setAccountId(item?.id || '')}
                            placeholder="Select Account"
                        />
                    </div>
                    )}
                </div>
                
                <div className="flex gap-4 flex-wrap">
                    <div className="flex-1 min-w-[140px]"><DatePicker label="Payment Date" value={paymentDate} onChange={d => setPaymentDate(toLocalDateString(d))} /></div>
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Reference / Note</label>
                        <div className="border-2 border-slate-300 rounded-lg bg-white focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 transition-colors">
                            <textarea
                                value={reference}
                                onChange={e => setReference(e.target.value)}
                                placeholder="e.g. Check #123"
                                rows={3}
                                className="block w-full px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 resize-y min-h-[80px] rounded-lg border-0 bg-transparent focus:ring-0 focus:outline-none"
                            />
                        </div>
                    </div>
                </div>

                <div className="mt-4 border rounded-lg overflow-hidden">
                    <div className="bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 grid grid-cols-12 gap-2">
                        <div className="col-span-4">Invoice</div>
                        <div className="col-span-3 text-right">Due Amount</div>
                        <div className="col-span-3 text-right">Payment</div>
                        <div className="col-span-2 text-right">Balance After</div>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                        {sortedInvoices.map(inv => {
                            const due = inv.amount - inv.paidAmount;
                            const payAmount = parseFloat(payments[inv.id] || '0');
                            const remaining = Math.max(0, due - payAmount);
                            const isFullyPaid = Math.abs(remaining) < 0.01;

                            return (
                                <div key={inv.id} className="px-3 py-2 text-sm border-b grid grid-cols-12 gap-2 items-center hover:bg-slate-50">
                                    <div className="col-span-4">
                                        <div className="font-medium">#{inv.invoiceNumber}</div>
                                        <div className="text-xs text-slate-500">{new Date(inv.dueDate).toLocaleDateString()}</div>
                                    </div>
                                    <div className="col-span-3 text-right text-slate-600 font-medium">
                                        {due.toLocaleString()}
                                    </div>
                                    <div className="col-span-3">
                                        <input
                                            type="text"
                                            className="w-full text-right border rounded px-2 py-1 focus:ring-2 focus:ring-accent/50 outline-none font-bold text-emerald-600"
                                            value={payments[inv.id] || ''}
                                            onChange={(e) => handleAmountChange(inv.id, e.target.value)}
                                            placeholder="0"
                                        />
                                    </div>
                                    <div className={`col-span-2 text-right text-xs font-medium ${isFullyPaid ? 'text-slate-400' : 'text-rose-500'}`}>
                                        {isFullyPaid ? 'Paid' : remaining.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="button" onClick={handleSubmit} disabled={totalPaymentAmount <= 0}>Confirm Payment</Button>
                </div>
            </div>
        </Modal>
    );
};

export default BulkPaymentModal;
