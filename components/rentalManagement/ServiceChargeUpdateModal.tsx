
import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Transaction } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { useNotification } from '../../context/NotificationContext';

interface ServiceChargeUpdateModalProps {
    isOpen: boolean;
    onClose: () => void;
    transaction: Transaction | null;
}

const ServiceChargeUpdateModal: React.FC<ServiceChargeUpdateModalProps> = ({ isOpen, onClose, transaction }) => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert, showConfirm } = useNotification();

    const [amount, setAmount] = useState('');
    const [date, setDate] = useState('');

    useEffect(() => {
        if (isOpen && transaction) {
            setAmount(transaction.amount.toString());
            const d = new Date(transaction.date);
            setDate(!isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '');
        }
    }, [isOpen, transaction]);

    const handleSave = async () => {
        if (!transaction) return;

        const newAmount = parseFloat(amount);
        if (isNaN(newAmount) || newAmount <= 0) {
            await showAlert("Please enter a valid positive amount.");
            return;
        }

        if (!date) {
            await showAlert("Please select a valid date.");
            return;
        }
        
        const dateObj = new Date(date);
        if (isNaN(dateObj.getTime())) {
            await showAlert("Invalid date selected.");
            return;
        }

        // 1. Update the selected transaction (Income for Building)
        const updatedTx: Transaction = {
            ...transaction,
            amount: newAmount,
            date: dateObj.toISOString(),
        };
        dispatch({ type: 'UPDATE_TRANSACTION', payload: updatedTx });

        // 2. Attempt to find and update the corresponding deduction transaction (Expense/Negative Income for Owner)
        // We look for a transaction created around the same time, same property, with inverted amount.
        // The bulk runner creates them with IDs like `bm-debit-{timestamp}-{i}` and `bm-credit-{timestamp}-{i}`
        
        // Heuristic 1: ID Pattern matching
        let pairId = '';
        if (transaction.id.includes('bm-credit')) {
            pairId = transaction.id.replace('bm-credit', 'bm-debit');
        } else if (transaction.id.includes('bm-debit')) {
             pairId = transaction.id.replace('bm-debit', 'bm-credit');
        }

        let pairTx = state.transactions.find(t => t.id === pairId);

        // Heuristic 2: Loose matching if IDs don't match (e.g. manual or legacy)
        if (!pairTx) {
            pairTx = state.transactions.find(t => 
                t.id !== transaction.id &&
                t.propertyId === transaction.propertyId &&
                t.date === transaction.date &&
                Math.abs(t.amount + transaction.amount) < 0.01 // Opposite amounts sum to 0
            );
        }

        if (pairTx) {
            const updatedPairTx: Transaction = {
                ...pairTx,
                amount: -newAmount, // Invert for deduction
                date: dateObj.toISOString(),
            };
            dispatch({ type: 'UPDATE_TRANSACTION', payload: updatedPairTx });
        }

        showToast("Service charge updated successfully.", "success");
        onClose();
    };

    const handleDelete = async () => {
        if (!transaction) return;
        
        if (await showConfirm("Are you sure you want to delete this service charge? This will also remove the associated owner deduction/building fund entry.", { title: "Delete Service Charge", confirmLabel: "Delete", cancelLabel: "Cancel" })) {
             // Delete current
             dispatch({ type: 'DELETE_TRANSACTION', payload: transaction.id });

             // Find and delete pair
             let pairId = '';
             if (transaction.id.includes('bm-credit')) {
                 pairId = transaction.id.replace('bm-credit', 'bm-debit');
             } else if (transaction.id.includes('bm-debit')) {
                 pairId = transaction.id.replace('bm-debit', 'bm-credit');
             }
             
             let pairTx = state.transactions.find(t => t.id === pairId);
             
             if (!pairTx) {
                 // Fallback match
                 pairTx = state.transactions.find(t => 
                    t.id !== transaction.id &&
                    t.propertyId === transaction.propertyId &&
                    t.date === transaction.date &&
                    Math.abs(t.amount + transaction.amount) < 0.01
                );
             }
             
             if (pairTx) {
                 dispatch({ type: 'DELETE_TRANSACTION', payload: pairTx.id });
             }
             
             showToast("Service charge deleted.", "info");
             onClose();
        }
    };

    if (!transaction) return null;

    const property = state.properties.find(p => p.id === transaction.propertyId);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Update Service Charge">
            <div className="space-y-4">
                <div className="p-3 bg-slate-50 rounded border border-slate-200 text-sm">
                    <p><strong>Property:</strong> {property?.name || 'Unknown'}</p>
                    <p className="text-xs text-slate-500 mt-1">Updating this will adjust the Owner's ledger and Building Fund automatically.</p>
                </div>

                <Input 
                    label="Amount" 
                    type="number" 
                    value={amount} 
                    onChange={e => setAmount(e.target.value)} 
                />
                
                <Input 
                    label="Date Applied" 
                    type="date" 
                    value={date} 
                    onChange={e => setDate(e.target.value)} 
                />

                <div className="flex justify-between pt-4">
                    <Button variant="danger" onClick={handleDelete}>Delete</Button>
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={onClose}>Cancel</Button>
                        <Button onClick={handleSave}>Save Changes</Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default ServiceChargeUpdateModal;
