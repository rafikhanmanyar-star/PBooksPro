
import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Employee, LifeCycleEvent } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import DatePicker from '../ui/DatePicker';
import Textarea from '../ui/Textarea';
import { CURRENCY } from '../../constants';
import { useNotification } from '../../context/NotificationContext';

interface EmployeePromotionModalProps {
    isOpen: boolean;
    onClose: () => void;
    employee: Employee | null;
    onSuccess?: () => void;
}

const EmployeePromotionModal: React.FC<EmployeePromotionModalProps> = ({
    isOpen,
    onClose,
    employee,
    onSuccess
}) => {
    const { state, dispatch } = useAppContext();
    const { showAlert, showToast } = useNotification();

    const [newDesignation, setNewDesignation] = useState('');
    const [newSalary, setNewSalary] = useState('');
    const [newGrade, setNewGrade] = useState('');
    const [newDepartment, setNewDepartment] = useState('');
    const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
    const [description, setDescription] = useState('');

    useEffect(() => {
        if (isOpen && employee) {
            setNewDesignation(employee.employmentDetails.designation || '');
            setNewSalary(employee.basicSalary.toString());
            setNewGrade(employee.employmentDetails.grade || '');
            setNewDepartment(employee.employmentDetails.department || '');
            setEffectiveDate(new Date().toISOString().split('T')[0]);
            setDescription(`Promoted to ${employee.employmentDetails.designation}`);
        }
    }, [isOpen, employee]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!employee) return;

        if (!newDesignation.trim()) {
            await showAlert('Please enter the new designation.');
            return;
        }

        if (!newSalary || isNaN(parseFloat(newSalary)) || parseFloat(newSalary) < 0) {
            await showAlert('Please enter a valid salary amount.');
            return;
        }

        const salaryChange = parseFloat(newSalary) - employee.basicSalary;
        const prevDesignation = employee.employmentDetails.designation;
        const prevGrade = employee.employmentDetails.grade;
        const prevDepartment = employee.employmentDetails.department;

        // Check if there's any actual change
        if (
            newDesignation === prevDesignation &&
            parseFloat(newSalary) === employee.basicSalary &&
            newGrade === (prevGrade || '') &&
            newDepartment === (prevDepartment || '')
        ) {
            await showAlert('No changes detected. Please update at least one field.');
            return;
        }

        dispatch({
            type: 'PROMOTE_EMPLOYEE',
            payload: {
                employeeId: employee.id,
                newDesignation: newDesignation.trim(),
                newSalary: parseFloat(newSalary),
                effectiveDate,
                newGrade: newGrade.trim() || undefined,
                newDepartment: newDepartment.trim() || undefined
            }
        });

        showToast(
            `Employee promoted successfully. Salary ${salaryChange >= 0 ? 'increased' : 'decreased'} by ${CURRENCY} ${Math.abs(salaryChange).toLocaleString()}.`, 
            'success'
        );
        
        if (onSuccess) onSuccess();
        else onClose();
    };

    if (!employee) return null;

    const employeeName = `${employee.personalDetails.firstName} ${employee.personalDetails.lastName}`;
    const salaryChange = parseFloat(newSalary) - employee.basicSalary || 0;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Promote Employee: ${employeeName}`}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="p-3 bg-slate-50 rounded border border-slate-200 mb-4">
                    <div className="text-sm font-semibold text-slate-700 mb-2">Current Details</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                            <span className="text-slate-500">Designation:</span>
                            <span className="ml-2 font-medium">{employee.employmentDetails.designation}</span>
                        </div>
                        <div>
                            <span className="text-slate-500">Salary:</span>
                            <span className="ml-2 font-medium">{CURRENCY} {employee.basicSalary.toLocaleString()}</span>
                        </div>
                        {employee.employmentDetails.grade && (
                            <div>
                                <span className="text-slate-500">Grade:</span>
                                <span className="ml-2 font-medium">{employee.employmentDetails.grade}</span>
                            </div>
                        )}
                        {employee.employmentDetails.department && (
                            <div>
                                <span className="text-slate-500">Department:</span>
                                <span className="ml-2 font-medium">{employee.employmentDetails.department}</span>
                            </div>
                        )}
                    </div>
                </div>

                <Input
                    label="New Designation"
                    value={newDesignation}
                    onChange={e => setNewDesignation(e.target.value)}
                    placeholder="e.g. Senior Manager"
                    required
                />

                <Input
                    label="New Basic Salary"
                    type="number"
                    value={newSalary}
                    onChange={e => setNewSalary(e.target.value)}
                    placeholder="0.00"
                    required
                />

                {salaryChange !== 0 && (
                    <div className={`p-2 rounded border ${
                        salaryChange > 0 
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                            : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}>
                        <div className="text-xs font-semibold">
                            Salary Change: {salaryChange > 0 ? '+' : ''}{CURRENCY} {salaryChange.toLocaleString()}
                            {' '}({salaryChange > 0 ? 'Increase' : 'Decrease'})
                        </div>
                    </div>
                )}

                <Input
                    label="New Grade (Optional)"
                    value={newGrade}
                    onChange={e => setNewGrade(e.target.value)}
                    placeholder="e.g. G5"
                />

                <Input
                    label="New Department (Optional)"
                    value={newDepartment}
                    onChange={e => setNewDepartment(e.target.value)}
                    placeholder="e.g. Engineering"
                />

                <DatePicker
                    label="Effective Date"
                    value={effectiveDate}
                    onChange={d => setEffectiveDate(d.toISOString().split('T')[0])}
                    required
                />

                <Textarea
                    label="Description / Notes"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Additional details about the promotion..."
                    rows={3}
                />

                <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="submit">Promote Employee</Button>
                </div>
            </form>
        </Modal>
    );
};

export default EmployeePromotionModal;
