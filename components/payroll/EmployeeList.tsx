/**
 * EmployeeList - Displays all employees in the payroll system
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Search, UserPlus, FileDown, Mail, Phone, Loader2 } from 'lucide-react';
import { storageService } from './services/storageService';
import { payrollApi } from '../../services/api/payrollApi';
import { PayrollEmployee, EmployeeListProps } from './types';
import { useAuth } from '../../context/AuthContext';
import { usePayrollContext } from '../../context/PayrollContext';

const EmployeeList: React.FC<EmployeeListProps> = ({ onSelect, onAdd }) => {
  const { tenant } = useAuth();
  const tenantId = tenant?.id || '';
  
  // Use PayrollContext for preserving search term across navigation
  const { workforceSearchTerm, setWorkforceSearchTerm } = usePayrollContext();
  
  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);

  // Fetch employees from API with localStorage fallback
  useEffect(() => {
    const fetchEmployees = async () => {
      if (!tenantId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        // Try API first
        const apiEmployees = await payrollApi.getEmployees();
        if (apiEmployees.length > 0) {
          setEmployees(apiEmployees);
          // Update localStorage cache
          localStorage.setItem(`payroll_employees_${tenantId}`, JSON.stringify(apiEmployees));
        } else {
          // Fallback to localStorage
          setEmployees(storageService.getEmployees(tenantId));
        }
      } catch (error) {
        console.warn('Failed to fetch employees from API, using localStorage:', error);
        // Fallback to localStorage
        setEmployees(storageService.getEmployees(tenantId));
      } finally {
        setIsLoading(false);
      }
    };

    fetchEmployees();
  }, [tenantId]);

  // Filter employees based on search (using context for persistence)
  const filteredEmployees = useMemo(() => {
    if (!workforceSearchTerm) return employees;
    const term = workforceSearchTerm.toLowerCase();
    return employees.filter(emp => 
      emp.name.toLowerCase().includes(term) ||
      emp.department.toLowerCase().includes(term) ||
      emp.designation.toLowerCase().includes(term) ||
      emp.id.toLowerCase().includes(term) ||
      (emp.email?.toLowerCase().includes(term))
    );
  }, [employees, workforceSearchTerm]);

  const handleExportCSV = () => {
    setIsExporting(true);
    setTimeout(() => {
      const headers = ['ID', 'Name', 'Email', 'Phone', 'Designation', 'Department', 'Grade', 'Status', 'Joining Date', 'Basic Salary'];
      const rows = filteredEmployees.map(emp => [
        emp.id,
        emp.name,
        emp.email || '',
        emp.phone || '',
        emp.designation,
        emp.department,
        emp.grade,
        emp.status,
        emp.joining_date,
        emp.salary.basic
      ]);

      const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `Workforce_Export_${new Date().toISOString().split('T')[0]}.csv`);
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
        <Loader2 size={32} className="text-blue-600 animate-spin" />
        <p className="text-slate-400 font-bold">Loading workforce...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Workforce</h1>
          <p className="text-slate-500 text-xs sm:text-sm">Management of employee payroll profiles and status.</p>
        </div>
        <button 
          onClick={onAdd}
          className="bg-blue-600 text-white px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 text-sm"
        >
          <UserPlus size={18} /> Add Employee
        </button>
      </div>

      {/* Search and Export */}
      <div className="flex items-center gap-2 sm:gap-4 bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-sm focus-within:ring-2 ring-blue-500/20 transition-all">
        <Search size={18} className="text-slate-400 shrink-0" />
        <input 
          type="text" 
          placeholder="Search workforce..." 
          value={workforceSearchTerm}
          onChange={(e) => setWorkforceSearchTerm(e.target.value)}
          className="flex-1 min-w-0 outline-none text-slate-700 placeholder-slate-400 bg-transparent text-sm font-medium"
        />
        <div className="h-6 w-[1px] bg-slate-200 hidden sm:block"></div>
        <button 
          onClick={handleExportCSV}
          disabled={isExporting}
          className="text-slate-400 hover:text-slate-900 transition-colors p-2 hover:bg-slate-100 rounded-lg disabled:opacity-50 shrink-0"
          title="Export Filtered CSV"
        >
          {isExporting ? <Loader2 size={18} className="animate-spin" /> : <FileDown size={18} />}
        </button>
      </div>

      {/* Employee Cards (Mobile) */}
      <div className="block md:hidden space-y-3">
        {filteredEmployees.length > 0 ? (
          filteredEmployees.map((emp) => (
            <div 
              key={emp.id} 
              className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm active:bg-blue-50/30 transition-colors" 
              onClick={() => onSelect(emp)}
            >
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-slate-400 uppercase shrink-0">
                  {emp.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-900">{emp.name}</div>
                  <div className="text-xs text-slate-400 font-medium truncate">ID: {emp.id}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">{emp.designation}</span>
                    <span className="text-xs font-medium text-slate-500 bg-slate-50 px-2 py-0.5 rounded">{emp.department}</span>
                  </div>
                  {(emp.email || emp.phone) && (
                    <div className="mt-2 space-y-1">
                      {emp.email && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium truncate">
                          <Mail size={10} /> {emp.email}
                        </div>
                      )}
                      {emp.phone && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                          <Phone size={10} /> {emp.phone}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 px-4 py-12 text-center text-slate-400 font-medium text-sm">
            {workforceSearchTerm ? 'No employees found matching your search.' : 'No employees added yet.'}
          </div>
        )}
      </div>

      {/* Employee Table (Desktop) */}
      <div className="hidden md:block bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <th className="px-6 lg:px-8 py-5">Employee Info</th>
                <th className="px-6 lg:px-8 py-5">Contact Details</th>
                <th className="px-6 lg:px-8 py-5">Role & Dept</th>
                <th className="px-6 lg:px-8 py-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEmployees.length > 0 ? (
                filteredEmployees.map((emp) => (
                  <tr 
                    key={emp.id} 
                    className="group hover:bg-blue-50/30 cursor-pointer transition-colors" 
                    onClick={() => onSelect(emp)}
                  >
                    <td className="px-6 lg:px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors uppercase shrink-0">
                          {emp.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors truncate">{emp.name}</div>
                          <div className="text-xs text-slate-400 font-medium truncate">ID: {emp.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 lg:px-8 py-5">
                      {emp.email || emp.phone ? (
                        <div className="space-y-1">
                          {emp.email && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium truncate max-w-[180px]">
                              <Mail size={10} className="shrink-0" /> <span className="truncate">{emp.email}</span>
                            </div>
                          )}
                          {emp.phone && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium truncate max-w-[150px]">
                              <Phone size={10} className="shrink-0" /> {emp.phone}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-300 uppercase font-black tracking-widest">Not Provided</span>
                      )}
                    </td>
                    <td className="px-6 lg:px-8 py-5">
                      <div className="text-sm font-bold text-slate-700">{emp.designation}</div>
                      <div className="text-xs text-slate-400 font-medium">{emp.department}</div>
                    </td>
                    <td className="px-6 lg:px-8 py-5 text-right">
                      <button className="text-blue-600 font-bold text-xs uppercase tracking-wider hover:bg-blue-600 hover:text-white px-3 py-1.5 rounded-lg border border-blue-600/10 transition-all">
                        View Profile
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-8 py-20 text-center text-slate-400 font-medium">
                    {workforceSearchTerm ? 'No employees found matching your search.' : 'No employees added yet. Click "Add Employee" to get started.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default EmployeeList;
