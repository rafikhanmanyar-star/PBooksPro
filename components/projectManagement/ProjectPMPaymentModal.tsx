
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, Transaction, AccountType, Project } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import { useNotification } from '../../context/NotificationContext';
import { CURRENCY } from '../../constants';

interface ProjectPMPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    project: Project;
    balanceDue: number;
}

const ProjectPMPaymentModal: React.FC<ProjectPMPaymentModalProps> = ({ isOpen, onClose, project, balanceDue }) => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert } = useNotification();
    
    // State
    const [amount, setAmount] = useState(Math.max(0, balanceDue).toString());
    const [paymentMode, setPaymentMode] = useState<'CASH' | 'EQUITY'>('CASH');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [description, setDescription] = useState('');
    
    // Cash Mode State
    const [sourceAccountId, setSourceAccountId] = useState('');
    
    // Equity Mode State
    const [targetProjectId, setTargetProjectId] = useState('');
    const [investorAccountId, setInvestorAccountId] = useState('');

    // Lists
    const bankAccounts = useMemo(() => state.accounts.filter(a => a.type === AccountType.BANK), [state.accounts]);
    const equityAccounts = useMemo(() => state.accounts.filter(a => a.type === AccountType.EQUITY), [state.accounts]);
    const targetProjects = useMemo(() => state.projects.filter(p => p.id !== project.id), [state.projects, project.id]);

    const handleSubmit = async () => {
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            await showAlert("Please enter a valid amount.");
            return;
        }

        const pmCostCategory = state.categories.find(c => c.name === 'Project Management Cost');
        if (!pmCostCategory) {
            await showAlert("Critical Error: 'Project Management Cost' category missing.");
            return;
        }

        const timestamp = Date.now();

        if (paymentMode === 'CASH') {
            if (!sourceAccountId) { await showAlert("Please select a payment account."); return; }
            
            const tx: Transaction = {
                id: `pm-pay-${timestamp}`,
                type: TransactionType.EXPENSE,
                amount: numAmount,
                date,
                description: description || `PM Fee Payment for ${project.name}`,
                accountId: sourceAccountId,
                categoryId: pmCostCategory.id,
                projectId: project.id,
                contactId: undefined // Could link to a PM staff member if needed
            };
            dispatch({ type: 'ADD_TRANSACTION', payload: tx });

        } else {
            // EQUITY TRANSFER
            // Logic: 
            // 1. Expense from Current Project (PM Cost) -> Reduces Project Profit
            // 2. Income/Equity Injection into Target Project for the Investor
            // Since we can't easily link expense in Proj A to Equity in Proj B directly, we use a Clearing Account.
            
            if (!targetProjectId) { await showAlert("Please select a target project."); return; }
            if (!investorAccountId) { await showAlert("Please select the investor equity account."); return; }

            let clearingAcc = state.accounts.find(a => a.name === 'Internal Clearing');
            if (!clearingAcc) {
                // Should exist, but fail safe
                await showAlert("System Error: Internal Clearing account missing.");
                return;
            }

            const batchId = `pm-eq-trans-${timestamp}`;
            const txs: Transaction[] = [];

            // 1. Record Expense in Source Project (Paid via Clearing)
            // This reduces the PM liability in Project A
            txs.push({
                id: `pm-exp-${timestamp}`,
                type: TransactionType.TRANSFER, // Using Transfer to move funds to Clearing
                amount: numAmount,
                date,
                description: description || `PM Fee Transfer to ${state.projects.find(p=>p.id===targetProjectId)?.name} (Equity)`,
                fromAccountId: clearingAcc.id, // Virtual source for expense? No.
                // Wait, Expense usually comes from Bank. Here it comes from... nowhere? 
                // It effectively increases liability of Project A to Clearing, and Project B owes Investor.
                // Let's treat it as a TRANSFER transaction where Source is Project A context?
                // Simplest: Expense on Project A paid from Clearing Account.
                // BUT Clearing Account needs balance.
                // Let's assume we use a TRANSFER transaction type to denote the movement.
                // FROM: Clearing (Virtual) -> NO.
                
                // Let's stick to the pattern used in Cycle Manager:
                // We are creating Equity in Project B. 
                // Investment: Investor -> Project B.
                // Source of funds: Project A Payout.
                
                // Transaction 1: Expense Project A (Category: PM Cost). Account: Clearing.
                // This marks the fee as "Paid" in Project A's ledger.
                accountId: clearingAcc.id, // Placeholder
                // Actually, use EXPENSE type to ensure it hits the P&L of Project A
                categoryId: pmCostCategory.id,
                projectId: project.id,
                batchId
            } as any); 
            // Correcting above: Use 'EXPENSE' type for P&L impact.
            // AccountID must be valid. Clearing Account is valid. 
            // So Project A pays Clearing Account.
            
            txs[0] = {
                id: `pm-exp-${timestamp}`,
                type: TransactionType.EXPENSE,
                amount: numAmount,
                date,
                description: description || `PM Fee Transfer to Equity (${state.projects.find(p=>p.id===targetProjectId)?.name})`,
                accountId: clearingAcc.id, 
                categoryId: pmCostCategory.id,
                projectId: project.id,
                batchId
            };

            // Transaction 2: Investment in Project B
            // Transfer FROM Clearing TO Investor Equity
            // This mirrors "Capital Investment" logic
            txs.push({
                id: `pm-inv-${timestamp}`,
                type: TransactionType.TRANSFER,
                amount: numAmount,
                date,
                description: `Equity Injection via PM Fee from ${project.name}`,
                accountId: investorAccountId,
                fromAccountId: clearingAcc.id,
                toAccountId: investorAccountId,
                projectId: targetProjectId,
                batchId
            });

            dispatch({ type: 'BATCH_ADD_TRANSACTIONS', payload: txs });
        }

        showToast("Payment recorded successfully.", "success");
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Pay PM Fee: ${project.name}`}>
            <div className="space-y-6">
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <span className="text-sm text-slate-500 block">Outstanding Fee Balance</span>
                    <span className="text-xl font-bold text-slate-800">{CURRENCY} {balanceDue.toLocaleString()}</span>
                </div>

                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Payment Mode</label>
                    <div className="grid grid-cols-2 gap-4">
                        <label className={`flex items-center justify-center p-3 rounded-lg border cursor-pointer transition-all ${paymentMode === 'CASH' ? 'bg-emerald-50 border-emerald-500 text-emerald-700 font-bold' : 'bg-white border-slate-200 text-slate-600'}`}>
                            <input type="radio" checked={paymentMode === 'CASH'} onChange={() => setPaymentMode('CASH')} className="hidden" />
                            Cash Payout
                        </label>
                        <label className={`flex items-center justify-center p-3 rounded-lg border cursor-pointer transition-all ${paymentMode === 'EQUITY' ? 'bg-indigo-50 border-indigo-500 text-indigo-700 font-bold' : 'bg-white border-slate-200 text-slate-600'}`}>
                            <input type="radio" checked={paymentMode === 'EQUITY'} onChange={() => setPaymentMode('EQUITY')} className="hidden" />
                            Transfer to Equity
                        </label>
                    </div>
                </div>

                <div className="space-y-4">
                    <Input label="Amount" type="number" value={amount} onChange={e => setAmount(e.target.value)} required />
                    
                    {paymentMode === 'CASH' ? (
                        <ComboBox label="Pay From (Bank)" items={bankAccounts} selectedId={sourceAccountId} onSelect={(i) => setSourceAccountId(i?.id || '')} placeholder="Select Account" required />
                    ) : (
                        <>
                            <ComboBox label="Target Project" items={targetProjects} selectedId={targetProjectId} onSelect={(i) => setTargetProjectId(i?.id || '')} placeholder="Select Project" required />
                            <ComboBox label="Investor Account (PM Team)" items={equityAccounts} selectedId={investorAccountId} onSelect={(i) => setInvestorAccountId(i?.id || '')} placeholder="Select Equity Account" required />
                            <p className="text-xs text-slate-500 bg-yellow-50 p-2 rounded border border-yellow-100">
                                Note: This will record an expense in the current project and create an equity investment in the target project.
                            </p>
                        </>
                    )}
                    
                    <Input label="Date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
                    <Input label="Description" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional details..." />
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSubmit}>Confirm Payment</Button>
                </div>
            </div>
        </Modal>
    );
};

export default ProjectPMPaymentModal;
