/**
 * PayrollReport - Analytics and reporting dashboard
 * Uses storage only (payroll cycle runs and payslips); no test/demo data.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  PieChart as RechartsPieChart,
  Pie
} from 'recharts';
import { 
  Printer,
  Download,
  Loader2
} from 'lucide-react';
import { storageService } from './services/storageService';
import { PayrollEmployee } from './types';
import { useAuth } from '../../context/AuthContext';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { syncPayrollFromServer } from './services/payrollSync';
import { usePrintContext } from '../../context/PrintContext';
import { formatCurrency } from './utils/formatters';
import { payslipDisplayPaidAmount, payslipIsFullyPaid, payslipRemainingAmount } from './utils/payslipPaymentState';
import { toLocalDateString } from '../../utils/dateUtils';

const PayrollReport: React.FC = () => {
  const { tenant } = useAuth();
  const { print: triggerPrint } = usePrintContext();
  const tenantId = tenant?.id || '';
  
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const [runs, setRuns] = useState<ReturnType<typeof storageService.getPayrollRuns>>([]);
  const [payslips, setPayslips] = useState<ReturnType<typeof storageService.getPayslips>>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const load = async () => {
      try {
        if (!isLocalOnlyMode()) {
          await syncPayrollFromServer(tenantId);
        }
        storageService.init(tenantId);
        setEmployees(storageService.getEmployees(tenantId));
        setRuns(storageService.getPayrollRuns(tenantId));
        setPayslips(storageService.getPayslips(tenantId));
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [tenantId]);

  // Payroll run and payslip metrics (from Payroll Cycle)
  const runStats = useMemo(() => {
    const paidRuns = runs.filter(r => r.status === 'PAID');
    const totalPaidAmount = payslips.reduce((s, ps) => s + payslipDisplayPaidAmount(ps), 0);
    const totalUnpaidAmount = payslips
      .filter((ps) => !payslipIsFullyPaid(ps))
      .reduce((s, ps) => s + payslipRemainingAmount(ps), 0);
    return {
      totalRuns: runs.length,
      paidRuns: paidRuns.length,
      totalPaidAmount,
      totalUnpaidAmount
    };
  }, [runs, payslips]);

  // Calculate department-wise salary data (from workforce; safe for missing salary/department)
  const deptData = useMemo(() => {
    return employees.reduce((acc: { name: string; amount: number; count: number }[], emp) => {
      const deptName = emp.department || 'Other';
      const salary = emp.salary;
      const basic = salary && typeof salary.basic !== 'undefined'
        ? (typeof salary.basic === 'string' ? parseFloat(salary.basic) : Number(salary.basic))
        : 0;
      const dept = acc.find(d => d.name === deptName);
      if (dept) {
        dept.amount += basic || 0;
        dept.count += 1;
      } else {
        acc.push({ name: deptName, amount: basic || 0, count: 1 });
      }
      return acc;
    }, []);
  }, [employees]);

  // Project + rental building basic salary (same combined % normalization as pay split)
  const projectData = useMemo(() => {
    type Row = { id: string; name: string; amount: number; count: number };
    const byKey = new Map<string, { name: string; amount: number; employeeIds: Set<string> }>();

    const add = (key: string, displayName: string, amount: number, empId: string) => {
      const k = key || '__unassigned';
      const row = byKey.get(k) ?? { name: displayName || 'Unassigned', amount: 0, employeeIds: new Set<string>() };
      row.name = displayName || row.name;
      row.amount += amount;
      row.employeeIds.add(empId);
      byKey.set(k, row);
    };

    for (const emp of employees) {
      const salary = emp.salary;
      const basic =
        salary && typeof salary.basic !== 'undefined'
          ? (typeof salary.basic === 'string' ? parseFloat(salary.basic) : Number(salary.basic))
          : 0;
      const b = basic || 0;
      const projectParts = (emp.projects || []).filter((p) => (p.percentage ?? 0) > 0);
      const buildingParts = (emp.buildings || []).filter((x) => (x.percentage ?? 0) > 0);
      const sumPct =
        projectParts.reduce((s, p) => s + (p.percentage ?? 0), 0) +
        buildingParts.reduce((s, x) => s + (x.percentage ?? 0), 0);

      if (projectParts.length === 0 && buildingParts.length === 0) {
        add('__unassigned', 'Unassigned', b, emp.id);
        continue;
      }
      if (sumPct <= 0) {
        add('__unassigned', 'Unassigned', b, emp.id);
        continue;
      }

      for (const p of projectParts) {
        const share = b * ((p.percentage ?? 0) / sumPct);
        const key = `proj:${p.project_id || `name:${p.project_name}`}`;
        add(key, p.project_name || 'Project', share, emp.id);
      }
      for (const x of buildingParts) {
        const share = b * ((x.percentage ?? 0) / sumPct);
        const key = `bld:${x.building_id || `name:${x.building_name}`}`;
        add(key, x.building_name || 'Building', share, emp.id);
      }
    }

    return Array.from(byKey.entries())
      .map(([id, r]): Row => ({ id, name: r.name, amount: r.amount, count: r.employeeIds.size }))
      .sort((a, b) => b.amount - a.amount);
  }, [employees]);

  // Calculate grade-wise salary data (from workforce)
  const gradeData = useMemo(() => {
    return employees.reduce((acc: { name: string; amount: number; count: number }[], emp) => {
      const gradeName = emp.grade || 'Unassigned';
      const salary = emp.salary;
      const basic = salary && typeof salary.basic !== 'undefined'
        ? (typeof salary.basic === 'string' ? parseFloat(salary.basic) : Number(salary.basic))
        : 0;
      const grade = acc.find(g => g.name === gradeName);
      if (grade) {
        grade.amount += basic || 0;
        grade.count += 1;
      } else {
        acc.push({ name: gradeName, amount: basic || 0, count: 1 });
      }
      return acc;
    }, []);
  }, [employees]);

  // Calculate overall salary components breakdown (from workforce salary structures)
  const pieData = useMemo(() => {
    let totalBasic = 0;
    let totalAllowances = 0;
    let totalDeductions = 0;

    employees.forEach(emp => {
      const salary = emp.salary || { basic: 0, allowances: [], deductions: [] };
      const basicSalary = typeof salary.basic === 'string' ? parseFloat(salary.basic) : (salary.basic ?? 0);
      totalBasic += basicSalary || 0;
      (salary.allowances || []).forEach((a: { amount: number; is_percentage?: boolean }) => {
        const amount = typeof a.amount === 'string' ? parseFloat(a.amount) : (a.amount ?? 0);
        totalAllowances += a.is_percentage ? (basicSalary * amount) / 100 : amount;
      });
      (salary.deductions || []).forEach((d: { amount: number; is_percentage?: boolean }) => {
        const amount = typeof d.amount === 'string' ? parseFloat(d.amount) : (d.amount ?? 0);
        totalDeductions += d.is_percentage ? (basicSalary * amount) / 100 : amount;
      });
    });

    const total = totalBasic + totalAllowances;
    if (total === 0) return [];

    return [
      { name: 'Basic Pay', value: Math.round((totalBasic / total) * 100), color: '#4f46e5', amount: totalBasic },
      { name: 'Allowances', value: Math.round((totalAllowances / total) * 100), color: '#10b981', amount: totalAllowances },
      { name: 'Deductions', value: Math.round((totalDeductions / total) * 100), color: '#ef4444', amount: totalDeductions },
    ];
  }, [employees]);

  const handleExportReport = () => {
    setIsExporting(true);
    setTimeout(() => {
      const deptHeaders = ['Department', 'Employee Count', 'Total Basic Salary (PKR)'];
      const deptRows = deptData.map(d => [d.name, d.count, d.amount]);
      const gradeHeaders = ['Grade', 'Employee Count', 'Total Basic Salary (PKR)'];
      const gradeRows = gradeData.map(g => [g.name, g.count, g.amount]);
      const projectHeaders = ['Project', 'Employee Count', 'Total Basic Salary (PKR)'];
      const projectRows = projectData.map(p => [p.name, p.count, p.amount]);
      const csvContent = [
        deptHeaders.join(','),
        ...deptRows.map(e => e.join(',')),
        '',
        projectHeaders.join(','),
        ...projectRows.map(e => e.join(',')),
        '',
        gradeHeaders.join(','),
        ...gradeRows.map(e => e.join(','))
      ].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Payroll_Analytics_${toLocalDateString(new Date())}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setIsExporting(false);
    }, 400);
  };

  if (!tenantId || isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 size={32} className="text-primary animate-spin" />
        <p className="text-app-muted font-bold">Loading analytics data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-app-text tracking-tight">Analytics & Reports</h1>
          <p className="text-app-muted text-xs sm:text-sm font-medium">Financial distribution and workforce cost analysis.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => triggerPrint('REPORT', { elementId: 'printable-area' })}
            className="px-3 sm:px-5 py-2 sm:py-2.5 bg-app-card border border-app-border rounded-xl text-app-text font-bold text-xs sm:text-sm flex items-center gap-2 hover:bg-app-toolbar transition-colors"
          >
            <Printer size={16} /> <span className="hidden sm:inline">Print</span>
          </button>
          <button 
            onClick={handleExportReport}
            disabled={isExporting}
            className="px-3 sm:px-5 py-2 sm:py-2.5 bg-slate-900 text-white rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 disabled:opacity-50"
          >
            {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} 
            <span className="hidden sm:inline">Export Report</span><span className="sm:hidden">Export</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div id="printable-area" className="printable-area space-y-4 sm:space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-app-card p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-app-border shadow-ds-card">
          <p className="text-[10px] font-black text-app-muted uppercase tracking-widest mb-1">Total Employees</p>
          <p className="text-2xl sm:text-3xl font-black text-app-text">{employees.length}</p>
        </div>
        <div className="bg-app-card p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-app-border shadow-ds-card">
          <p className="text-[10px] font-black text-app-muted uppercase tracking-widest mb-1">Payroll Runs</p>
          <p className="text-2xl sm:text-3xl font-black text-app-text">{runStats.totalRuns}</p>
          <p className="text-[10px] text-app-muted mt-0.5">{runStats.paidRuns} paid</p>
        </div>
        <div className="bg-app-card p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-app-border shadow-ds-card">
          <p className="text-[10px] font-black text-app-muted uppercase tracking-widest mb-1">Total Paid (All Time)</p>
          <p className="text-lg sm:text-2xl font-black text-app-text">
            <span className="text-xs sm:text-base">PKR</span> {formatCurrency(runStats.totalPaidAmount)}
          </p>
        </div>
        <div className="bg-app-card p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-app-border shadow-ds-card">
          <p className="text-[10px] font-black text-app-muted uppercase tracking-widest mb-1">Unpaid (Outstanding)</p>
          <p className="text-lg sm:text-2xl font-black text-ds-warning">
            <span className="text-xs sm:text-base">PKR</span> {formatCurrency(runStats.totalUnpaidAmount)}
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8 print-full">
        <div className="lg:col-span-2 space-y-4 sm:space-y-8 print-full">
          {/* Bar Chart - Department Distribution */}
          <div className="bg-app-card p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-app-border shadow-ds-card print-card">
            <h3 className="text-xs sm:text-sm font-black text-app-muted uppercase tracking-widest mb-4 sm:mb-8">Departmental Cost Distribution</h3>
            <div className="h-[250px] sm:h-[350px]">
              {deptData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={deptData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 10, fontWeight: 700 }} interval={0} angle={-45} textAnchor="end" height={60} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 10, fontWeight: 700 }} width={60} />
                    <Tooltip 
                      cursor={{ fill: 'var(--toolbar-bg)' }} 
                      contentStyle={{ borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)', boxShadow: 'var(--shadow-modal)', padding: '8px', fontSize: '12px' }}
                      formatter={(value: number) => [`PKR ${formatCurrency(value)}`, 'Total Basic']}
                    />
                    <Bar dataKey="amount" fill="var(--color-primary)" radius={[8, 8, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-app-muted text-sm">
                  No data available
                </div>
              )}
            </div>
          </div>

          {/* Grade distribution table */}
          <div className="bg-app-card p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-app-border shadow-ds-card print-card">
            <h3 className="text-xs sm:text-sm font-black text-app-muted uppercase tracking-widest mb-4 sm:mb-6">Cost by Grade</h3>
            {gradeData.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-app-border text-app-muted font-black uppercase tracking-wider text-left">
                      <th className="pb-3 pr-4">Grade</th>
                      <th className="pb-3 pr-4 text-right">Employees</th>
                      <th className="pb-3 text-right">Total Basic (PKR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-app-border">
                    {gradeData.map((g) => (
                      <tr key={g.name}>
                        <td className="py-3 pr-4 font-bold text-app-text">{g.name}</td>
                        <td className="py-3 pr-4 text-right text-app-muted">{g.count}</td>
                        <td className="py-3 text-right font-bold text-app-text">{formatCurrency(g.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-app-muted text-sm">No grade data yet. Assign grades to employees in Workforce.</p>
            )}
          </div>

          {/* Pie Chart - Cost Components */}
          <div className="bg-app-card p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-app-border shadow-ds-card grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8 items-center print-card">
            <div>
              <h3 className="text-xs sm:text-sm font-black text-app-muted uppercase tracking-widest mb-2">Cost Components</h3>
              <p className="text-xs text-app-muted font-medium mb-4 sm:mb-6 hidden sm:block">Breakdown of gross financial obligations.</p>
              <div className="space-y-2 sm:space-y-3">
                {pieData.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-app-toolbar/50 border border-app-border">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                      <span className="text-xs font-bold text-app-text">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-black text-app-text">{item.value}%</span>
                      <span className="text-[10px] text-app-muted ml-1 sm:ml-2 hidden sm:inline">PKR {formatCurrency(item.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="h-[180px] sm:h-[250px] relative">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <RechartsPieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={8}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </RechartsPieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-app-muted text-sm">
                  No data
                </div>
              )}
              {pieData.length > 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xl sm:text-2xl font-black text-app-text">100%</span>
                  <span className="text-[9px] sm:text-[10px] font-black text-app-muted uppercase tracking-widest">Gross</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Department Details */}
        <div className="space-y-3 sm:space-y-4">
          <h3 className="text-xs sm:text-sm font-black text-app-muted uppercase tracking-widest">Department Details</h3>
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
            {deptData.map((dept, i) => (
              <div key={i} className="bg-app-card p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-app-border shadow-ds-card">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-bold text-app-text text-sm truncate">{dept.name}</h4>
                  <span className="text-[10px] font-black text-app-muted bg-app-toolbar px-1.5 sm:px-2 py-0.5 sm:py-1 rounded shrink-0 ml-1">
                    {dept.count}
                  </span>
                </div>
                <p className="text-sm sm:text-lg font-black text-primary">PKR {formatCurrency(dept.amount)}</p>
                <p className="text-[10px] text-app-muted mt-1 hidden sm:block">
                  Avg: PKR {formatCurrency(dept.amount / dept.count)}/emp
                </p>
              </div>
            ))}
            {deptData.length === 0 && (
              <div className="col-span-2 lg:col-span-1 bg-app-card p-6 sm:p-8 rounded-xl sm:rounded-2xl border border-app-border text-center text-app-muted text-sm">
                No departments yet
              </div>
            )}
          </div>
        </div>
      </div>

        {/* Project & building salary expense (full width below department block) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8 print-full">
          <div className="lg:col-span-2 space-y-4 print-full">
            <div className="bg-app-card p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-app-border shadow-ds-card print-card">
              <h3 className="text-xs sm:text-sm font-black text-app-muted uppercase tracking-widest mb-4 sm:mb-8">Project &amp; building salary expense</h3>
              <p className="text-xs text-app-muted font-medium mb-4 sm:mb-6 -mt-4 sm:-mt-6">
                Basic salary split by each employee&apos;s project and rental-building assignments (same % rules as when paying salary). Amounts with only buildings appear under those building names; no assignment stays under Unassigned.
              </p>
              <div className="h-[250px] sm:h-[350px]">
                {projectData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={projectData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: 'var(--text-muted)', fontSize: 10, fontWeight: 700 }}
                        interval={0}
                        angle={-45}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 10, fontWeight: 700 }} width={60} />
                      <Tooltip
                        cursor={{ fill: 'var(--toolbar-bg)' }}
                        contentStyle={{
                          borderRadius: '12px',
                          border: '1px solid var(--border-color)',
                          background: 'var(--card-bg)',
                          color: 'var(--text-primary)',
                          boxShadow: 'var(--shadow-modal)',
                          padding: '8px',
                          fontSize: '12px',
                        }}
                        formatter={(value: number) => [`PKR ${formatCurrency(value)}`, 'Total basic']}
                      />
                      <Bar dataKey="amount" fill="#0ea5e9" radius={[8, 8, 0, 0]} barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-app-muted text-sm">No data available</div>
                )}
              </div>
            </div>
            <div className="bg-app-card p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-app-border shadow-ds-card print-card lg:hidden">
              <h3 className="text-xs sm:text-sm font-black text-app-muted uppercase tracking-widest mb-4 sm:mb-6">Project / building list</h3>
              {projectData.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-app-border text-app-muted font-black uppercase tracking-wider text-left">
                        <th className="pb-3 pr-4">Project / building</th>
                        <th className="pb-3 pr-4 text-right">Employees</th>
                        <th className="pb-3 text-right">Total basic (PKR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-app-border">
                      {projectData.map((row) => (
                        <tr key={row.id}>
                          <td className="py-3 pr-4 font-bold text-app-text">{row.name}</td>
                          <td className="py-3 pr-4 text-right text-app-muted">{row.count}</td>
                          <td className="py-3 text-right font-bold text-app-text">{formatCurrency(row.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-app-muted text-sm">No project or building assignments yet.</p>
              )}
            </div>
          </div>
          <div className="space-y-3 sm:space-y-4">
            <h3 className="text-xs sm:text-sm font-black text-app-muted uppercase tracking-widest">Project &amp; building details</h3>
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
              {projectData.map((proj, i) => (
                <div key={i} className="bg-app-card p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-app-border shadow-ds-card">
                  <div className="flex justify-between items-start mb-2 gap-2">
                    <h4 className="font-bold text-app-text text-sm truncate" title={proj.name}>
                      {proj.name}
                    </h4>
                    <span className="text-[10px] font-black text-app-muted bg-app-toolbar px-1.5 sm:px-2 py-0.5 sm:py-1 rounded shrink-0">
                      {proj.count}
                    </span>
                  </div>
                  <p className="text-sm sm:text-lg font-black text-sky-600 dark:text-sky-400">PKR {formatCurrency(proj.amount)}</p>
                  <p className="text-[10px] text-app-muted mt-1 hidden sm:block">
                    Avg: PKR {formatCurrency(proj.count ? proj.amount / proj.count : 0)}/emp
                  </p>
                </div>
              ))}
              {projectData.length === 0 && (
                <div className="col-span-2 lg:col-span-1 bg-app-card p-6 sm:p-8 rounded-xl sm:rounded-2xl border border-app-border text-center text-app-muted text-sm">
                  No project or building cost data yet
                </div>
              )}
            </div>
            <div className="hidden lg:block bg-app-card p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-app-border shadow-ds-card print-card">
              <h4 className="text-[10px] font-black text-app-muted uppercase tracking-widest mb-3">Project / building list</h4>
              {projectData.length > 0 ? (
                <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-app-card">
                      <tr className="border-b border-app-border text-app-muted font-black uppercase tracking-wider text-left">
                        <th className="pb-2 pr-2">Name</th>
                        <th className="pb-2 pr-2 text-right">Emp.</th>
                        <th className="pb-2 text-right">Basic</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-app-border">
                      {projectData.map((row) => (
                        <tr key={row.id}>
                          <td className="py-2 pr-2 font-bold text-app-text max-w-[120px] truncate" title={row.name}>
                            {row.name}
                          </td>
                          <td className="py-2 pr-2 text-right text-app-muted">{row.count}</td>
                          <td className="py-2 text-right font-bold text-app-text">{formatCurrency(row.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-app-muted text-xs">Assign projects or buildings on employee profiles to see breakdown.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PayrollReport;
