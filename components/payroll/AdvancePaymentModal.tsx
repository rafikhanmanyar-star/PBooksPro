
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Staff, AccountType, TransactionType, Transaction } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import { useNotification } from '../../context/NotificationContext';
import { CURRENCY } from '../../constants';

interface AdvancePaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    staff: Staff | null;
}

const AdvancePaymentModal: React.FC<AdvancePaymentModalProps> = ({ isOpen, onClose, staff }) => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert } = useNotification();

    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [accountId, setAccountId] = useState('');
    const [description, setDescription] = useState('');

    // Filter for Bank Accounts
    const userSelectableAccounts = useMemo(() => state.accounts.filter(a => a.type === AccountType.BANK), [state.accounts]);

    useEffect(() => {
        if (isOpen) {
            setAmount('');
            setDate(new Date().toISOString().split('T')[0]);
            const cashAccount = userSelectableAccounts.find(a => a.name === 'Cash');
            setAccountId(cashAccount?.id || userSelectableAccounts[0]?.id || '');
            setDescription('Salary Advance');
        }
    }, [isOpen, userSelectableAccounts]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!staff) return;
        
        if (!accountId) {
            await showAlert('Please select a payment account.');
            return;
        }

        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            await showAlert('Please enter a valid positive amount.');
            return;
        }

        // Find Salary Advance Category
        const advCategory = state.categories.find(c => c.name === 'Salary Advance');
        if (!advCategory) {
            await showAlert("System Error: 'Salary Advance' category missing. Please check settings.");
            return;
        }

        const contact = state.contacts.find(c => c.id === staff.id);
        const contactName = contact?.name || 'Staff';

        const transaction: Transaction = {
            id: `txn-adv-${Date.now()}`,
            type: TransactionType.EXPENSE,
            amount: numAmount,
            date: date,
            description: description || `Salary Advance to ${contactName}`,
            accountId: accountId,
            categoryId: advCategory.id,
            contactId: staff.id,
            projectId: staff.projectId,
            buildingId: staff.buildingId
        };

        dispatch({ type: 'ADD_TRANSACTION', payload: transaction });
        showToast(`Advance payment of ${CURRENCY} ${numAmount.toLocaleString()} recorded for ${contactName}.`, 'success');
        onClose();
    };

    if (!staff) return null;

    const contact = state.contacts.find(c => c.id === staff.id);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Give Advance: ${contact?.name}`}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 text-sm text-amber-800">
                    This will be recorded as an expense under "Salary Advance". It will not automatically deduct from the next payslip, but will be visible in the employee's ledger.
                </div>

                <ComboBox 
                    label="Pay From Account" 
                    items={userSelectableAccounts} 
                    selectedId={accountId} 
                    onSelect={(item) => setAccountId(item?.id || '')} 
                    placeholder="Select Account"
                    required
                />

                <Input 
                    label="Advance Amount" 
                    type="number" 
                    value={amount} 
                    onChange={e => setAmount(e.target.value)} 
                    required 
                    autoFocus
                />

                <DatePicker 
                    label="Payment Date" 
                    value={date} 
                    onChange={d => setDate(d.toISOString().split('T')[0])} 
                    required 
                />

                <Input 
                    label="Description" 
                    value={description} 
                    onChange={e => setDescription(e.target.value)} 
                    placeholder="e.g. Emergency advance" 
                />

                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="submit">Record Payment</Button>
                </div>
            </form>
        </Modal>
    );
};

export default AdvancePaymentModal;
