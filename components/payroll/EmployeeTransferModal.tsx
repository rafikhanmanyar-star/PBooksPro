
import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Employee, ProjectAssignment } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import DatePicker from '../ui/DatePicker';
import Textarea from '../ui/Textarea';
import { CURRENCY } from '../../constants';
import { useNotification } from '../../context/NotificationContext';

interface EmployeeTransferModalProps {
    isOpen: boolean;
    onClose: () => void;
    employee: Employee | null;
    onSuccess?: () => void;
}

interface ProjectAllocationInput {
    projectId: string;
    percentage: number;
    costCenter?: string;
}

const EmployeeTransferModal: React.FC<EmployeeTransferModalProps> = ({
    isOpen,
    onClose,
    employee,
    onSuccess
}) => {
    const { state, dispatch } = useAppContext();
    const { showAlert, showToast } = useNotification();

    const [allocations, setAllocations] = useState<ProjectAllocationInput[]>([]);
    const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
    const [description, setDescription] = useState('');

    const availableProjects = useMemo(() => state.projects || [], [state.projects]);

    useEffect(() => {
        if (isOpen && employee) {
            // Initialize with current project assignments or default to one empty allocation
            const currentAssignments = employee.projectAssignments || [];
            if (currentAssignments.length > 0) {
                setAllocations(
                    currentAssignments.map(a => ({
                        projectId: a.projectId,
                        percentage: a.percentage,
                        costCenter: a.costCenter
                    }))
                );
            } else {
                // Default to one allocation
                setAllocations([{ projectId: '', percentage: 100 }]);
            }
            setEffectiveDate(new Date().toISOString().split('T')[0]);
            setDescription(`Transfer to new project assignment${currentAssignments.length > 1 ? 's' : ''}`);
        }
    }, [isOpen, employee]);

    const totalPercentage = useMemo(() => {
        return allocations.reduce((sum, a) => sum + (a.percentage || 0), 0);
    }, [allocations]);

    const addAllocation = () => {
        setAllocations([...allocations, { projectId: '', percentage: 0 }]);
    };

    const removeAllocation = (index: number) => {
        setAllocations(allocations.filter((_, i) => i !== index));
    };

    const updateAllocation = (index: number, field: keyof ProjectAllocationInput, value: string | number) => {
        const updated = [...allocations];
        updated[index] = { ...updated[index], [field]: value };
        setAllocations(updated);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!employee) return;

        if (allocations.length === 0) {
            await showAlert('Please add at least one project assignment.');
            return;
        }

        // Validate all allocations have project IDs
        if (allocations.some(a => !a.projectId)) {
            await showAlert('Please select a project for all allocations.');
            return;
        }

        // Validate percentages
        if (Math.abs(totalPercentage - 100) > 0.01) {
            await showAlert(`Total percentage must equal 100%. Current total: ${totalPercentage}%`);
            return;
        }

        // Check for duplicate projects
        const projectIds = allocations.map(a => a.projectId);
        if (new Set(projectIds).size !== projectIds.length) {
            await showAlert('Cannot assign employee to the same project multiple times.');
            return;
        }

        const projectAssignments: ProjectAssignment[] = allocations.map(a => ({
            projectId: a.projectId,
            percentage: a.percentage,
            costCenter: a.costCenter?.trim() || undefined
        }));

        dispatch({
            type: 'TRANSFER_EMPLOYEE',
            payload: {
                employeeId: employee.id,
                projectAssignments,
                effectiveDate
            }
        });

        showToast(
            `Employee transferred successfully. Assigned to ${allocations.length} project(s).`, 
            'success'
        );
        
        if (onSuccess) onSuccess();
        else onClose();
    };

    if (!employee) return null;

    const employeeName = `${employee.personalDetails.firstName} ${employee.personalDetails.lastName}`;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Transfer Employee: ${employeeName}`}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="p-3 bg-slate-50 rounded border border-slate-200 mb-4">
                    <div className="text-sm font-semibold text-slate-700 mb-2">Current Project Assignments</div>
                    {employee.projectAssignments && employee.projectAssignments.length > 0 ? (
                        <div className="space-y-1 text-xs">
                            {employee.projectAssignments.map((assignment, idx) => {
                                const project = availableProjects.find(p => p.id === assignment.projectId);
                                return (
                                    <div key={idx} className="flex justify-between">
                                        <span className="text-slate-600">
                                            {project?.name || assignment.projectId}:
                                        </span>
                                        <span className="font-medium">{assignment.percentage}%</span>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-xs text-slate-500">No current project assignments</div>
                    )}
                </div>

                <div className="border-t border-slate-200 pt-4">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-sm font-semibold text-slate-700">New Project Assignments</h3>
                        <Button type="button" variant="secondary" onClick={addAllocation} className="text-xs">
                            + Add Project
                        </Button>
                    </div>

                    <div className="space-y-3">
                        {allocations.map((allocation, index) => (
                            <div key={index} className="p-3 border border-slate-200 rounded-lg bg-white">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-semibold text-slate-600">Assignment #{index + 1}</span>
                                    {allocations.length > 1 && (
                                        <Button
                                            type="button"
                                            variant="danger"
                                            onClick={() => removeAllocation(index)}
                                            className="text-xs py-1 px-2"
                                        >
                                            Remove
                                        </Button>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <ComboBox
                                        label="Project"
                                        items={availableProjects}
                                        selectedId={allocation.projectId}
                                        onSelect={(item) => updateAllocation(index, 'projectId', item?.id || '')}
                                        placeholder="Select Project"
                                        required
                                    />
                                    <Input
                                        label="Percentage"
                                        type="number"
                                        value={allocation.percentage.toString()}
                                        onChange={e => updateAllocation(index, 'percentage', parseFloat(e.target.value) || 0)}
                                        placeholder="0"
                                        required
                                        min="0"
                                        max="100"
                                        step="0.01"
                                    />
                                </div>
                                <Input
                                    label="Cost Center (Optional)"
                                    value={allocation.costCenter || ''}
                                    onChange={e => updateAllocation(index, 'costCenter', e.target.value)}
                                    placeholder="e.g. CC-001"
                                    className="mt-2"
                                />
                            </div>
                        ))}
                    </div>

                    <div className={`mt-3 p-2 rounded border text-xs font-semibold ${
                        Math.abs(totalPercentage - 100) < 0.01
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}>
                        Total Percentage: {totalPercentage.toFixed(2)}% 
                        {Math.abs(totalPercentage - 100) >= 0.01 && ' (Must equal 100%)'}
                    </div>
                </div>

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
                    placeholder="Additional details about the transfer..."
                    rows={3}
                />

                <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                    <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button type="submit">Transfer Employee</Button>
                </div>
            </form>
        </Modal>
    );
};

export default EmployeeTransferModal;
