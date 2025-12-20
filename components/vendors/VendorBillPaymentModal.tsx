
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Contact, Transaction, TransactionType, InvoiceStatus, AccountType } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import { CURRENCY } from '../../constants';
import { useNotification } from '../../context/NotificationContext';
import { formatDate } from '../../utils/dateUtils';

interface VendorBillPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    vendor: Contact;
}

const VendorBillPaymentModal: React.FC<VendorBillPaymentModalProps> = ({ isOpen, onClose, vendor }) => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert } = useNotification();

    const [selectedBillIds, setSelectedBillIds] = useState<Set<string>>(new Set());
    const [totalAmount, setTotalAmount] = useState('');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [accountId, setAccountId] = useState('');
    const [reference, setReference] = useState('');
    const [description, setDescription] = useState('');

    // Get pending bills
    const pendingBills = useMemo(() => {
        return state.bills
            .filter(b => b.contactId === vendor.id && b.status !== InvoiceStatus.PAID)
            .sort((a, b) => new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime());
    }, [state.bills, vendor.id]);

    // Filter Selectable Accounts (Bank Accounts Only)
    const userSelectableAccounts = useMemo(() => state.accounts.filter(a => a.type === AccountType.BANK), [state.accounts]);

    // Update total amount based on selection
    useEffect(() => {
        const selected = pendingBills.filter(b => selectedBillIds.has(b.id));
        const sum = selected.reduce((acc, b) => acc + (b.amount - b.paidAmount), 0);
        setTotalAmount(sum > 0 ? sum.toString() : '');
    }, [selectedBillIds, pendingBills]);

    const handleToggleBill = (billId: string) => {
        const newSet = new Set(selectedBillIds);
        if (newSet.has(billId)) newSet.delete(billId);
        else newSet.add(billId);
        setSelectedBillIds(newSet);
    };

    const handleSelectAll = () => {
        if (selectedBillIds.size === pendingBills.length) {
            setSelectedBillIds(new Set());
        } else {
            setSelectedBillIds(new Set(pendingBills.map(b => b.id)));
        }
    };

    const handleSubmit = async () => {
        if (!accountId) { await showAlert("Please select a payment account."); return; }
        
        const numericTotal = parseFloat(totalAmount);
        if (isNaN(numericTotal) || numericTotal <= 0) { await showAlert("Please enter a valid amount."); return; }

        if (selectedBillIds.size === 0) { await showAlert("Please select at least one bill to pay."); return; }

        const selectedBills = pendingBills.filter(b => selectedBillIds.has(b.id));
        
        // Sort selected bills by date (oldest first) to distribute payment
        selectedBills.sort((a, b) => new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime());

        const totalDueSelected = selectedBills.reduce((acc, b) => acc + (b.amount - b.paidAmount), 0);
        
        if (numericTotal > totalDueSelected + 0.01) { // Allow small epsilon
             await showAlert(`Payment amount cannot exceed the total due for selected bills (${CURRENCY} ${totalDueSelected.toLocaleString()})`);
             return;
        }

        let remainingToDistribute = numericTotal;
        const transactions: Transaction[] = [];
        const batchId = `batch-pay-${Date.now()}`;

        for (const bill of selectedBills) {
            if (remainingToDistribute <= 0.001) break;

            const due = bill.amount - bill.paidAmount;
            const payAmount = Math.min(due, remainingToDistribute);
            
            // Ensure precision doesn't cause issues
            const roundedPayAmount = Math.round(payAmount * 100) / 100;

            if (roundedPayAmount > 0) {
                transactions.push({
                    id: `txn-bp-${Date.now()}-${bill.id}`,
                    type: TransactionType.EXPENSE,
                    amount: roundedPayAmount,
                    date: paymentDate,
                    description: description || `Bill Payment: #${bill.billNumber}` + (reference ? ` (Ref: ${reference})` : ''),
                    accountId,
                    contactId: vendor.id,
                    projectId: bill.projectId,
                    buildingId: bill.buildingId,
                    propertyId: bill.propertyId,
                    agreementId: bill.projectAgreementId, // Correctly use projectAgreementId
                    categoryId: bill.categoryId,
                    billId: bill.id,
                    contractId: bill.contractId,
                    batchId
                });
                remainingToDistribute -= roundedPayAmount;
            }
        }

        if (transactions.length > 0) {
            dispatch({ type: 'BATCH_ADD_TRANSACTIONS', payload: transactions });
            showToast(`Payment recorded for ${transactions.length} bills.`, 'success');
            onClose();
        } else {
            await showAlert("Could not generate valid transactions. Please check amounts.");
        }
    };

    // Auto-set default account
    useEffect(() => {
        if (isOpen && !accountId) {
            const cash = userSelectableAccounts.find(a => a.name === 'Cash');
            if (cash) setAccountId(cash.id);
            else if (userSelectableAccounts.length > 0) setAccountId(userSelectableAccounts[0].id);
        }
    }, [isOpen, userSelectableAccounts, accountId]);

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Pay Vendor: ${vendor.name}`} size="xl">
            <div className="flex flex-col h-full max-h-[80vh]">
                <div className="p-4 bg-slate-50 border-b border-slate-200">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="font-bold text-slate-700">Pending Bills</h3>
                        <div className="text-sm text-slate-500">
                            {selectedBillIds.size} selected | Total Due: <span className="font-bold text-slate-800">{CURRENCY} {parseFloat(totalAmount || '0').toLocaleString()}</span>
                        </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto border rounded-lg bg-white shadow-sm">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-100 sticky top-0">
                                <tr>
                                    <th className="px-4 py-2 text-center w-10">
                                        <input 
                                            type="checkbox" 
                                            checked={selectedBillIds.size > 0 && selectedBillIds.size === pendingBills.length}
                                            onChange={handleSelectAll}
                                            className="rounded text-accent focus:ring-accent"
                                        />
                                    </th>
                                    <th className="px-4 py-2 text-left font-medium text-slate-600">Date</th>
                                    <th className="px-4 py-2 text-left font-medium text-slate-600">Bill #</th>
                                    <th className="px-4 py-2 text-left font-medium text-slate-600">Description</th>
                                    <th className="px-4 py-2 text-right font-medium text-slate-600">Due Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {pendingBills.length > 0 ? pendingBills.map(bill => {
                                    const due = bill.amount - bill.paidAmount;
                                    return (
                                        <tr key={bill.id} className={selectedBillIds.has(bill.id) ? 'bg-indigo-50' : 'hover:bg-slate-50'}>
                                            <td className="px-4 py-2 text-center">
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedBillIds.has(bill.id)}
                                                    onChange={() => handleToggleBill(bill.id)}
                                                    className="rounded text-accent focus:ring-accent"
                                                />
                                            </td>
                                            <td className="px-4 py-2 text-slate-700">{formatDate(bill.issueDate)}</td>
                                            <td className="px-4 py-2 font-medium text-slate-800">{bill.billNumber}</td>
                                            <td className="px-4 py-2 text-slate-500 truncate max-w-xs">{bill.description}</td>
                                            <td className="px-4 py-2 text-right font-mono text-slate-700">{CURRENCY} {due.toLocaleString()}</td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-8 text-center text-slate-500">No pending bills found for this vendor.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-4">
                        <ComboBox 
                            id="payment-account"
                            name="payment-account"
                            label="Pay From Account" 
                            items={userSelectableAccounts} 
                            selectedId={accountId} 
                            onSelect={(item) => setAccountId(item?.id || '')} 
                            placeholder="Select Account"
                            required
                        />
                        <Input 
                            id="payment-amount"
                            name="payment-amount"
                            label="Total Payment Amount" 
                            type="number"
                            value={totalAmount}
                            onChange={e => setTotalAmount(e.target.value)}
                            required
                        />
                    </div>
                    <div className="space-y-4">
                        <DatePicker 
                            id="payment-date"
                            name="payment-date"
                            label="Payment Date" 
                            value={paymentDate} 
                            onChange={d => setPaymentDate(d.toISOString().split('T')[0])}
                            required
                        />
                        <Input 
                            id="payment-reference"
                            name="payment-reference"
                            label="Payment Reference" 
                            value={reference}
                            onChange={e => setReference(e.target.value)}
                            placeholder="Cheque No, Transaction ID..."
                        />
                    </div>
                    <div className="md:col-span-2">
                        <Input 
                            id="payment-description"
                            name="payment-description"
                            label="Description" 
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Optional notes..."
                        />
                    </div>
                </div>

                <div className="p-4 border-t border-slate-200 flex justify-end gap-2 bg-slate-50 rounded-b-lg">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={pendingBills.length === 0}>Confirm Payment</Button>
                </div>
            </div>
        </Modal>
    );
};

export default VendorBillPaymentModal;
