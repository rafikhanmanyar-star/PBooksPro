
import React, { useMemo, useState } from 'react';
import Modal from '../ui/Modal';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, AccountType } from '../../types';
import { CURRENCY } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import Button from '../ui/Button';

interface InvestorHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    investorId: string;
    investorName: string;
    initialProjectId?: string; // If 'all', shows all. If specific ID, filters initally.
}

const InvestorHistoryModal: React.FC<InvestorHistoryModalProps> = ({ isOpen, onClose, investorId, investorName, initialProjectId }) => {
    const { state } = useAppContext();
    const [showAllProjects, setShowAllProjects] = useState(initialProjectId === 'all' || !initialProjectId);

    const transactions = useMemo(() => {
        if (!investorId) return [];

        let txs = state.transactions.filter(tx => {
            // Must be related to the investor's equity account
            if (tx.fromAccountId !== investorId && tx.toAccountId !== investorId && tx.accountId !== investorId) return false;
            
            // Must be TRANSFER (Capital) or INCOME (Profit)
            if (tx.type !== TransactionType.TRANSFER && tx.type !== TransactionType.INCOME) return false;
            
            return true;
        });

        // Filter by project if not showing all
        if (!showAllProjects && initialProjectId && initialProjectId !== 'all') {
            txs = txs.filter(tx => tx.projectId === initialProjectId);
        }

        return txs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    }, [state.transactions, investorId, showAllProjects, initialProjectId]);

    const formattedData = useMemo(() => {
        return transactions.map(tx => {
            const isCredit = tx.toAccountId === investorId || (tx.type === TransactionType.INCOME && tx.accountId === investorId);
            const isDebit = tx.fromAccountId === investorId;
            
            // Logic:
            // Investment: FROM Investor TO Company (Transfer). Investor Acct is Source. 
            // Wait, In ProjectEquityManagement:
            // Investment: From=Investor, To=Bank. (Debit to Investor Account? No, Credit to Bank)
            // Wait, standard accounting:
            // Receive Cash from Investor: Dr Bank, Cr Equity.
            // In our system: Transfer From Investor (Equity) To Bank (Asset).
            // Equity Account Balance decreases (becomes more negative/credit). 
            // So "Investment" is when FromAccount = Investor.
            
            // Withdrawal: Transfer From Bank To Investor.
            // Equity Account Balance increases (becomes less negative).
            // So "Withdrawal" is when ToAccount = Investor.
            
            // Profit Share (Income): Income allocated to Equity Account. 
            // Increases "Amount Owed to Investor". Same direction as Investment.
            
            let type = 'Unknown';
            let amount = 0;
            let direction = '';

            if (tx.type === TransactionType.TRANSFER) {
                 if (tx.fromAccountId === investorId) {
                     type = 'Investment';
                     amount = tx.amount;
                     direction = 'Invested';
                 } else if (tx.toAccountId === investorId) {
                     // Check if profit distribution or withdrawal
                     if (tx.description?.toLowerCase().includes('profit')) {
                         type = 'Profit Share';
                         amount = tx.amount;
                         direction = 'Earned';
                     } else {
                         type = 'Withdrawal';
                         amount = tx.amount;
                         direction = 'Withdrawn';
                     }
                 }
            } else if (tx.type === TransactionType.INCOME) {
                type = 'Profit Share (Direct)';
                amount = tx.amount;
                direction = 'Earned';
            }

            return {
                id: tx.id,
                date: tx.date,
                type,
                description: tx.description,
                projectName: state.projects.find(p => p.id === tx.projectId)?.name || 'General',
                amount,
                direction
            };
        });
    }, [transactions, investorId, state.projects]);

    const totalInvested = formattedData.filter(d => d.direction === 'Invested').reduce((sum, d) => sum + d.amount, 0);
    const totalWithdrawn = formattedData.filter(d => d.direction === 'Withdrawn').reduce((sum, d) => sum + d.amount, 0);
    const totalProfit = formattedData.filter(d => d.direction === 'Earned').reduce((sum, d) => sum + d.amount, 0);
    const netEquity = (totalInvested + totalProfit) - totalWithdrawn;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Investor History: ${investorName}`} size="xl">
            <div className="flex flex-col h-[70vh]">
                <div className="flex justify-between items-center mb-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div className="text-sm">
                        <span className="text-slate-500 mr-2">Scope:</span>
                        <span className="font-bold text-slate-800">
                            {showAllProjects ? 'All Projects' : state.projects.find(p => p.id === initialProjectId)?.name || 'Selected Project'}
                        </span>
                        {!showAllProjects && (
                             <button 
                                onClick={() => setShowAllProjects(true)}
                                className="ml-3 text-xs text-indigo-600 hover:underline font-medium"
                            >
                                Show All Projects
                            </button>
                        )}
                         {showAllProjects && initialProjectId && initialProjectId !== 'all' && (
                             <button 
                                onClick={() => setShowAllProjects(false)}
                                className="ml-3 text-xs text-indigo-600 hover:underline font-medium"
                            >
                                Filter by {state.projects.find(p => p.id === initialProjectId)?.name}
                            </button>
                        )}
                    </div>
                    <div className="text-right text-sm">
                         <span className="text-slate-500">Net Equity:</span>
                         <span className="ml-2 font-bold text-slate-800">{CURRENCY} {netEquity.toLocaleString()}</span>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-4 text-center">
                    <div className="p-2 bg-emerald-50 rounded border border-emerald-100">
                        <div className="text-xs text-emerald-600 font-bold uppercase">Invested</div>
                        <div className="text-lg font-bold text-emerald-800">{CURRENCY} {totalInvested.toLocaleString()}</div>
                    </div>
                    <div className="p-2 bg-indigo-50 rounded border border-indigo-100">
                        <div className="text-xs text-indigo-600 font-bold uppercase">Profit Share</div>
                        <div className="text-lg font-bold text-indigo-800">{CURRENCY} {totalProfit.toLocaleString()}</div>
                    </div>
                    <div className="p-2 bg-rose-50 rounded border border-rose-100">
                        <div className="text-xs text-rose-600 font-bold uppercase">Withdrawn</div>
                        <div className="text-lg font-bold text-rose-800">{CURRENCY} {totalWithdrawn.toLocaleString()}</div>
                    </div>
                </div>

                <div className="flex-grow overflow-auto border rounded-lg">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                        <thead className="bg-slate-50 sticky top-0 z-10">
                            <tr>
                                <th className="px-4 py-2 text-left font-medium text-slate-600">Date</th>
                                <th className="px-4 py-2 text-left font-medium text-slate-600">Type</th>
                                <th className="px-4 py-2 text-left font-medium text-slate-600">Project</th>
                                <th className="px-4 py-2 text-left font-medium text-slate-600">Description</th>
                                <th className="px-4 py-2 text-right font-medium text-slate-600">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {formattedData.map(row => (
                                <tr key={row.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-2 whitespace-nowrap text-slate-700">{formatDate(row.date)}</td>
                                    <td className="px-4 py-2">
                                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                            row.direction === 'Invested' ? 'bg-emerald-100 text-emerald-800' :
                                            row.direction === 'Withdrawn' ? 'bg-rose-100 text-rose-800' :
                                            'bg-indigo-100 text-indigo-800'
                                        }`}>
                                            {row.type}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2 text-slate-700">{row.projectName}</td>
                                    <td className="px-4 py-2 text-slate-600 max-w-xs truncate" title={row.description}>{row.description}</td>
                                    <td className="px-4 py-2 text-right font-mono font-medium text-slate-800">{CURRENCY} {row.amount.toLocaleString()}</td>
                                </tr>
                            ))}
                            {formattedData.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">No transactions found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="flex justify-end mt-4 pt-2 border-t">
                    <Button variant="secondary" onClick={onClose}>Close</Button>
                </div>
            </div>
        </Modal>
    );
};

export default InvestorHistoryModal;
