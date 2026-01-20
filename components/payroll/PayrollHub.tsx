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
  Wallet,
  Save,
  Loader2
} from 'lucide-react';
import PayrollRunScreen from './PayrollRunScreen';
import EmployeeList from './EmployeeList';
import EmployeeProfile from './EmployeeProfile';
import EmployeeForm from './EmployeeForm';
import PayrollReport from './PayrollReport';
import PaymentHistory from './PaymentHistory';
import SalaryConfigModal from './modals/SalaryConfigModal';
import GradeConfigModal from './modals/GradeConfigModal';
import { PayrollEmployee, GradeLevel, EarningType, DeductionType } from './types';
import { storageService } from './services/storageService';
import { payrollApi } from '../../services/api/payrollApi';
import { apiClient } from '../../services/api/client';
import { useAuth } from '../../context/AuthContext';
import { Account, Category, Project, TransactionType } from '../../types';

type PayrollSubTab = 'workforce' | 'cycles' | 'report' | 'structure' | 'history';

const PayrollHub: React.FC = () => {
  // Use AuthContext for tenant and user info
  const { user, tenant } = useAuth();
  
  const [activeSubTab, setActiveSubTab] = useState<PayrollSubTab>('workforce');
  const [selectedEmployee, setSelectedEmployee] = useState<PayrollEmployee | null>(null);
  const [isAddingEmployee, setIsAddingEmployee] = useState(false);
  const [earningTypes, setEarningTypes] = useState<EarningType[]>([]);
  const [deductionTypes, setDeductionTypes] = useState<DeductionType[]>([]);
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  
  // Modal states for salary structure configuration
  const [isEarningModalOpen, setIsEarningModalOpen] = useState(false);
  const [isDeductionModalOpen, setIsDeductionModalOpen] = useState(false);
  const [isGradeModalOpen, setIsGradeModalOpen] = useState(false);
  const [editingEarning, setEditingEarning] = useState<EarningType | null>(null);
  const [editingDeduction, setEditingDeduction] = useState<DeductionType | null>(null);
  const [editingGrade, setEditingGrade] = useState<GradeLevel | null>(null);
  
  // Payment settings state
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [payrollSettings, setPayrollSettings] = useState({
    defaultAccountId: '',
    defaultCategoryId: '',
    defaultProjectId: ''
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

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
      const [apiEarnings, apiDeductions, apiGrades, accountsData, categoriesData, projectsData, settings] = await Promise.all([
        payrollApi.getEarningTypes(),
        payrollApi.getDeductionTypes(),
        payrollApi.getGradeLevels(),
        apiClient.get<Account[]>('/accounts').catch(() => []),
        apiClient.get<Category[]>('/categories').catch(() => []),
        apiClient.get<Project[]>('/projects').catch(() => []),
        payrollApi.getPayrollSettings()
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
      
      // Set accounts, categories, projects for payment settings
      setAccounts(accountsData || []);
      setCategories((categoriesData || []).filter(c => c.type === TransactionType.EXPENSE));
      setProjects(projectsData || []);
      
      // Set payroll settings
      setPayrollSettings({
        defaultAccountId: settings.defaultAccountId || '',
        defaultCategoryId: settings.defaultCategoryId || '',
        defaultProjectId: settings.defaultProjectId || ''
      });
    } catch (error) {
      console.warn('Failed to fetch from API, using localStorage:', error);
      setEarningTypes(storageService.getEarningTypes(tenantId));
      setDeductionTypes(storageService.getDeductionTypes(tenantId));
      setGradeLevels(storageService.getGradeLevels(tenantId));
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
                setActiveSubTab(tab.id);
                setSelectedEmployee(null);
                setIsAddingEmployee(false);
              }}
              className={`flex items-center gap-1.5 sm:gap-2 py-3 sm:py-5 px-2 sm:px-1 border-b-2 font-black text-[10px] sm:text-[11px] uppercase tracking-wider sm:tracking-[0.15em] transition-all relative whitespace-nowrap ${
                activeSubTab === tab.id 
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              <tab.icon size={14} className="sm:w-4 sm:h-4" />
              <span className="hidden xs:inline sm:inline">{tab.label}</span>
              <span className="xs:hidden">{tab.label.split(' ')[0]}</span>
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
          <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Salary Structure</h1>
                <p className="text-slate-500 text-xs sm:text-sm">Configure earning components, deductions, and grade levels for {tenant?.companyName || tenant?.name || 'your organization'}.</p>
              </div>
            </div>

            {/* Earning Components */}
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 sm:px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp size={18} className="text-emerald-600" />
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Earning Components</h3>
                </div>
                <button 
                  onClick={() => { setEditingEarning(null); setIsEarningModalOpen(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors"
                >
                  <Plus size={14} /> Add
                </button>
              </div>
              <div className="p-4 sm:p-6">
                {earningTypes.length === 0 ? (
                  <p className="text-center text-slate-400 py-8 text-sm">No earning components configured. Click "Add" to create one.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {earningTypes.map((e, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-emerald-50/50 rounded-xl border border-emerald-100 group hover:border-emerald-200 transition-colors">
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{e.name}</p>
                          <p className="text-xs text-emerald-600 font-medium">
                            {e.is_percentage ? `${e.amount}% of Basic` : `PKR ${e.amount.toLocaleString()}`}
                          </p>
                        </div>
                        <button 
                          onClick={() => { setEditingEarning(e); setIsEarningModalOpen(true); }}
                          className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Edit3 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Deduction Components */}
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 sm:px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingDown size={18} className="text-red-600" />
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Deduction Components</h3>
                </div>
                <button 
                  onClick={() => { setEditingDeduction(null); setIsDeductionModalOpen(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-colors"
                >
                  <Plus size={14} /> Add
                </button>
              </div>
              <div className="p-4 sm:p-6">
                {deductionTypes.length === 0 ? (
                  <p className="text-center text-slate-400 py-8 text-sm">No deduction components configured. Click "Add" to create one.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {deductionTypes.map((d, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-red-50/50 rounded-xl border border-red-100 group hover:border-red-200 transition-colors">
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{d.name}</p>
                          <p className="text-xs text-red-600 font-medium">
                            {d.is_percentage ? `${d.amount}% of Gross` : `PKR ${d.amount.toLocaleString()}`}
                          </p>
                        </div>
                        <button 
                          onClick={() => { setEditingDeduction(d); setIsDeductionModalOpen(true); }}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-100 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Edit3 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Grade Levels */}
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 sm:px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Award size={18} className="text-blue-600" />
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Grade Levels</h3>
                </div>
                <button 
                  onClick={() => { setEditingGrade(null); setIsGradeModalOpen(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors"
                >
                  <Plus size={14} /> Add
                </button>
              </div>
              <div className="p-4 sm:p-6">
                {gradeLevels.length === 0 ? (
                  <p className="text-center text-slate-400 py-8 text-sm">No grade levels configured. Click "Add" to create one.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {gradeLevels.map((g, i) => (
                      <div key={i} className="flex items-center justify-between p-4 bg-blue-50/50 rounded-xl border border-blue-100 group hover:border-blue-200 transition-colors">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 bg-blue-600 text-white text-[10px] font-bold rounded">{g.name}</span>
                            <span className="text-xs text-slate-500">{g.description}</span>
                          </div>
                          <p className="text-xs text-blue-600 font-medium">
                            PKR {g.min_salary.toLocaleString()} - {g.max_salary.toLocaleString()}
                          </p>
                        </div>
                        <button 
                          onClick={() => { setEditingGrade(g); setIsGradeModalOpen(true); }}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Edit3 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Payment Settings */}
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 sm:px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet size={18} className="text-purple-600" />
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Payment Settings</h3>
                </div>
              </div>
              <div className="p-4 sm:p-6 space-y-4">
                <p className="text-xs text-slate-500 mb-4">Configure default account and expense category for salary payments.</p>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Default Payment Account</label>
                    <select
                      value={payrollSettings.defaultAccountId}
                      onChange={(e) => setPayrollSettings({ ...payrollSettings, defaultAccountId: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-sm"
                    >
                      <option value="">Select Account</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>{acc.name} ({acc.type})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Default Expense Category</label>
                    <select
                      value={payrollSettings.defaultCategoryId}
                      onChange={(e) => setPayrollSettings({ ...payrollSettings, defaultCategoryId: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-sm"
                    >
                      <option value="">Select Category</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Default Project</label>
                    <select
                      value={payrollSettings.defaultProjectId}
                      onChange={(e) => setPayrollSettings({ ...payrollSettings, defaultProjectId: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-sm"
                    >
                      <option value="">None (Use Employee's Project)</option>
                      {projects.map((proj) => (
                        <option key={proj.id} value={proj.id}>{proj.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                
                <div className="pt-4 border-t border-slate-100">
                  <button
                    onClick={async () => {
                      setIsSavingSettings(true);
                      try {
                        await payrollApi.updatePayrollSettings({
                          defaultAccountId: payrollSettings.defaultAccountId || null,
                          defaultCategoryId: payrollSettings.defaultCategoryId || null,
                          defaultProjectId: payrollSettings.defaultProjectId || null
                        });
                      } catch (error) {
                        console.error('Failed to save payroll settings:', error);
                      } finally {
                        setIsSavingSettings(false);
                      }
                    }}
                    disabled={isSavingSettings}
                    className="px-4 py-2 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-all flex items-center gap-2 disabled:opacity-50 text-sm"
                  >
                    {isSavingSettings ? (
                      <><Loader2 size={16} className="animate-spin" /> Saving...</>
                    ) : (
                      <><Save size={16} /> Save Settings</>
                    )}
                  </button>
                </div>
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
          </div>
        )}
        
        {activeSubTab === 'history' && <PaymentHistory />}
      </div>
    </div>
  );
};

export default PayrollHub;
