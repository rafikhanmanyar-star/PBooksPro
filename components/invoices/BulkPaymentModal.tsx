
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Invoice, Transaction, TransactionType, AccountType, InvoiceType } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import { CURRENCY } from '../../constants';
import { useNotification } from '../../context/NotificationContext';

interface BulkPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedInvoices: Invoice[];
    onPaymentComplete?: () => void;
}

const BulkPaymentModal: React.FC<BulkPaymentModalProps> = ({ isOpen, onClose, selectedInvoices, onPaymentComplete }) => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert } = useNotification();
    
    // State for individual invoice payment amounts
    const [payments, setPayments] = useState<Record<string, string>>({});
    
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [accountId, setAccountId] = useState('');
    const [reference, setReference] = useState('');

    // Filter for Bank Accounts Only (exclude Internal Clearing)
    const userSelectableAccounts = useMemo(() => state.accounts.filter(a => a.type === AccountType.BANK && a.name !== 'Internal Clearing'), [state.accounts]);

    // Sort invoices by Due Date for display order
    const sortedInvoices = useMemo(() => {
        return [...selectedInvoices].sort((a, b) => {
            const dateA = new Date(a.dueDate || a.issueDate).getTime();
            const dateB = new Date(b.dueDate || b.issueDate).getTime();
            return dateA - dateB;
        });
    }, [selectedInvoices]);

    const totalDue = useMemo(() => {
        return selectedInvoices.reduce((sum, inv) => sum + (inv.amount - inv.paidAmount), 0);
    }, [selectedInvoices]);

    const totalPaymentAmount = useMemo(() => {
        return Object.keys(payments).reduce((sum, key) => sum + (parseFloat(payments[key]) || 0), 0);
    }, [payments]);

    // Determine if this is a Rental context
    const isRentalContext = useMemo(() => {
        return selectedInvoices.some(inv => inv.invoiceType === InvoiceType.RENTAL);
    }, [selectedInvoices]);

    // Initialize payments with full remaining balance
    useEffect(() => {
        if (isOpen) {
            const initialPayments: Record<string, string> = {};
            selectedInvoices.forEach(inv => {
                const remaining = inv.amount - inv.paidAmount;
                initialPayments[inv.id] = remaining > 0 ? remaining.toString() : '0';
            });
            setPayments(initialPayments);
            
            const cashAccount = userSelectableAccounts.find(a => a.name === 'Cash');
            setAccountId(cashAccount?.id || userSelectableAccounts[0]?.id || '');
        }
    }, [isOpen, selectedInvoices, userSelectableAccounts]);

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
        for (const inv of selectedInvoices) {
            const payAmount = parseFloat(payments[inv.id] || '0');
            const due = inv.amount - inv.paidAmount;
            if (payAmount > due + 0.01) { // Small epsilon for float comparison
                 await showAlert(`Payment for invoice #${inv.invoiceNumber} (${CURRENCY} ${payAmount.toLocaleString()}) exceeds balance due (${CURRENCY} ${due.toLocaleString()}).`);
                 return;
            }
        }

        // Generate a batch ID to group these transactions
        const batchId = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const label = isRentalContext ? 'Rental' : 'Installment';
        const transactions: Transaction[] = [];

        selectedInvoices.forEach(inv => {
            const payAmount = parseFloat(payments[inv.id] || '0');
            if (payAmount > 0) {
                transactions.push({
                    id: `txn-bulk-${Date.now()}-${inv.id}`,
                    type: TransactionType.INCOME,
                    amount: payAmount,
                    date: paymentDate,
                    description: `Bulk Payment: ${reference || label} (Inv #${inv.invoiceNumber})`,
                    accountId,
                    contactId: inv.contactId,
                    projectId: inv.projectId,
                    buildingId: inv.buildingId,
                    propertyId: inv.propertyId,
                    unitId: inv.unitId,
                    categoryId: inv.categoryId,
                    invoiceId: inv.id,
                    batchId: batchId
                });
            }
        });

        if (transactions.length === 0) {
            await showAlert("No valid payment amounts entered.");
            return;
        }

        dispatch({ type: 'BATCH_ADD_TRANSACTIONS', payload: transactions });
        showToast(`Processed bulk payment for ${transactions.length} invoices.`, 'success');
        
        if (onPaymentComplete) {
            onPaymentComplete();
        } else {
            onClose();
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Receive Bulk Payment`} size="xl">
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
                            label="Deposit Account"
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
                        <div className="col-span-4">Invoice</div>
                        <div className="col-span-3 text-right">Due Amount</div>
                        <div className="col-span-3 text-right">Payment</div>
                        <div className="col-span-2 text-right">Balance After</div>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                        {sortedInvoices.map(inv => {
                            const due = inv.amount - inv.paidAmount;
                            const payAmount = parseFloat(payments[inv.id] || '0');
                            const remaining = Math.max(0, due - payAmount);
                            const isFullyPaid = Math.abs(remaining) < 0.01;

                            return (
                                <div key={inv.id} className="px-3 py-2 text-sm border-b grid grid-cols-12 gap-2 items-center hover:bg-slate-50">
                                    <div className="col-span-4">
                                        <div className="font-medium">#{inv.invoiceNumber}</div>
                                        <div className="text-xs text-slate-500">{new Date(inv.dueDate).toLocaleDateString()}</div>
                                    </div>
                                    <div className="col-span-3 text-right text-slate-600 font-medium">
                                        {due.toLocaleString()}
                                    </div>
                                    <div className="col-span-3">
                                        <input
                                            type="text"
                                            className="w-full text-right border rounded px-2 py-1 focus:ring-2 focus:ring-accent/50 outline-none font-bold text-emerald-600"
                                            value={payments[inv.id] || ''}
                                            onChange={(e) => handleAmountChange(inv.id, e.target.value)}
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

export default BulkPaymentModal;
