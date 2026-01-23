/**
 * PayrollHub - Main entry point for the Payroll module
 * 
 * This component manages the payroll sub-navigation and renders the appropriate
 * sub-component based on the active tab.
 */

import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  Settings2, 
  History,
  Users,
  BarChart3,
  Plus,
  Edit3,
  Trash2,
  TrendingUp,
  TrendingDown,
  Award,
  Building2,
} from 'lucide-react';
import PayrollRunScreen from './PayrollRunScreen';
import EmployeeList from './EmployeeList';
import EmployeeProfile from './EmployeeProfile';
import EmployeeForm from './EmployeeForm';
import PayrollReport from './PayrollReport';
import PaymentHistory from './PaymentHistory';
import SalaryConfigModal from './modals/SalaryConfigModal';
import GradeConfigModal from './modals/GradeConfigModal';
import DepartmentConfigModal from './modals/DepartmentConfigModal';
import { PayrollEmployee, GradeLevel, Department, EarningType, DeductionType } from './types';
import { storageService } from './services/storageService';
import { payrollApi } from '../../services/api/payrollApi';
import { useAuth } from '../../context/AuthContext';
import { usePayrollContext, PayrollSubTab } from '../../context/PayrollContext';
import { formatCurrency } from './utils/formatters';

const PayrollHub: React.FC = () => {
  // Use AuthContext for tenant and user info
  const { user, tenant } = useAuth();
  
  // Use PayrollContext for preserving state across navigation
  const {
    activeSubTab,
    setActiveSubTab,
    selectedEmployee,
    setSelectedEmployee,
    isAddingEmployee,
    setIsAddingEmployee,
  } = usePayrollContext();
  
  const [earningTypes, setEarningTypes] = useState<EarningType[]>([]);
  const [deductionTypes, setDeductionTypes] = useState<DeductionType[]>([]);
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  
  // Modal states for salary structure configuration
  const [isEarningModalOpen, setIsEarningModalOpen] = useState(false);
  const [isDeductionModalOpen, setIsDeductionModalOpen] = useState(false);
  const [isGradeModalOpen, setIsGradeModalOpen] = useState(false);
  const [isDepartmentModalOpen, setIsDepartmentModalOpen] = useState(false);
  const [editingEarning, setEditingEarning] = useState<EarningType | null>(null);
  const [editingDeduction, setEditingDeduction] = useState<DeductionType | null>(null);
  const [editingGrade, setEditingGrade] = useState<GradeLevel | null>(null);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  

  // Get tenant ID from auth context
  const tenantId = tenant?.id || '';
  const userId = user?.id || '';
  const userRole = user?.role || '';

  // Check if user is an employee (non-HR role) - for now, we show full access
  const isEmployeeRole = userRole === 'Employee';

  useEffect(() => {
    if (tenantId) {
      refreshData();
    }
  }, [activeSubTab, tenantId]);

  const refreshData = async () => {
    if (!tenantId) return;
    
    try {
      // Fetch from cloud API first, fallback to localStorage
      const [apiEarnings, apiDeductions, apiGrades, apiDepartments] = await Promise.all([
        payrollApi.getEarningTypes(),
        payrollApi.getDeductionTypes(),
        payrollApi.getGradeLevels(),
        payrollApi.getDepartments()
      ]);
      
      // Use API data if available, otherwise fallback to localStorage
      if (apiEarnings.length > 0) {
        setEarningTypes(apiEarnings);
      } else {
        setEarningTypes(storageService.getEarningTypes(tenantId));
      }
      
      if (apiDeductions.length > 0) {
        setDeductionTypes(apiDeductions);
      } else {
        setDeductionTypes(storageService.getDeductionTypes(tenantId));
      }
      
      if (apiGrades.length > 0) {
        setGradeLevels(apiGrades);
      } else {
        setGradeLevels(storageService.getGradeLevels(tenantId));
      }
      
      if (apiDepartments.length > 0) {
        setDepartments(apiDepartments);
      } else {
        setDepartments(storageService.getDepartments(tenantId));
      }
    } catch (error) {
      console.warn('Failed to fetch from API, using localStorage:', error);
      setEarningTypes(storageService.getEarningTypes(tenantId));
      setDeductionTypes(storageService.getDeductionTypes(tenantId));
      setGradeLevels(storageService.getGradeLevels(tenantId));
      setDepartments(storageService.getDepartments(tenantId));
    }
  };

  // Navigation tabs
  const hrTabs = [
    { id: 'workforce' as const, label: 'Workforce', icon: Users },
    { id: 'cycles' as const, label: 'Payroll Cycles', icon: CreditCard },
    { id: 'report' as const, label: 'Analytics', icon: BarChart3 },
    { id: 'structure' as const, label: 'Salary Structure', icon: Settings2 },
    { id: 'history' as const, label: 'Payment History', icon: History },
  ];

  // If no tenant, show loading or error
  if (!tenantId) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-slate-400 font-bold">Loading payroll module...</p>
      </div>
    );
  }

  // For employee-only role, show their profile only
  if (isEmployeeRole) {
    const employees = storageService.getEmployees(tenantId);
    const selfEmployee = employees.find(e => e.email === user?.username) || employees[0];
    
    if (selfEmployee) {
      return (
        <EmployeeProfile 
          employee={selfEmployee} 
          onBack={() => {}} 
        />
      );
    }
    
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-slate-400 font-bold">Initializing your secure profile...</p>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col -m-2 sm:-m-3 md:-m-4 lg:-m-6 xl:-m-8">
      {/* Sub-navigation tabs - Fixed at top of payroll section */}
      <div className="flex-shrink-0 bg-white/95 backdrop-blur-md border-b border-slate-200 px-2 sm:px-4 lg:px-8 z-30 shadow-sm no-print">
        <div className="flex overflow-x-auto no-scrollbar gap-1 sm:gap-8">
          {hrTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                // Only switch tab - don't reset employee state to preserve view when returning
                setActiveSubTab(tab.id);
              }}
              className={`flex items-center gap-1.5 sm:gap-2 py-3 sm:pt-[39px] sm:pb-[39px] px-2 sm:px-0 sm:my-[15px] sm:mx-[3px] border-b-2 font-black text-[10px] sm:text-[11px] uppercase tracking-wider sm:tracking-[0.15em] transition-all relative whitespace-nowrap ${
                activeSubTab === tab.id 
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              <tab.icon size={14} className="sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab content - scrollable area below fixed navigation */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-3 md:p-4 lg:p-6 xl:p-8 pb-20 sm:pb-24 md:pb-6 animate-in fade-in duration-500">
        {activeSubTab === 'workforce' && (
          selectedEmployee ? (
            <EmployeeProfile 
              employee={selectedEmployee} 
              onBack={() => setSelectedEmployee(null)} 
            />
          ) : isAddingEmployee ? (
            <EmployeeForm 
              onBack={() => setIsAddingEmployee(false)} 
              onSave={() => { 
                setIsAddingEmployee(false); 
                refreshData(); 
              }} 
            />
          ) : (
            <EmployeeList 
              onSelect={setSelectedEmployee} 
              onAdd={() => setIsAddingEmployee(true)} 
            />
          )
        )}
        
        {activeSubTab === 'cycles' && <PayrollRunScreen />}
        
        {activeSubTab === 'report' && <PayrollReport />}
        
        {activeSubTab === 'structure' && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">Salary Structure</h1>
                <p className="text-slate-500 text-[11px] sm:text-xs">Configure earning components, deductions, grade levels and departments.</p>
              </div>
            </div>

            {/* Earning Components */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-3 sm:px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp size={16} className="text-emerald-600" />
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Earning Components</h3>
                  <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded">{earningTypes.length}</span>
                </div>
                <button 
                  onClick={() => { setEditingEarning(null); setIsEarningModalOpen(true); }}
                  className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-[10px] font-bold hover:bg-emerald-700 transition-colors"
                >
                  <Plus size={12} /> Add
                </button>
              </div>
              <div className="p-2">
                {earningTypes.length === 0 ? (
                  <p className="text-center text-slate-400 py-4 text-xs">No earning components configured. Click "Add" to create one.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {earningTypes.map((e, i) => (
                      <div key={i} className="flex items-center justify-between px-2.5 py-2 bg-emerald-50/50 hover:bg-emerald-100/50 rounded-lg border border-emerald-100 transition-colors">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="w-6 h-6 rounded bg-emerald-600 flex items-center justify-center flex-shrink-0">
                            <TrendingUp size={12} className="text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-slate-900 text-xs truncate">{e.name}</p>
                            <p className="text-[10px] text-emerald-600 font-medium">
                              {e.is_percentage ? `${e.amount}% of Basic` : `PKR ${formatCurrency(e.amount)}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${e.is_percentage ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                            {e.is_percentage ? '%' : 'Fixed'}
                          </span>
                          <button 
                            onClick={() => { setEditingEarning(e); setIsEarningModalOpen(true); }}
                            className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-200 rounded transition-colors"
                          >
                            <Edit3 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Deduction Components */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-3 sm:px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingDown size={16} className="text-red-600" />
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Deduction Components</h3>
                  <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded">{deductionTypes.length}</span>
                </div>
                <button 
                  onClick={() => { setEditingDeduction(null); setIsDeductionModalOpen(true); }}
                  className="flex items-center gap-1 px-2.5 py-1 bg-red-600 text-white rounded-lg text-[10px] font-bold hover:bg-red-700 transition-colors"
                >
                  <Plus size={12} /> Add
                </button>
              </div>
              <div className="p-2">
                {deductionTypes.length === 0 ? (
                  <p className="text-center text-slate-400 py-4 text-xs">No deduction components configured. Click "Add" to create one.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {deductionTypes.map((d, i) => (
                      <div key={i} className="flex items-center justify-between px-2.5 py-2 bg-red-50/50 hover:bg-red-100/50 rounded-lg border border-red-100 transition-colors">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="w-6 h-6 rounded bg-red-600 flex items-center justify-center flex-shrink-0">
                            <TrendingDown size={12} className="text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-slate-900 text-xs truncate">{d.name}</p>
                            <p className="text-[10px] text-red-600 font-medium">
                              {d.is_percentage ? `${d.amount}% of Gross` : `PKR ${formatCurrency(d.amount)}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${d.is_percentage ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                            {d.is_percentage ? '%' : 'Fixed'}
                          </span>
                          <button 
                            onClick={() => { setEditingDeduction(d); setIsDeductionModalOpen(true); }}
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-200 rounded transition-colors"
                          >
                            <Edit3 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Grade Levels */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-3 sm:px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Award size={16} className="text-blue-600" />
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Grade Levels</h3>
                  <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded">{gradeLevels.length}</span>
                </div>
                <button 
                  onClick={() => { setEditingGrade(null); setIsGradeModalOpen(true); }}
                  className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white rounded-lg text-[10px] font-bold hover:bg-blue-700 transition-colors"
                >
                  <Plus size={12} /> Add
                </button>
              </div>
              <div className="p-2">
                {gradeLevels.length === 0 ? (
                  <p className="text-center text-slate-400 py-4 text-xs">No grade levels configured. Click "Add" to create one.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {gradeLevels.map((g, i) => (
                      <div key={i} className="flex items-center justify-between px-2.5 py-2 bg-blue-50/50 hover:bg-blue-100/50 rounded-lg border border-blue-100 transition-colors">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-[9px] font-bold">{g.name.substring(0, 2).toUpperCase()}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-slate-900 text-xs truncate">{g.name}</p>
                            <p className="text-[10px] text-blue-600 font-medium truncate">
                              {formatCurrency(g.min_salary)} - {formatCurrency(g.max_salary)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {g.description && (
                            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-medium truncate max-w-[60px]" title={g.description}>
                              {g.description}
                            </span>
                          )}
                          <button 
                            onClick={() => { setEditingGrade(g); setIsGradeModalOpen(true); }}
                            className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-200 rounded transition-colors"
                          >
                            <Edit3 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Departments */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-3 sm:px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 size={16} className="text-purple-600" />
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Departments</h3>
                  <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold rounded">{departments.length}</span>
                </div>
                <button 
                  onClick={() => { setEditingDepartment(null); setIsDepartmentModalOpen(true); }}
                  className="flex items-center gap-1 px-2.5 py-1 bg-purple-600 text-white rounded-lg text-[10px] font-bold hover:bg-purple-700 transition-colors"
                >
                  <Plus size={12} /> Add
                </button>
              </div>
              <div className="p-2">
                {departments.length === 0 ? (
                  <p className="text-center text-slate-400 py-4 text-xs">No departments configured. Click "Add" to create one.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {departments.map((d, i) => (
                      <div key={i} className={`flex items-center justify-between px-2.5 py-2 rounded-lg border transition-colors ${d.is_active ? 'bg-purple-50/50 hover:bg-purple-100/50 border-purple-100' : 'bg-slate-50/50 hover:bg-slate-100/50 border-slate-200 opacity-70'}`}>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 ${d.is_active ? 'bg-purple-600' : 'bg-slate-400'}`}>
                            <Building2 size={12} className="text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-slate-900 text-xs truncate">{d.name}</p>
                            <p className="text-[10px] text-slate-500 font-medium truncate">
                              {d.description || (d.employee_count ? `${d.employee_count} employees` : 'No description')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${d.is_active ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
                            {d.is_active ? 'Active' : 'Off'}
                          </span>
                          <button 
                            onClick={() => { setEditingDepartment(d); setIsDepartmentModalOpen(true); }}
                            className="p-1 text-slate-400 hover:text-purple-600 hover:bg-purple-200 rounded transition-colors"
                          >
                            <Edit3 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Configuration Modals */}
            <SalaryConfigModal 
              isOpen={isEarningModalOpen}
              onClose={() => { setIsEarningModalOpen(false); setEditingEarning(null); }}
              type="earning"
              initialData={editingEarning}
              onSave={() => refreshData()}
            />
            <SalaryConfigModal 
              isOpen={isDeductionModalOpen}
              onClose={() => { setIsDeductionModalOpen(false); setEditingDeduction(null); }}
              type="deduction"
              initialData={editingDeduction}
              onSave={() => refreshData()}
            />
            <GradeConfigModal 
              isOpen={isGradeModalOpen}
              onClose={() => { setIsGradeModalOpen(false); setEditingGrade(null); }}
              initialData={editingGrade}
              onSave={() => refreshData()}
            />
            <DepartmentConfigModal 
              isOpen={isDepartmentModalOpen}
              onClose={() => { setIsDepartmentModalOpen(false); setEditingDepartment(null); }}
              initialData={editingDepartment}
              onSave={() => refreshData()}
            />
          </div>
        )}
        
        {activeSubTab === 'history' && <PaymentHistory />}
      </div>
    </div>
  );
};

export default PayrollHub;
