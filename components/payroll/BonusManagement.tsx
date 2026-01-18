
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { BonusRecord, Employee } from '../../types';
import { ICONS, CURRENCY } from '../../constants';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import ComboBox from '../ui/ComboBox';
import { useNotification } from '../../context/NotificationContext';
import BonusFormModal from './BonusFormModal';

const BonusManagement: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showToast, showConfirm } = useNotification();
    
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('All');
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [bonusToEdit, setBonusToEdit] = useState<BonusRecord | null>(null);

    const filteredBonuses = useMemo(() => {
        let filtered = state.bonusRecords || [];

        // Status filter
        if (statusFilter !== 'All') {
            filtered = filtered.filter(b => b.status === statusFilter);
        }

        // Search filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(b => {
                const employee = (state.employees || []).find(e => e.id === b.employeeId);
                if (!employee) return false;
                const name = `${employee.personalDetails.firstName} ${employee.personalDetails.lastName}`.toLowerCase();
                const employeeId = employee.employeeId.toLowerCase();
                const desc = b.description.toLowerCase();
                return name.includes(q) || employeeId.includes(q) || desc.includes(q);
            });
        }

        return filtered.sort((a, b) => 
            new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime()
        );
    }, [state.bonusRecords, state.employees, statusFilter, searchQuery]);

    const handleAddBonus = () => {
        setBonusToEdit(null);
        setIsFormModalOpen(true);
    };

    const handleEditBonus = (bonus: BonusRecord) => {
        setBonusToEdit(bonus);
        setIsFormModalOpen(true);
    };

    const handleDeleteBonus = async (bonus: BonusRecord) => {
        const employee = (state.employees || []).find(e => e.id === bonus.employeeId);
        const employeeName = employee 
            ? `${employee.personalDetails.firstName} ${employee.personalDetails.lastName}`
            : 'Employee';
        
        const confirmed = await showConfirm(
            `Are you sure you want to delete bonus "${bonus.description}" for ${employeeName}?`,
            { title: 'Delete Bonus', confirmLabel: 'Delete', cancelLabel: 'Cancel' }
        );
        if (confirmed) {
            dispatch({ type: 'DELETE_BONUS', payload: bonus.id });
            showToast('Bonus deleted successfully');
        }
    };

    const getStatusBadge = (status: BonusRecord['status']) => {
        const colors: Record<BonusRecord['status'], string> = {
            'Pending': 'bg-amber-100 text-amber-700 border-amber-200',
            'Approved': 'bg-green-100 text-green-700 border-green-200',
            'Rejected': 'bg-red-100 text-red-700 border-red-200',
            'Paid': 'bg-blue-100 text-blue-700 border-blue-200'
        };
        return (
            <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${colors[status] || 'bg-gray-100'}`}>
                {status}
            </span>
        );
    };

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
                <div className="px-6 py-4">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-xl font-bold text-slate-900">Bonus Management</h2>
                            <p className="text-sm text-slate-500 mt-1">Manage employee bonuses and incentives</p>
                        </div>
                        <Button onClick={handleAddBonus} className="shadow-md hover:shadow-lg">
                            <div className="w-4 h-4 mr-2">{ICONS.plus}</div>
                            Add Bonus
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
                                    placeholder="Search bonuses..."
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
                                    { id: 'Pending', name: 'Pending' },
                                    { id: 'Approved', name: 'Approved' },
                                    { id: 'Rejected', name: 'Rejected' },
                                    { id: 'Paid', name: 'Paid' }
                                ]}
                                selectedId={statusFilter}
                                onSelect={(item) => setStatusFilter(item?.id || 'All')}
                                placeholder="Filter by Status"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Bonus List */}
            <div className="flex-1 overflow-y-auto p-6">
                {filteredBonuses.length > 0 ? (
                    <div className="space-y-3">
                        {filteredBonuses.map(bonus => {
                            const employee = (state.employees || []).find(e => e.id === bonus.employeeId);
                            if (!employee) return null;

                            const employeeName = `${employee.personalDetails.firstName} ${employee.personalDetails.lastName}`;
                            const project = bonus.projectId 
                                ? state.projects.find(p => p.id === bonus.projectId)
                                : null;

                            return (
                                <Card key={bonus.id} className="hover:shadow-md transition-shadow">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h3 className="font-bold text-slate-900">
                                                    {employeeName}
                                                </h3>
                                                {getStatusBadge(bonus.status)}
                                                {bonus.isRecurring && (
                                                    <span className="px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded-full border border-indigo-200">
                                                        Recurring
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-slate-700 mb-2">{bonus.description}</p>
                                            <div className="flex items-center gap-4 text-sm text-slate-600">
                                                <span className="font-bold text-emerald-600">
                                                    {CURRENCY} {bonus.amount.toLocaleString()}
                                                </span>
                                                <span>Effective: {bonus.effectiveDate}</span>
                                                {bonus.payrollMonth && (
                                                    <span>Payroll: {bonus.payrollMonth}</span>
                                                )}
                                                {project && (
                                                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded border border-indigo-200">
                                                        {project.name}
                                                    </span>
                                                )}
                                            </div>
                                            {bonus.type && (
                                                <div className="mt-2 text-xs text-slate-500">
                                                    Type: {bonus.type}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                onClick={() => handleEditBonus(bonus)}
                                            >
                                                <div className="w-3 h-3 mr-1">{ICONS.edit}</div>
                                                Edit
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                onClick={() => handleDeleteBonus(bonus)}
                                                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                            >
                                                <div className="w-3 h-3">{ICONS.trash}</div>
                                            </Button>
                                        </div>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full py-12">
                        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                            <div className="w-10 h-10 text-slate-400">{ICONS.dollarSign}</div>
                        </div>
                        <h3 className="text-lg font-semibold text-slate-800 mb-2">No bonuses found</h3>
                        <p className="text-sm text-slate-500 mb-4">
                            {searchQuery || statusFilter !== 'All'
                                ? 'Try adjusting your filters'
                                : 'Add bonuses for employees to get started'}
                        </p>
                        {!searchQuery && statusFilter === 'All' && (
                            <Button onClick={handleAddBonus}>
                                <div className="w-4 h-4 mr-2">{ICONS.plus}</div>
                                Add Bonus
                            </Button>
                        )}
                    </div>
                )}
            </div>

            {/* Bonus Form Modal */}
            <BonusFormModal
                isOpen={isFormModalOpen}
                onClose={() => {
                    setIsFormModalOpen(false);
                    setBonusToEdit(null);
                }}
                bonusToEdit={bonusToEdit}
                onSuccess={() => {
                    setIsFormModalOpen(false);
                    setBonusToEdit(null);
                }}
            />
        </div>
    );
};

export default BonusManagement;
