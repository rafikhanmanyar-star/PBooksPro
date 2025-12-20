
import React from 'react';
import { useAppContext } from '../../context/AppContext';
import { Employee } from '../../types';
import { ICONS, CURRENCY } from '../../constants';
import Button from '../ui/Button';
import Card from '../ui/Card';

interface EmployeeDetailViewProps {
    employeeId: string;
    onClose: () => void;
    onEdit: (employee: Employee) => void;
}

const EmployeeDetailView: React.FC<EmployeeDetailViewProps> = ({ employeeId, onClose, onEdit }) => {
    const { state } = useAppContext();
    const employee = state.employees.find(e => e.id === employeeId);

    if (!employee) {
        return (
            <div className="p-6 text-center">
                <p className="text-slate-600">Employee not found</p>
                <Button onClick={onClose} className="mt-4">Close</Button>
            </div>
        );
    }

    const getStatusBadge = (status: Employee['status']) => {
        const colors: Record<Employee['status'], string> = {
            'Active': 'bg-green-100 text-green-700 border-green-200',
            'Inactive': 'bg-gray-100 text-gray-700 border-gray-200',
            'On Leave': 'bg-blue-100 text-blue-700 border-blue-200',
            'Transferred': 'bg-purple-100 text-purple-700 border-purple-200',
            'Promoted': 'bg-green-100 text-green-700 border-green-200',
            'Resigned': 'bg-amber-100 text-amber-700 border-amber-200',
            'Terminated': 'bg-red-100 text-red-700 border-red-200',
            'Suspended': 'bg-orange-100 text-orange-700 border-orange-200'
        };
        return (
            <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${colors[status] || 'bg-gray-100'}`}>
                {status}
            </span>
        );
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-200">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">
                        {employee.personalDetails.firstName} {employee.personalDetails.lastName}
                    </h2>
                    <p className="text-sm text-slate-500 font-mono mt-1">{employee.employeeId}</p>
                </div>
                <div className="flex items-center gap-3">
                    {getStatusBadge(employee.status)}
                    <Button variant="secondary" onClick={() => onEdit(employee)}>
                        <div className="w-4 h-4 mr-2">{ICONS.edit}</div>
                        Edit
                    </Button>
                </div>
            </div>

            {/* Personal Details */}
            <Card>
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Personal Details</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-xs text-slate-500 mb-1">Email</p>
                        <p className="text-sm font-medium text-slate-800">{employee.personalDetails.email || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 mb-1">Phone</p>
                        <p className="text-sm font-medium text-slate-800">{employee.personalDetails.phone || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 mb-1">Date of Birth</p>
                        <p className="text-sm font-medium text-slate-800">
                            {employee.personalDetails.dateOfBirth 
                                ? new Date(employee.personalDetails.dateOfBirth).toLocaleDateString()
                                : 'N/A'}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 mb-1">Address</p>
                        <p className="text-sm font-medium text-slate-800">{employee.personalDetails.address || 'N/A'}</p>
                    </div>
                </div>
            </Card>

            {/* Employment Details */}
            <Card>
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Employment Details</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-xs text-slate-500 mb-1">Designation</p>
                        <p className="text-sm font-medium text-slate-800">{employee.employmentDetails.designation}</p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 mb-1">Department</p>
                        <p className="text-sm font-medium text-slate-800">{employee.employmentDetails.department || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 mb-1">Grade</p>
                        <p className="text-sm font-medium text-slate-800">{employee.employmentDetails.grade || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 mb-1">Employment Type</p>
                        <p className="text-sm font-medium text-slate-800">{employee.employmentDetails.employmentType}</p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 mb-1">Joining Date</p>
                        <p className="text-sm font-medium text-slate-800">
                            {new Date(employee.employmentDetails.joiningDate).toLocaleDateString()}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 mb-1">Basic Salary</p>
                        <p className="text-sm font-bold text-slate-800">
                            {CURRENCY} {employee.basicSalary.toLocaleString()} /month
                        </p>
                    </div>
                </div>
            </Card>

            {/* Project Assignments */}
            {employee.projectAssignments.length > 0 && (
                <Card>
                    <h3 className="text-lg font-semibold text-slate-800 mb-4">Project Assignments</h3>
                    <div className="space-y-3">
                        {employee.projectAssignments.map((assignment, index) => {
                            const project = state.projects.find(p => p.id === assignment.projectId);
                            return (
                                <div key={index} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-semibold text-slate-800">{project?.name || 'Unknown Project'}</p>
                                            <p className="text-xs text-slate-500 mt-1">
                                                Effective: {new Date(assignment.effectiveDate).toLocaleDateString()}
                                                {assignment.endDate && ` - ${new Date(assignment.endDate).toLocaleDateString()}`}
                                            </p>
                                        </div>
                                        {assignment.percentage && (
                                            <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-semibold">
                                                {assignment.percentage}%
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            )}

            {/* Lifecycle History */}
            {employee.lifecycleHistory.length > 0 && (
                <Card>
                    <h3 className="text-lg font-semibold text-slate-800 mb-4">Lifecycle History</h3>
                    <div className="space-y-2">
                        {employee.lifecycleHistory.slice(0, 10).map((event, index) => (
                            <div key={index} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="font-semibold text-slate-800">{event.type}</p>
                                        <p className="text-sm text-slate-600 mt-1">{event.description}</p>
                                    </div>
                                    <p className="text-xs text-slate-500">
                                        {new Date(event.date).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* Actions */}
            <div className="flex justify-end pt-4 border-t border-slate-200">
                <Button onClick={onClose}>Close</Button>
            </div>
        </div>
    );
};

export default EmployeeDetailView;

