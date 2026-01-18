
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Employee, EmployeeStatus, ProjectAssignment, LifeCycleEvent } from '../../types';
import { ICONS, CURRENCY } from '../../constants';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import ComboBox from '../ui/ComboBox';
import { useNotification } from '../../context/NotificationContext';
import EmployeeForm from './EmployeeForm';
import EmployeeDetailView from './EmployeeDetailView';
import EmployeeTerminationModal from './EmployeeTerminationModal';
import EmployeePromotionModal from './EmployeePromotionModal';
import EmployeeTransferModal from './EmployeeTransferModal';

const EmployeeManagement: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showToast, showConfirm } = useNotification();
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<EmployeeStatus | 'All'>('All');
    const [projectFilter, setProjectFilter] = useState<string>(state.defaultProjectId || 'all');
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [employeeToEdit, setEmployeeToEdit] = useState<Employee | null>(null);
    const [isTerminationModalOpen, setIsTerminationModalOpen] = useState(false);
    const [isPromotionModalOpen, setIsPromotionModalOpen] = useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [actionEmployee, setActionEmployee] = useState<Employee | null>(null);

    const filteredEmployees = useMemo(() => {
        let filtered = state.employees || [];

        // Status filter
        if (statusFilter !== 'All') {
            filtered = filtered.filter(e => e.status === statusFilter);
        }

        // Project filter
        if (projectFilter !== 'all') {
            filtered = filtered.filter(e => 
                (e.projectAssignments || []).some(a => a.projectId === projectFilter)
            );
        }

        // Search filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(e => 
                e.employeeId.toLowerCase().includes(q) ||
                e.personalDetails.firstName.toLowerCase().includes(q) ||
                e.personalDetails.lastName.toLowerCase().includes(q) ||
                e.employmentDetails.designation.toLowerCase().includes(q) ||
                e.personalDetails.email?.toLowerCase().includes(q)
            );
        }

        return filtered.sort((a, b) => 
            a.personalDetails.lastName.localeCompare(b.personalDetails.lastName)
        );
    }, [state.employees, statusFilter, projectFilter, searchQuery]);

    const handleAddEmployee = () => {
        setEmployeeToEdit(null);
        setIsFormModalOpen(true);
    };

    const handleEditEmployee = (employee: Employee) => {
        setEmployeeToEdit(employee);
        setIsFormModalOpen(true);
    };

    const handleViewEmployee = (employee: Employee) => {
        setSelectedEmployeeId(employee.id);
        setIsDetailModalOpen(true);
    };

    const handleDeleteEmployee = async (employee: Employee) => {
        const confirmed = await showConfirm(
            `Are you sure you want to delete employee "${employee.personalDetails.firstName} ${employee.personalDetails.lastName}" (${employee.employeeId})? This action cannot be undone.`,
            { title: 'Delete Employee', confirmLabel: 'Delete', cancelLabel: 'Cancel' }
        );
        if (confirmed) {
            dispatch({ type: 'DELETE_EMPLOYEE', payload: employee.id });
            showToast('Employee deleted successfully');
        }
    };

    const handleTerminateEmployee = (employee: Employee) => {
        setActionEmployee(employee);
        setIsTerminationModalOpen(true);
    };

    const handlePromoteEmployee = (employee: Employee) => {
        setActionEmployee(employee);
        setIsPromotionModalOpen(true);
    };

    const handleTransferEmployee = (employee: Employee) => {
        setActionEmployee(employee);
        setIsTransferModalOpen(true);
    };

    const getStatusBadge = (status: EmployeeStatus) => {
        const colors: Record<EmployeeStatus, string> = {
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
            <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${colors[status] || 'bg-gray-100'}`}>
                {status}
            </span>
        );
    };

    const getInitials = (firstName: string, lastName: string) => {
        return `${firstName[0]}${lastName[0]}`.toUpperCase();
    };

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
                <div className="px-6 py-4">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-xl font-bold text-slate-900">Employee Management</h2>
                            <p className="text-sm text-slate-500 mt-1">Manage employee lifecycle, assignments, and records</p>
                        </div>
                        <Button onClick={handleAddEmployee} className="shadow-md hover:shadow-lg">
                            <div className="w-4 h-4 mr-2">{ICONS.plus}</div>
                            Add Employee
                        </Button>
                    </div>

                    {/* Filters */}
                    <div className="flex flex-wrap gap-3">
                        <div className="flex-1 min-w-[200px]">
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                    <div className="w-4 h-4">{ICONS.search}</div>
                                </div>
                                <Input
                                    placeholder="Search employees..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                        </div>
                        <div className="w-48">
                            <ComboBox
                                items={[
                                    { id: 'All', name: 'All Status' },
                                    { id: 'Active', name: 'Active' },
                                    { id: 'Inactive', name: 'Inactive' },
                                    { id: 'On Leave', name: 'On Leave' },
                                    { id: 'Resigned', name: 'Resigned' },
                                    { id: 'Terminated', name: 'Terminated' }
                                ]}
                                selectedId={statusFilter}
                                onSelect={(item) => setStatusFilter((item?.id as EmployeeStatus | 'All') || 'All')}
                                placeholder="Filter by Status"
                            />
                        </div>
                        <div className="w-48">
                            <ComboBox
                                items={[
                                    { id: 'all', name: 'All Projects' },
                                    ...state.projects.map(p => ({ id: p.id, name: p.name }))
                                ]}
                                selectedId={projectFilter}
                                onSelect={(item) => setProjectFilter(item?.id || 'all')}
                                placeholder="Filter by Project"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Employee Grid */}
            <div className="flex-1 overflow-y-auto p-6">
                {filteredEmployees.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredEmployees.map(employee => (
                            <Card key={employee.id} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => handleViewEmployee(employee)}>
                                <div className="flex items-start gap-4">
                                    <div className="flex-shrink-0 w-14 h-14 rounded-full bg-gradient-to-br from-indigo-600 to-blue-600 flex items-center justify-center text-white text-lg font-bold shadow-md">
                                        {getInitials(employee.personalDetails.firstName, employee.personalDetails.lastName)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-bold text-slate-900 truncate">
                                                    {employee.personalDetails.firstName} {employee.personalDetails.lastName}
                                                </h3>
                                                <p className="text-xs text-slate-500 font-mono">{employee.employeeId}</p>
                                            </div>
                                            {getStatusBadge(employee.status)}
                                        </div>
                                        <div className="space-y-1 text-sm">
                                            <p className="text-slate-700">
                                                <span className="font-semibold">{employee.employmentDetails.designation}</span>
                                                {employee.employmentDetails.department && (
                                                    <span className="text-slate-500"> • {employee.employmentDetails.department}</span>
                                                )}
                                            </p>
                                            <p className="text-slate-600">
                                                <span className="font-semibold">{CURRENCY} {employee.basicSalary.toLocaleString()}</span>
                                                <span className="text-xs text-slate-500"> /month</span>
                                            </p>
                                            {employee.projectAssignments.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-2">
                                                    {employee.projectAssignments.slice(0, 2).map((assignment, idx) => {
                                                        const project = state.projects.find(p => p.id === assignment.projectId);
                                                        return project ? (
                                                            <span key={idx} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded border border-indigo-200">
                                                                {project.name}
                                                            </span>
                                                        ) : null;
                                                    })}
                                                    {employee.projectAssignments.length > 2 && (
                                                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded">
                                                            +{employee.projectAssignments.length - 2} more
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-slate-200" onClick={(e) => e.stopPropagation()}>
                                            {employee.status === 'Active' && (
                                                <>
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        onClick={() => handlePromoteEmployee(employee)}
                                                        className="text-xs"
                                                        title="Promote"
                                                    >
                                                        ↑ Promote
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        onClick={() => handleTransferEmployee(employee)}
                                                        className="text-xs"
                                                        title="Transfer"
                                                    >
                                                        ↔ Transfer
                                                    </Button>
                                                </>
                                            )}
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                onClick={() => handleEditEmployee(employee)}
                                                className="flex-1 text-xs"
                                            >
                                                <div className="w-3 h-3 mr-1">{ICONS.edit}</div>
                                                Edit
                                            </Button>
                                            {employee.status === 'Active' && (
                                                <Button
                                                    size="sm"
                                                    variant="danger"
                                                    onClick={() => handleTerminateEmployee(employee)}
                                                    className="text-xs"
                                                    title="Terminate"
                                                >
                                                    × Terminate
                                                </Button>
                                            )}
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                onClick={() => handleDeleteEmployee(employee)}
                                                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                                title="Delete"
                                            >
                                                <div className="w-3 h-3">{ICONS.trash}</div>
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full py-12">
                        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                            <div className="w-10 h-10 text-slate-400">{ICONS.users}</div>
                        </div>
                        <h3 className="text-lg font-semibold text-slate-800 mb-2">No employees found</h3>
                        <p className="text-sm text-slate-500 mb-4">
                            {searchQuery || statusFilter !== 'All' || projectFilter !== 'all'
                                ? 'Try adjusting your filters'
                                : 'Add your first employee to get started'}
                        </p>
                        {!searchQuery && statusFilter === 'All' && projectFilter === 'all' && (
                            <Button onClick={handleAddEmployee}>
                                <div className="w-4 h-4 mr-2">{ICONS.plus}</div>
                                Add Employee
                            </Button>
                        )}
                    </div>
                )}
            </div>

            {/* Modals */}
            <Modal 
                isOpen={isFormModalOpen} 
                onClose={() => { setIsFormModalOpen(false); setEmployeeToEdit(null); }} 
                title={employeeToEdit ? 'Edit Employee' : 'Add New Employee'}
                size="xl"
            >
                <EmployeeForm
                    employeeToEdit={employeeToEdit}
                    onClose={() => { setIsFormModalOpen(false); setEmployeeToEdit(null); }}
                />
            </Modal>

            {selectedEmployeeId && (
                <Modal
                    isOpen={isDetailModalOpen}
                    onClose={() => { setIsDetailModalOpen(false); setSelectedEmployeeId(null); }}
                    title="Employee Details"
                    size="xl"
                >
                    <EmployeeDetailView
                        employeeId={selectedEmployeeId}
                        onClose={() => { setIsDetailModalOpen(false); setSelectedEmployeeId(null); }}
                        onEdit={(employee) => {
                            setIsDetailModalOpen(false);
                            setSelectedEmployeeId(null);
                            handleEditEmployee(employee);
                        }}
                    />
                </Modal>
            )}

            {/* Employee Lifecycle Modals */}
            <EmployeeTerminationModal
                isOpen={isTerminationModalOpen}
                onClose={() => {
                    setIsTerminationModalOpen(false);
                    setActionEmployee(null);
                }}
                employee={actionEmployee}
                onSuccess={() => {
                    setIsTerminationModalOpen(false);
                    setActionEmployee(null);
                }}
            />

            <EmployeePromotionModal
                isOpen={isPromotionModalOpen}
                onClose={() => {
                    setIsPromotionModalOpen(false);
                    setActionEmployee(null);
                }}
                employee={actionEmployee}
                onSuccess={() => {
                    setIsPromotionModalOpen(false);
                    setActionEmployee(null);
                }}
            />

            <EmployeeTransferModal
                isOpen={isTransferModalOpen}
                onClose={() => {
                    setIsTransferModalOpen(false);
                    setActionEmployee(null);
                }}
                employee={actionEmployee}
                onSuccess={() => {
                    setIsTransferModalOpen(false);
                    setActionEmployee(null);
                }}
            />
        </div>
    );
};

export default EmployeeManagement;

