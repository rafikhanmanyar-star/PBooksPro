
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, Transaction, AccountType } from '../../types';
import { CURRENCY } from '../../constants';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import ComboBox from '../ui/ComboBox';
import { useNotification } from '../../context/NotificationContext';

interface PMProjectBalance {
    projectId: string;
    projectName: string;
    accruedFee: number;
    paidFee: number;
    balance: number;
}

const ProjectPMPayouts: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showAlert, showToast } = useNotification();
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentAccount, setPaymentAccount] = useState('');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);

    const balances = useMemo<PMProjectBalance[]>(() => {
        // Add safety checks for undefined arrays
        if (!state.categories || !Array.isArray(state.categories)) return [];
        if (!state.projects || !Array.isArray(state.projects)) return [];
        if (!state.transactions || !Array.isArray(state.transactions)) return [];
        
        const pmCostCategory = state.categories.find(c => c?.name === 'Project Management Cost');
        const brokerFeeCategory = state.categories.find(c => c?.name === 'Broker Fee');
        const rebateCategory = state.categories.find(c => c?.name === 'Rebate Amount');
        const ownerPayoutCategory = state.categories.find(c => c?.name === 'Owner Payout');
        
        // Discount Categories to exclude
        const discountCategories = state.categories.filter(c => 
            c?.name && ['Customer Discount', 'Floor Discount', 'Lump Sum Discount', 'Misc Discount'].includes(c.name)
        );

        // Categories to exclude from cost base: Commissions, Rebates, Payouts, and Discounts
        const excludedCategoryIds = [
            brokerFeeCategory?.id, 
            rebateCategory?.id, 
            pmCostCategory?.id,
            ownerPayoutCategory?.id,
            ...discountCategories.map(c => c.id)
        ].filter(Boolean) as string[];

        const projectData: Record<string, { expense: number, excluded: number, paid: number }> = {};

        // Initialize projects
        state.projects.forEach(p => {
            if (p?.id) {
                projectData[p.id] = { expense: 0, excluded: 0, paid: 0 };
            }
        });

        state.transactions.forEach(tx => {
            if (tx.type !== TransactionType.EXPENSE || !tx.projectId || !projectData[tx.projectId]) return;

            if (pmCostCategory && tx.categoryId === pmCostCategory.id) {
                projectData[tx.projectId].paid += tx.amount;
            } else {
                projectData[tx.projectId].expense += tx.amount;
                if (tx.categoryId && excludedCategoryIds.includes(tx.categoryId)) {
                    projectData[tx.projectId].excluded += tx.amount;
                }
            }
        });

        const pmPercentage = state.pmCostPercentage || 0;

        return Object.entries(projectData).map(([id, data]) => {
            const project = state.projects.find(p => p?.id === id);
            const netBase = data.expense - data.excluded;
            const accrued = netBase * (pmPercentage / 100);
            return {
                projectId: id,
                projectName: project?.name || 'Unknown',
                accruedFee: accrued,
                paidFee: data.paid,
                balance: accrued - data.paid
            };
        }).filter(p => Math.abs(p.balance) > 0.01 || p.accruedFee > 0);

    }, [state.transactions, state.projects, state.categories, state.pmCostPercentage]);

    const selectedBalance = useMemo(() => balances.find(b => b.projectId === selectedProjectId), [balances, selectedProjectId]);
    // Filter for Bank Accounts
    const accounts = useMemo(() => state.accounts.filter(a => a.type === AccountType.BANK), [state.accounts]);

    const handleOpenModal = (projectId: string) => {
        setSelectedProjectId(projectId);
        const balance = balances.find(b => b.projectId === projectId)?.balance || 0;
        setPaymentAmount(Math.max(0, balance).toFixed(2));
        const cash = accounts.find(a => a.name === 'Cash');
        setPaymentAccount(cash?.id || accounts[0]?.id || '');
        setIsModalOpen(true);
    };

    const handlePayment = async () => {
        if (!selectedProjectId || !paymentAccount) return;
        
        const amt = parseFloat(paymentAmount);
        if (isNaN(amt) || amt <= 0) {
            await showAlert("Please enter a valid amount.");
            return;
        }

        const pmCategory = state.categories.find(c => c.name === 'Project Management Cost');
        if (!pmCategory) {
            await showAlert("System Error: 'Project Management Cost' category is missing. Please check Settings > Categories.");
            return;
        }

        const project = state.projects.find(p => p.id === selectedProjectId);

        const tx: Transaction = {
            id: `pm-pay-${Date.now()}`,
            type: TransactionType.EXPENSE,
            amount: amt,
            date: paymentDate,
            description: `PM Cost Payout for ${project?.name}`,
            accountId: paymentAccount,
            categoryId: pmCategory.id,
            projectId: selectedProjectId,
            contactId: undefined 
        };

        dispatch({ type: 'ADD_TRANSACTION', payload: tx });
        showToast("PM Payout recorded successfully", 'success');
        setIsModalOpen(false);
    };

    return (
        <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg text-sm text-blue-800">
                <p className="font-semibold mb-1">About Project Management Costs</p>
                <p>
                    Fees are calculated as <strong>{state.pmCostPercentage}%</strong> of the project's total expenses (excluding commissions, rebates, discounts, and payouts).
                    Use this screen to record payments for these accrued fees.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {balances.length > 0 ? balances.map(item => (
                    <Card key={item.projectId} className="flex flex-col justify-between">
                        <div>
                            <h3 className="font-bold text-lg text-slate-800">{item.projectName}</h3>
                            <div className="mt-3 space-y-2 text-sm">
                                <div className="flex justify-between text-slate-600">
                                    <span>Accrued ({state.pmCostPercentage}%):</span>
                                    <span className="font-medium">{CURRENCY} {item.accruedFee.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-slate-600">
                                    <span>Paid:</span>
                                    <span className="font-medium text-emerald-600">{CURRENCY} {item.paidFee.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between pt-3 border-t border-slate-100 mt-2">
                                    <span className="font-bold text-slate-700">Balance Due:</span>
                                    <span className={`font-bold ${item.balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                        {CURRENCY} {item.balance.toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="mt-6 pt-4 border-t border-slate-100">
                            <Button onClick={() => handleOpenModal(item.projectId)} disabled={item.balance <= 0} className="w-full justify-center">
                                Record Payout
                            </Button>
                        </div>
                    </Card>
                )) : (
                    <div className="col-span-full text-center py-12 text-slate-500 bg-white rounded-lg border border-slate-200">
                        <p>No project management fees accrued yet.</p>
                    </div>
                )}
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Record PM Cost Payout">
                <div className="space-y-4">
                    <div className="p-3 bg-slate-50 rounded border border-slate-200">
                        <p className="text-sm text-slate-500">Project</p>
                        <p className="font-bold text-slate-800">{selectedBalance?.projectName}</p>
                        <p className="text-sm text-slate-500 mt-2">Outstanding Balance</p>
                        <p className="font-bold text-rose-600">{CURRENCY} {selectedBalance?.balance.toLocaleString()}</p>
                    </div>
                    <Input label="Payment Amount" type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} />
                    <ComboBox label="Pay From Account" items={accounts} selectedId={paymentAccount} onSelect={item => setPaymentAccount(item?.id || '')} placeholder="Select account" />
                    <Input label="Date" type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
                    <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                        <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                        <Button onClick={handlePayment}>Confirm Payment</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default ProjectPMPayouts;
