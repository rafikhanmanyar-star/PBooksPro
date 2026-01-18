
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { ICONS, CURRENCY } from '../../constants';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Tabs from '../ui/Tabs';
import { Employee, PayrollCycle, Payslip } from '../../types';

import EmployeeManagement from './EmployeeManagement';
import PayrollProcessing from './PayrollProcessing';
import PayrollReports from './PayrollReports';
import AttendanceManagement from './AttendanceManagement';
import BonusManagement from './BonusManagement';
import PayrollAdjustmentManagement from './PayrollAdjustmentManagement';

const GlobalPayrollPage: React.FC = () => {
    const { state } = useAppContext();
    const [activeTab, setActiveTab] = useState('Overview');

    const tabs = ['Overview', 'Employees', 'Payroll Processing', 'Attendance', 'Bonuses', 'Adjustments', 'Reports'];

    // Calculate KPIs
    const activeEmployees = useMemo(() => 
        (state.employees || []).filter(e => e.status === 'Active'), 
        [state.employees]
    );

    const totalHeadcount = activeEmployees.length;
    
    const estimatedMonthlyCost = useMemo(() => {
        return activeEmployees.reduce((sum, emp) => {
            return sum + (emp.basicSalary || 0);
        }, 0);
    }, [activeEmployees]);

    const pendingPayslips = useMemo(() => 
        (state.payslips || []).filter(p => p.status === 'Pending').length,
        [state.payslips]
    );

    const currentCycle = useMemo(() => {
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        return (state.payrollCycles || []).find(c => c.month === currentMonth && c.status !== 'Locked');
    }, [state.payrollCycles]);

    const recentCycles = useMemo(() => 
        (state.payrollCycles || [])
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 5),
        [state.payrollCycles]
    );

    const renderContent = () => {
        switch (activeTab) {
            case 'Overview':
                return (
                    <div className="space-y-6">
                        {/* KPI Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <Card className="bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-200">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">Active Employees</p>
                                        <p className="text-3xl font-bold text-indigo-900">{totalHeadcount}</p>
                                        <p className="text-xs text-indigo-600 mt-1">
                                            {(state.employees || []).filter(e => e.status === 'Terminated' || e.status === 'Resigned').length} Inactive
                                        </p>
                                    </div>
                                    <div className="w-14 h-14 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 shadow-lg">
                                        <div className="w-7 h-7">{ICONS.users}</div>
                                    </div>
                                </div>
                            </Card>

                            <Card className="bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-200">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1">Est. Monthly Cost</p>
                                        <p className="text-2xl font-bold text-emerald-900">{CURRENCY} {estimatedMonthlyCost.toLocaleString()}</p>
                                        <p className="text-xs text-emerald-600 mt-1">Based on basic salary</p>
                                    </div>
                                    <div className="w-14 h-14 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 shadow-lg">
                                        <div className="w-7 h-7">{ICONS.dollarSign}</div>
                                    </div>
                                </div>
                            </Card>

                            <Card className="bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-1">Pending Approval</p>
                                        <p className="text-3xl font-bold text-amber-900">{pendingPayslips}</p>
                                        <p className="text-xs text-amber-600 mt-1">Payslips awaiting review</p>
                                    </div>
                                    <div className="w-14 h-14 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600 shadow-lg">
                                        <div className="w-7 h-7">{ICONS.alertTriangle}</div>
                                    </div>
                                </div>
                            </Card>

                            <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-1">Payroll Cycles</p>
                                        <p className="text-3xl font-bold text-purple-900">{(state.payrollCycles || []).length}</p>
                                        <p className="text-xs text-purple-600 mt-1">
                                            {currentCycle ? 'Current cycle active' : 'No active cycle'}
                                        </p>
                                    </div>
                                    <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600 shadow-lg">
                                        <div className="w-7 h-7">{ICONS.briefcase}</div>
                                    </div>
                                </div>
                            </Card>
                        </div>

                        {/* Quick Actions & Recent Activity */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Card className="bg-white">
                                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                                    <div className="w-5 h-5 text-indigo-600">{ICONS.briefcase}</div>
                                    Quick Actions
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <Button 
                                        onClick={() => setActiveTab('Payroll Processing')} 
                                        className="h-20 flex-col justify-center gap-2 bg-gradient-to-br from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white shadow-lg hover:shadow-xl transition-all"
                                    >
                                        <div className="w-6 h-6">{ICONS.plus}</div>
                                        <span className="text-sm font-semibold">Run Payroll</span>
                                    </Button>
                                    <Button 
                                        variant="secondary" 
                                        onClick={() => setActiveTab('Employees')} 
                                        className="h-20 flex-col justify-center gap-2 bg-white border-2 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50"
                                    >
                                        <div className="w-6 h-6 text-indigo-600">{ICONS.users}</div>
                                        <span className="text-sm font-semibold text-slate-700">Manage Employees</span>
                                    </Button>
                                    <Button 
                                        variant="secondary" 
                                        onClick={() => setActiveTab('Attendance')} 
                                        className="h-20 flex-col justify-center gap-2 bg-white border-2 border-slate-200 hover:border-blue-300 hover:bg-blue-50"
                                    >
                                        <div className="w-6 h-6 text-blue-600">{ICONS.calendar}</div>
                                        <span className="text-sm font-semibold text-slate-700">Attendance</span>
                                    </Button>
                                    <Button 
                                        variant="secondary" 
                                        onClick={() => setActiveTab('Reports')} 
                                        className="h-20 flex-col justify-center gap-2 bg-white border-2 border-slate-200 hover:border-purple-300 hover:bg-purple-50"
                                    >
                                        <div className="w-6 h-6 text-purple-600">{ICONS.barChart}</div>
                                        <span className="text-sm font-semibold text-slate-700">Reports</span>
                                    </Button>
                                </div>
                            </Card>

                            <Card className="bg-white">
                                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                                    <div className="w-5 h-5 text-slate-600">{ICONS.fileText}</div>
                                    Recent Payroll Cycles
                                </h3>
                                <div className="space-y-2">
                                    {(recentCycles || []).length > 0 ? (
                                        (recentCycles || []).map(cycle => (
                                            <div 
                                                key={cycle.id} 
                                                className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
                                                onClick={() => setActiveTab('Payroll Processing')}
                                            >
                                                <div>
                                                    <p className="font-semibold text-slate-800">{cycle.name}</p>
                                                    <p className="text-xs text-slate-500">{cycle.month} • {cycle.totalEmployees} employees</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                                        cycle.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                                                        cycle.status === 'Approved' ? 'bg-blue-100 text-blue-700' :
                                                        cycle.status === 'Review' ? 'bg-amber-100 text-amber-700' :
                                                        'bg-slate-100 text-slate-700'
                                                    }`}>
                                                        {cycle.status}
                                                    </span>
                                                    <span className="text-sm font-bold text-slate-800">
                                                        {CURRENCY} {cycle.totalNetSalary.toLocaleString()}
                                                    </span>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-8 text-slate-400">
                                            <p className="text-sm">No payroll cycles yet</p>
                                            <p className="text-xs mt-1">Create your first payroll cycle to get started</p>
                                        </div>
                                    )}
                                </div>
                            </Card>
                        </div>

                        {/* System Status */}
                        <Card className="bg-white">
                            <h3 className="text-lg font-bold text-slate-800 mb-4">System Status</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Active Projects</p>
                                    <p className="text-2xl font-bold text-slate-800">
                                        {new Set(activeEmployees.flatMap(e => (e.projectAssignments || []).map(a => a.projectId))).size}
                                    </p>
                                    <p className="text-xs text-slate-500 mt-1">With employees</p>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Pending Bonuses</p>
                                    <p className="text-2xl font-bold text-slate-800">
                                        {(state.bonusRecords || []).filter(b => b.status === 'Pending').length}
                                    </p>
                                    <p className="text-xs text-slate-500 mt-1">Awaiting approval</p>
                                </div>
                            </div>
                        </Card>
                    </div>
                );
            case 'Employees':
                return <EmployeeManagement />;
            case 'Payroll Processing':
                return <PayrollProcessing />;
            case 'Attendance':
                return <AttendanceManagement />;
            case 'Bonuses':
                return <BonusManagement />;
            case 'Adjustments':
                return <PayrollAdjustmentManagement />;
            case 'Reports':
                return <PayrollReports />;
            default:
                return null;
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50">
            <div className="bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
                <div className="px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900">Enterprise Payroll Management</h1>
                            <p className="text-sm text-slate-500 mt-1">Complete payroll lifecycle management with multi-project support</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-hidden">
                <div className="h-full flex flex-col">
                    <div className="bg-white border-b border-slate-200 px-6">
                        <Tabs
                            tabs={['Overview', 'Employees', 'Payroll Processing', 'Attendance', 'Bonuses', 'Adjustments', 'Reports']}
                            activeTab={activeTab}
                            onTabClick={setActiveTab}
                        />
                    </div>

                    <div className="flex-1 overflow-y-auto p-6">
                        {renderContent()}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GlobalPayrollPage;
