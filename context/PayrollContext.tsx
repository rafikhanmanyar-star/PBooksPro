/**
 * PayrollContext - Preserves payroll page state across navigation
 * 
 * This context maintains the state of the payroll module so that
 * when users navigate away and come back, their view preferences
 * (active tab, selected employee, search terms, filters) are preserved.
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { PayrollEmployee, PayrollRun } from '../components/payroll/types';

// Sub-tab types for payroll navigation
export type PayrollSubTab = 'workforce' | 'cycles' | 'report' | 'structure' | 'history';

// State interface for PayrollContext
interface PayrollState {
  // Navigation
  activeSubTab: PayrollSubTab;
  
  // Workforce tab state
  selectedEmployee: PayrollEmployee | null;
  isAddingEmployee: boolean;
  workforceSearchTerm: string;
  
  // Payroll Cycles tab state
  selectedRunDetail: PayrollRun | null;
  isCreatingRun: boolean;
  cyclesSearchTerm: string;
  
  // Payment History tab state
  historySearchTerm: string;
  historyFilterYear: string;
  selectedBatch: PayrollRun | null;
  
  // Analytics/Report tab state
  reportPeriod: string;
  reportYear: number;
}

// Actions that can be performed on the state
interface PayrollContextValue extends PayrollState {
  // Navigation
  setActiveSubTab: (tab: PayrollSubTab) => void;
  
  // Workforce actions
  setSelectedEmployee: (employee: PayrollEmployee | null) => void;
  setIsAddingEmployee: (isAdding: boolean) => void;
  setWorkforceSearchTerm: (term: string) => void;
  
  // Cycles actions
  setSelectedRunDetail: (run: PayrollRun | null) => void;
  setIsCreatingRun: (isCreating: boolean) => void;
  setCyclesSearchTerm: (term: string) => void;
  
  // History actions
  setHistorySearchTerm: (term: string) => void;
  setHistoryFilterYear: (year: string) => void;
  setSelectedBatch: (batch: PayrollRun | null) => void;
  
  // Report actions
  setReportPeriod: (period: string) => void;
  setReportYear: (year: number) => void;
  
  // Reset functions
  resetWorkforceState: () => void;
  resetCyclesState: () => void;
  resetHistoryState: () => void;
  resetAllState: () => void;
}

// Initial state values
const initialState: PayrollState = {
  activeSubTab: 'workforce',
  selectedEmployee: null,
  isAddingEmployee: false,
  workforceSearchTerm: '',
  selectedRunDetail: null,
  isCreatingRun: false,
  cyclesSearchTerm: '',
  historySearchTerm: '',
  historyFilterYear: 'All',
  selectedBatch: null,
  reportPeriod: 'monthly',
  reportYear: new Date().getFullYear(),
};

// Create the context
const PayrollContext = createContext<PayrollContextValue | undefined>(undefined);

// Provider component
interface PayrollProviderProps {
  children: ReactNode;
}

export const PayrollProvider: React.FC<PayrollProviderProps> = ({ children }) => {
  // Navigation state
  const [activeSubTab, setActiveSubTab] = useState<PayrollSubTab>(initialState.activeSubTab);
  
  // Workforce tab state
  const [selectedEmployee, setSelectedEmployee] = useState<PayrollEmployee | null>(initialState.selectedEmployee);
  const [isAddingEmployee, setIsAddingEmployee] = useState(initialState.isAddingEmployee);
  const [workforceSearchTerm, setWorkforceSearchTerm] = useState(initialState.workforceSearchTerm);
  
  // Cycles tab state
  const [selectedRunDetail, setSelectedRunDetail] = useState<PayrollRun | null>(initialState.selectedRunDetail);
  const [isCreatingRun, setIsCreatingRun] = useState(initialState.isCreatingRun);
  const [cyclesSearchTerm, setCyclesSearchTerm] = useState(initialState.cyclesSearchTerm);
  
  // History tab state
  const [historySearchTerm, setHistorySearchTerm] = useState(initialState.historySearchTerm);
  const [historyFilterYear, setHistoryFilterYear] = useState(initialState.historyFilterYear);
  const [selectedBatch, setSelectedBatch] = useState<PayrollRun | null>(initialState.selectedBatch);
  
  // Report tab state
  const [reportPeriod, setReportPeriod] = useState(initialState.reportPeriod);
  const [reportYear, setReportYear] = useState(initialState.reportYear);
  
  // Reset functions
  const resetWorkforceState = useCallback(() => {
    setSelectedEmployee(null);
    setIsAddingEmployee(false);
    setWorkforceSearchTerm('');
  }, []);
  
  const resetCyclesState = useCallback(() => {
    setSelectedRunDetail(null);
    setIsCreatingRun(false);
    setCyclesSearchTerm('');
  }, []);
  
  const resetHistoryState = useCallback(() => {
    setHistorySearchTerm('');
    setHistoryFilterYear('All');
    setSelectedBatch(null);
  }, []);
  
  const resetAllState = useCallback(() => {
    setActiveSubTab('workforce');
    resetWorkforceState();
    resetCyclesState();
    resetHistoryState();
    setReportPeriod('monthly');
    setReportYear(new Date().getFullYear());
  }, [resetWorkforceState, resetCyclesState, resetHistoryState]);
  
  const value: PayrollContextValue = {
    // State
    activeSubTab,
    selectedEmployee,
    isAddingEmployee,
    workforceSearchTerm,
    selectedRunDetail,
    isCreatingRun,
    cyclesSearchTerm,
    historySearchTerm,
    historyFilterYear,
    selectedBatch,
    reportPeriod,
    reportYear,
    
    // Actions
    setActiveSubTab,
    setSelectedEmployee,
    setIsAddingEmployee,
    setWorkforceSearchTerm,
    setSelectedRunDetail,
    setIsCreatingRun,
    setCyclesSearchTerm,
    setHistorySearchTerm,
    setHistoryFilterYear,
    setSelectedBatch,
    setReportPeriod,
    setReportYear,
    
    // Reset functions
    resetWorkforceState,
    resetCyclesState,
    resetHistoryState,
    resetAllState,
  };
  
  return (
    <PayrollContext.Provider value={value}>
      {children}
    </PayrollContext.Provider>
  );
};

// Custom hook to use the PayrollContext
export const usePayrollContext = (): PayrollContextValue => {
  const context = useContext(PayrollContext);
  if (context === undefined) {
    throw new Error('usePayrollContext must be used within a PayrollProvider');
  }
  return context;
};

export default PayrollContext;
