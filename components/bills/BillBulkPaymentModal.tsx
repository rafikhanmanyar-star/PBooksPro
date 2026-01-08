
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Bill, Transaction, TransactionType, AccountType } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import { CURRENCY } from '../../constants';
import { useNotification } from '../../context/NotificationContext';
import { getAppStateApiService } from '../../services/api/appStateApi';

interface BillBulkPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedBills: Bill[];
    onPaymentComplete?: () => void;
}

const BillBulkPaymentModal: React.FC<BillBulkPaymentModalProps> = ({ isOpen, onClose, selectedBills, onPaymentComplete }) => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert } = useNotification();
    
    // State for individual bill payment amounts
    const [payments, setPayments] = useState<Record<string, string>>({});
    
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [accountId, setAccountId] = useState('');
    const [reference, setReference] = useState('');

    // Filter for Bank Accounts Only (exclude Internal Clearing)
    const userSelectableAccounts = useMemo(() => state.accounts.filter(a => a.type === AccountType.BANK && a.name !== 'Internal Clearing'), [state.accounts]);

    // Sort bills by Due Date for display order
    const sortedBills = useMemo(() => {
        return [...selectedBills].sort((a, b) => {
            const dateA = new Date(a.dueDate || a.issueDate).getTime();
            const dateB = new Date(b.dueDate || b.issueDate).getTime();
            return dateA - dateB;
        });
    }, [selectedBills]);

    const totalDue = useMemo(() => {
        return selectedBills.reduce((sum, bill) => sum + (bill.amount - bill.paidAmount), 0);
    }, [selectedBills]);

    const totalPaymentAmount = useMemo(() => {
        return Object.keys(payments).reduce((sum, key) => sum + (parseFloat(payments[key]) || 0), 0);
    }, [payments]);

    // Initialize payments with full remaining balance
    useEffect(() => {
        if (isOpen) {
            const initialPayments: Record<string, string> = {};
            selectedBills.forEach(bill => {
                const remaining = bill.amount - bill.paidAmount;
                initialPayments[bill.id] = remaining > 0 ? remaining.toString() : '0';
            });
            setPayments(initialPayments);
            
            const cashAccount = userSelectableAccounts.find(a => a.name === 'Cash');
            setAccountId(cashAccount?.id || userSelectableAccounts[0]?.id || '');
        }
    }, [isOpen, selectedBills, userSelectableAccounts]);

    const handleAmountChange = (id: string, value: string) => {
        // Allow valid positive decimal numbers
        if (value === '' || /^\d*\.?\d*$/.test(value)) {
            setPayments(prev => ({ ...prev, [id]: value }));
        }
    };

    const handleSubmit = async () => {
        if (!accountId) {
            await showAlert("Please select a payment account.");
            return;
        }
        
        if (totalPaymentAmount <= 0) {
            await showAlert("Total payment amount must be greater than zero.");
            return;
        }

        // Validate amounts
        for (const bill of selectedBills) {
            const payAmount = parseFloat(payments[bill.id] || '0');
            const due = bill.amount - bill.paidAmount;
            if (payAmount > due + 0.01) { // Small epsilon for float comparison
                 await showAlert(`Payment for bill #${bill.billNumber} (${CURRENCY} ${payAmount.toLocaleString()}) exceeds balance due (${CURRENCY} ${due.toLocaleString()}).`);
                 return;
            }
        }

        // Generate a batch ID to group these transactions
        const batchId = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const transactions: Transaction[] = [];

        selectedBills.forEach(bill => {
            const payAmount = parseFloat(payments[bill.id] || '0');
            if (payAmount > 0) {
                // Check if this is a tenant-allocated bill
                let tenantId: string | undefined = undefined;
                let tenantCategoryId: string | undefined = undefined;

                // Check if bill has a rental agreement (tenant bill)
                if (bill.projectAgreementId) {
                    const rentalAgreement = state.rentalAgreements.find(ra => ra.id === bill.projectAgreementId);
                    if (rentalAgreement) {
                        tenantId = rentalAgreement.tenantId;
                    }
                }

                // If this is a tenant-allocated bill, update category to include "(Tenant)" suffix
                if (tenantId && bill.categoryId) {
                    const originalCategory = state.categories.find(c => c.id === bill.categoryId);
                    if (originalCategory) {
                        // Find or use category with "(Tenant)" suffix
                        const tenantCategoryName = `${originalCategory.name} (Tenant)`;
                        const tenantCategory = state.categories.find(c => 
                            c.name === tenantCategoryName && c.type === TransactionType.EXPENSE
                        );
                        tenantCategoryId = tenantCategory?.id || bill.categoryId;
                    }
                }

                transactions.push({
                    id: `txn-bulk-${Date.now()}-${bill.id}`,
                    type: TransactionType.EXPENSE,
                    amount: payAmount,
                    date: paymentDate,
                    description: `Bulk Payment: ${reference || 'Bills'} (Bill #${bill.billNumber})`,
                    accountId,
                    // For tenant-allocated bills, use tenant contactId; otherwise use vendor contactId
                    contactId: tenantId || bill.contactId,
                    projectId: bill.projectId,
                    buildingId: bill.buildingId,
                    propertyId: bill.propertyId,
                    // Use tenant category if available, otherwise use original category
                    categoryId: tenantCategoryId || bill.categoryId,
                    contractId: bill.contractId,
                    billId: bill.id,
                    batchId: batchId
                });
            }
        });

        if (transactions.length === 0) {
            await showAlert("No valid payment amounts entered.");
            return;
        }

        try {
            // Try to save transactions via API first to catch conflicts early
            const apiService = getAppStateApiService();
            const savedTransactions: Transaction[] = [];
            const failedBills: { bill: Bill; error: any }[] = [];

            // Process each transaction individually to handle errors per bill
            for (const tx of transactions) {
                try {
                    const saved = await apiService.saveTransaction(tx);
                    savedTransactions.push(saved as Transaction);
                } catch (error: any) {
                    const bill = selectedBills.find(b => b.id === tx.billId);
                    failedBills.push({ bill: bill!, error });
                    
                    // Handle specific error codes
                    if (error.status === 409 || error.code === 'BILL_LOCKED' || error.code === 'BILL_VERSION_MISMATCH') {
                        // Concurrent modification - don't show error for this one, will show summary
                        console.warn(`Payment conflict for bill ${bill?.billNumber}:`, error.message);
                    } else if (error.status === 400 && error.code === 'PAYMENT_OVERPAYMENT') {
                        // Overpayment detected
                        console.error(`Overpayment for bill ${bill?.billNumber}:`, error.message);
                    }
                }
            }

            // If all transactions failed, show error
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

            // If some succeeded, dispatch only the successful ones
            if (savedTransactions.length > 0) {
                dispatch({ type: 'BATCH_ADD_TRANSACTIONS', payload: savedTransactions });
                
                if (failedBills.length > 0) {
                    const failedBillNumbers = failedBills.map(f => f.bill.billNumber).join(', ');
                    showToast(
                        `Processed ${savedTransactions.length} payment(s). Failed for bill(s): ${failedBillNumbers}. Please refresh and try again.`,
                        'warning'
                    );
                } else {
                    showToast(`Processed bulk payment for ${savedTransactions.length} bills.`, 'success');
                }
            }

            if (onPaymentComplete) {
                onPaymentComplete();
            } else {
                onClose();
            }
        } catch (error: any) {
            console.error('Error processing bulk payment:', error);
            const errorMessage = error.message || 'An unexpected error occurred while processing payments.';
            await showAlert(`Payment failed: ${errorMessage}`);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Pay Bills (Bulk)`} size="xl">
            <div className="space-y-4">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-grow">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Total Amount (Calculated)</label>
                        <div className="px-3 py-2 bg-slate-100 border border-slate-300 rounded-md font-bold text-lg text-slate-800">
                            {CURRENCY} {totalPaymentAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <p className="text-xs text-slate-500 mt-1">Total Due for Selection: {CURRENCY} {totalDue.toLocaleString()}</p>
                    </div>
                    <div className="flex-grow">
                        <ComboBox 
                            label="Payment Account"
                            items={userSelectableAccounts}
                            selectedId={accountId}
                            onSelect={(item) => setAccountId(item?.id || '')}
                            placeholder="Select Account"
                        />
                    </div>
                </div>
                
                <div className="flex gap-4">
                     <div className="flex-1"><DatePicker label="Payment Date" value={paymentDate} onChange={d => setPaymentDate(d.toISOString().split('T')[0])} /></div>
                     <Input label="Reference / Note" value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g. Check #123" className="flex-1"/>
                </div>

                <div className="mt-4 border rounded-lg overflow-hidden">
                    <div className="bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 grid grid-cols-12 gap-2">
                        <div className="col-span-4">Bill</div>
                        <div className="col-span-3 text-right">Due Amount</div>
                        <div className="col-span-3 text-right">Payment</div>
                        <div className="col-span-2 text-right">Balance After</div>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                        {sortedBills.map(bill => {
                            const due = bill.amount - bill.paidAmount;
                            const payAmount = parseFloat(payments[bill.id] || '0');
                            const remaining = Math.max(0, due - payAmount);
                            const isFullyPaid = Math.abs(remaining) < 0.01;

                            return (
                                <div key={bill.id} className="px-3 py-2 text-sm border-b grid grid-cols-12 gap-2 items-center hover:bg-slate-50">
                                    <div className="col-span-4">
                                        <div className="font-medium">#{bill.billNumber}</div>
                                        <div className="text-xs text-slate-500">{bill.dueDate ? new Date(bill.dueDate).toLocaleDateString() : new Date(bill.issueDate).toLocaleDateString()}</div>
                                    </div>
                                    <div className="col-span-3 text-right text-slate-600 font-medium">
                                        {due.toLocaleString()}
                                    </div>
                                    <div className="col-span-3">
                                        <input
                                            type="text"
                                            className="w-full text-right border rounded px-2 py-1 focus:ring-2 focus:ring-accent/50 outline-none font-bold text-rose-600"
                                            value={payments[bill.id] || ''}
                                            onChange={(e) => handleAmountChange(bill.id, e.target.value)}
                                            placeholder="0"
                                        />
                                    </div>
                                    <div className={`col-span-2 text-right text-xs font-medium ${isFullyPaid ? 'text-slate-400' : 'text-rose-500'}`}>
                                        {isFullyPaid ? 'Paid' : remaining.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="button" onClick={handleSubmit} disabled={totalPaymentAmount <= 0}>Confirm Payment</Button>
                </div>
            </div>
        </Modal>
    );
};

export default BillBulkPaymentModal;

