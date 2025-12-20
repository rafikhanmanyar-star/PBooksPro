
import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Contact, TransactionType, Transaction } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { CURRENCY } from '../../constants';
import ComboBox from '../ui/ComboBox';
import { useNotification } from '../../context/NotificationContext';

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
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [accountId, setAccountId] = useState('');
    const [projectId, setProjectId] = useState('');
    const [description, setDescription] = useState('');
    const [categoryId, setCategoryId] = useState('');
    
    const userSelectableAccounts = useMemo(() => state.accounts.filter(a => a.name !== 'Accounts Receivable' && a.name !== 'Accounts Payable'), [state.accounts]);
    const expenseCategories = useMemo(() => state.categories.filter(c => c.type === TransactionType.EXPENSE), [state.categories]);

    useEffect(() => {
        if (isOpen) {
            setAmount(balanceDue ? balanceDue.toString() : '');
            setDate(new Date().toISOString().split('T')[0]);
            const cashAccount = state.accounts.find(a => a.name === 'Cash');
            setAccountId(cashAccount?.id || userSelectableAccounts[0]?.id || '');
            setProjectId('');
            setDescription('');
            
            // Default to Owner Payout or Refund category
            const defaultCat = state.categories.find(c => c.name === 'Owner Payout' || c.name === 'Security Deposit Refund');
            setCategoryId(defaultCat?.id || '');
        }
    }, [isOpen, userSelectableAccounts, state.accounts, state.categories, balanceDue]);

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
            await showAlert('Please select an expense category.');
            return;
        }

        const payoutTransaction: Omit<Transaction, 'id'> = {
            type: TransactionType.EXPENSE,
            amount: numAmount,
            date,
            description: description || `Payout/Refund to ${client.name}`,
            accountId,
            contactId: client.id,
            categoryId,
            projectId: projectId || undefined,
        };

        dispatch({ type: 'ADD_TRANSACTION', payload: { ...payoutTransaction, id: Date.now().toString() } });
        onClose();
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
                    items={expenseCategories}
                    selectedId={categoryId}
                    onSelect={(item) => setCategoryId(item?.id || '')}
                    placeholder="Select Category (e.g. Owner Payout)"
                    required
                />

                 <ComboBox 
                    label="Link to Project (Optional)"
                    items={state.projects}
                    selectedId={projectId}
                    onSelect={(item) => setProjectId(item?.id || '')}
                    placeholder="Select a project"
                    allowAddNew={false}
                />
                
                <Input 
                    label="Date"
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    required
                />
                
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
