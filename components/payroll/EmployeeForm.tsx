
import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Employee, EmployeeStatus, ProjectAssignment, EmployeeSalaryComponent } from '../../types';
import Button from '../ui/Button';
import Input from '../ui/Input';
import ComboBox from '../ui/ComboBox';
import { useNotification } from '../../context/NotificationContext';

interface EmployeeFormProps {
    employeeToEdit?: Employee | null;
    onClose: () => void;
}

const EmployeeForm: React.FC<EmployeeFormProps> = ({ employeeToEdit, onClose }) => {
    const { state, dispatch } = useAppContext();
    const { showToast } = useNotification();

    const [formData, setFormData] = useState({
        employeeId: '',
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        dateOfBirth: '',
        address: '',
        designation: '',
        department: '',
        grade: '',
        role: '',
        joiningDate: new Date().toISOString().split('T')[0],
        confirmationDate: '',
        employmentType: 'Full-Time' as const,
        basicSalary: 0,
        status: 'Active' as EmployeeStatus,
        reportingManager: ''
    });

    const [projectAssignments, setProjectAssignments] = useState<ProjectAssignment[]>([]);
    const [salaryStructure, setSalaryStructure] = useState<EmployeeSalaryComponent[]>([]);

    useEffect(() => {
        if (employeeToEdit) {
            setFormData({
                employeeId: employeeToEdit.employeeId,
                firstName: employeeToEdit.personalDetails.firstName,
                lastName: employeeToEdit.personalDetails.lastName,
                email: employeeToEdit.personalDetails.email || '',
                phone: employeeToEdit.personalDetails.phone || '',
                dateOfBirth: employeeToEdit.personalDetails.dateOfBirth || '',
                address: employeeToEdit.personalDetails.address || '',
                designation: employeeToEdit.employmentDetails.designation,
                department: employeeToEdit.employmentDetails.department || '',
                grade: employeeToEdit.employmentDetails.grade || '',
                role: employeeToEdit.employmentDetails.role || '',
                joiningDate: employeeToEdit.employmentDetails.joiningDate.split('T')[0],
                confirmationDate: employeeToEdit.employmentDetails.confirmationDate?.split('T')[0] || '',
                employmentType: employeeToEdit.employmentDetails.employmentType,
                basicSalary: employeeToEdit.basicSalary,
                status: employeeToEdit.status,
                reportingManager: employeeToEdit.employmentDetails.reportingManager || ''
            });
            setProjectAssignments(employeeToEdit.projectAssignments);
            setSalaryStructure(employeeToEdit.salaryStructure);
        }
    }, [employeeToEdit]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.employeeId || !formData.firstName || !formData.lastName || !formData.designation) {
            showToast('Please fill in all required fields', 'error');
            return;
        }

        const employee: Employee = {
            id: employeeToEdit?.id || `emp-${Date.now()}`,
            employeeId: formData.employeeId,
            personalDetails: {
                firstName: formData.firstName,
                lastName: formData.lastName,
                email: formData.email || undefined,
                phone: formData.phone || undefined,
                dateOfBirth: formData.dateOfBirth || undefined,
                address: formData.address || undefined,
                emergencyContact: undefined // Can be added later
            },
            employmentDetails: {
                designation: formData.designation,
                department: formData.department || undefined,
                grade: formData.grade || undefined,
                role: formData.role || undefined,
                joiningDate: formData.joiningDate,
                confirmationDate: formData.confirmationDate || undefined,
                employmentType: formData.employmentType,
                reportingManager: formData.reportingManager || undefined
            },
            status: formData.status,
            basicSalary: formData.basicSalary,
            salaryStructure,
            projectAssignments,
            documents: employeeToEdit?.documents || [],
            lifecycleHistory: employeeToEdit?.lifecycleHistory || [],
            advanceBalance: employeeToEdit?.advanceBalance || 0,
            loanBalance: employeeToEdit?.loanBalance || 0,
            createdAt: employeeToEdit?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (employeeToEdit) {
            dispatch({ type: 'UPDATE_EMPLOYEE', payload: employee });
            showToast('Employee updated successfully');
        } else {
            dispatch({ type: 'ADD_EMPLOYEE', payload: employee });
            showToast('Employee added successfully');
        }

        onClose();
    };

    const addProjectAssignment = () => {
        if (state.projects.length === 0) {
            showToast('No projects available. Please create a project first.', 'error');
            return;
        }
        setProjectAssignments([
            ...projectAssignments,
            {
                projectId: state.projects[0].id,
                effectiveDate: new Date().toISOString().split('T')[0],
                percentage: 100
            }
        ]);
    };

    const removeProjectAssignment = (index: number) => {
        setProjectAssignments(projectAssignments.filter((_, i) => i !== index));
    };

    const updateProjectAssignment = (index: number, field: keyof ProjectAssignment, value: any) => {
        const updated = [...projectAssignments];
        updated[index] = { ...updated[index], [field]: value };
        setProjectAssignments(updated);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Personal Details */}
            <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-800 border-b border-slate-200 pb-2">Personal Details</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Employee ID *</label>
                        <Input
                            value={formData.employeeId}
                            onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                            required
                            disabled={!!employeeToEdit}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                        <ComboBox
                            items={[
                                { id: 'Active', name: 'Active' },
                                { id: 'Inactive', name: 'Inactive' },
                                { id: 'On Leave', name: 'On Leave' },
                                { id: 'Suspended', name: 'Suspended' }
                            ]}
                            selectedId={formData.status}
                            onSelect={(item) => setFormData({ ...formData, status: (item?.id as EmployeeStatus) || 'Active' })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">First Name *</label>
                        <Input
                            value={formData.firstName}
                            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Last Name *</label>
                        <Input
                            value={formData.lastName}
                            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                        <Input
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                        <Input
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Date of Birth</label>
                        <Input
                            type="date"
                            value={formData.dateOfBirth}
                            onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                        <Input
                            value={formData.address}
                            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        />
                    </div>
                </div>
            </div>

            {/* Employment Details */}
            <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-800 border-b border-slate-200 pb-2">Employment Details</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Designation *</label>
                        <Input
                            value={formData.designation}
                            onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
                        <Input
                            value={formData.department}
                            onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Grade</label>
                        <Input
                            value={formData.grade}
                            onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                        <Input
                            value={formData.role}
                            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Joining Date *</label>
                        <Input
                            type="date"
                            value={formData.joiningDate}
                            onChange={(e) => setFormData({ ...formData, joiningDate: e.target.value })}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Confirmation Date</label>
                        <Input
                            type="date"
                            value={formData.confirmationDate}
                            onChange={(e) => setFormData({ ...formData, confirmationDate: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Employment Type</label>
                        <ComboBox
                            items={[
                                { id: 'Full-Time', name: 'Full-Time' },
                                { id: 'Part-Time', name: 'Part-Time' },
                                { id: 'Contract', name: 'Contract' },
                                { id: 'Intern', name: 'Intern' }
                            ]}
                            selectedId={formData.employmentType}
                            onSelect={(item) => setFormData({ ...formData, employmentType: (item?.id as any) || 'Full-Time' })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Basic Salary *</label>
                        <Input
                            type="number"
                            value={formData.basicSalary}
                            onChange={(e) => setFormData({ ...formData, basicSalary: parseFloat(e.target.value) || 0 })}
                            required
                            min="0"
                            step="0.01"
                        />
                    </div>
                </div>
            </div>

            {/* Project Assignments */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-slate-800 border-b border-slate-200 pb-2 flex-1">Project Assignments</h3>
                    <Button type="button" variant="secondary" size="sm" onClick={addProjectAssignment}>
                        Add Project
                    </Button>
                </div>
                {projectAssignments.length > 0 ? (
                    <div className="space-y-3">
                        {projectAssignments.map((assignment, index) => (
                            <div key={index} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">Project</label>
                                        <ComboBox
                                            items={state.projects.map(p => ({ id: p.id, name: p.name }))}
                                            selectedId={assignment.projectId}
                                            onSelect={(item) => updateProjectAssignment(index, 'projectId', item?.id || '')}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">Effective Date</label>
                                        <Input
                                            type="date"
                                            value={assignment.effectiveDate.split('T')[0]}
                                            onChange={(e) => updateProjectAssignment(index, 'effectiveDate', e.target.value)}
                                        />
                                    </div>
                                    <div className="flex items-end gap-2">
                                        <div className="flex-1">
                                            <label className="block text-xs font-medium text-slate-600 mb-1">Percentage</label>
                                            <Input
                                                type="number"
                                                value={assignment.percentage || ''}
                                                onChange={(e) => updateProjectAssignment(index, 'percentage', parseFloat(e.target.value) || 0)}
                                                min="0"
                                                max="100"
                                            />
                                        </div>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => removeProjectAssignment(index)}
                                            className="text-rose-600 hover:text-rose-700"
                                        >
                                            Remove
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-slate-500 text-center py-4">No project assignments. Click "Add Project" to assign.</p>
                )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <Button type="button" variant="secondary" onClick={onClose}>
                    Cancel
                </Button>
                <Button type="submit">
                    {employeeToEdit ? 'Update Employee' : 'Add Employee'}
                </Button>
            </div>
        </form>
    );
};

export default EmployeeForm;

