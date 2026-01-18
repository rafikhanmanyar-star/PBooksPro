
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { PayrollAdjustment, Employee } from '../../types';
import { ICONS, CURRENCY } from '../../constants';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import ComboBox from '../ui/ComboBox';
import { useNotification } from '../../context/NotificationContext';
import PayrollAdjustmentFormModal from './PayrollAdjustmentFormModal';

const PayrollAdjustmentManagement: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showToast, showConfirm } = useNotification();
    
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('All');
    const [categoryFilter, setCategoryFilter] = useState<string>('All');
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [adjustmentToEdit, setAdjustmentToEdit] = useState<PayrollAdjustment | null>(null);

    const filteredAdjustments = useMemo(() => {
        let filtered = state.payrollAdjustments || [];

        // Status filter
        if (statusFilter !== 'All') {
            filtered = filtered.filter(a => a.status === statusFilter);
        }

        // Category filter
        if (categoryFilter !== 'All') {
            filtered = filtered.filter(a => a.category === categoryFilter);
        }

        // Search filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(a => {
                const employee = (state.employees || []).find(e => e.id === a.employeeId);
                if (!employee) return false;
                const name = `${employee.personalDetails.firstName} ${employee.personalDetails.lastName}`.toLowerCase();
                const employeeId = employee.employeeId.toLowerCase();
                const desc = a.description.toLowerCase();
                const reason = a.reason.toLowerCase();
                return name.includes(q) || employeeId.includes(q) || desc.includes(q) || reason.includes(q);
            });
        }

        return filtered.sort((a, b) => 
            new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime()
        );
    }, [state.payrollAdjustments, state.employees, statusFilter, categoryFilter, searchQuery]);

    const handleAddAdjustment = () => {
        setAdjustmentToEdit(null);
        setIsFormModalOpen(true);
    };

    const handleEditAdjustment = (adjustment: PayrollAdjustment) => {
        setAdjustmentToEdit(adjustment);
        setIsFormModalOpen(true);
    };

    const handleDeleteAdjustment = async (adjustment: PayrollAdjustment) => {
        const employee = (state.employees || []).find(e => e.id === adjustment.employeeId);
        const employeeName = employee 
            ? `${employee.personalDetails.firstName} ${employee.personalDetails.lastName}`
            : 'Employee';
        
        const confirmed = await showConfirm(
            `Are you sure you want to delete adjustment "${adjustment.description}" for ${employeeName}?`,
            { title: 'Delete Adjustment', confirmLabel: 'Delete', cancelLabel: 'Cancel' }
        );
        if (confirmed) {
            dispatch({ type: 'DELETE_PAYROLL_ADJUSTMENT', payload: adjustment.id });
            showToast('Adjustment deleted successfully');
        }
    };

    const getStatusBadge = (status: PayrollAdjustment['status']) => {
        const colors: Record<PayrollAdjustment['status'], string> = {
            'Active': 'bg-green-100 text-green-700 border-green-200',
            'Inactive': 'bg-gray-100 text-gray-700 border-gray-200',
            'Cancelled': 'bg-red-100 text-red-700 border-red-200'
        };
        return (
            <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${colors[status] || 'bg-gray-100'}`}>
                {status}
            </span>
        );
    };

    const getCategoryBadge = (category: PayrollAdjustment['category']) => {
        const isDeduction = category === 'Deduction';
        return (
            <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${
                isDeduction 
                    ? 'bg-rose-100 text-rose-700 border-rose-200' 
                    : 'bg-emerald-100 text-emerald-700 border-emerald-200'
            }`}>
                {category}
            </span>
        );
    };

    const uniqueCategories = useMemo(() => {
        const cats = new Set<string>();
        (state.payrollAdjustments || []).forEach(a => cats.add(a.category));
        return Array.from(cats).sort();
    }, [state.payrollAdjustments]);

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
                <div className="px-6 py-4">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-xl font-bold text-slate-900">Payroll Adjustments</h2>
                            <p className="text-sm text-slate-500 mt-1">Manage deductions, allowances, and other payroll adjustments</p>
                        </div>
                        <Button onClick={handleAddAdjustment} className="shadow-md hover:shadow-lg">
                            <div className="w-4 h-4 mr-2">{ICONS.plus}</div>
                            Add Adjustment
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
                                    placeholder="Search adjustments..."
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
                                    { id: 'Cancelled', name: 'Cancelled' }
                                ]}
                                selectedId={statusFilter}
                                onSelect={(item) => setStatusFilter(item?.id || 'All')}
                                placeholder="Filter by Status"
                            />
                        </div>
                        <div className="w-48">
                            <ComboBox
                                items={[
                                    { id: 'All', name: 'All Categories' },
                                    ...uniqueCategories.map(cat => ({ id: cat, name: cat }))
                                ]}
                                selectedId={categoryFilter}
                                onSelect={(item) => setCategoryFilter(item?.id || 'All')}
                                placeholder="Filter by Category"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Adjustments List */}
            <div className="flex-1 overflow-y-auto p-6">
                {filteredAdjustments.length > 0 ? (
                    <div className="space-y-3">
                        {filteredAdjustments.map(adjustment => {
                            const employee = (state.employees || []).find(e => e.id === adjustment.employeeId);
                            if (!employee) return null;

                            const employeeName = `${employee.personalDetails.firstName} ${employee.personalDetails.lastName}`;
                            const isDeduction = adjustment.category === 'Deduction';

                            return (
                                <Card key={adjustment.id} className="hover:shadow-md transition-shadow">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-2">
                                                <h3 className="font-bold text-slate-900">
                                                    {employeeName}
                                                </h3>
                                                {getStatusBadge(adjustment.status)}
                                                {getCategoryBadge(adjustment.category)}
                                                {adjustment.isRecurring && (
                                                    <span className="px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded-full border border-indigo-200">
                                                        Recurring
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-slate-700 mb-2">{adjustment.description}</p>
                                            <div className="flex items-center gap-4 text-sm text-slate-600 mb-2">
                                                <span className={`font-bold ${isDeduction ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                    {isDeduction ? '-' : '+'}{CURRENCY} {adjustment.amount.toLocaleString()}
                                                </span>
                                                <span>Effective: {adjustment.effectiveDate}</span>
                                                {adjustment.payrollMonth && (
                                                    <span>Payroll: {adjustment.payrollMonth}</span>
                                                )}
                                            </div>
                                            <div className="text-xs text-slate-500">
                                                <div>Type: {adjustment.type}</div>
                                                <div>Reason: {adjustment.reason}</div>
                                                {adjustment.performedBy && (
                                                    <div>Performed by: {adjustment.performedBy} on {new Date(adjustment.performedAt).toLocaleDateString()}</div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                onClick={() => handleEditAdjustment(adjustment)}
                                            >
                                                <div className="w-3 h-3 mr-1">{ICONS.edit}</div>
                                                Edit
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                onClick={() => handleDeleteAdjustment(adjustment)}
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
                            <div className="w-10 h-10 text-slate-400">{ICONS.settings}</div>
                        </div>
                        <h3 className="text-lg font-semibold text-slate-800 mb-2">No adjustments found</h3>
                        <p className="text-sm text-slate-500 mb-4">
                            {searchQuery || statusFilter !== 'All' || categoryFilter !== 'All'
                                ? 'Try adjusting your filters'
                                : 'Add payroll adjustments for employees to get started'}
                        </p>
                        {!searchQuery && statusFilter === 'All' && categoryFilter === 'All' && (
                            <Button onClick={handleAddAdjustment}>
                                <div className="w-4 h-4 mr-2">{ICONS.plus}</div>
                                Add Adjustment
                            </Button>
                        )}
                    </div>
                )}
            </div>

            {/* Adjustment Form Modal */}
            <PayrollAdjustmentFormModal
                isOpen={isFormModalOpen}
                onClose={() => {
                    setIsFormModalOpen(false);
                    setAdjustmentToEdit(null);
                }}
                adjustmentToEdit={adjustmentToEdit}
                onSuccess={() => {
                    setIsFormModalOpen(false);
                    setAdjustmentToEdit(null);
                }}
            />
        </div>
    );
};

export default PayrollAdjustmentManagement;
