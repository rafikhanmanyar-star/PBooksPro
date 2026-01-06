
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { TransactionType, Transaction, AccountType, Project, Bill, InvoiceStatus } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import Select from '../ui/Select';
import { useNotification } from '../../context/NotificationContext';
import { CURRENCY } from '../../constants';
import { formatDate } from '../../utils/dateUtils';
import { getAppStateApiService } from '../../services/api/appStateApi';

interface PMLedgerItem {
    id: string;
    cycle: string;
    cycleLabel: string;
    paymentDate?: string;
    projectId: string;
    projectName: string;
    amountAllocated: number;
    amountPaid: number;
    netBalance: number;
    type: 'Allocation' | 'Payment';
    allocationStartDate?: string;
    allocationEndDate?: string;
}

interface ProjectPMPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    project: Project;
    balanceDue: number;
    unpaidAllocations: PMLedgerItem[];
}

const ProjectPMPaymentModal: React.FC<ProjectPMPaymentModalProps> = ({ 
    isOpen, 
    onClose, 
    project, 
    balanceDue,
    unpaidAllocations 
}) => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert } = useNotification();
    
    // State
    const [selectedAllocations, setSelectedAllocations] = useState<Set<string>>(new Set());
    const [paymentMode, setPaymentMode] = useState<'CASH' | 'EQUITY'>('CASH');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [description, setDescription] = useState('');
    
    // Cash Mode State
    const [sourceAccountId, setSourceAccountId] = useState('');
    const [expenseCategoryId, setExpenseCategoryId] = useState<string>(''); // Required expense category
    
    // Equity Mode State - Auto-detect PM project
    const [pmProjectId, setPmProjectId] = useState<string>(state.defaultProjectId || '');
    const [pmEquityAccountId, setPmEquityAccountId] = useState<string>('');

    // Lists
    const bankAccounts = useMemo(() => state.accounts.filter(a => a.type === AccountType.BANK && a.name !== 'Internal Clearing'), [state.accounts]);
    const equityAccounts = useMemo(() => state.accounts.filter(a => a.type === AccountType.EQUITY), [state.accounts]);
    const expenseCategories = useMemo(() => 
        state.categories.filter(c => c.type === TransactionType.EXPENSE).sort((a, b) => a.name.localeCompare(b.name)), 
        [state.categories]
    );
    
    // Find Project Management project
    const pmProject = useMemo(() => {
        return state.projects.find(p => 
            p.name.toLowerCase().includes('project management') || 
            p.name.toLowerCase().includes('pm') ||
            p.name.toLowerCase() === 'project management'
        );
    }, [state.projects]);

    // Find PM equity account (usually named something like "Project Management" or "PM Team")
    const pmEquityAccount = useMemo(() => {
        if (!pmProject) return null;
        // Try to find equity account that might be associated with PM
        return equityAccounts.find(acc => 
            acc.name.toLowerCase().includes('project management') ||
            acc.name.toLowerCase().includes('pm team') ||
            acc.name.toLowerCase().includes('pm equity')
        ) || equityAccounts[0]; // Fallback to first equity account
    }, [equityAccounts, pmProject]);

    // Initialize PM project and equity account
    useEffect(() => {
        if (pmProject) {
            setPmProjectId(pmProject.id);
        }
        if (pmEquityAccount) {
            setPmEquityAccountId(pmEquityAccount.id);
        }
    }, [pmProject, pmEquityAccount]);

    // Reset selections when modal opens/closes or allocations change
    useEffect(() => {
        if (isOpen) {
            // Reset selections when modal opens
            setSelectedAllocations(new Set());
            setPaymentMode('CASH');
            setDate(new Date().toISOString().split('T')[0]);
            setDescription('');
        }
    }, [isOpen, unpaidAllocations]);

    // Calculate total selected amount
    const totalSelectedAmount = useMemo(() => {
        return unpaidAllocations
            .filter(item => selectedAllocations.has(item.id))
            .reduce((sum, item) => sum + item.netBalance, 0);
    }, [unpaidAllocations, selectedAllocations]);

    // Select all / Deselect all
    const handleToggleAll = () => {
        if (selectedAllocations.size === unpaidAllocations.length) {
            setSelectedAllocations(new Set());
        } else {
            setSelectedAllocations(new Set(unpaidAllocations.map(item => item.id)));
        }
    };

    const handleToggleAllocation = (id: string) => {
        const newSet = new Set(selectedAllocations);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedAllocations(newSet);
    };

    const handleSubmit = async () => {
        if (selectedAllocations.size === 0) {
            await showAlert("Please select at least one allocation to pay.");
            return;
        }

        if (totalSelectedAmount <= 0) {
            await showAlert("Selected allocations have no outstanding balance.");
            return;
        }

        // Find or create Project Management Cost category
        let pmCostCategory = state.categories.find(c => c.name === 'Project Management Cost');
        if (!pmCostCategory) {
            // Create PM Cost category if it doesn't exist
            pmCostCategory = {
                id: `pm-cost-category-${Date.now()}`,
                name: 'Project Management Cost',
                type: TransactionType.EXPENSE,
                description: 'System category for project management fee allocations',
                isPermanent: false
            };
            dispatch({ type: 'ADD_CATEGORY', payload: pmCostCategory });
        }

        const timestamp = Date.now();
        const selectedItems = unpaidAllocations.filter(item => selectedAllocations.has(item.id));

        if (paymentMode === 'CASH') {
            if (!sourceAccountId) { 
                await showAlert("Please select a payment account."); 
                return; 
            }
            if (!expenseCategoryId) {
                await showAlert("Please select an expense category."); 
                return; 
            }
            
            // Create one transaction per selected allocation, linked to bill
            const transactions: Transaction[] = [];
            const billsToUpdate: Bill[] = [];
            
            selectedItems.forEach(item => {
                const bill = item.billId ? state.bills.find(b => b.id === item.billId) : null;
                const paymentAmount = item.netBalance;
                
                // Create expense transaction
                transactions.push({
                    id: `pm-pay-${timestamp}-${item.id}`,
                    type: TransactionType.EXPENSE,
                    amount: paymentAmount,
                    date,
                    description: description || `PM Fee Payout - ${item.cycleLabel} [PM-ALLOC-${item.cycle}]`,
                    accountId: sourceAccountId,
                    categoryId: expenseCategoryId, // User-selected expense category
                    projectId: project.id,
                    billId: bill?.id // Link to bill
                });
                
                // Update bill paid amount
                if (bill) {
                    const newPaidAmount = bill.paidAmount + paymentAmount;
                    const newStatus = newPaidAmount >= bill.amount ? InvoiceStatus.PAID : 
                                     (newPaidAmount > 0 ? InvoiceStatus.PARTIALLY_PAID : InvoiceStatus.UNPAID);
                    billsToUpdate.push({
                        ...bill,
                        paidAmount: newPaidAmount,
                        status: newStatus
                    });
                }
            });

            try {
                // Try to save transactions via API first to catch conflicts early
                const apiService = getAppStateApiService();
                const savedTransactions: Transaction[] = [];
                const failedBills: { billId: string; error: any }[] = [];

                // Process each transaction individually to handle errors per bill
                for (const tx of transactions) {
                    try {
                        const saved = await apiService.saveTransaction(tx);
                        savedTransactions.push(saved as Transaction);
                    } catch (error: any) {
                        if (tx.billId) {
                            failedBills.push({ billId: tx.billId, error });
                        }
                        if (error.status === 409 || error.code === 'BILL_LOCKED' || error.code === 'BILL_VERSION_MISMATCH') {
                            console.warn(`Payment conflict for bill ${tx.billId}:`, error.message);
                        } else if (error.status === 400 && error.code === 'PAYMENT_OVERPAYMENT') {
                            console.error(`Overpayment for bill ${tx.billId}:`, error.message);
                        }
                    }
                }

                if (savedTransactions.length === 0) {
                    const firstError = failedBills[0]?.error;
                    if (firstError?.status === 409 || firstError?.code === 'BILL_LOCKED' || firstError?.code === 'BILL_VERSION_MISMATCH') {
                        await showAlert(
                            `Payment conflict detected. One or more bills are being processed by another user. Please refresh and try again.`
                        );
                    } else if (firstError?.status === 400 && firstError?.code === 'PAYMENT_OVERPAYMENT') {
                        await showAlert(
                            `Overpayment detected. ${firstError.message || 'One or more payments exceed the bill amount.'}`
                        );
                    } else {
                        await showAlert(
                            `Failed to process payments: ${firstError?.message || 'Unknown error occurred'}`
                        );
                    }
                    return;
                }

                if (savedTransactions.length > 0) {
                    dispatch({ type: 'BATCH_ADD_TRANSACTIONS', payload: savedTransactions });
                    // Only update bills that had successful transactions
                    const successfulBillIds = new Set(savedTransactions.map(tx => tx.billId).filter(Boolean));
                    billsToUpdate.filter(bill => successfulBillIds.has(bill.id)).forEach(bill => {
                        dispatch({ type: 'UPDATE_BILL', payload: bill });
                    });
                    
                    if (failedBills.length > 0) {
                        showToast(
                            `Payment recorded for ${savedTransactions.length} allocation(s). ${failedBills.length} payment(s) failed due to conflicts. Please refresh and try again.`,
                            'warning'
                        );
                    } else {
                        showToast(`Payment recorded for ${savedTransactions.length} allocation(s).`, "success");
                    }
                }
            } catch (error: any) {
                console.error('Error processing PM payment:', error);
                await showAlert(`Payment failed: ${error.message || 'An unexpected error occurred while processing payments.'}`);
                return;
            }

        } else {
            // EQUITY TRANSFER to PM Project
            if (!pmProjectId) {
                await showAlert("Project Management project not found. Please create a project named 'Project Management' first.");
                return;
            }
            if (!pmEquityAccountId) {
                await showAlert("Please select the PM equity account.");
                return;
            }

            let clearingAcc = state.accounts.find(a => a.name === 'Internal Clearing');
            if (!clearingAcc) {
                clearingAcc = {
                    id: `sys-acc-clearing-${Date.now()}`,
                    name: 'Internal Clearing',
                    type: AccountType.BANK,
                    balance: 0,
                    description: 'System account for PM equity transfers',
                    isPermanent: true
                };
                dispatch({ type: 'ADD_ACCOUNT', payload: clearingAcc });
            }

            const batchId = `pm-eq-payout-${timestamp}`;
            const transactions: Transaction[] = [];

            // For each selected allocation, create:
            // 1. Expense in source project (PM Cost category)
            // 2. Investment in PM project (equity increase)
            if (!expenseCategoryId) {
                await showAlert("Please select an expense category."); 
                return; 
            }
            
            const billsToUpdate: Bill[] = [];
            
            selectedItems.forEach(item => {
                const bill = item.billId ? state.bills.find(b => b.id === item.billId) : null;
                const paymentAmount = item.netBalance;
                
                // Expense in source project
                transactions.push({
                    id: `pm-exp-${timestamp}-${item.id}`,
                    type: TransactionType.EXPENSE,
                    amount: paymentAmount,
                    date,
                    description: description || `PM Fee Transfer to Equity - ${item.cycleLabel} [PM-ALLOC-${item.cycle}]`,
                    accountId: clearingAcc!.id,
                    categoryId: expenseCategoryId, // User-selected expense category
                    projectId: project.id,
                    billId: bill?.id, // Link to bill
                    batchId
                });
                
                // Update bill paid amount
                if (bill) {
                    const newPaidAmount = bill.paidAmount + paymentAmount;
                    const newStatus = newPaidAmount >= bill.amount ? InvoiceStatus.PAID : 
                                     (newPaidAmount > 0 ? InvoiceStatus.PARTIALLY_PAID : InvoiceStatus.UNPAID);
                    billsToUpdate.push({
                        ...bill,
                        paidAmount: newPaidAmount,
                        status: newStatus
                    });
                }

                // Investment in PM project (equity increase)
                transactions.push({
                    id: `pm-inv-${timestamp}-${item.id}`,
                    type: TransactionType.TRANSFER,
                    amount: item.netBalance,
                    date,
                    description: `PM Fee Equity - ${item.cycleLabel} from ${project.name} [PM-ALLOC-${item.cycle}]`,
                    accountId: pmEquityAccountId,
                    fromAccountId: clearingAcc!.id,
                    toAccountId: pmEquityAccountId,
                    projectId: pmProjectId,
                    batchId
                });
            });

            try {
                // Try to save transactions via API first to catch conflicts early
                const apiService = getAppStateApiService();
                const savedTransactions: Transaction[] = [];
                const failedBills: { billId: string; error: any }[] = [];

                // Process each transaction individually to handle errors per bill
                for (const tx of transactions) {
                    try {
                        const saved = await apiService.saveTransaction(tx);
                        savedTransactions.push(saved as Transaction);
                    } catch (error: any) {
                        if (tx.billId) {
                            failedBills.push({ billId: tx.billId, error });
                        }
                        if (error.status === 409 || error.code === 'BILL_LOCKED' || error.code === 'BILL_VERSION_MISMATCH') {
                            console.warn(`Payment conflict for bill ${tx.billId}:`, error.message);
                        } else if (error.status === 400 && error.code === 'PAYMENT_OVERPAYMENT') {
                            console.error(`Overpayment for bill ${tx.billId}:`, error.message);
                        }
                    }
                }

                if (savedTransactions.length === 0) {
                    const firstError = failedBills[0]?.error;
                    if (firstError?.status === 409 || firstError?.code === 'BILL_LOCKED' || firstError?.code === 'BILL_VERSION_MISMATCH') {
                        await showAlert(
                            `Payment conflict detected. One or more bills are being processed by another user. Please refresh and try again.`
                        );
                    } else if (firstError?.status === 400 && firstError?.code === 'PAYMENT_OVERPAYMENT') {
                        await showAlert(
                            `Overpayment detected. ${firstError.message || 'One or more payments exceed the bill amount.'}`
                        );
                    } else {
                        await showAlert(
                            `Failed to process transfers: ${firstError?.message || 'Unknown error occurred'}`
                        );
                    }
                    return;
                }

                if (savedTransactions.length > 0) {
                    dispatch({ type: 'BATCH_ADD_TRANSACTIONS', payload: savedTransactions });
                    // Only update bills that had successful transactions
                    const successfulBillIds = new Set(savedTransactions.filter(tx => tx.billId).map(tx => tx.billId));
                    billsToUpdate.filter(bill => successfulBillIds.has(bill.id)).forEach(bill => {
                        dispatch({ type: 'UPDATE_BILL', payload: bill });
                    });
                    
                    if (failedBills.length > 0) {
                        showToast(
                            `Transferred ${savedTransactions.length / 2} allocation(s) to PM equity. ${failedBills.length} transfer(s) failed due to conflicts. Please refresh and try again.`,
                            'warning'
                        );
                    } else {
                        showToast(`Transferred ${savedTransactions.length / 2} allocation(s) to PM equity.`, "success");
                    }
                }
            } catch (error: any) {
                console.error('Error processing PM equity transfer:', error);
                await showAlert(`Transfer failed: ${error.message || 'An unexpected error occurred while processing transfers.'}`);
                return;
            }
        }

        onClose();
        // Reset selections
        setSelectedAllocations(new Set());
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`PM Fee Payout: ${project.name}`} size="lg">
            <div className="space-y-6">
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <span className="text-sm text-slate-500 block">Total Outstanding Balance</span>
                    <span className="text-xl font-bold text-slate-800">{CURRENCY} {balanceDue.toLocaleString()}</span>
                </div>

                {/* Unpaid Allocations List */}
                <div className="border rounded-lg">
                    <div className="p-3 bg-slate-50 border-b flex justify-between items-center">
                        <h4 className="font-semibold text-slate-700">Unpaid Allocations</h4>
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            onClick={handleToggleAll}
                        >
                            {selectedAllocations.size === unpaidAllocations.length ? 'Deselect All' : 'Select All'}
                        </Button>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                        {unpaidAllocations.length === 0 ? (
                            <div className="p-8 text-center text-slate-500 italic">
                                No unpaid allocations found.
                            </div>
                        ) : (
                            <table className="min-w-full divide-y divide-slate-200 text-sm">
                                <thead className="bg-slate-50 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-2 w-12">
                                            <input
                                                type="checkbox"
                                                checked={selectedAllocations.size === unpaidAllocations.length && unpaidAllocations.length > 0}
                                                onChange={handleToggleAll}
                                                className="rounded border-slate-300"
                                            />
                                        </th>
                                        <th className="px-4 py-2 text-left font-semibold text-slate-600">Cycle</th>
                                        <th className="px-4 py-2 text-right font-semibold text-slate-600">Outstanding</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {unpaidAllocations.map(item => (
                                        <tr 
                                            key={item.id} 
                                            className={`hover:bg-slate-50 cursor-pointer ${selectedAllocations.has(item.id) ? 'bg-blue-50' : ''}`}
                                            onClick={() => handleToggleAllocation(item.id)}
                                        >
                                            <td className="px-4 py-2">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedAllocations.has(item.id)}
                                                    onChange={() => handleToggleAllocation(item.id)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="rounded border-slate-300"
                                                />
                                            </td>
                                            <td className="px-4 py-2 text-slate-700 font-medium">{item.cycleLabel}</td>
                                            <td className="px-4 py-2 text-right font-mono text-rose-600 font-bold">
                                                {CURRENCY} {item.netBalance.toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                    {selectedAllocations.size > 0 && (
                        <div className="p-3 bg-indigo-50 border-t">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-medium text-indigo-700">
                                    {selectedAllocations.size} allocation(s) selected
                                </span>
                                <span className="text-lg font-bold text-indigo-800">
                                    Total: {CURRENCY} {totalSelectedAmount.toLocaleString()}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Payout Mode</label>
                    <div className="grid grid-cols-2 gap-4">
                        <label className={`flex items-center justify-center p-3 rounded-lg border cursor-pointer transition-all ${paymentMode === 'CASH' ? 'bg-emerald-50 border-emerald-500 text-emerald-700 font-bold' : 'bg-white border-slate-200 text-slate-600'}`}>
                            <input type="radio" checked={paymentMode === 'CASH'} onChange={() => setPaymentMode('CASH')} className="hidden" />
                            Bank Payment
                        </label>
                        <label className={`flex items-center justify-center p-3 rounded-lg border cursor-pointer transition-all ${paymentMode === 'EQUITY' ? 'bg-indigo-50 border-indigo-500 text-indigo-700 font-bold' : 'bg-white border-slate-200 text-slate-600'}`}>
                            <input type="radio" checked={paymentMode === 'EQUITY'} onChange={() => setPaymentMode('EQUITY')} className="hidden" />
                            Transfer to PM Equity
                        </label>
                    </div>
                </div>

                <div className="space-y-4">
                    {paymentMode === 'CASH' ? (
                        <ComboBox 
                            label="Pay From (Bank Account)" 
                            items={bankAccounts} 
                            selectedId={sourceAccountId} 
                            onSelect={(i) => setSourceAccountId(i?.id || '')} 
                            placeholder="Select Account" 
                            required 
                        />
                    ) : (
                        <>
                            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                                <p className="text-sm font-medium text-blue-800 mb-2">PM Project:</p>
                                <p className="text-sm text-blue-700">
                                    {pmProject ? (
                                        <span className="font-semibold">{pmProject.name}</span>
                                    ) : (
                                        <span className="text-rose-600">Not found. Please create a project named "Project Management".</span>
                                    )}
                                </p>
                            </div>
                            <ComboBox 
                                label="PM Equity Account" 
                                items={equityAccounts} 
                                selectedId={pmEquityAccountId} 
                                onSelect={(i) => setPmEquityAccountId(i?.id || '')} 
                                placeholder="Select PM Equity Account" 
                                required 
                            />
                            <p className="text-xs text-slate-500 bg-yellow-50 p-2 rounded border border-yellow-100">
                                This will record expenses in the source project and increase equity in the Project Management project. 
                                PM expenses can later be paid from this equity.
                            </p>
                        </>
                    )}
                    
                    <Select 
                        label="Expense Category *" 
                        value={expenseCategoryId} 
                        onChange={e => setExpenseCategoryId(e.target.value)}
                        required
                    >
                        <option value="">Select Expense Category</option>
                        {expenseCategories.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                    </Select>
                    
                    <Input label="Date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
                    <Input label="Description" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional details..." />
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button 
                        onClick={handleSubmit}
                        disabled={selectedAllocations.size === 0 || totalSelectedAmount <= 0}
                    >
                        Confirm Payout
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default ProjectPMPaymentModal;
