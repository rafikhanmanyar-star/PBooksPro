
import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { BonusRecord, BonusType, Employee } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import Select from '../ui/Select';
import Textarea from '../ui/Textarea';
import { CURRENCY } from '../../constants';
import { useNotification } from '../../context/NotificationContext';

interface BonusFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    bonusToEdit?: BonusRecord | null;
    onSuccess?: () => void;
}

const BonusFormModal: React.FC<BonusFormModalProps> = ({
    isOpen,
    onClose,
    bonusToEdit,
    onSuccess
}) => {
    const { state, dispatch } = useAppContext();
    const { showAlert, showToast } = useNotification();

    const [employeeId, setEmployeeId] = useState('');
    const [type, setType] = useState<BonusType>('Performance');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
    const [payrollMonth, setPayrollMonth] = useState('');
    const [isRecurring, setIsRecurring] = useState(false);
    const [projectId, setProjectId] = useState('');
    const [status, setStatus] = useState<BonusRecord['status']>('Pending');

    const activeEmployees = useMemo(() => 
        (state.employees || []).filter(e => e.status === 'Active'),
        [state.employees]
    );

    useEffect(() => {
        if (isOpen) {
            if (bonusToEdit) {
                setEmployeeId(bonusToEdit.employeeId);
                setType(bonusToEdit.type);
                setAmount(bonusToEdit.amount.toString());
                setDescription(bonusToEdit.description);
                setEffectiveDate(bonusToEdit.effectiveDate);
                setPayrollMonth(bonusToEdit.payrollMonth || '');
                setIsRecurring(bonusToEdit.isRecurring || false);
                setProjectId(bonusToEdit.projectId || '');
                setStatus(bonusToEdit.status);
            } else {
                setEmployeeId('');
                setType('Performance');
                setAmount('');
                setDescription('');
                setEffectiveDate(new Date().toISOString().split('T')[0]);
                setPayrollMonth('');
                setIsRecurring(false);
                setProjectId('');
                setStatus('Pending');
            }
        }
    }, [isOpen, bonusToEdit]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!employeeId) {
            await showAlert('Please select an employee.');
            return;
        }

        if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
            await showAlert('Please enter a valid bonus amount.');
            return;
        }

        if (!description.trim()) {
            await showAlert('Please enter a description for the bonus.');
            return;
        }

        if (!effectiveDate) {
            await showAlert('Please select an effective date.');
            return;
        }

        const bonus: BonusRecord = {
            id: bonusToEdit?.id || `bonus_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            employeeId,
            type,
            amount: parseFloat(amount),
            description: description.trim(),
            effectiveDate,
            payrollMonth: payrollMonth || undefined,
            isRecurring,
            projectId: projectId || undefined,
            status,
            approvedBy: status === 'Approved' ? state.currentUser?.id : undefined,
            approvedAt: status === 'Approved' ? new Date().toISOString() : undefined
        };

        if (bonusToEdit) {
            dispatch({ type: 'UPDATE_BONUS', payload: bonus });
            showToast('Bonus updated successfully!', 'success');
        } else {
            dispatch({ type: 'ADD_BONUS', payload: bonus });
            showToast('Bonus added successfully!', 'success');
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
            title={bonusToEdit ? 'Edit Bonus' : 'Add Bonus'}
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
                    label="Bonus Type"
                    value={type}
                    onChange={(e) => setType(e.target.value as BonusType)}
                    options={[
                        { value: 'Performance', label: 'Performance' },
                        { value: 'Project Completion', label: 'Project Completion' },
                        { value: 'Annual', label: 'Annual' },
                        { value: 'Quarterly', label: 'Quarterly' },
                        { value: 'Celebratory', label: 'Celebratory' },
                        { value: 'Ad-Hoc', label: 'Ad-Hoc' },
                        { value: 'Recurring', label: 'Recurring' }
                    ]}
                    required
                />

                <Input
                    label="Bonus Amount"
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
                    placeholder="Describe the reason for this bonus..."
                    required
                    rows={3}
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
                        Recurring Bonus
                    </label>
                </div>

                <ComboBox
                    label="Project (Optional)"
                    items={state.projects.map(p => ({ id: p.id, name: p.name }))}
                    selectedId={projectId}
                    onSelect={(item) => setProjectId(item?.id || '')}
                    placeholder="Select Project"
                />

                <Select
                    label="Status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as BonusRecord['status'])}
                    options={[
                        { value: 'Pending', label: 'Pending' },
                        { value: 'Approved', label: 'Approved' },
                        { value: 'Rejected', label: 'Rejected' },
                        { value: 'Paid', label: 'Paid' }
                    ]}
                    required
                />

                <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="submit">{bonusToEdit ? 'Update' : 'Add'} Bonus</Button>
                </div>
            </form>
        </Modal>
    );
};

export default BonusFormModal;
