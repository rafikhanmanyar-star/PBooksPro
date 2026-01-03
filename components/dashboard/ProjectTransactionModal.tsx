
import React, { useMemo } from 'react';
import Modal from '../ui/Modal';
import { Transaction, TransactionType } from '../../types';
import { useAppContext } from '../../context/AppContext';
import TransactionItem from '../transactions/TransactionItem';
import { ICONS, CURRENCY } from '../../constants';
import Button from '../ui/Button';
import { formatRoundedNumber } from '../../utils/numberUtils';

interface ProjectTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: {
    projectId: string;
    projectName: string;
    categoryId?: string;
    categoryName?: string;
    type: 'Income' | 'Expense';
    startDate: string;
    endDate: string;
  } | null;
}

const ProjectTransactionModal: React.FC<ProjectTransactionModalProps> = ({ isOpen, onClose, data }) => {
  const { state } = useAppContext();

  const filteredTransactions = useMemo(() => {
    if (!data) return [];
    
    const start = new Date(data.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(data.endDate);
    end.setHours(23, 59, 59, 999);

    return state.transactions.filter(tx => {
        let projectId = tx.projectId;
        let categoryId = tx.categoryId;

        // Resolve details from linked Bill if missing
        if (tx.billId) {
            const bill = state.bills.find(b => b.id === tx.billId);
            if (bill) {
                if (!projectId) projectId = bill.projectId;
                if (!categoryId) categoryId = bill.categoryId;
            }
        }

        // Resolve details from linked Invoice if missing
        if (tx.invoiceId) {
             const inv = state.invoices.find(i => i.id === tx.invoiceId);
             if (inv) {
                 if (!projectId) projectId = inv.projectId;
                 if (!categoryId) categoryId = inv.categoryId;
             }
        }

        // Exclude Rental Categories
        const category = state.categories.find(c => c.id === categoryId);
        if (category?.isRental) return false;

        // Must be a project transaction
        if (!projectId) return false;

        const txDate = new Date(tx.date);
        
        const projectMatch = data.projectId === 'all' ? !!projectId : projectId === data.projectId;
        
        let categoryMatch = true;
        if (data.categoryId) {
            if (data.categoryId === 'uncategorized') categoryMatch = !categoryId;
            else categoryMatch = categoryId === data.categoryId;
        }

        return projectMatch &&
               categoryMatch &&
               tx.type === data.type &&
               txDate >= start &&
               txDate <= end;
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  }, [data, state.transactions, state.categories, state.bills, state.invoices]);
  
  const totalAmount = useMemo(() => {
      return filteredTransactions.reduce((sum, tx) => sum + tx.amount, 0);
  }, [filteredTransactions]);

  if (!data) return null;

  const title = `${data.type} Transactions - ${data.categoryName ? data.categoryName : 'All Categories'}`;
  const subTitle = data.projectId === 'all' ? 'All Projects' : data.projectName;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
        <div>
            <div className="p-3 bg-slate-100 rounded-lg mb-4">
                <div className="flex justify-between items-center">
                    <div>
                        <span className="font-semibold text-slate-700 block">{subTitle}</span>
                        <span className="text-xs text-slate-500">
                            {new Date(data.startDate).toLocaleDateString()} - {new Date(data.endDate).toLocaleDateString()}
                        </span>
                    </div>
                    <span className={`font-bold text-lg ${data.type === 'Income' ? 'text-success' : 'text-danger'}`}>
                        {CURRENCY} {formatRoundedNumber(totalAmount)}
                    </span>
                </div>
            </div>
            
            {filteredTransactions.length > 0 ? (
                <div className="max-h-[60vh] overflow-y-auto -mx-4">
                    <div className="divide-y divide-slate-100">
                        {filteredTransactions.map(tx => (
                            <TransactionItem key={tx.id} transaction={tx} onEdit={() => {}} />
                        ))}
                    </div>
                </div>
            ) : (
                 <div className="text-center py-10">
                    <div className="mx-auto h-12 w-12 text-slate-400">{ICONS.fileText}</div>
                    <h3 className="mt-2 text-md font-semibold text-slate-800">No Transactions Found</h3>
                </div>
            )}
            <div className="flex-grow flex justify-end mt-4">
                <Button variant="secondary" onClick={onClose}>Close</Button>
            </div>
        </div>
    </Modal>
  );
};

export default ProjectTransactionModal;
