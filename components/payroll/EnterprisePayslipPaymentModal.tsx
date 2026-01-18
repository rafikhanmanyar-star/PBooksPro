
import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Payslip, AccountType, PayslipStatus } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import { CURRENCY } from '../../constants';
import { useNotification } from '../../context/NotificationContext';

interface EnterprisePayslipPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    payslip: Payslip | null;
    onSuccess?: () => void;
}

const EnterprisePayslipPaymentModal: React.FC<EnterprisePayslipPaymentModalProps> = ({ 
    isOpen, 
    onClose, 
    payslip, 
    onSuccess 
}) => {
    const { state, dispatch } = useAppContext();
    const { showAlert, showToast } = useNotification();

    const [amount, setAmount] = useState('');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [accountId, setAccountId] = useState('');
    const [description, setDescription] = useState('');
    
    // Filter for Bank Accounts Only (exclude Internal Clearing)
    const userSelectableAccounts = useMemo(() => 
        state.accounts.filter(a => a.type === AccountType.BANK && a.name !== 'Internal Clearing'), 
        [state.accounts]
    );

    const balanceDue = useMemo(() => {
        if (!payslip) return 0;
        return Math.max(0, payslip.netSalary - (payslip.paidAmount || 0));
    }, [payslip]);

    const employee = useMemo(() => {
        if (!payslip) return null;
        return (state.employees || []).find(e => e.id === payslip.employeeId);
    }, [payslip, state.employees]);

    useEffect(() => {
        if (isOpen && payslip) {
            setAmount(balanceDue.toString());
            setPaymentDate(new Date().toISOString().split('T')[0]);
            
            const cashAccount = userSelectableAccounts.find(a => a.name === 'Cash');
            setAccountId(cashAccount?.id || userSelectableAccounts[0]?.id || '');
            
            const employeeName = employee 
                ? `${employee.personalDetails.firstName} ${employee.personalDetails.lastName}`
                : 'Employee';
            setDescription(`Salary Payment for ${employeeName} - ${payslip.month}`);
        }
    }, [isOpen, payslip, balanceDue, userSelectableAccounts, employee]);

    const numericAmount = parseFloat(amount) || 0;
    const excessAmount = Math.max(0, numericAmount - balanceDue);

    const handleSubmit = async () => {
        if (!payslip) return;
        
        if (!accountId) {
            await showAlert("Please select a payment account.");
            return;
        }
        
        if (isNaN(numericAmount) || numericAmount <= 0) {
            await showAlert("Please enter a valid amount.");
            return;
        }

        dispatch({
            type: 'MARK_PAYSLIP_PAID',
            payload: {
                payslipId: payslip.id,
                accountId,
                paymentDate,
                amount: numericAmount,
                description
            }
        });

        if (excessAmount > 0) {
            showToast(
                `Payment recorded. ${CURRENCY} ${excessAmount.toLocaleString()} added as Advance.`, 
                "success"
            );
        } else {
            showToast("Payslip marked as paid successfully!", "success");
        }
        
        if (onSuccess) onSuccess();
        else onClose();
    };

    if (!payslip) return null;

    const employeeName = employee 
        ? `${employee.personalDetails.firstName} ${employee.personalDetails.lastName}`
        : 'Employee';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Pay Salary: ${employeeName}`}>
            <div className="space-y-4">
                <div className="p-3 bg-slate-50 rounded border border-slate-200 mb-2">
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Month:</span>
                        <span className="font-semibold">{payslip.month}</span>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                        <span className="text-slate-600">Employee ID:</span>
                        <span className="font-semibold">{employee?.employeeId || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between text-sm mt-1 border-t border-slate-200 pt-1">
                        <span className="text-slate-600">Net Salary:</span>
                        <span className="font-medium text-slate-800">{CURRENCY} {payslip.netSalary.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                        <span className="text-slate-600">Already Paid:</span>
                        <span className="font-medium text-emerald-600">{CURRENCY} {(payslip.paidAmount || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-base mt-2 font-bold">
                        <span className="text-slate-700">Remaining Due:</span>
                        <span className="text-rose-600">{CURRENCY} {balanceDue.toLocaleString()}</span>
                    </div>
                    {payslip.costAllocations && payslip.costAllocations.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-slate-200">
                            <div className="text-xs font-semibold text-slate-500 mb-1">Cost Allocations:</div>
                            {payslip.costAllocations.map((allocation, idx) => {
                                const project = state.projects.find(p => p.id === allocation.projectId);
                                return (
                                    <div key={idx} className="text-xs text-slate-600 flex justify-between">
                                        <span>{project?.name || allocation.projectId}:</span>
                                        <span>{allocation.percentage}%</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <ComboBox 
                    label="Pay From Account"
                    items={userSelectableAccounts}
                    selectedId={accountId}
                    onSelect={(item) => setAccountId(item?.id || '')}
                    placeholder="Select Account"
                    required
                />

                <Input 
                    label="Payment Amount" 
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    required
                />

                {excessAmount > 0 && (
                    <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 animate-fade-in">
                        <strong>Advance Payment:</strong> The excess amount of 
                        <span className="font-bold"> {CURRENCY} {excessAmount.toLocaleString()} </span> 
                        will be recorded as a Salary Advance for the next payslip.
                    </div>
                )}

                <DatePicker 
                    label="Payment Date" 
                    value={paymentDate} 
                    onChange={d => setPaymentDate(d.toISOString().split('T')[0])}
                    required
                />
                
                <Input 
                    label="Description / Particulars" 
                    value={description} 
                    onChange={e => setDescription(e.target.value)}
                    placeholder="e.g. Salary via Bank Transfer"
                />

                <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSubmit}>Confirm Payment</Button>
                </div>
            </div>
        </Modal>
    );
};

export default EnterprisePayslipPaymentModal;
