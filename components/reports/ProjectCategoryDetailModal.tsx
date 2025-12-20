
import React, { useState, useMemo } from 'react';
import Modal from '../ui/Modal';
import { TransactionType, Project } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { CURRENCY } from '../../constants';
import Button from '../ui/Button';
import Tabs from '../ui/Tabs';

interface ProjectCategoryDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project | null;
  startDate: Date;
  endDate: Date;
}

const ProjectCategoryDetailModal: React.FC<ProjectCategoryDetailModalProps> = ({ isOpen, onClose, project, startDate, endDate }) => {
  const { state } = useAppContext();
  const [activeTab, setActiveTab] = useState<TransactionType.INCOME | TransactionType.EXPENSE>(TransactionType.EXPENSE);

  const categorySummary = useMemo(() => {
    if (!project) return [];
    
    const start = new Date(startDate);
    start.setHours(0,0,0,0);
    const end = new Date(endDate);
    end.setHours(23,59,59,999);
    
    const transactions = state.transactions.filter(tx => {
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

        const txDate = new Date(tx.date);
        const category = state.categories.find(c => c.id === categoryId);
        
        return projectId === project.id && 
               tx.type === activeTab &&
               !category?.isRental && // Exclude rental
               txDate >= start &&
               txDate <= end;
    });

    const summary: { [categoryId: string]: { name: string, total: number } } = {};

    transactions.forEach(tx => {
        let categoryId = tx.categoryId;
        if (tx.billId && !categoryId) {
             const bill = state.bills.find(b => b.id === tx.billId);
             if (bill) categoryId = bill.categoryId;
        }
        if (tx.invoiceId && !categoryId) {
             const inv = state.invoices.find(i => i.id === tx.invoiceId);
             if (inv) categoryId = inv.categoryId;
        }

        const safeCategoryId = categoryId || 'uncategorized';
        if (!summary[safeCategoryId]) {
            const category = state.categories.find(c => c.id === safeCategoryId);
            summary[safeCategoryId] = { name: category?.name || 'Uncategorized', total: 0 };
        }
        summary[safeCategoryId].total += tx.amount;
    });

    return Object.values(summary).sort((a, b) => b.total - a.total);

  }, [project, startDate, endDate, activeTab, state.transactions, state.categories, state.bills, state.invoices]);
  
  const totalAmount = useMemo(() => {
      return categorySummary.reduce((sum, item) => sum + item.total, 0);
  }, [categorySummary]);

  if (!project) return null;

  const title = `Details for ${project.name}`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
        <div>
            <Tabs tabs={[TransactionType.EXPENSE, TransactionType.INCOME]} activeTab={activeTab} onTabClick={(tab) => setActiveTab(tab as any)} />
            
            <div className="p-3 bg-slate-100 rounded-lg my-4">
                <div className="flex justify-between items-center">
                    <span className="font-semibold text-slate-700">Total {activeTab}:</span>
                    <span className={`font-bold text-lg ${activeTab === TransactionType.INCOME ? 'text-success' : 'text-danger'}`}>
                        {CURRENCY} {totalAmount.toLocaleString()}
                    </span>
                </div>
            </div>
            
            {categorySummary.length > 0 ? (
                <div className="max-h-[60vh] overflow-y-auto -mx-4">
                    <div className="divide-y divide-slate-100">
                        {categorySummary.map(item => (
                            <div key={item.name} className="flex justify-between items-center px-4 py-3">
                                <span className="font-medium text-slate-800">{item.name}</span>
                                <span className={`font-semibold ${activeTab === TransactionType.INCOME ? 'text-success' : 'text-danger'}`}>
                                    {CURRENCY} {item.total.toLocaleString()}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                 <div className="text-center py-10">
                    <h3 className="mt-2 text-md font-semibold text-slate-800">No {activeTab.toLowerCase()} transactions found.</h3>
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
