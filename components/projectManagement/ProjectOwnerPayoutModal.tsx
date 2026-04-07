
import React, { useState, useEffect, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { useAppContext, _getAppState } from '../../context/AppContext';
import { Contact, TransactionType, Transaction, SalesReturnStatus } from '../../types';
import { flushAppStateToDatabase } from '../../services/database/criticalPersistence';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { getAppStateApiService } from '../../services/api/appStateApi';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import DatePicker from '../ui/DatePicker';
import Button from '../ui/Button';
import { CURRENCY } from '../../constants';
import ComboBox from '../ui/ComboBox';
import { useNotification } from '../../context/NotificationContext';
import { findSalesReturnCategory, getSalesReturnRefundCategoryIdSet } from '../../constants/salesReturnSystemCategories';
import { toLocalDateString } from '../../utils/dateUtils';

interface ProjectOwnerPayoutModalProps {
    isOpen: boolean;
    onClose: () => void;
    client: Contact | null;
    balanceDue?: number; // Optional prop passed from parent
}

const ProjectOwnerPayoutModal: React.FC<ProjectOwnerPayoutModalProps> = ({ isOpen, onClose, client, balanceDue }) => {
    const { state, dispatch } = useAppContext();
    const { showAlert } = useNotification();

    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(toLocalDateString(new Date()));
    const [accountId, setAccountId] = useState('');
    const [projectId, setProjectId] = useState(state.defaultProjectId || '');
    const [description, setDescription] = useState('');
    const [categoryId, setCategoryId] = useState('');
    
    const userSelectableAccounts = useMemo(() => state.accounts.filter(a => a.name !== 'Accounts Receivable' && a.name !== 'Accounts Payable' && a.name !== 'Internal Clearing'), [state.accounts]);
    const expenseCategories = useMemo(() => state.categories.filter(c => c.type === TransactionType.EXPENSE), [state.categories]);
    const incomeCategories = useMemo(() => state.categories.filter(c => c.type === TransactionType.INCOME), [state.categories]);
    
    /** Prefer dedicated sales-return refund category; fall back to Unit Selling Income (legacy). */
    const refundRevenueCategory = useMemo(() => {
        return (
            findSalesReturnCategory(state.categories, 'REFUND_REVENUE_REDUCTION') ??
            state.categories.find((c) => c.id === 'sys-cat-unit-sell' || c.id.endsWith('__sys-cat-unit-sell')) ??
            state.categories.find((c) => c.name === 'Unit Selling Income')
        );
    }, [state.categories]);

    const refundCategoryIdSet = useMemo(
        () => getSalesReturnRefundCategoryIdSet(state.categories),
        [state.categories]
    );

    useEffect(() => {
        if (isOpen) {
            setAmount(balanceDue ? balanceDue.toString() : '');
            setDate(toLocalDateString(new Date()));
            const cashAccount = state.accounts.find(a => a.name === 'Cash');
            setAccountId(cashAccount?.id || userSelectableAccounts[0]?.id || '');
            setProjectId('');
            setDescription('');
            
            // Refund payouts: sales-return refund category or Unit Selling Income (revenue reduction)
            if (refundRevenueCategory) {
                setCategoryId(refundRevenueCategory.id);
            } else {
                const defaultCat = state.categories.find(c => c.name === 'Owner Payout' || c.name === 'Security Deposit Refund');
                setCategoryId(defaultCat?.id || '');
            }
        }
    }, [isOpen, userSelectableAccounts, state.accounts, state.categories, balanceDue, refundRevenueCategory]);

    const handleSubmit = async () => {
        if (!client) return;
        const numAmount = parseFloat(amount);
        if (!amount || numAmount <= 0) {
            await showAlert('Please enter a valid amount.');
            return;
        }
        if (balanceDue !== undefined && numAmount > balanceDue) {
             await showAlert(`Amount cannot exceed the calculated refund balance of ${CURRENCY} ${balanceDue.toLocaleString()}.`);
             return;
        }

        if (!accountId) {
            await showAlert('Please select a payment account.');
            return;
        }
        if (!categoryId) {
            await showAlert('Please select a category.');
            return;
        }

        // Find the sales return for this client to track refund payment
        // Since we no longer use bills, we find sales returns by client and unpaid refund amount
        const salesReturn = state.salesReturns.find(sr => {
            if (sr.status === SalesReturnStatus.REFUNDED) return false;
            if (!sr.agreementId) return false;
            const agreement = state.projectAgreements.find(pa => pa.id === sr.agreementId);
            if (!agreement || agreement.clientId !== client.id) return false;
            
            // Check if this refund amount matches the unpaid amount
            const totalRefunded = state.transactions
                .filter(tx => 
                    tx.contactId === client.id &&
                    (tx.categoryId ? refundCategoryIdSet.has(tx.categoryId) : false) &&
                    tx.description?.includes(`Sales Return #${sr.returnNumber}`)
                )
                .reduce((sum, tx) => sum + tx.amount, 0);
            
            const unpaidAmount = Math.round(sr.refundAmount - totalRefunded); // Round to whole number
            return unpaidAmount >= numAmount - 0.01; // Allow small rounding
        });
        
        // Get agreement and projectId from sales return
        let agreementFromReturn = null;
        if (salesReturn?.agreementId) {
            agreementFromReturn = state.projectAgreements.find(pa => pa.id === salesReturn.agreementId);
        }

        // Create the refund transaction
        // This single transaction:
        // 1. Reduces Unit Selling Income (revenue reduction via category)
        // 2. Reduces Cash/Bank (cash outflow via account)
        // Refunds are NOT expenses - they are revenue reductions
        // IMPORTANT: Must use Unit Selling Income category to reduce revenue in P&L
        // IMPORTANT: Must have projectId for P&L to include the transaction
        const finalCategoryId = (balanceDue !== undefined && refundRevenueCategory) 
            ? refundRevenueCategory.id 
            : (categoryId || refundRevenueCategory?.id || '');
        
        // Get projectId from sales return's agreement if not provided
        let finalProjectId = projectId;
        if (!finalProjectId && agreementFromReturn) {
            finalProjectId = agreementFromReturn.projectId;
        }
        
        // Ensure we have both categoryId and projectId for refunds
        if (!finalCategoryId || !finalProjectId) {
            await showAlert('Error: Missing category or project information for refund. Please ensure Sales Return Refund (revenue reduction) or Unit Selling Income exists and agreement has a project.');
            return;
        }
        
        const refundTransaction: Omit<Transaction, 'id'> = {
            type: TransactionType.EXPENSE, // EXPENSE type reduces cash account
            amount: Math.round(numAmount), // Round to whole number
            date,
            description: description || `Refund Payment to ${client.name}${salesReturn ? ` - Sales Return #${salesReturn.returnNumber}` : ''}`,
            accountId, // Cash/Bank account - reduces cash balance
            contactId: client.id,
            categoryId: finalCategoryId, // Unit Selling Income - reduces revenue (MUST be set for refunds)
            projectId: finalProjectId, // MUST have projectId for P&L to include it
            agreementId: salesReturn?.agreementId,
            // NO billId - refunds don't use bills
        };

        const transactionId = Date.now().toString();
        const newTx: Transaction = { ...refundTransaction, id: transactionId };

        if (isLocalOnlyMode()) {
            flushSync(() => {
                dispatch({ type: 'ADD_TRANSACTION', payload: newTx });
                if (salesReturn) {
                    const totalRefunded = Math.round(
                        state.transactions
                            .filter(
                                (tx) =>
                                    tx.contactId === client.id &&
                                    (tx.categoryId ? refundCategoryIdSet.has(tx.categoryId) : false) &&
                                    tx.description?.includes(`Sales Return #${salesReturn.returnNumber}`)
                            )
                            .reduce((sum, tx) => sum + tx.amount, 0) + numAmount
                    );
                    const isFullyRefunded = totalRefunded >= salesReturn.refundAmount - 0.001;
                    if (isFullyRefunded && salesReturn.status !== SalesReturnStatus.REFUNDED) {
                        dispatch({
                            type: 'MARK_RETURN_REFUNDED',
                            payload: { returnId: salesReturn.id, refundDate: date },
                        });
                    }
                }
            });
            try {
                await flushAppStateToDatabase(_getAppState());
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                await showAlert(`Could not save refund to the database: ${msg}`);
                return;
            }
        } else {
            try {
                const api = getAppStateApiService();
                const saved = await api.saveTransaction(newTx);
                flushSync(() => {
                    dispatch({ type: 'ADD_TRANSACTION', payload: saved as Transaction, _isRemote: true } as any);
                    if (salesReturn) {
                        const totalRefunded = Math.round(
                            state.transactions
                                .filter(
                                    (tx) =>
                                        tx.contactId === client.id &&
                                        (tx.categoryId ? refundCategoryIdSet.has(tx.categoryId) : false) &&
                                        tx.description?.includes(`Sales Return #${salesReturn.returnNumber}`)
                                )
                                .reduce((sum, tx) => sum + tx.amount, 0) + numAmount
                        );
                        const isFullyRefunded = totalRefunded >= salesReturn.refundAmount - 0.001;
                        if (isFullyRefunded && salesReturn.status !== SalesReturnStatus.REFUNDED) {
                            dispatch({
                                type: 'MARK_RETURN_REFUNDED',
                                payload: { returnId: salesReturn.id, refundDate: date },
                            });
                        }
                    }
                });
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                await showAlert(`Failed to save refund: ${msg}`);
                return;
            }
        }

        setTimeout(() => {
            onClose();
        }, 150);
    };
    
    if (!client) return null;
    
    const accountsWithBalance = userSelectableAccounts.map(acc => ({
        ...acc,
        name: `${acc.name} (${CURRENCY} ${acc.balance.toLocaleString()})`
    }));

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Pay / Refund ${client.name}`}>
            <div className="space-y-4">
                {balanceDue !== undefined && (
                    <div className="p-3 bg-slate-100 rounded text-center mb-2">
                        <span className="text-sm text-slate-500 block">Max Refundable Amount</span>
                        <span className="text-lg font-bold text-slate-800">{CURRENCY} {balanceDue.toLocaleString()}</span>
                    </div>
                )}

                <ComboBox 
                    label="Pay From Account"
                    items={accountsWithBalance}
                    selectedId={accountId}
                    onSelect={(item) => setAccountId(item?.id || '')}
                    placeholder="Select an account"
                    required
                />

                <Input 
                    label="Amount"
                    type="text"
                    inputMode="decimal"
                    min="0"
                    max={balanceDue}
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    required
                />
                
                <ComboBox 
                    label="Category"
                    items={balanceDue !== undefined && refundRevenueCategory ? [refundRevenueCategory, ...expenseCategories] : expenseCategories}
                    selectedId={categoryId}
                    onSelect={(item) => setCategoryId(item?.id || '')}
                    placeholder={balanceDue !== undefined ? "Sales return refund / Unit Selling Income (reduces revenue)" : "Select Category (e.g. Owner Payout)"}
                    required
                />
                {balanceDue !== undefined && refundRevenueCategory && categoryId === refundRevenueCategory.id && (
                    <p className="text-xs text-amber-600 -mt-2">
                        ✓ Using sales return refund (or Unit Selling Income) — reduces realized revenue instead of showing as a generic expense.
                    </p>
                )}

                 <ComboBox 
                    label="Link to Project (Optional)"
                    items={state.projects}
                    selectedId={projectId}
                    onSelect={(item) => setProjectId(item?.id || '')}
                    placeholder="Select a project"
                    allowAddNew={false}
                />
                
                <DatePicker label="Date" value={date} onChange={d => setDate(toLocalDateString(d))} required />
                
                <Input 
                    label="Description / Note"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Reason for payment..."
                />

                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="button" onClick={handleSubmit}>Confirm Payment</Button>
                </div>
            </div>
        </Modal>
    );
};

export default ProjectOwnerPayoutModal;
