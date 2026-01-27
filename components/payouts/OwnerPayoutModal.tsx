
import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Contact, TransactionType, Transaction, AccountType, Category } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { CURRENCY } from '../../constants';
import ComboBox from '../ui/ComboBox';
import { useNotification } from '../../context/NotificationContext';

interface OwnerPayoutModalProps {
    isOpen: boolean;
    onClose: () => void;
    owner: Contact | null;
    balanceDue: number;
    payoutType?: 'Rent' | 'Security';
    preSelectedBuildingId?: string;
    transactionToEdit?: Transaction; // Transaction to edit (if provided, modal is in edit mode)
}

const OwnerPayoutModal: React.FC<OwnerPayoutModalProps> = ({ isOpen, onClose, owner, balanceDue, payoutType = 'Rent', preSelectedBuildingId, transactionToEdit }) => {
    const { state, dispatch } = useAppContext();
    const { showAlert, showToast } = useNotification();

    const isEditMode = !!transactionToEdit;

    const [amount, setAmount] = useState('0');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [accountId, setAccountId] = useState('');
    const [buildingId, setBuildingId] = useState('');
    const [reference, setReference] = useState('');
    const [notes, setNotes] = useState('');
    const [error, setError] = useState('');
    
    // Filter for Bank Accounts (exclude Internal Clearing)
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
                // Edit mode: pre-fill with transaction data
                setAmount(String(transactionToEdit.amount));
                setDate(new Date(transactionToEdit.date).toISOString().split('T')[0]);
                setAccountId(transactionToEdit.accountId || '');
                setBuildingId(transactionToEdit.buildingId || preSelectedBuildingId || '');
                
                // Extract reference and notes from description
                const desc = transactionToEdit.description || '';
                // Try to extract reference (Ref: ...)
                const refMatch = desc.match(/\(Ref:\s*([^)]+)\)/);
                if (refMatch) {
                    setReference(refMatch[1].trim());
                }
                // Extract notes (everything after " - " and before " (Ref:" or " [")
                // Format: "Owner Payout to Name - notes (Ref: ref) [Building]"
                const notesMatch = desc.match(/-\s*([^-]+?)(?:\s*\(Ref:|$)/);
                if (notesMatch) {
                    setNotes(notesMatch[1].trim());
                } else {
                    // If no notes pattern, try to extract anything after the main prefix
                    const prefixMatch = desc.match(/^(?:Owner Payout|Security Deposit Payout)\s+to\s+[^-]+/);
                    if (prefixMatch) {
                        const remaining = desc.substring(prefixMatch[0].length).trim();
                        if (remaining && !remaining.startsWith('(') && !remaining.startsWith('[')) {
                            setNotes(remaining);
                        }
                    }
                }
            } else {
                // Create mode: use defaults
                setAmount(String(balanceDue));
                setDate(new Date().toISOString().split('T')[0]);
                const cashAccount = userSelectableAccounts.find(a => a.name === 'Cash');
                setAccountId(cashAccount?.id || userSelectableAccounts[0]?.id || '');
                setBuildingId(preSelectedBuildingId || '');
                setReference('');
                setNotes('');
            }
            setError('');
        }
    }, [isOpen, balanceDue, userSelectableAccounts, preSelectedBuildingId, isEditMode, transactionToEdit]);

    useEffect(() => {
        const numericAmount = parseFloat(amount) || 0;
        // In edit mode, don't validate against balanceDue since we're modifying an existing transaction
        if (!isEditMode && numericAmount > balanceDue + 0.01) {
            setError(`Amount cannot exceed the balance of ${CURRENCY} ${balanceDue.toLocaleString()}.`);
        } else if (numericAmount <= 0) {
            setError('Amount must be positive.');
        } else {
            setError('');
        }
    }, [amount, balanceDue, isEditMode]);

    const handleSubmit = async () => {
        if (error || !owner) return;

        const payoutAccount = state.accounts.find(a => a.id === accountId);
        if (!payoutAccount) {
            await showAlert(`Error: Please select a valid account to pay from.`);
            return;
        }

        let payoutCategory;
        
        if (payoutType === 'Security') {
            // Find or create "Owner Security Payout" category
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
                secCat = newCat; // Use newly created category
            }
            payoutCategory = secCat;
        } else {
            // Rent Payout
            payoutCategory = state.categories.find(c => c.name === 'Owner Payout');
            if (!payoutCategory) {
                await showAlert("Critical: 'Owner Payout' category not found. Please check Rental Settings.");
                return;
            }
        }

        let description = `${payoutType === 'Security' ? 'Security Deposit Payout' : 'Owner Payout'} to ${owner.name}`;
        if (notes) description += ` - ${notes}`;
        if (reference) description += ` (Ref: ${reference})`;
        if (buildingId) {
             const bName = state.buildings.find(b => b.id === buildingId)?.name;
             if (bName) description += ` [${bName}]`;
        }

        const payoutTransaction: Transaction = {
            type: TransactionType.EXPENSE,
            amount: parseFloat(amount),
            date,
            description,
            accountId: payoutAccount.id,
            contactId: owner.id,
            categoryId: payoutCategory.id,
            buildingId: buildingId || undefined,
            propertyId: isEditMode && transactionToEdit ? transactionToEdit.propertyId : undefined, // Preserve propertyId if editing
            id: isEditMode && transactionToEdit ? transactionToEdit.id : Date.now().toString(),
        };

        if (isEditMode) {
            dispatch({ type: 'UPDATE_TRANSACTION', payload: payoutTransaction });
            showToast(`${payoutType} payout updated successfully.`, 'success');
        } else {
            dispatch({ type: 'ADD_TRANSACTION', payload: payoutTransaction });
            showToast(`${payoutType} payout recorded successfully.`, 'success');
        }
        onClose();
    };
    
    if (!owner) return null;
    
    const accountsWithBalance = userSelectableAccounts.map(acc => ({
        ...acc,
        name: `${acc.name} (${CURRENCY} ${acc.balance.toLocaleString()})`
    }));

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isEditMode ? `Edit Payout - ${owner.name} (${payoutType})` : `Pay ${owner.name} (${payoutType})`}>
            <div className="space-y-4">
                <div className="p-4 bg-slate-50 rounded-lg">
                    <div className="flex justify-between font-bold text-lg">
                        <span>Balance Due:</span>
                        <span>{CURRENCY} {balanceDue.toLocaleString()}</span>
                    </div>
                    {payoutType === 'Security' && (
                        <p className="text-xs text-slate-500 mt-2">
                            This payment will be recorded as 'Owner Security Payout', reducing the held security deposit liability.
                        </p>
                    )}
                    {preSelectedBuildingId && (
                         <p className="text-xs text-indigo-600 mt-2 font-medium">
                            * Filtered by Building: {state.buildings.find(b => b.id === preSelectedBuildingId)?.name}
                        </p>
                    )}
                </div>

                <ComboBox 
                    label="Pay From Account"
                    items={accountsWithBalance}
                    selectedId={accountId}
                    onSelect={(item) => setAccountId(item?.id || '')}
                    placeholder="Select an account"
                />

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
                        label="Assign to Building (Optional)"
                        items={buildingsForOwner}
                        selectedId={buildingId}
                        onSelect={(item) => setBuildingId(item?.id || '')}
                        placeholder="Select a building"
                        allowAddNew={false}
                    />
                )}
                
                <Input 
                    label="Payment Date"
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    required
                />

                <Input 
                    label="Notes / Description"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Optional notes..."
                />

                {error && <p className="text-sm text-danger">{error}</p>}
                
                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="button" onClick={handleSubmit} disabled={!!error}>{isEditMode ? 'Update Payment' : 'Confirm Payment'}</Button>
                </div>
            </div>
        </Modal>
    );
};

export default OwnerPayoutModal;
