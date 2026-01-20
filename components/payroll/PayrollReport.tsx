/**
 * PayrollReport - Analytics and reporting dashboard
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

const PayrollReport: React.FC = () => {
  const { tenant } = useAuth();
  const tenantId = tenant?.id || '';
  
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (tenantId) {
      const data = storageService.getEmployees(tenantId);
      setEmployees(data);
    }
  }, [tenantId]);

  // Calculate department-wise salary data
  const deptData = useMemo(() => {
    return employees.reduce((acc: any[], emp) => {
      const dept = acc.find(d => d.name === emp.department);
      const amount = emp.salary.basic;
      if (dept) {
        dept.amount += amount;
        dept.count += 1;
      } else {
        acc.push({ name: emp.department, amount, count: 1 });
      }
      return acc;
    }, []);
  }, [employees]);

  // Calculate overall salary components breakdown
  const pieData = useMemo(() => {
    let totalBasic = 0;
    let totalAllowances = 0;
    let totalDeductions = 0;

    employees.forEach(emp => {
      totalBasic += emp.salary.basic;
      emp.salary.allowances.forEach(a => {
        totalAllowances += a.is_percentage ? (emp.salary.basic * a.amount) / 100 : a.amount;
      });
      emp.salary.deductions.forEach(d => {
        totalDeductions += d.is_percentage ? (emp.salary.basic * d.amount) / 100 : d.amount;
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
      const headers = ['Department', 'Employee Count', 'Total Basic Salary (PKR)'];
      const rows = deptData.map(d => [d.name, d.count, d.amount]);

      const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `Payroll_Department_Report_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setIsExporting(false);
    }, 800);
  };

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-slate-400 font-bold">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Analytics & Reports</h1>
          <p className="text-slate-500 text-sm font-medium">Financial distribution and workforce cost analysis for the current fiscal period.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => window.print()}
            className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 font-bold text-sm flex items-center gap-2 hover:bg-slate-50 transition-colors"
          >
            <Printer size={16} /> Print
          </button>
          <button 
            onClick={handleExportReport}
            disabled={isExporting}
            className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-black flex items-center gap-2 hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 disabled:opacity-50"
          >
            {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} 
            Export Report
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Employees</p>
          <p className="text-3xl font-black text-slate-900">{employees.length}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Departments</p>
          <p className="text-3xl font-black text-slate-900">{deptData.length}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Monthly Payroll</p>
          <p className="text-2xl font-black text-slate-900">
            PKR {employees.reduce((sum, e) => sum + e.salary.basic, 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Avg. Basic Salary</p>
          <p className="text-2xl font-black text-slate-900">
            PKR {employees.length > 0 
              ? Math.round(employees.reduce((sum, e) => sum + e.salary.basic, 0) / employees.length).toLocaleString()
              : 0
            }
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 print-full">
        <div className="lg:col-span-2 space-y-8 print-full">
          {/* Bar Chart - Department Distribution */}
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm print-card">
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-8">Departmental Cost Distribution</h3>
            <div className="h-[350px]">
              {deptData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deptData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }} />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc' }} 
                      contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '12px' }}
                      formatter={(value: number) => [`PKR ${value.toLocaleString()}`, 'Total Basic']}
                    />
                    <Bar dataKey="amount" fill="#4f46e5" radius={[10, 10, 0, 0]} barSize={50} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400">
                  No data available
                </div>
              )}
            </div>
          </div>

          {/* Pie Chart - Cost Components */}
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-8 items-center print-card">
            <div>
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-2">Cost Components</h3>
              <p className="text-xs text-slate-400 font-medium mb-6">Breakdown of gross financial obligations.</p>
              <div className="space-y-3">
                {pieData.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                      <span className="text-xs font-bold text-slate-700">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-black text-slate-900">{item.value}%</span>
                      <span className="text-[10px] text-slate-400 ml-2">PKR {item.amount.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="h-[250px] relative">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
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
                <div className="h-full flex items-center justify-center text-slate-400">
                  No data
                </div>
              )}
              {pieData.length > 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-black text-slate-900">100%</span>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Gross</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Department Details */}
        <div className="space-y-4">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Department Details</h3>
          <div className="space-y-3">
            {deptData.map((dept, i) => (
              <div key={i} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-bold text-slate-900">{dept.name}</h4>
                  <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-1 rounded">
                    {dept.count} emp
                  </span>
                </div>
                <p className="text-lg font-black text-indigo-600">PKR {dept.amount.toLocaleString()}</p>
                <p className="text-[10px] text-slate-400 mt-1">
                  Avg: PKR {Math.round(dept.amount / dept.count).toLocaleString()}/emp
                </p>
              </div>
            ))}
            {deptData.length === 0 && (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-400">
                No departments yet
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PayrollReport;
