
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
    const [type, setType] = useState<'Deduction' | 'Addition'>('Addition');
    const [category, setCategory] = useState<'Allowance' | 'Deduction' | 'Tax' | 'PF' | 'ESI' | 'Insurance' | 'Loan' | 'Advance' | 'Penalty' | 'Fine' | 'Custom'>('Allowance');
    const [customCategory, setCustomCategory] = useState('');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [reason, setReason] = useState('');
    const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
    const [payrollMonth, setPayrollMonth] = useState('');
    const [isRecurring, setIsRecurring] = useState(false);
    const [formula, setFormula] = useState('');
    const [status, setStatus] = useState<PayrollAdjustment['status'] | 'Custom'>('Active');
    const [customStatus, setCustomStatus] = useState('');

    const activeEmployees = useMemo(() => 
        (state.employees || []).filter(e => e.status === 'Active'),
        [state.employees]
    );

    useEffect(() => {
        if (isOpen) {
            if (adjustmentToEdit) {
                setEmployeeId(adjustmentToEdit.employeeId);
                setType(adjustmentToEdit.type);
                setType(adjustmentToEdit.type);
                // Check if category is a standard category or custom
                const standardCategories = ['Allowance', 'Transport', 'Meal', 'Medical', 'Deduction', 'Tax', 'PF', 'ESI', 'Insurance', 'Loan', 'Advance', 'Penalty', 'Fine'];
                if (standardCategories.includes(adjustmentToEdit.category)) {
                    setCategory(adjustmentToEdit.category as any);
                    setCustomCategory('');
                } else {
                    setCategory('Custom');
                    setCustomCategory(adjustmentToEdit.category);
                }
                setAmount(adjustmentToEdit.amount.toString());
                setDescription(adjustmentToEdit.description);
                setReason(adjustmentToEdit.reason);
                setEffectiveDate(adjustmentToEdit.effectiveDate);
                setPayrollMonth(adjustmentToEdit.payrollMonth || '');
                setIsRecurring(adjustmentToEdit.isRecurring || false);
                setFormula(adjustmentToEdit.formula || '');
                // Check if status is a standard status or custom
                const standardStatuses: PayrollAdjustment['status'][] = ['Active', 'Applied', 'Cancelled'];
                if (standardStatuses.includes(adjustmentToEdit.status)) {
                    setStatus(adjustmentToEdit.status);
                    setCustomStatus('');
                } else {
                    setStatus('Custom');
                    setCustomStatus(adjustmentToEdit.status);
                }
            } else {
                setEmployeeId('');
                setType('Addition');
                setCategory('Allowance');
                setCustomCategory('');
                setAmount('');
                setDescription('');
                setReason('');
                setEffectiveDate(new Date().toISOString().split('T')[0]);
                setPayrollMonth('');
                setIsRecurring(false);
                setFormula('');
                setStatus('Active');
                setCustomStatus('');
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

        const adjustmentCategory = category === 'Custom' ? customCategory.trim() : category;
        const adjustmentStatus = status === 'Custom' ? customStatus.trim() : status;

        if (!adjustmentCategory) {
            await showAlert('Please enter a category.');
            return;
        }

        if (status === 'Custom' && !customStatus.trim()) {
            await showAlert('Please enter a status.');
            return;
        }

        const adjustment: PayrollAdjustment = {
            id: adjustmentToEdit?.id || `adjustment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            employeeId,
            type,
            category: adjustmentCategory,
            amount: parseFloat(amount),
            description: description.trim(),
            reason: reason.trim(),
            effectiveDate,
            payrollMonth: payrollMonth || undefined,
            isRecurring,
            formula: formula || undefined,
            status: adjustmentStatus as PayrollAdjustment['status'],
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
                    label="Type"
                    value={type}
                    onChange={(e) => {
                        const newType = e.target.value as 'Deduction' | 'Addition';
                        setType(newType);
                        if (!adjustmentToEdit) {
                            // Auto-set default category based on type
                            if (newType === 'Addition') {
                                setCategory('Allowance');
                            } else {
                                setCategory('Deduction');
                            }
                        }
                    }}
                    options={[
                        { value: 'Addition', label: 'Addition (Add to Salary)' },
                        { value: 'Deduction', label: 'Deduction (Subtract from Salary)' }
                    ]}
                    required
                />

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                        Category <span className="text-rose-500">*</span>
                    </label>
                    <ComboBox
                        items={type === 'Addition' ? [
                            { id: 'Allowance', name: 'Allowance' },
                            { id: 'Transport', name: 'Transport' },
                            { id: 'Meal', name: 'Meal' },
                            { id: 'Medical', name: 'Medical' },
                            { id: 'Custom', name: '+ Add Custom Category...' }
                        ] : [
                            { id: 'Deduction', name: 'Deduction' },
                            { id: 'Tax', name: 'Tax' },
                            { id: 'PF', name: 'Provident Fund (PF)' },
                            { id: 'ESI', name: 'Employee State Insurance (ESI)' },
                            { id: 'Insurance', name: 'Insurance' },
                            { id: 'Loan', name: 'Loan' },
                            { id: 'Advance', name: 'Advance' },
                            { id: 'Penalty', name: 'Penalty' },
                            { id: 'Fine', name: 'Fine' },
                            { id: 'Custom', name: '+ Add Custom Category...' }
                        ]}
                        selectedId={category === 'Custom' ? 'Custom' : category}
                        onSelect={(item) => {
                            if (item?.id === 'Custom') {
                                setCategory('Custom');
                                setCustomCategory('');
                            } else {
                                setCategory((item?.id as any) || (type === 'Addition' ? 'Allowance' : 'Deduction'));
                                setCustomCategory('');
                            }
                        }}
                        placeholder="Select or add category"
                        required
                    />
                    {category === 'Custom' && (
                        <Input
                            label="Custom Category"
                            value={customCategory}
                            onChange={e => setCustomCategory(e.target.value)}
                            placeholder="Enter custom category..."
                            className="mt-2"
                            required
                        />
                    )}
                </div>

                <Input
                    label={`${type === 'Addition' ? 'Addition' : 'Deduction'} Amount`}
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

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                        Status <span className="text-rose-500">*</span>
                    </label>
                    <ComboBox
                        items={[
                            { id: 'Active', name: 'Active' },
                            { id: 'Applied', name: 'Applied' },
                            { id: 'Cancelled', name: 'Cancelled' },
                            { id: 'Custom', name: '+ Add Custom Status...' }
                        ]}
                        selectedId={status === 'Custom' ? 'Custom' : status}
                        onSelect={(item) => {
                            if (item?.id === 'Custom') {
                                setStatus('Custom');
                                setCustomStatus('');
                            } else {
                                setStatus((item?.id as PayrollAdjustment['status']) || 'Active');
                                setCustomStatus('');
                            }
                        }}
                        placeholder="Select or add status"
                        required
                    />
                    {status === 'Custom' && (
                        <Input
                            label="Custom Status"
                            value={customStatus}
                            onChange={e => setCustomStatus(e.target.value)}
                            placeholder="Enter custom status..."
                            className="mt-2"
                            required
                        />
                    )}
                </div>

                <div className="p-3 bg-slate-50 rounded border border-slate-200">
                    <div className="text-xs font-semibold text-slate-600 mb-1">
                        Adjustment Summary:
                    </div>
                    <div className="text-sm text-slate-700">
                        {type === 'Addition' ? (
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
