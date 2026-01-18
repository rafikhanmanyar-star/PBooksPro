
import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Employee, TerminationDetails, AccountType } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import { CURRENCY } from '../../constants';
import { useNotification } from '../../context/NotificationContext';

interface EmployeeTerminationModalProps {
    isOpen: boolean;
    onClose: () => void;
    employee: Employee | null;
    onSuccess?: () => void;
}

const EmployeeTerminationModal: React.FC<EmployeeTerminationModalProps> = ({
    isOpen,
    onClose,
    employee,
    onSuccess
}) => {
    const { state, dispatch } = useAppContext();
    const { showAlert, showToast } = useNotification();

    const [terminationType, setTerminationType] = useState<'Resignation' | 'Termination' | 'Retirement' | 'Contract End'>('Resignation');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [lastWorkingDay, setLastWorkingDay] = useState('');
    const [noticePeriodDays, setNoticePeriodDays] = useState('');
    const [reason, setReason] = useState('');
    
    // Financials
    const [gratuityAmount, setGratuityAmount] = useState('');
    const [leaveEncashment, setLeaveEncashment] = useState('');
    const [benefitsAmount, setBenefitsAmount] = useState('');
    const [outstandingLoans, setOutstandingLoans] = useState('');
    const [outstandingAdvances, setOutstandingAdvances] = useState('');
    const [paymentAccountId, setPaymentAccountId] = useState('');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [notes, setNotes] = useState('');

    const userSelectableAccounts = useMemo(() => 
        state.accounts.filter(a => a.type === AccountType.BANK && a.name !== 'Internal Clearing'), 
        [state.accounts]
    );

    useEffect(() => {
        if (isOpen && employee) {
            const today = new Date().toISOString().split('T')[0];
            setDate(today);
            setLastWorkingDay(today);
            setOutstandingLoans((employee.loanBalance || 0).toString());
            setOutstandingAdvances((employee.advanceBalance || 0).toString());
            
            const cashAccount = userSelectableAccounts.find(a => a.name === 'Cash');
            setPaymentAccountId(cashAccount?.id || userSelectableAccounts[0]?.id || '');
        }
    }, [isOpen, employee, userSelectableAccounts]);

    const finalSettlementAmount = useMemo(() => {
        const gratuity = parseFloat(gratuityAmount) || 0;
        const leaveEnc = parseFloat(leaveEncashment) || 0;
        const benefits = parseFloat(benefitsAmount) || 0;
        const loans = parseFloat(outstandingLoans) || 0;
        const advances = parseFloat(outstandingAdvances) || 0;
        
        // Settlement = Gratuity + Leave Encashment + Benefits - Outstanding Loans - Outstanding Advances
        return Math.max(0, gratuity + leaveEnc + benefits - loans - advances);
    }, [gratuityAmount, leaveEncashment, benefitsAmount, outstandingLoans, outstandingAdvances]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!employee) return;

        if (!lastWorkingDay) {
            await showAlert('Please enter the last working day.');
            return;
        }

        if (!reason.trim()) {
            await showAlert('Please provide a reason for termination.');
            return;
        }

        if (finalSettlementAmount > 0 && !paymentAccountId) {
            await showAlert('Please select a payment account for the settlement amount.');
            return;
        }

        const terminationDetails: TerminationDetails = {
            date,
            type: terminationType,
            reason: reason.trim(),
            noticePeriodDays: noticePeriodDays ? parseInt(noticePeriodDays) : undefined,
            lastWorkingDay,
            gratuityAmount: parseFloat(gratuityAmount) || undefined,
            leaveEncashment: parseFloat(leaveEncashment) || undefined,
            benefitsAmount: parseFloat(benefitsAmount) || undefined,
            outstandingLoans: parseFloat(outstandingLoans) || undefined,
            outstandingAdvances: parseFloat(outstandingAdvances) || undefined,
            finalSettlementAmount,
            paymentAccountId: finalSettlementAmount > 0 ? paymentAccountId : undefined,
            paymentDate: finalSettlementAmount > 0 ? paymentDate : undefined,
            notes: notes.trim() || undefined
        };

        dispatch({
            type: 'TERMINATE_EMPLOYEE',
            payload: {
                employeeId: employee.id,
                terminationDetails
            }
        });

        showToast(
            `Employee ${terminationType === 'Resignation' ? 'resigned' : 'terminated'} successfully.`, 
            'success'
        );
        
        if (onSuccess) onSuccess();
        else onClose();
    };

    if (!employee) return null;

    const employeeName = `${employee.personalDetails.firstName} ${employee.personalDetails.lastName}`;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Terminate Employee: ${employeeName}`}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <Select
                    label="Termination Type"
                    value={terminationType}
                    onChange={(e) => setTerminationType(e.target.value as any)}
                    options={[
                        { value: 'Resignation', label: 'Resignation' },
                        { value: 'Termination', label: 'Termination' },
                        { value: 'Retirement', label: 'Retirement' },
                        { value: 'Contract End', label: 'Contract End' }
                    ]}
                    required
                />

                <DatePicker
                    label="Termination Date"
                    value={date}
                    onChange={d => setDate(d.toISOString().split('T')[0])}
                    required
                />

                <DatePicker
                    label="Last Working Day"
                    value={lastWorkingDay}
                    onChange={d => setLastWorkingDay(d.toISOString().split('T')[0])}
                    required
                />

                <Input
                    label="Notice Period (Days)"
                    type="number"
                    value={noticePeriodDays}
                    onChange={e => setNoticePeriodDays(e.target.value)}
                    placeholder="Optional"
                />

                <Textarea
                    label="Reason"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Enter reason for termination..."
                    required
                    rows={3}
                />

                <div className="border-t border-slate-200 pt-4 mt-4">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Financial Settlement</h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Gratuity Amount"
                            type="number"
                            value={gratuityAmount}
                            onChange={e => setGratuityAmount(e.target.value)}
                            placeholder="0.00"
                        />
                        <Input
                            label="Leave Encashment"
                            type="number"
                            value={leaveEncashment}
                            onChange={e => setLeaveEncashment(e.target.value)}
                            placeholder="0.00"
                        />
                        <Input
                            label="Benefits Amount"
                            type="number"
                            value={benefitsAmount}
                            onChange={e => setBenefitsAmount(e.target.value)}
                            placeholder="0.00"
                        />
                        <Input
                            label="Outstanding Loans"
                            type="number"
                            value={outstandingLoans}
                            onChange={e => setOutstandingLoans(e.target.value)}
                            placeholder={employee.loanBalance?.toString() || '0.00'}
                            readOnly
                        />
                    </div>

                    <Input
                        label="Outstanding Advances"
                        type="number"
                        value={outstandingAdvances}
                        onChange={e => setOutstandingAdvances(e.target.value)}
                        placeholder={employee.advanceBalance?.toString() || '0.00'}
                        className="mt-4"
                        readOnly
                    />

                    <div className="mt-4 p-3 bg-slate-50 rounded border border-slate-200">
                        <div className="flex justify-between items-center">
                            <span className="font-semibold text-slate-700">Final Settlement Amount:</span>
                            <span className={`text-xl font-bold ${finalSettlementAmount > 0 ? 'text-emerald-600' : finalSettlementAmount < 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                                {CURRENCY} {finalSettlementAmount.toLocaleString()}
                            </span>
                        </div>
                        {finalSettlementAmount < 0 && (
                            <div className="mt-2 text-xs text-rose-600">
                                Employee owes the company. This will be deducted from final settlement.
                            </div>
                        )}
                    </div>

                    {finalSettlementAmount > 0 && (
                        <>
                            <ComboBox
                                label="Payment Account"
                                items={userSelectableAccounts}
                                selectedId={paymentAccountId}
                                onSelect={(item) => setPaymentAccountId(item?.id || '')}
                                placeholder="Select Account"
                                className="mt-4"
                                required
                            />
                            <DatePicker
                                label="Payment Date"
                                value={paymentDate}
                                onChange={d => setPaymentDate(d.toISOString().split('T')[0])}
                                className="mt-4"
                                required
                            />
                        </>
                    )}
                </div>

                <Textarea
                    label="Additional Notes"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Any additional notes..."
                    rows={2}
                />

                <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="danger">Terminate Employee</Button>
                </div>
            </form>
        </Modal>
    );
};

export default EmployeeTerminationModal;
