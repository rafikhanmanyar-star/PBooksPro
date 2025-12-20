
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { PayrollCycle, PayrollFrequency, Payslip } from '../../types';
import { ICONS, CURRENCY } from '../../constants';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import ComboBox from '../ui/ComboBox';
import { useNotification } from '../../context/NotificationContext';
import { payrollEngine } from '../../services/payrollEngine';

const PayrollProcessing: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showToast, showConfirm } = useNotification();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Form state for new cycle
    const [cycleName, setCycleName] = useState('');
    const [cycleMonth, setCycleMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [frequency, setFrequency] = useState<PayrollFrequency>('Monthly');
    const [payDate, setPayDate] = useState(() => {
        const now = new Date();
        return now.toISOString().split('T')[0];
    });

    const cycles = useMemo(() => 
        (state.payrollCycles || []).sort((a, b) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
        [state.payrollCycles]
    );

    const selectedCycle = useMemo(() => 
        selectedCycleId ? cycles.find(c => c.id === selectedCycleId) : null,
        [selectedCycleId, cycles]
    );

    const handleCreateCycle = () => {
        setCycleName(`Payroll ${cycleMonth}`);
        setIsCreateModalOpen(true);
    };

    const handleSubmitCycle = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!cycleName.trim()) {
            showToast('Cycle name is required', 'error');
            return;
        }

        // Calculate pay period dates
        const [year, month] = cycleMonth.split('-').map(Number);
        const startDate = new Date(year, month - 1, 1);
        let endDate: Date;
        
        switch (frequency) {
            case 'Monthly':
                endDate = new Date(year, month, 0);
                break;
            case 'Semi-Monthly':
                endDate = new Date(year, month - 1, 15);
                break;
            case 'Weekly':
                endDate = new Date(startDate);
                endDate.setDate(startDate.getDate() + 6);
                break;
            case 'Bi-Weekly':
                endDate = new Date(startDate);
                endDate.setDate(startDate.getDate() + 13);
                break;
            default:
                endDate = new Date(year, month, 0);
        }

        const cycle: PayrollCycle = {
            id: `cycle-${Date.now()}`,
            name: cycleName.trim(),
            month: cycleMonth,
            frequency,
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
            payDate,
            issueDate: new Date().toISOString().split('T')[0],
            status: 'Draft',
            payslipIds: [],
            totalEmployees: 0,
            totalGrossSalary: 0,
            totalDeductions: 0,
            totalNetSalary: 0,
            projectCosts: {},
            createdAt: new Date().toISOString()
        };

        dispatch({ type: 'CREATE_PAYROLL_CYCLE', payload: cycle });
        showToast('Payroll cycle created successfully');
        setIsCreateModalOpen(false);
        setSelectedCycleId(cycle.id);
    };

    const handleProcessPayroll = async () => {
        if (!selectedCycle) {
            showToast('Please select a payroll cycle first', 'error');
            return;
        }

        const confirmed = await showConfirm(
            `Process payroll for "${selectedCycle.name}"? This will generate payslips for all active employees.`,
            { title: 'Process Payroll', confirmLabel: 'Process', cancelLabel: 'Cancel' }
        );

        if (!confirmed) return;

        setIsProcessing(true);
        try {
            const activeEmployees = (state.employees || []).filter(e => e.status === 'Active');
            const bonuses = (state.bonusRecords || []).filter(b => 
                b.status === 'Approved' && (!b.payrollMonth || b.payrollMonth === selectedCycle.month)
            );
            const adjustments = (state.payrollAdjustments || []).filter(a => 
                a.status === 'Active' && (!a.payrollMonth || a.payrollMonth === selectedCycle.month)
            );
            const attendance = (state.attendanceRecords || []).filter(a => {
                const recordDate = new Date(a.date);
                const cycleStart = new Date(selectedCycle.startDate);
                const cycleEnd = new Date(selectedCycle.endDate);
                return recordDate >= cycleStart && recordDate <= cycleEnd;
            });

            const taxConfig = (state.taxConfigurations || [])[0];
            const statutoryConfigs = state.statutoryConfigurations || [];

            const { payslips, errors, warnings } = payrollEngine.processPayrollCycle(
                selectedCycle,
                activeEmployees,
                bonuses,
                adjustments,
                attendance,
                taxConfig,
                statutoryConfigs
            );

            // Add all payslips
            payslips.forEach(payslip => {
                dispatch({ type: 'ADD_PAYSLIP', payload: payslip });
            });

            // Update cycle
            const updatedCycle: PayrollCycle = {
                ...selectedCycle,
                payslipIds: payslips.map(p => p.id),
                totalEmployees: payslips.length,
                totalGrossSalary: payslips.reduce((sum, p) => sum + p.grossSalary, 0),
                totalDeductions: payslips.reduce((sum, p) => sum + p.totalDeductions + p.totalTax + p.totalStatutory, 0),
                totalNetSalary: payslips.reduce((sum, p) => sum + p.netSalary, 0),
                projectCosts: payslips.reduce((acc, p) => {
                    p.costAllocations.forEach(allocation => {
                        acc[allocation.projectId] = (acc[allocation.projectId] || 0) + allocation.netAmount;
                    });
                    return acc;
                }, {} as Record<string, number>),
                status: 'Review'
            };

            dispatch({ type: 'UPDATE_PAYROLL_CYCLE', payload: updatedCycle });

            if (errors.length > 0) {
                showToast(`Payroll processed with ${errors.length} errors. Check console for details.`, 'error');
                console.error('Payroll errors:', errors);
            } else if (warnings.length > 0) {
                showToast(`Payroll processed with ${warnings.length} warnings.`, 'info');
                console.warn('Payroll warnings:', warnings);
            } else {
                showToast(`Payroll processed successfully. ${payslips.length} payslips generated.`);
            }
        } catch (error) {
            console.error('Payroll processing error:', error);
            showToast('Error processing payroll. Please check console for details.', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleApproveCycle = async () => {
        if (!selectedCycle) return;

        const confirmed = await showConfirm(
            `Approve "${selectedCycle.name}"? This will mark all payslips as approved.`,
            { title: 'Approve Payroll Cycle', confirmLabel: 'Approve', cancelLabel: 'Cancel' }
        );

        if (confirmed) {
            dispatch({ 
                type: 'APPROVE_PAYROLL_CYCLE', 
                payload: { cycleId: selectedCycle.id, approvedBy: state.currentUser?.id || 'system' } 
            });
            showToast('Payroll cycle approved successfully');
        }
    };

    const handleLockCycle = async () => {
        if (!selectedCycle) return;

        const confirmed = await showConfirm(
            `Lock "${selectedCycle.name}"? This will prevent any further changes.`,
            { title: 'Lock Payroll Cycle', confirmLabel: 'Lock', cancelLabel: 'Cancel' }
        );

        if (confirmed) {
            dispatch({ 
                type: 'LOCK_PAYROLL_CYCLE', 
                payload: { cycleId: selectedCycle.id, lockedBy: state.currentUser?.id || 'system' } 
            });
            showToast('Payroll cycle locked successfully');
        }
    };

    const getStatusBadge = (status: PayrollCycle['status']) => {
        const colors: Record<PayrollCycle['status'], string> = {
            'Draft': 'bg-gray-100 text-gray-700 border-gray-200',
            'Processing': 'bg-blue-100 text-blue-700 border-blue-200',
            'Review': 'bg-amber-100 text-amber-700 border-amber-200',
            'Approved': 'bg-green-100 text-green-700 border-green-200',
            'Paid': 'bg-green-100 text-green-700 border-green-200',
            'Locked': 'bg-gray-100 text-gray-700 border-gray-200'
        };
        return (
            <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${colors[status] || 'bg-gray-100'}`}>
                {status}
            </span>
        );
    };

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 shadow-sm flex-shrink-0 mb-6">
                <div className="px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-slate-900">Payroll Processing</h2>
                            <p className="text-sm text-slate-500 mt-1">Create and process payroll cycles</p>
                        </div>
                        <Button onClick={handleCreateCycle} className="shadow-md hover:shadow-lg">
                            <div className="w-4 h-4 mr-2">{ICONS.plus}</div>
                            Create New Cycle
                        </Button>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Cycles List */}
                    <div className="lg:col-span-1">
                        <Card>
                            <h3 className="text-lg font-semibold text-slate-800 mb-4">Payroll Cycles</h3>
                            <div className="space-y-2 max-h-[600px] overflow-y-auto">
                                {cycles.length > 0 ? (
                                    cycles.map(cycle => (
                                        <div
                                            key={cycle.id}
                                            onClick={() => setSelectedCycleId(cycle.id)}
                                            className={`p-4 rounded-lg border cursor-pointer transition-all ${
                                                selectedCycleId === cycle.id
                                                    ? 'bg-indigo-50 border-indigo-300 shadow-md'
                                                    : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="flex-1">
                                                    <h4 className="font-semibold text-slate-900">{cycle.name}</h4>
                                                    <p className="text-xs text-slate-500 mt-1">{cycle.month}</p>
                                                </div>
                                                {getStatusBadge(cycle.status)}
                                            </div>
                                            <div className="flex items-center justify-between text-sm mt-2">
                                                <span className="text-slate-600">{cycle.totalEmployees} employees</span>
                                                <span className="font-bold text-slate-800">
                                                    {CURRENCY} {cycle.totalNetSalary.toLocaleString()}
                                                </span>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-8 text-slate-400">
                                        <p className="text-sm">No payroll cycles yet</p>
                                        <p className="text-xs mt-1">Create your first cycle to get started</p>
                                    </div>
                                )}
                            </div>
                        </Card>
                    </div>

                    {/* Cycle Details */}
                    <div className="lg:col-span-2">
                        {selectedCycle ? (
                            <div className="space-y-6">
                                <Card>
                                    <div className="flex items-start justify-between mb-4">
                                        <div>
                                            <h3 className="text-xl font-bold text-slate-900">{selectedCycle.name}</h3>
                                            <p className="text-sm text-slate-500 mt-1">
                                                {selectedCycle.month} • {selectedCycle.frequency}
                                            </p>
                                        </div>
                                        {getStatusBadge(selectedCycle.status)}
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                                            <p className="text-xs text-slate-500 font-medium mb-1">Employees</p>
                                            <p className="text-2xl font-bold text-slate-800">{selectedCycle.totalEmployees}</p>
                                        </div>
                                        <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                                            <p className="text-xs text-emerald-600 font-medium mb-1">Gross Salary</p>
                                            <p className="text-2xl font-bold text-emerald-700">
                                                {CURRENCY} {selectedCycle.totalGrossSalary.toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="p-4 bg-rose-50 rounded-lg border border-rose-200">
                                            <p className="text-xs text-rose-600 font-medium mb-1">Deductions</p>
                                            <p className="text-2xl font-bold text-rose-700">
                                                {CURRENCY} {selectedCycle.totalDeductions.toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                                            <p className="text-xs text-indigo-600 font-medium mb-1">Net Salary</p>
                                            <p className="text-2xl font-bold text-indigo-700">
                                                {CURRENCY} {selectedCycle.totalNetSalary.toLocaleString()}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex gap-3">
                                        {selectedCycle.status === 'Draft' && (
                                            <Button 
                                                onClick={handleProcessPayroll} 
                                                disabled={isProcessing}
                                                className="bg-indigo-600 hover:bg-indigo-700"
                                            >
                                                {isProcessing ? 'Processing...' : 'Process Payroll'}
                                            </Button>
                                        )}
                                        {selectedCycle.status === 'Review' && (
                                            <Button 
                                                onClick={handleApproveCycle}
                                                className="bg-emerald-600 hover:bg-emerald-700"
                                            >
                                                Approve Cycle
                                            </Button>
                                        )}
                                        {selectedCycle.status === 'Approved' && (
                                            <Button 
                                                onClick={handleLockCycle}
                                                variant="secondary"
                                            >
                                                Lock Cycle
                                            </Button>
                                        )}
                                    </div>
                                </Card>

                                {/* Project Costs */}
                                {Object.keys(selectedCycle.projectCosts).length > 0 && (
                                    <Card>
                                        <h3 className="text-lg font-semibold text-slate-800 mb-4">Project-wise Costs</h3>
                                        <div className="space-y-2">
                                            {Object.entries(selectedCycle.projectCosts).map(([projectId, amount]) => {
                                                const project = state.projects.find(p => p.id === projectId);
                                                return (
                                                    <div key={projectId} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                                                        <span className="font-medium text-slate-800">{project?.name || 'Unknown Project'}</span>
                                                        <span className="font-bold text-slate-900">
                                                            {CURRENCY} {amount.toLocaleString()}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </Card>
                                )}
                            </div>
                        ) : (
                            <Card>
                                <div className="text-center py-12">
                                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <div className="w-10 h-10 text-slate-400">{ICONS.briefcase}</div>
                                    </div>
                                    <h3 className="text-lg font-semibold text-slate-800 mb-2">Select a Payroll Cycle</h3>
                                    <p className="text-sm text-slate-500">
                                        Choose a cycle from the list to view details and process payroll
                                    </p>
                                </div>
                            </Card>
                        )}
                    </div>
                </div>
            </div>

            {/* Create Cycle Modal */}
            <Modal 
                isOpen={isCreateModalOpen} 
                onClose={() => setIsCreateModalOpen(false)} 
                title="Create Payroll Cycle"
            >
                <form onSubmit={handleSubmitCycle} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Cycle Name *</label>
                        <Input
                            value={cycleName}
                            onChange={(e) => setCycleName(e.target.value)}
                            placeholder="e.g., January 2024 Payroll"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Month *</label>
                        <Input
                            type="month"
                            value={cycleMonth}
                            onChange={(e) => setCycleMonth(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Frequency *</label>
                        <ComboBox
                            items={[
                                { id: 'Monthly', name: 'Monthly' },
                                { id: 'Semi-Monthly', name: 'Semi-Monthly' },
                                { id: 'Weekly', name: 'Weekly' },
                                { id: 'Bi-Weekly', name: 'Bi-Weekly' }
                            ]}
                            selectedId={frequency}
                            onSelect={(item) => setFrequency((item?.id as PayrollFrequency) || 'Monthly')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Pay Date *</label>
                        <Input
                            type="date"
                            value={payDate}
                            onChange={(e) => setPayDate(e.target.value)}
                            required
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                        <Button type="button" variant="secondary" onClick={() => setIsCreateModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit">Create Cycle</Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default PayrollProcessing;
