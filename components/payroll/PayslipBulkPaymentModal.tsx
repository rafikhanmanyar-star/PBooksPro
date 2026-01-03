
import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Payslip, AccountType, Transaction, TransactionType } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import { CURRENCY } from '../../constants';
import { useNotification } from '../../context/NotificationContext';

interface PayslipBulkPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedPayslips: Payslip[];
    onPaymentComplete: () => void;
}

const PayslipBulkPaymentModal: React.FC<PayslipBulkPaymentModalProps> = ({ isOpen, onClose, selectedPayslips, onPaymentComplete }) => {
    const { state, dispatch } = useAppContext();
    const { showToast, showAlert } = useNotification();

    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [accountId, setAccountId] = useState('');
    const [paymentAmounts, setPaymentAmounts] = useState<Record<string, string>>({});

    // Filter for Bank Accounts (exclude Internal Clearing)
    const userSelectableAccounts = useMemo(() => state.accounts.filter(a => a.type === AccountType.BANK && a.name !== 'Internal Clearing'), [state.accounts]);

    // Calculate pending amounts and initialize state
    const pendingDetails = useMemo(() => {
        return selectedPayslips.map(p => {
            const paid = p.paidAmount || 0;
            const due = Math.max(0, p.netSalary - paid);
            return { 
                ...p, 
                due,
                staffName: state.contacts.find(c => c.id === p.staffId)?.name || 'Unknown'
            };
        });
    }, [selectedPayslips, state.contacts]);

    useEffect(() => {
        if (isOpen) {
            const cashAccount = userSelectableAccounts.find(a => a.name === 'Cash');
            setAccountId(cashAccount?.id || userSelectableAccounts[0]?.id || '');
            
            // Initialize amounts with full due amount
            const initialAmounts: Record<string, string> = {};
            pendingDetails.forEach(p => {
                initialAmounts[p.id] = p.due.toString();
            });
            setPaymentAmounts(initialAmounts);
        }
    }, [isOpen, userSelectableAccounts, pendingDetails]);

    const totalAmount = useMemo(() => {
        return Object.keys(paymentAmounts).reduce((sum, key) => sum + (parseFloat(paymentAmounts[key]) || 0), 0);
    }, [paymentAmounts]);

    const handleAmountChange = (id: string, value: string) => {
        if (value === '' || /^\d*\.?\d*$/.test(value)) {
            setPaymentAmounts(prev => ({ ...prev, [id]: value }));
        }
    };

    const handleSubmit = async () => {
        if (!accountId) {
            await showAlert('Please select a payment account.');
            return;
        }

        if (totalAmount <= 0) {
            await showAlert('Total payment amount is zero.');
            return;
        }
        
        // Find categories
        const projectSalaryCat = state.categories.find(c => c.name === 'Project Staff Salary');
        const rentalSalaryCat = state.categories.find(c => c.name === 'Rental Staff Salary');
        
        if (!projectSalaryCat || !rentalSalaryCat) {
            await showAlert("System Error: Salary categories missing.");
            return;
        }

        const transactions: Transaction[] = [];
        const batchId = `batch-pay-sal-${Date.now()}`;

        // Process each payslip
        for (const p of pendingDetails) {
            const amountToPay = parseFloat(paymentAmounts[p.id] || '0');
            if (amountToPay <= 0) continue;

            if (amountToPay > p.due + 0.01) {
                await showAlert(`Payment for ${p.staffName} (${CURRENCY} ${amountToPay}) exceeds due amount (${CURRENCY} ${p.due}).`);
                return;
            }

            // Determine context
            const isProject = state.projectPayslips.some(pp => pp.id === p.id);
            const staff = [...state.projectStaff, ...state.rentalStaff].find(s => s.id === p.staffId);
            
            const categoryId = isProject ? projectSalaryCat.id : rentalSalaryCat.id;
            const projectId = isProject ? (p.projectId || staff?.projectId) : undefined;
            const buildingId = !isProject ? (p.buildingId || staff?.buildingId) : undefined;

            // Note: Dispatching 'MARK_..._PAID' creates the transaction internally. 
            // We just need to trigger the action for each payslip.
            // We accumulate transaction count just for the toast message.
            transactions.push({ id: 'dummy', amount: amountToPay } as any);
            
            if (isProject) {
                dispatch({
                    type: 'MARK_PROJECT_PAYSLIP_PAID',
                    payload: { payslipId: p.id, accountId, paymentDate, amount: amountToPay, projectId }
                });
            } else {
                 dispatch({
                    type: 'MARK_RENTAL_PAYSLIP_PAID',
                    payload: { payslipId: p.id, accountId, paymentDate, amount: amountToPay }
                });
            }
        }
        
        showToast(`Paid ${transactions.length} payslips successfully.`, 'success');
        onPaymentComplete();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Bulk Payslip Payment" size="xl">
            <div className="space-y-4">
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-slate-600">Selected Payslips:</span>
                        <span className="font-bold text-slate-800">{selectedPayslips.length}</span>
                    </div>
                    <div className="flex justify-between items-center text-lg">
                        <span className="font-medium text-slate-700">Total Payable:</span>
                        <span className="font-bold text-accent">{CURRENCY} {totalAmount.toLocaleString()}</span>
                    </div>
                </div>

                <div className="flex gap-4">
                    <div className="flex-1">
                        <ComboBox 
                            label="Pay From Account" 
                            items={userSelectableAccounts} 
                            selectedId={accountId} 
                            onSelect={(item) => setAccountId(item?.id || '')} 
                            placeholder="Select Account"
                            required
                        />
                    </div>
                    <div className="flex-1">
                        <DatePicker 
                            label="Payment Date" 
                            value={paymentDate} 
                            onChange={d => setPaymentDate(d.toISOString().split('T')[0])} 
                            required 
                        />
                    </div>
                </div>

                <div className="max-h-[50vh] overflow-y-auto border rounded-lg">
                    <table className="min-w-full text-sm divide-y divide-slate-100">
                        <thead className="bg-slate-50 sticky top-0">
                            <tr>
                                <th className="px-3 py-2 text-left font-medium text-slate-600">Employee</th>
                                <th className="px-3 py-2 text-left font-medium text-slate-600">Month</th>
                                <th className="px-3 py-2 text-right font-medium text-slate-600">Amount Due</th>
                                <th className="px-3 py-2 text-right font-medium text-slate-600 w-32">Payment</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {pendingDetails.map(p => (
                                <tr key={p.id} className="hover:bg-slate-50">
                                    <td className="px-3 py-2 text-slate-800">{p.staffName}</td>
                                    <td className="px-3 py-2 text-slate-500">{p.month}</td>
                                    <td className="px-3 py-2 text-right font-medium text-slate-600">{CURRENCY} {p.due.toLocaleString()}</td>
                                    <td className="px-3 py-1">
                                        <input
                                            type="text"
                                            className="w-full text-right border rounded px-2 py-1 text-sm focus:ring-2 focus:ring-accent/50 outline-none tabular-nums font-medium text-emerald-600"
                                            value={paymentAmounts[p.id] || ''}
                                            onChange={(e) => handleAmountChange(p.id, e.target.value)}
                                            placeholder="0"
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSubmit}>Confirm Payment</Button>
                </div>
            </div>
        </Modal>
    );
};

export default PayslipBulkPaymentModal;
