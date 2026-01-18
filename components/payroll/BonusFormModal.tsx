
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
    const [type, setType] = useState<BonusType | 'Custom'>('Performance');
    const [customBonusType, setCustomBonusType] = useState('');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
    const [payrollMonth, setPayrollMonth] = useState('');
    const [isRecurring, setIsRecurring] = useState(false);
    const [projectId, setProjectId] = useState('');
    const [status, setStatus] = useState<BonusRecord['status'] | 'Custom'>('Pending');
    const [customBonusStatus, setCustomBonusStatus] = useState('');

    const activeEmployees = useMemo(() => 
        (state.employees || []).filter(e => e.status === 'Active'),
        [state.employees]
    );

    useEffect(() => {
        if (isOpen) {
            if (bonusToEdit) {
                setEmployeeId(bonusToEdit.employeeId);
                // Check if type is a standard type or custom
                const standardTypes: BonusType[] = ['Performance', 'Project Completion', 'Annual', 'Quarterly', 'Celebratory', 'Ad-Hoc', 'Recurring'];
                if (standardTypes.includes(bonusToEdit.type)) {
                    setType(bonusToEdit.type);
                    setCustomBonusType('');
                } else {
                    setType('Custom');
                    setCustomBonusType(bonusToEdit.type);
                }
                setAmount(bonusToEdit.amount.toString());
                setDescription(bonusToEdit.description);
                setEffectiveDate(bonusToEdit.effectiveDate);
                setPayrollMonth(bonusToEdit.payrollMonth || '');
                setIsRecurring(bonusToEdit.isRecurring || false);
                setProjectId(bonusToEdit.projectId || '');
                // Check if status is a standard status or custom
                const standardStatuses: BonusRecord['status'][] = ['Pending', 'Approved', 'Paid', 'Cancelled'];
                if (standardStatuses.includes(bonusToEdit.status)) {
                    setStatus(bonusToEdit.status);
                    setCustomBonusStatus('');
                } else {
                    setStatus('Custom');
                    setCustomBonusStatus(bonusToEdit.status);
                }
            } else {
                setEmployeeId('');
                setType('Performance');
                setCustomBonusType('');
                setAmount('');
                setDescription('');
                setEffectiveDate(new Date().toISOString().split('T')[0]);
                setPayrollMonth('');
                setIsRecurring(false);
                setProjectId('');
                setStatus('Pending');
                setCustomBonusStatus('');
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

        const bonusType = type === 'Custom' ? customBonusType.trim() : type;
        const bonusStatus = status === 'Custom' ? customBonusStatus.trim() : status;

        if (!bonusType) {
            await showAlert('Please enter a bonus type.');
            return;
        }

        if (status === 'Custom' && !customBonusStatus.trim()) {
            await showAlert('Please enter a bonus status.');
            return;
        }

        const bonus: BonusRecord = {
            id: bonusToEdit?.id || `bonus_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            employeeId,
            type: bonusType as BonusType,
            amount: parseFloat(amount),
            description: description.trim(),
            effectiveDate,
            payrollMonth: payrollMonth || undefined,
            isRecurring,
            projectId: projectId || undefined,
            status: bonusStatus as BonusRecord['status'],
            approvedBy: bonusStatus === 'Approved' ? state.currentUser?.id : undefined,
            approvedAt: bonusStatus === 'Approved' ? new Date().toISOString() : undefined
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

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                        Bonus Type <span className="text-rose-500">*</span>
                    </label>
                    <ComboBox
                        items={[
                            { id: 'Performance', name: 'Performance' },
                            { id: 'Project Completion', name: 'Project Completion' },
                            { id: 'Annual', name: 'Annual' },
                            { id: 'Quarterly', name: 'Quarterly' },
                            { id: 'Celebratory', name: 'Celebratory' },
                            { id: 'Ad-Hoc', name: 'Ad-Hoc' },
                            { id: 'Recurring', name: 'Recurring' },
                            { id: 'Custom', name: '+ Add Custom Type...' }
                        ]}
                        selectedId={type === 'Custom' ? 'Custom' : type}
                        onSelect={(item) => {
                            if (item?.id === 'Custom') {
                                setType('Custom');
                                setCustomBonusType('');
                            } else {
                                setType(item?.id as BonusType || 'Performance');
                                setCustomBonusType('');
                            }
                        }}
                        placeholder="Select or add bonus type"
                        required
                    />
                    {type === 'Custom' && (
                        <Input
                            label="Custom Bonus Type"
                            value={customBonusType}
                            onChange={e => setCustomBonusType(e.target.value)}
                            placeholder="Enter custom bonus type..."
                            className="mt-2"
                            required
                        />
                    )}
                </div>

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

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                        Status <span className="text-rose-500">*</span>
                    </label>
                    <ComboBox
                        items={[
                            { id: 'Pending', name: 'Pending' },
                            { id: 'Approved', name: 'Approved' },
                            { id: 'Paid', name: 'Paid' },
                            { id: 'Cancelled', name: 'Cancelled' },
                            { id: 'Custom', name: '+ Add Custom Status...' }
                        ]}
                        selectedId={status === 'Custom' ? 'Custom' : status}
                        onSelect={(item) => {
                            if (item?.id === 'Custom') {
                                setStatus('Custom');
                                setCustomBonusStatus('');
                            } else {
                                setStatus((item?.id as BonusRecord['status']) || 'Pending');
                                setCustomBonusStatus('');
                            }
                        }}
                        placeholder="Select or add status"
                        required
                    />
                    {status === 'Custom' && (
                        <Input
                            label="Custom Status"
                            value={customBonusStatus}
                            onChange={e => setCustomBonusStatus(e.target.value)}
                            placeholder="Enter custom status..."
                            className="mt-2"
                            required
                        />
                    )}
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="submit">{bonusToEdit ? 'Update' : 'Add'} Bonus</Button>
                </div>
            </form>
        </Modal>
    );
};

export default BonusFormModal;
