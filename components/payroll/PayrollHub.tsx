/**
 * PayrollHub - Main entry point for the Payroll module
 * 
 * This component manages the payroll sub-navigation and renders the appropriate
 * sub-component based on the active tab.
 */

import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  History,
  Users,
  BarChart3,
} from 'lucide-react';
import PayrollRunScreen from './PayrollRunScreen';
import EmployeeList from './EmployeeList';
import EmployeeProfile from './EmployeeProfile';
import EmployeeForm from './EmployeeForm';
import PayrollReport from './PayrollReport';
import PaymentHistory from './PaymentHistory';
import { PayrollEmployee } from './types';
import { storageService } from './services/storageService';
import { useAuth } from '../../context/AuthContext';
import { usePayrollContext } from '../../context/PayrollContext';
import Tabs from '../ui/Tabs';

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

  // Get tenant ID from auth context
  const tenantId = tenant?.id || '';
  const userId = user?.id || '';
  const userRole = user?.role || '';

  // Check if user is an employee (non-HR role) - for now, we show full access
  const isEmployeeRole = userRole === 'Employee';

  // Trigger refresh when returning from EmployeeForm (employee list refetches on key change)
  const [workforceRefreshKey, setWorkforceRefreshKey] = useState(0);

  // Navigation tabs - simplified: Workforce, Payroll Cycles, Analytics, Payment History
  const hrTabs = [
    { id: 'workforce' as const, label: 'Workforce', icon: Users },
    { id: 'cycles' as const, label: 'Payroll Cycles', icon: CreditCard },
    { id: 'report' as const, label: 'Analytics', icon: BarChart3 },
    { id: 'history' as const, label: 'Payment History', icon: History },
  ];
  const payrollTabLabels = hrTabs.map((t) => t.label);
  const labelToId = Object.fromEntries(hrTabs.map((t) => [t.label, t.id])) as Record<string, typeof hrTabs[0]['id']>;
  const activeTabLabel = hrTabs.find((t) => t.id === activeSubTab)?.label ?? payrollTabLabels[0];

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
          onBack={() => { }}
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
    <div className="flex flex-col h-full -mx-2 -mb-2 sm:-mx-3 sm:-mb-3 md:-mx-4 md:-mb-4 lg:-mx-6 lg:-mb-6 xl:-mx-8 xl:-mb-8">
      {/* Sub-navigation tabs - browser style (same as rental-payout, settings, etc.) */}
      <div className="flex-shrink-0 no-print">
        <Tabs
          variant="browser"
          tabs={payrollTabLabels}
          activeTab={activeTabLabel}
          onTabClick={(label) => {
            const id = labelToId[label];
            if (id) setActiveSubTab(id);
          }}
        />
      </div>

      {/* Tab content - scrollable area below tabs, seamless with active tab */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden bg-white rounded-b-lg -mt-px p-2 sm:p-3 md:p-4 lg:p-6 xl:p-8 pb-20 sm:pb-24 md:pb-6 animate-in fade-in duration-500">
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
                setWorkforceRefreshKey(k => k + 1);
              }}
            />
          ) : (
            <EmployeeList
              key={workforceRefreshKey}
              onSelect={setSelectedEmployee}
              onAdd={() => setIsAddingEmployee(true)}
            />
          )
        )}

        {activeSubTab === 'cycles' && <PayrollRunScreen />}

        {activeSubTab === 'report' && <PayrollReport />}

        {activeSubTab === 'history' && <PaymentHistory />}
      </div>
    </div>
  );
};

export default PayrollHub;
