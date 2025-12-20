
import React, { useState, useMemo } from 'react';
import Modal from '../ui/Modal';
import { Building, Transaction } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { CURRENCY, ICONS } from '../../constants';
import Button from '../ui/Button';
import TransactionForm from '../transactions/TransactionForm';
import LinkedTransactionWarningModal from '../transactions/LinkedTransactionWarningModal';
import { formatDate } from '../../utils/dateUtils';

interface BuildingTransactionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  building?: Building;
  accountType?: string;
  transactions: Transaction[];
}

type SortKey = 'date' | 'property' | 'description' | 'amount';

const BuildingTransactionsModal: React.FC<BuildingTransactionsModalProps> = ({ isOpen, onClose, building, accountType, transactions }) => {
    const { state, dispatch } = useAppContext();
    const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
    const [warningModalState, setWarningModalState] = useState<{ isOpen: boolean; transaction: Transaction | null; action: 'edit' | 'delete' | null; }>({ isOpen: false, transaction: null, action: null });
    
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });

    const handleSort = (key: SortKey) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const sortedTransactions = useMemo(() => {
        const sorted = [...transactions];
        sorted.sort((a, b) => {
            let valA: any = a[sortConfig.key as keyof Transaction] || '';
            let valB: any = b[sortConfig.key as keyof Transaction] || '';

            if (sortConfig.key === 'date') {
                valA = new Date(a.date).getTime();
                valB = new Date(b.date).getTime();
            } else if (sortConfig.key === 'property') {
                 const propA = state.properties.find(p => p.id === a.propertyId)?.name || '';
                 const propB = state.properties.find(p => p.id === b.propertyId)?.name || '';
                 valA = propA.toLowerCase();
                 valB = propB.toLowerCase();
            } else if (sortConfig.key === 'description') {
                valA = (a.description || '').toLowerCase();
                valB = (b.description || '').toLowerCase();
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }, [transactions, sortConfig, state.properties]);

    const handleEdit = (tx: Transaction) => {
        setEditingTransaction(tx);
    };
    
    const handleCloseForm = () => {
        setEditingTransaction(null);
    };

    const handleShowDeleteWarning = (tx: Transaction) => {
        setEditingTransaction(null);
        setWarningModalState({ isOpen: true, transaction: tx, action: 'delete' });
    };

    const handleConfirmWarning = () => {
        const { transaction, action } = warningModalState;
        if (!transaction || !action) return;

        if (action === 'delete') {
            dispatch({ type: 'DELETE_TRANSACTION', payload: transaction.id });
        }
        setWarningModalState({ isOpen: false, transaction: null, action: null });
    };

    const handleCloseWarning = () => {
        setWarningModalState({ isOpen: false, transaction: null, action: null });
    };

    const getLinkedItemName = (tx: Transaction | null): string => {
        if (!tx?.invoiceId) return 'an unknown item';
        const invoice = state.invoices.find(i => i.id === tx.invoiceId);
        return `Invoice #${invoice?.invoiceNumber || 'N/A'}`;
    };

    const totalAmount = transactions.reduce((sum, tx) => sum + tx.amount, 0);

    const title = `${accountType} Transactions for ${building?.name}`;

    const SortIcon = ({ column }: { column: SortKey }) => (
        <span className="ml-1 text-[10px] text-slate-400">
            {sortConfig.key === column ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
        </span>
    );

    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} title={title} size="xl">
                <div>
                    <div className="p-3 bg-slate-100 rounded-lg mb-4 flex justify-between items-center">
                        <span className="font-semibold text-slate-700">Total:</span>
                        <span className="font-bold text-lg text-accent">{CURRENCY} {totalAmount.toLocaleString()}</span>
                    </div>

                    {sortedTransactions.length > 0 ? (
                        <div className="max-h-[60vh] overflow-y-auto">
                            <table className="min-w-full divide-y divide-slate-200 text-sm">
                                <thead className="bg-slate-50 sticky top-0">
                                    <tr>
                                        <th onClick={() => handleSort('date')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Date <SortIcon column="date"/></th>
                                        <th onClick={() => handleSort('property')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Property <SortIcon column="property"/></th>
                                        <th onClick={() => handleSort('description')} className="px-3 py-2 text-left font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Description <SortIcon column="description"/></th>
                                        <th onClick={() => handleSort('amount')} className="px-3 py-2 text-right font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 select-none">Amount <SortIcon column="amount"/></th>
                                        <th className="px-3 py-2 text-right font-semibold text-slate-600"></th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-200">
                                    {sortedTransactions.map(tx => {
                                        const property = state.properties.find(p => p.id === tx.propertyId);
                                        return (
                                            <tr key={tx.id}>
                                                <td className="px-3 py-2 whitespace-nowrap">{formatDate(tx.date)}</td>
                                                <td className="px-3 py-2 whitespace-nowrap">{property?.name || 'N/A'}</td>
                                                <td className="px-3 py-2 max-w-xs truncate">{tx.description}</td>
                                                <td className="px-3 py-2 text-right font-medium">{CURRENCY} {tx.amount.toLocaleString()}</td>
                                                <td className="px-3 py-2 text-right">
                                                    <Button variant="ghost" size="sm" onClick={() => handleEdit(tx)}>
                                                        <div className="w-4 h-4">{ICONS.edit}</div>
                                                    </Button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="text-center py-10 text-slate-500">No transactions found.</p>
                    )}
                    <div className="flex justify-end mt-4">
                        <Button variant="secondary" onClick={onClose}>Close</Button>
                    </div>
                </div>
            </Modal>
            
            <Modal isOpen={!!editingTransaction} onClose={handleCloseForm} title="Edit Transaction">
                <TransactionForm 
                    transactionToEdit={editingTransaction}
                    onClose={handleCloseForm}
                    onShowDeleteWarning={handleShowDeleteWarning}
                />
            </Modal>

            <LinkedTransactionWarningModal
                isOpen={warningModalState.isOpen}
                onClose={handleCloseWarning}
                onConfirm={handleConfirmWarning}
                action={warningModalState.action as 'update' | 'delete'}
                linkedItemName={getLinkedItemName(warningModalState.transaction)}
            />
        </>
    );
};

export default BuildingTransactionsModal;
