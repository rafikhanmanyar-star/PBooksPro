
import React, { useMemo } from 'react';
import Modal from '../ui/Modal';
import { useAppContext } from '../../context/AppContext';
import TransactionItem from '../transactions/TransactionItem';
import { TransactionType, LoanSubtype, AccountType } from '../../types';
import Button from '../ui/Button';
import { CURRENCY } from '../../constants';

interface SettingsLedgerModalProps {
    isOpen: boolean;
    onClose: () => void;
    entityId: string;
    entityType: 'account' | 'category' | 'contact' | 'project' | 'building' | 'property' | 'unit';
    entityName: string;
}

const SettingsLedgerModal: React.FC<SettingsLedgerModalProps> = ({ isOpen, onClose, entityId, entityType, entityName }) => {
    const { state, dispatch } = useAppContext();

    const transactions = useMemo(() => {
        if (!entityId) return [];

        return state.transactions.filter(tx => {
            if (entityType === 'account') {
                return tx.accountId === entityId || tx.fromAccountId === entityId || tx.toAccountId === entityId;
            }
            if (entityType === 'category') {
                return tx.categoryId === entityId;
            }
            if (entityType === 'contact') {
                return tx.contactId === entityId;
            }
            if (entityType === 'project') {
                return tx.projectId === entityId;
            }
            if (entityType === 'building') {
                return tx.buildingId === entityId;
            }
            if (entityType === 'property') {
                return tx.propertyId === entityId;
            }
            if (entityType === 'unit') {
                return tx.unitId === entityId;
            }
            return false;
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [state.transactions, entityId, entityType]);

    const totalBalance = useMemo(() => {
        if (entityType === 'account') {
            const acc = state.accounts.find(a => a.id === entityId);
            // Invert balance for Equity and Liability accounts so positive numbers mean "Credit Balance" (Money in the bucket for Equity/Liability)
            if (acc && (acc.type === AccountType.LIABILITY || acc.type === AccountType.EQUITY)) {
                return -(acc.balance || 0);
            }
            return acc?.balance || 0;
        }
        
        return transactions.reduce((sum, tx) => {
            let amount = tx.amount;
            
            if (entityType === 'category' || entityType === 'project' || entityType === 'building' || entityType === 'property' || entityType === 'unit') {
                // For categorical/structural entities, calculate net flow (Income - Expense)
                if (tx.type === TransactionType.INCOME) return sum + amount;
                if (tx.type === TransactionType.EXPENSE) return sum - amount;
                return sum;
            }

            // For contacts (Ledger logic)
            // Income linked to contact = Credit (Positive impact on business cash, but for contact ledger usually implies they paid us)
            // Expense linked to contact = Debit (Negative impact on business cash, we paid them)
            // Displaying net flow:
            if (tx.type === TransactionType.EXPENSE) return sum - amount;
            if (tx.type === TransactionType.INCOME) return sum + amount;
            if (tx.type === TransactionType.LOAN) {
                 if (tx.subtype === LoanSubtype.RECEIVE) return sum + amount;
                 return sum - amount;
            }
            return sum;
        }, 0);
    }, [transactions, entityType, entityId, state.accounts]);

    const handleEditTransaction = (tx: any) => {
        onClose();
        dispatch({ type: 'SET_EDITING_ENTITY', payload: null }); 
        // Note: Transaction editing navigation would typically happen here
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Ledger: ${entityName}`} size="xl">
            <div className="space-y-4">
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-600">Net Volume / Balance</span>
                    <span className={`text-xl font-bold ${totalBalance >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>
                        {CURRENCY} {totalBalance.toLocaleString()}
                    </span>
                </div>

                <div className="max-h-[60vh] overflow-y-auto border rounded-lg border-slate-100">
                    {transactions.length > 0 ? (
                        <div className="divide-y divide-slate-100">
                            {transactions.map(tx => (
                                <TransactionItem key={tx.id} transaction={tx} onEdit={handleEditTransaction} />
                            ))}
                        </div>
                    ) : (
                        <div className="p-8 text-center text-slate-500">
                            No transactions found for this item.
                        </div>
                    )}
                </div>

                <div className="flex justify-end">
                    <Button variant="secondary" onClick={onClose}>Close</Button>
                </div>
            </div>
        </Modal>
    );
};

export default SettingsLedgerModal;
