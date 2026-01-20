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
  Lock
} from 'lucide-react';
import PayrollRunScreen from './PayrollRunScreen';
import EmployeeList from './EmployeeList';
import EmployeeProfile from './EmployeeProfile';
import EmployeeForm from './EmployeeForm';
import PayrollReport from './PayrollReport';
import PaymentHistory from './PaymentHistory';
import { PayrollEmployee, GradeLevel, EarningType, DeductionType } from './types';
import { storageService } from './services/storageService';
import { useAuth } from '../../context/AuthContext';

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

  const refreshData = () => {
    if (!tenantId) return;
    
    setEarningTypes(storageService.getEarningTypes(tenantId));
    setDeductionTypes(storageService.getDeductionTypes(tenantId));
    setGradeLevels(storageService.getGradeLevels(tenantId));
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
    <div className="space-y-6">
      {/* Sub-navigation tabs */}
      <div className="bg-white/80 backdrop-blur-md border-b border-slate-200 -mx-4 lg:-mx-8 -mt-4 lg:-mt-8 px-4 lg:px-8 mb-6 sticky top-16 z-30 shadow-sm no-print">
        <div className="flex overflow-x-auto no-scrollbar gap-8">
          {hrTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveSubTab(tab.id);
                setSelectedEmployee(null);
                setIsAddingEmployee(false);
              }}
              className={`flex items-center gap-2 py-5 px-1 border-b-2 font-black text-[11px] uppercase tracking-[0.15em] transition-all relative whitespace-nowrap ${
                activeSubTab === tab.id 
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="animate-in fade-in duration-500">
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
          <div className="bg-white p-12 rounded-3xl border border-slate-200 flex flex-col items-center justify-center text-center">
            <Lock size={48} className="text-slate-200 mb-4" />
            <h3 className="text-xl font-bold text-slate-900">Salary Structure Configuration</h3>
            <p className="text-slate-500 max-w-sm mt-2">
              Configuration for {tenant?.companyName || tenant?.name || 'your organization'} is managed at the organizational level.
            </p>
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <h4 className="font-bold text-slate-700 text-sm mb-2">Earning Components</h4>
                <ul className="text-xs text-slate-500 space-y-1">
                  {earningTypes.map((e, i) => (
                    <li key={i}>{e.name}: {e.is_percentage ? `${e.amount}%` : `PKR ${e.amount.toLocaleString()}`}</li>
                  ))}
                </ul>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <h4 className="font-bold text-slate-700 text-sm mb-2">Deduction Components</h4>
                <ul className="text-xs text-slate-500 space-y-1">
                  {deductionTypes.map((d, i) => (
                    <li key={i}>{d.name}: {d.is_percentage ? `${d.amount}%` : `PKR ${d.amount.toLocaleString()}`}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
        
        {activeSubTab === 'history' && <PaymentHistory />}
      </div>
    </div>
  );
};

export default PayrollHub;
