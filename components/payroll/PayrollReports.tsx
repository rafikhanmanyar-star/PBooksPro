
import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Employee, Payslip, PayrollCycle } from '../../types';
import { ICONS, CURRENCY } from '../../constants';
import Card from '../ui/Card';
import Button from '../ui/Button';
import ComboBox from '../ui/ComboBox';
import Input from '../ui/Input';

const PayrollReports: React.FC = () => {
    const { state } = useAppContext();
    const [reportType, setReportType] = useState<'overview' | 'project' | 'employee' | 'tax'>('overview');
    const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('all');
    const [dateRange, setDateRange] = useState({
        start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    });

    const payslips = useMemo(() => {
        let filtered = state.payslips || [];
        
        // Filter by date range
        filtered = filtered.filter(p => {
            const payslipDate = new Date(p.month + '-01');
            const start = new Date(dateRange.start);
            const end = new Date(dateRange.end);
            return payslipDate >= start && payslipDate <= end;
        });

        // Filter by project
        if (selectedProjectId !== 'all') {
            filtered = filtered.filter(p => 
                p.costAllocations.some(a => a.projectId === selectedProjectId)
            );
        }

        // Filter by employee
        if (selectedEmployeeId !== 'all') {
            filtered = filtered.filter(p => p.employeeId === selectedEmployeeId);
        }

        return filtered;
    }, [state.payslips, dateRange, selectedProjectId, selectedEmployeeId]);

    const projectCosts = useMemo(() => {
        const costs: Record<string, { gross: number; net: number; employees: Set<string> }> = {};
        
        payslips.forEach(payslip => {
            payslip.costAllocations.forEach(allocation => {
                if (!costs[allocation.projectId]) {
                    costs[allocation.projectId] = { gross: 0, net: 0, employees: new Set() };
                }
                costs[allocation.projectId].gross += allocation.basicSalary + allocation.allowances + allocation.bonuses;
                costs[allocation.projectId].net += allocation.netAmount;
                costs[allocation.projectId].employees.add(payslip.employeeId);
            });
        });

        return costs;
    }, [payslips]);

    const employeeTotals = useMemo(() => {
        const totals: Record<string, { gross: number; net: number; payslips: number }> = {};
        
        payslips.forEach(payslip => {
            if (!totals[payslip.employeeId]) {
                totals[payslip.employeeId] = { gross: 0, net: 0, payslips: 0 };
            }
            totals[payslip.employeeId].gross += payslip.grossSalary;
            totals[payslip.employeeId].net += payslip.netSalary;
            totals[payslip.employeeId].payslips += 1;
        });

        return totals;
    }, [payslips]);

    const taxSummary = useMemo(() => {
        const summary = {
            totalTax: 0,
            totalStatutory: 0,
            totalDeductions: 0,
            byEmployee: {} as Record<string, { tax: number; statutory: number; deductions: number }>
        };

        payslips.forEach(payslip => {
            summary.totalTax += payslip.totalTax;
            summary.totalStatutory += payslip.totalStatutory;
            summary.totalDeductions += payslip.totalDeductions;

            if (!summary.byEmployee[payslip.employeeId]) {
                summary.byEmployee[payslip.employeeId] = { tax: 0, statutory: 0, deductions: 0 };
            }
            summary.byEmployee[payslip.employeeId].tax += payslip.totalTax;
            summary.byEmployee[payslip.employeeId].statutory += payslip.totalStatutory;
            summary.byEmployee[payslip.employeeId].deductions += payslip.totalDeductions;
        });

        return summary;
    }, [payslips]);

    const renderOverviewReport = () => {
        const totalGross = payslips.reduce((sum, p) => sum + p.grossSalary, 0);
        const totalNet = payslips.reduce((sum, p) => sum + p.netSalary, 0);
        const totalDeductions = payslips.reduce((sum, p) => sum + p.totalDeductions + p.totalTax + p.totalStatutory, 0);
        const uniqueEmployees = new Set(payslips.map(p => p.employeeId)).size;

        return (
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card className="bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-200">
                        <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">Total Employees</p>
                        <p className="text-3xl font-bold text-indigo-900">{uniqueEmployees}</p>
                    </Card>
                    <Card className="bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-200">
                        <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1">Total Gross</p>
                        <p className="text-2xl font-bold text-emerald-900">{CURRENCY} {totalGross.toLocaleString()}</p>
                    </Card>
                    <Card className="bg-gradient-to-br from-rose-50 to-red-50 border-rose-200">
                        <p className="text-xs font-semibold text-rose-600 uppercase tracking-wider mb-1">Total Deductions</p>
                        <p className="text-2xl font-bold text-rose-900">{CURRENCY} {totalDeductions.toLocaleString()}</p>
                    </Card>
                    <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200">
                        <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-1">Total Net</p>
                        <p className="text-2xl font-bold text-purple-900">{CURRENCY} {totalNet.toLocaleString()}</p>
                    </Card>
                </div>

                <Card>
                    <h3 className="text-lg font-semibold text-slate-800 mb-4">Project-wise Cost Breakdown</h3>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Project</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Employees</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-emerald-600 uppercase">Gross Salary</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-purple-600 uppercase">Net Salary</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 bg-white">
                                {Object.entries(projectCosts).map(([projectId, costs]) => {
                                    const project = state.projects.find(p => p.id === projectId);
                                    return (
                                        <tr key={projectId} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 font-medium text-slate-800">{project?.name || 'Unknown'}</td>
                                            <td className="px-4 py-3 text-right text-slate-600">{costs.employees.size}</td>
                                            <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                                                {CURRENCY} {costs.gross.toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-right font-semibold text-purple-700">
                                                {CURRENCY} {costs.net.toLocaleString()}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {Object.keys(projectCosts).length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                                            No project costs found for the selected period
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>
        );
    };

    const renderProjectReport = () => {
        return (
            <Card>
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Project-wise Payroll Report</h3>
                <div className="space-y-4">
                    {Object.entries(projectCosts).map(([projectId, costs]) => {
                        const project = state.projects.find(p => p.id === projectId);
                        return (
                            <div key={projectId} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="font-bold text-slate-900">{project?.name || 'Unknown Project'}</h4>
                                    <span className="text-sm text-slate-600">{costs.employees.size} employees</span>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-xs text-slate-500 mb-1">Gross Salary</p>
                                        <p className="text-lg font-bold text-emerald-700">
                                            {CURRENCY} {costs.gross.toLocaleString()}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 mb-1">Net Salary</p>
                                        <p className="text-lg font-bold text-purple-700">
                                            {CURRENCY} {costs.net.toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {Object.keys(projectCosts).length === 0 && (
                        <p className="text-center py-8 text-slate-500">No project costs found</p>
                    )}
                </div>
            </Card>
        );
    };

    const renderEmployeeReport = () => {
        return (
            <Card>
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Employee-wise Payroll Report</h3>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Employee</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Payslips</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-emerald-600 uppercase">Total Gross</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-purple-600 uppercase">Total Net</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white">
                            {Object.entries(employeeTotals).map(([employeeId, totals]) => {
                                const employee = state.employees.find(e => e.id === employeeId);
                                return (
                                    <tr key={employeeId} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 font-medium text-slate-800">
                                            {employee 
                                                ? `${employee.personalDetails.firstName} ${employee.personalDetails.lastName}`
                                                : 'Unknown Employee'}
                                        </td>
                                        <td className="px-4 py-3 text-right text-slate-600">{totals.payslips}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                                            {CURRENCY} {totals.gross.toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold text-purple-700">
                                            {CURRENCY} {totals.net.toLocaleString()}
                                        </td>
                                    </tr>
                                );
                            })}
                            {Object.keys(employeeTotals).length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                                        No employee data found for the selected period
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        );
    };

    const renderTaxReport = () => {
        return (
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="bg-rose-50 border-rose-200">
                        <p className="text-xs font-semibold text-rose-600 uppercase tracking-wider mb-1">Total Tax</p>
                        <p className="text-2xl font-bold text-rose-900">
                            {CURRENCY} {taxSummary.totalTax.toLocaleString()}
                        </p>
                    </Card>
                    <Card className="bg-amber-50 border-amber-200">
                        <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-1">Total Statutory</p>
                        <p className="text-2xl font-bold text-amber-900">
                            {CURRENCY} {taxSummary.totalStatutory.toLocaleString()}
                        </p>
                    </Card>
                    <Card className="bg-slate-50 border-slate-200">
                        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Total Deductions</p>
                        <p className="text-2xl font-bold text-slate-900">
                            {CURRENCY} {taxSummary.totalDeductions.toLocaleString()}
                        </p>
                    </Card>
                </div>

                <Card>
                    <h3 className="text-lg font-semibold text-slate-800 mb-4">Employee-wise Tax Summary</h3>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Employee</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-rose-600 uppercase">Tax</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-amber-600 uppercase">Statutory</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Total Deductions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 bg-white">
                                {Object.entries(taxSummary.byEmployee).map(([employeeId, summary]) => {
                                    const employee = state.employees.find(e => e.id === employeeId);
                                    return (
                                        <tr key={employeeId} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 font-medium text-slate-800">
                                                {employee 
                                                    ? `${employee.personalDetails.firstName} ${employee.personalDetails.lastName}`
                                                    : 'Unknown Employee'}
                                            </td>
                                            <td className="px-4 py-3 text-right font-semibold text-rose-700">
                                                {CURRENCY} {summary.tax.toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-right font-semibold text-amber-700">
                                                {CURRENCY} {summary.statutory.toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-right font-semibold text-slate-700">
                                                {CURRENCY} {(summary.tax + summary.statutory + summary.deductions).toLocaleString()}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {Object.keys(taxSummary.byEmployee).length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                                            No tax data found for the selected period
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 shadow-sm flex-shrink-0 mb-6">
                <div className="px-6 py-4">
                    <h2 className="text-xl font-bold text-slate-900">Payroll Reports & Analytics</h2>
                    <p className="text-sm text-slate-500 mt-1">Comprehensive payroll insights and analytics</p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6">
                {/* Filters */}
                <Card className="mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Report Type</label>
                            <ComboBox
                                items={[
                                    { id: 'overview', name: 'Overview' },
                                    { id: 'project', name: 'Project-wise' },
                                    { id: 'employee', name: 'Employee-wise' },
                                    { id: 'tax', name: 'Tax Summary' }
                                ]}
                                selectedId={reportType}
                                onSelect={(item) => setReportType((item?.id as any) || 'overview')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                            <Input
                                type="date"
                                value={dateRange.start}
                                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                            <Input
                                type="date"
                                value={dateRange.end}
                                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Project (Optional)</label>
                            <ComboBox
                                items={[
                                    { id: 'all', name: 'All Projects' },
                                    ...state.projects.map(p => ({ id: p.id, name: p.name }))
                                ]}
                                selectedId={selectedProjectId}
                                onSelect={(item) => setSelectedProjectId(item?.id || 'all')}
                            />
                        </div>
                    </div>
                </Card>

                {/* Report Content */}
                {reportType === 'overview' && renderOverviewReport()}
                {reportType === 'project' && renderProjectReport()}
                {reportType === 'employee' && renderEmployeeReport()}
                {reportType === 'tax' && renderTaxReport()}
            </div>
        </div>
    );
};

export default PayrollReports;
