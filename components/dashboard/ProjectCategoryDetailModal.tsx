import React, { useMemo } from 'react';
import Modal from '../ui/Modal';
import { TransactionType } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { CURRENCY } from '../../constants';
import Button from '../ui/Button';
import { formatRoundedNumber } from '../../utils/numberUtils';

interface ProjectCategoryDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: {
    projectId: string;
    projectName: string;
    type: 'Income' | 'Expense';
  } | null;
}

const ProjectCategoryDetailModal: React.FC<ProjectCategoryDetailModalProps> = ({ isOpen, onClose, data }) => {
  const { state } = useAppContext();

  const categorySummary = useMemo(() => {
    if (!data) return [];
    
    const transactions = state.transactions.filter(tx => 
        tx.projectId === data.projectId && tx.type === (data.type as TransactionType)
    );

    const summary: { [categoryId: string]: { name: string, total: number } } = {};

    transactions.forEach(tx => {
        const categoryId = tx.categoryId || 'uncategorized';
        if (!summary[categoryId]) {
            const category = state.categories.find(c => c.id === tx.categoryId);
            summary[categoryId] = { name: category?.name || 'Uncategorized', total: 0 };
        }
        summary[categoryId].total += tx.amount;
    });

    return Object.values(summary).sort((a, b) => b.total - a.total);

  }, [data, state.transactions, state.categories]);
  
  const totalAmount = useMemo(() => {
      return categorySummary.reduce((sum, item) => sum + item.total, 0);
  }, [categorySummary]);

  if (!data) return null;

  const title = `${data.type} Breakdown for ${data.projectName}`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
        <div>
            <div className="p-3 bg-slate-100 rounded-lg mb-4">
                <div className="flex justify-between items-center">
                    <span className="font-semibold text-slate-700">Total {data.type}:</span>
                    <span className={`font-bold text-lg ${data.type === 'Income' ? 'text-success' : 'text-danger'}`}>
                        {CURRENCY} {formatRoundedNumber(totalAmount)}
                    </span>
                </div>
            </div>
            
            {categorySummary.length > 0 ? (
                <div className="max-h-[60vh] overflow-y-auto -mx-4">
                    <div className="divide-y divide-slate-100">
                        {categorySummary.map(item => (
                            <div key={item.name} className="flex justify-between items-center px-4 py-3">
                                <span className="font-medium text-slate-800">{item.name}</span>
                                <span className={`font-semibold ${data.type === 'Income' ? 'text-success' : 'text-danger'}`}>
                                    {CURRENCY} {formatRoundedNumber(item.total)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                 <div className="text-center py-10">
                    <h3 className="mt-2 text-md font-semibold text-slate-800">No {data.type.toLowerCase()} transactions found for this project.</h3>
                </div>
            )}
            <div className="flex justify-end mt-4">
                <Button variant="secondary" onClick={onClose}>Close</Button>
            </div>
        </div>
    </Modal>
  );
};

export default ProjectCategoryDetailModal;
