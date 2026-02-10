
import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useNotification } from '../../context/NotificationContext';
import { Transaction, TransactionType } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Select from '../ui/Select';
import { CURRENCY } from '../../constants';

interface ReceiveFromOwnerModalProps {
    isOpen: boolean;
    onClose: () => void;
    ownerId: string;
    ownerName: string;
    suggestedAmount: number;
}

const ReceiveFromOwnerModal: React.FC<ReceiveFromOwnerModalProps> = ({
    isOpen,
    onClose,
    ownerId,
    ownerName,
    suggestedAmount,
}) => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert } = useNotification();

    const [amount, setAmount] = useState('');
    const [date, setDate] = useState('');
    const [accountId, setAccountId] = useState('');
    const [reference, setReference] = useState('');

    // Available bank/cash accounts
    const accountOptions = useMemo(() => {
        return state.accounts.filter(a => a.type === 'Bank' || a.type === 'Cash' || a.name === 'Cash');
    }, [state.accounts]);

    // Reset form on open
    useEffect(() => {
        if (isOpen) {
            setAmount(suggestedAmount.toFixed(2));
            setDate(new Date().toISOString().split('T')[0]);
            const cashAccount = state.accounts.find(a => a.name === 'Cash');
            setAccountId(cashAccount?.id || accountOptions[0]?.id || '');
            setReference('');
        }
    }, [isOpen, suggestedAmount, state.accounts, accountOptions]);

    // Vacant properties for this owner
    const vacantProperties = useMemo(() => {
        return state.properties
            .filter(p => p.ownerId === ownerId && (p.monthlyServiceCharge || 0) > 0)
            .map(p => p.name);
    }, [state.properties, ownerId]);

    const handleSubmit = async () => {
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            await showAlert('Please enter a valid positive amount.');
            return;
        }

        if (!date) {
            await showAlert('Please select a valid date.');
            return;
        }

        if (!accountId) {
            await showAlert('Please select an account.');
            return;
        }

        // Find the Owner Service Charge Payment category
        let ownerSvcPayCategory = state.categories.find(c => c.name === 'Owner Service Charge Payment');

        if (!ownerSvcPayCategory) {
            // Auto-create if missing (shouldn't happen with proper initialization)
            ownerSvcPayCategory = {
                id: 'sys-cat-own-svc-pay',
                name: 'Owner Service Charge Payment',
                type: TransactionType.INCOME,
                isPermanent: true,
                isRental: true,
            };
            dispatch({ type: 'ADD_CATEGORY', payload: ownerSvcPayCategory });
        }

        // Find the Rental Income category for the credit side
        const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
        if (!rentalIncomeCategory) {
            await showAlert("Critical Error: 'Rental Income' category not found.");
            return;
        }

        const baseTimestamp = Date.now();

        // Create the income transaction (money received from owner)
        const receiveTx: Transaction = {
            id: `own-svc-pay-${baseTimestamp}`,
            type: TransactionType.INCOME,
            amount: numAmount,
            date: date,
            description: reference || `Service Charge Payment received from ${ownerName}`,
            accountId: accountId,
            categoryId: ownerSvcPayCategory.id,
            contactId: ownerId,
            isSystem: false,
        };

        dispatch({ type: 'ADD_TRANSACTION', payload: receiveTx });
        showToast(`Payment of ${CURRENCY} ${numAmount.toLocaleString()} received from ${ownerName}.`, 'success');
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Receive Payment from Owner">
            <div className="space-y-4">
                {/* Info Banner */}
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-sm text-blue-800">
                    <p className="font-medium">Collecting service charges from owner</p>
                    <p className="mt-1 text-blue-600">
                        This records a payment received from the owner to cover building service charges
                        {vacantProperties.length > 0 ? ` for vacant properties: ${vacantProperties.join(', ')}` : ''}.
                    </p>
                </div>

                {/* Owner Info */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="text-sm text-slate-500">Owner</p>
                            <p className="font-semibold text-slate-800">{ownerName}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm text-slate-500">Amount Owed</p>
                            <p className="font-bold text-red-600">{CURRENCY} {suggestedAmount.toLocaleString()}</p>
                        </div>
                    </div>
                </div>

                {/* Amount */}
                <Input
                    label="Amount to Receive"
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    required
                />

                {/* Date */}
                <Input
                    label="Payment Date"
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    required
                />

                {/* Account */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Receive Into Account</label>
                    <Select
                        value={accountId}
                        onChange={e => setAccountId(e.target.value)}
                    >
                        {accountOptions.map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.name}</option>
                        ))}
                    </Select>
                </div>

                {/* Reference */}
                <Input
                    label="Reference / Description (optional)"
                    type="text"
                    value={reference}
                    onChange={e => setReference(e.target.value)}
                    placeholder={`Service Charge Payment from ${ownerName}`}
                />

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSubmit}>Receive Payment</Button>
                </div>
            </div>
        </Modal>
    );
};

export default ReceiveFromOwnerModal;
