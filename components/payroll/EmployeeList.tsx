/**
 * EmployeeList - Displays all employees in the payroll system
 */

import React, { useState, useMemo } from 'react';
import { Search, UserPlus, FileDown, Mail, Phone, Loader2 } from 'lucide-react';
import { storageService } from './services/storageService';
import { PayrollEmployee, EmployeeListProps } from './types';
import { useAuth } from '../../context/AuthContext';

const EmployeeList: React.FC<EmployeeListProps> = ({ onSelect, onAdd }) => {
  const { tenant } = useAuth();
  const tenantId = tenant?.id || '';
  
  const [isExporting, setIsExporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Get employees from storage
  const employees = useMemo(() => {
    if (!tenantId) return [];
    return storageService.getEmployees(tenantId);
  }, [tenantId]);

  // Filter employees based on search
  const filteredEmployees = useMemo(() => {
    if (!searchTerm) return employees;
    const term = searchTerm.toLowerCase();
    return employees.filter(emp => 
      emp.name.toLowerCase().includes(term) ||
      emp.department.toLowerCase().includes(term) ||
      emp.designation.toLowerCase().includes(term) ||
      emp.id.toLowerCase().includes(term) ||
      (emp.email?.toLowerCase().includes(term))
    );
  }, [employees, searchTerm]);

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

  if (!tenantId) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-slate-400 font-bold">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Workforce</h1>
          <p className="text-slate-500 text-sm">Management of employee payroll profiles and status.</p>
        </div>
        <button 
          onClick={onAdd}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center gap-2"
        >
          <UserPlus size={18} /> Add Employee
        </button>
      </div>

      {/* Search and Export */}
      <div className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm focus-within:ring-2 ring-blue-500/20 transition-all">
        <Search size={20} className="text-slate-400" />
        <input 
          type="text" 
          placeholder="Search workforce by name, department, ID..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 outline-none text-slate-700 placeholder-slate-400 bg-transparent text-sm font-medium"
        />
        <div className="h-6 w-[1px] bg-slate-200 mx-2"></div>
        <button 
          onClick={handleExportCSV}
          disabled={isExporting}
          className="text-slate-400 hover:text-slate-900 transition-colors p-2 hover:bg-slate-100 rounded-lg disabled:opacity-50"
          title="Export Filtered CSV"
        >
          {isExporting ? <Loader2 size={18} className="animate-spin" /> : <FileDown size={18} />}
        </button>
      </div>

      {/* Employee Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <th className="px-8 py-5">Employee Info</th>
              <th className="px-8 py-5">Contact Details</th>
              <th className="px-8 py-5">Role & Dept</th>
              <th className="px-8 py-5 text-right">Actions</th>
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
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors uppercase">
                        {emp.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors">{emp.name}</div>
                        <div className="text-xs text-slate-400 font-medium">ID: {emp.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    {emp.email || emp.phone ? (
                      <div className="space-y-1">
                        {emp.email && (
                          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium truncate max-w-[150px]">
                            <Mail size={10} /> {emp.email}
                          </div>
                        )}
                        {emp.phone && (
                          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium truncate max-w-[150px]">
                            <Phone size={10} /> {emp.phone}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-300 uppercase font-black tracking-widest">Not Provided</span>
                    )}
                  </td>
                  <td className="px-8 py-5">
                    <div className="text-sm font-bold text-slate-700">{emp.designation}</div>
                    <div className="text-xs text-slate-400 font-medium">{emp.department}</div>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <button className="text-blue-600 font-bold text-xs uppercase tracking-wider hover:bg-blue-600 hover:text-white px-3 py-1.5 rounded-lg border border-blue-600/10 transition-all">
                      View Profile
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-8 py-20 text-center text-slate-400 font-medium">
                  {searchTerm ? 'No employees found matching your search.' : 'No employees added yet. Click "Add Employee" to get started.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default EmployeeList;
