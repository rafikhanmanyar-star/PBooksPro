
import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { PayrollAdjustment, Employee } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import { CURRENCY } from '../../constants';
import { useNotification } from '../../context/NotificationContext';

interface PayrollAdjustmentFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    adjustmentToEdit?: PayrollAdjustment | null;
    onSuccess?: () => void;
}

const PayrollAdjustmentFormModal: React.FC<PayrollAdjustmentFormModalProps> = ({
    isOpen,
    onClose,
    adjustmentToEdit,
    onSuccess
}) => {
    const { state, dispatch } = useAppContext();
    const { showAlert, showToast } = useNotification();

    const [employeeId, setEmployeeId] = useState('');
    const [type, setType] = useState('Allowance');
    const [category, setCategory] = useState<'Allowance' | 'Deduction'>('Allowance');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [reason, setReason] = useState('');
    const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
    const [payrollMonth, setPayrollMonth] = useState('');
    const [isRecurring, setIsRecurring] = useState(false);
    const [formula, setFormula] = useState('');
    const [status, setStatus] = useState<PayrollAdjustment['status']>('Active');

    const activeEmployees = useMemo(() => 
        (state.employees || []).filter(e => e.status === 'Active'),
        [state.employees]
    );

    useEffect(() => {
        if (isOpen) {
            if (adjustmentToEdit) {
                setEmployeeId(adjustmentToEdit.employeeId);
                setType(adjustmentToEdit.type);
                setCategory(adjustmentToEdit.category);
                setAmount(adjustmentToEdit.amount.toString());
                setDescription(adjustmentToEdit.description);
                setReason(adjustmentToEdit.reason);
                setEffectiveDate(adjustmentToEdit.effectiveDate);
                setPayrollMonth(adjustmentToEdit.payrollMonth || '');
                setIsRecurring(adjustmentToEdit.isRecurring || false);
                setFormula(adjustmentToEdit.formula || '');
                setStatus(adjustmentToEdit.status);
            } else {
                setEmployeeId('');
                setType('Allowance');
                setCategory('Allowance');
                setAmount('');
                setDescription('');
                setReason('');
                setEffectiveDate(new Date().toISOString().split('T')[0]);
                setPayrollMonth('');
                setIsRecurring(false);
                setFormula('');
                setStatus('Active');
            }
        }
    }, [isOpen, adjustmentToEdit]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!employeeId) {
            await showAlert('Please select an employee.');
            return;
        }

        if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
            await showAlert('Please enter a valid adjustment amount.');
            return;
        }

        if (!description.trim()) {
            await showAlert('Please enter a description for the adjustment.');
            return;
        }

        if (!reason.trim()) {
            await showAlert('Please enter a reason for the adjustment.');
            return;
        }

        if (!effectiveDate) {
            await showAlert('Please select an effective date.');
            return;
        }

        const adjustment: PayrollAdjustment = {
            id: adjustmentToEdit?.id || `adjustment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            employeeId,
            type,
            category,
            amount: parseFloat(amount),
            description: description.trim(),
            reason: reason.trim(),
            effectiveDate,
            payrollMonth: payrollMonth || undefined,
            isRecurring,
            formula: formula || undefined,
            status,
            performedBy: state.currentUser?.id || 'System',
            performedAt: new Date().toISOString()
        };

        if (adjustmentToEdit) {
            dispatch({ type: 'UPDATE_PAYROLL_ADJUSTMENT', payload: adjustment });
            showToast('Adjustment updated successfully!', 'success');
        } else {
            dispatch({ type: 'ADD_PAYROLL_ADJUSTMENT', payload: adjustment });
            showToast('Adjustment added successfully!', 'success');
        }
        
        if (onSuccess) onSuccess();
        else onClose();
    };

    const selectedEmployee = useMemo(() => 
        activeEmployees.find(e => e.id === employeeId),
        [activeEmployees, employeeId]
    );

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={adjustmentToEdit ? 'Edit Adjustment' : 'Add Payroll Adjustment'}
            size="lg"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <ComboBox
                    label="Employee"
                    items={activeEmployees.map(e => ({
                        id: e.id,
                        name: `${e.personalDetails.firstName} ${e.personalDetails.lastName} (${e.employeeId})`
                    }))}
                    selectedId={employeeId}
                    onSelect={(item) => setEmployeeId(item?.id || '')}
                    placeholder="Select Employee"
                    required
                />

                <Select
                    label="Category"
                    value={category}
                    onChange={(e) => {
                        const newCategory = e.target.value as 'Allowance' | 'Deduction';
                        setCategory(newCategory);
                        if (!adjustmentToEdit) {
                            // Auto-set type based on category
                            if (newCategory === 'Allowance') {
                                setType('Transport');
                            } else {
                                setType('Penalty');
                            }
                        }
                    }}
                    options={[
                        { value: 'Allowance', label: 'Allowance' },
                        { value: 'Deduction', label: 'Deduction' }
                    ]}
                    required
                />

                <Input
                    label="Type"
                    value={type}
                    onChange={e => setType(e.target.value)}
                    placeholder={category === 'Allowance' ? 'e.g. Transport, Meal' : 'e.g. Penalty, Late Fee'}
                    required
                />

                <Input
                    label={`${category === 'Allowance' ? 'Allowance' : 'Deduction'} Amount`}
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    required
                    prefix={CURRENCY}
                />

                <Textarea
                    label="Description"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Describe the adjustment..."
                    required
                    rows={2}
                />

                <Textarea
                    label="Reason"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Why is this adjustment being made?"
                    required
                    rows={2}
                />

                <DatePicker
                    label="Effective Date"
                    value={effectiveDate}
                    onChange={d => setEffectiveDate(d.toISOString().split('T')[0])}
                    required
                />

                <Input
                    label="Payroll Month (Optional)"
                    type="month"
                    value={payrollMonth}
                    onChange={e => setPayrollMonth(e.target.value)}
                    placeholder="YYYY-MM"
                />

                <div className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        id="isRecurring"
                        checked={isRecurring}
                        onChange={(e) => setIsRecurring(e.target.checked)}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <label htmlFor="isRecurring" className="text-sm text-slate-700">
                        Recurring Adjustment
                    </label>
                </div>

                {isRecurring && (
                    <Input
                        label="Formula (Optional)"
                        value={formula}
                        onChange={e => setFormula(e.target.value)}
                        placeholder="e.g. basicSalary * 0.05"
                    />
                )}

                <Select
                    label="Status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as PayrollAdjustment['status'])}
                    options={[
                        { value: 'Active', label: 'Active' },
                        { value: 'Inactive', label: 'Inactive' },
                        { value: 'Cancelled', label: 'Cancelled' }
                    ]}
                    required
                />

                <div className="p-3 bg-slate-50 rounded border border-slate-200">
                    <div className="text-xs font-semibold text-slate-600 mb-1">
                        Adjustment Summary:
                    </div>
                    <div className="text-sm text-slate-700">
                        {category === 'Allowance' ? (
                            <span className="text-emerald-600 font-semibold">
                                +{CURRENCY} {amount || '0.00'} will be added
                            </span>
                        ) : (
                            <span className="text-rose-600 font-semibold">
                                -{CURRENCY} {amount || '0.00'} will be deducted
                            </span>
                        )}
                        {' '}from the employee's payroll
                        {payrollMonth && ` for ${payrollMonth}`}
                        {isRecurring && ' (recurring)'}.
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="submit">{adjustmentToEdit ? 'Update' : 'Add'} Adjustment</Button>
                </div>
            </form>
        </Modal>
    );
};

export default PayrollAdjustmentFormModal;
