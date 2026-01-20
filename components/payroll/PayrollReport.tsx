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
import { payrollApi } from '../../services/api/payrollApi';
import { PayrollEmployee } from './types';
import { useAuth } from '../../context/AuthContext';

const PayrollReport: React.FC = () => {
  const { tenant } = useAuth();
  const tenantId = tenant?.id || '';
  
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchEmployees = async () => {
      if (!tenantId) {
        setIsLoading(false);
        return;
      }
      
      setIsLoading(true);
      try {
        // Fetch from cloud API first
        const apiEmployees = await payrollApi.getEmployees();
        if (apiEmployees.length > 0) {
          setEmployees(apiEmployees);
        } else {
          // Fallback to localStorage
          setEmployees(storageService.getEmployees(tenantId));
        }
      } catch (error) {
        console.warn('Failed to fetch employees from API:', error);
        // Fallback to localStorage
        setEmployees(storageService.getEmployees(tenantId));
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchEmployees();
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

  if (!tenantId || isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 size={32} className="text-indigo-600 animate-spin" />
        <p className="text-slate-400 font-bold">Loading analytics data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Analytics & Reports</h1>
          <p className="text-slate-500 text-xs sm:text-sm font-medium">Financial distribution and workforce cost analysis.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => window.print()}
            className="px-3 sm:px-5 py-2 sm:py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 font-bold text-xs sm:text-sm flex items-center gap-2 hover:bg-slate-50 transition-colors"
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Employees</p>
          <p className="text-2xl sm:text-3xl font-black text-slate-900">{employees.length}</p>
        </div>
        <div className="bg-white p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Departments</p>
          <p className="text-2xl sm:text-3xl font-black text-slate-900">{deptData.length}</p>
        </div>
        <div className="bg-white p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Monthly Payroll</p>
          <p className="text-lg sm:text-2xl font-black text-slate-900">
            <span className="text-xs sm:text-base">PKR</span> {employees.reduce((sum, e) => sum + e.salary.basic, 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-white p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Avg. Basic Salary</p>
          <p className="text-lg sm:text-2xl font-black text-slate-900">
            <span className="text-xs sm:text-base">PKR</span> {employees.length > 0 
              ? Math.round(employees.reduce((sum, e) => sum + e.salary.basic, 0) / employees.length).toLocaleString()
              : 0
            }
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8 print-full">
        <div className="lg:col-span-2 space-y-4 sm:space-y-8 print-full">
          {/* Bar Chart - Department Distribution */}
          <div className="bg-white p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm print-card">
            <h3 className="text-xs sm:text-sm font-black text-slate-400 uppercase tracking-widest mb-4 sm:mb-8">Departmental Cost Distribution</h3>
            <div className="h-[250px] sm:h-[350px]">
              {deptData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deptData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} interval={0} angle={-45} textAnchor="end" height={60} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} width={60} />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc' }} 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '8px', fontSize: '12px' }}
                      formatter={(value: number) => [`PKR ${value.toLocaleString()}`, 'Total Basic']}
                    />
                    <Bar dataKey="amount" fill="#4f46e5" radius={[8, 8, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                  No data available
                </div>
              )}
            </div>
          </div>

          {/* Pie Chart - Cost Components */}
          <div className="bg-white p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8 items-center print-card">
            <div>
              <h3 className="text-xs sm:text-sm font-black text-slate-400 uppercase tracking-widest mb-2">Cost Components</h3>
              <p className="text-xs text-slate-400 font-medium mb-4 sm:mb-6 hidden sm:block">Breakdown of gross financial obligations.</p>
              <div className="space-y-2 sm:space-y-3">
                {pieData.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-slate-50 border border-slate-100">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                      <span className="text-xs font-bold text-slate-700">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-black text-slate-900">{item.value}%</span>
                      <span className="text-[10px] text-slate-400 ml-1 sm:ml-2 hidden sm:inline">PKR {item.amount.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="h-[180px] sm:h-[250px] relative">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
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
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                  No data
                </div>
              )}
              {pieData.length > 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xl sm:text-2xl font-black text-slate-900">100%</span>
                  <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Gross</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Department Details */}
        <div className="space-y-3 sm:space-y-4">
          <h3 className="text-xs sm:text-sm font-black text-slate-400 uppercase tracking-widest">Department Details</h3>
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
            {deptData.map((dept, i) => (
              <div key={i} className="bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-bold text-slate-900 text-sm truncate">{dept.name}</h4>
                  <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded shrink-0 ml-1">
                    {dept.count}
                  </span>
                </div>
                <p className="text-sm sm:text-lg font-black text-indigo-600">PKR {dept.amount.toLocaleString()}</p>
                <p className="text-[10px] text-slate-400 mt-1 hidden sm:block">
                  Avg: PKR {Math.round(dept.amount / dept.count).toLocaleString()}/emp
                </p>
              </div>
            ))}
            {deptData.length === 0 && (
              <div className="col-span-2 lg:col-span-1 bg-white p-6 sm:p-8 rounded-xl sm:rounded-2xl border border-slate-200 text-center text-slate-400 text-sm">
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
