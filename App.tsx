
import React, { useEffect, useState, useMemo, Suspense, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import Sidebar from './components/layout/Sidebar';
import { Page, TransactionType } from './types';
import { useAppContext } from './context/AppContext';
import ErrorBoundary from './components/ErrorBoundary';
import ProgressDisplay from './components/ui/ProgressDisplay';
import CustomKeyboard from './components/ui/CustomKeyboard';
import { useKeyboard } from './context/KeyboardContext';
import KPIPanel from './components/kpi/KPIPanel';
import { useKpis } from './context/KPIContext';
import KPIDrilldown from './components/kpi/KPIDrilldown';
import ScrollToTop from './components/ui/ScrollToTop';
import Loading from './components/ui/Loading';
import { useLicense } from './context/LicenseContext';
import LicenseLockScreen from './components/license/LicenseLockScreen';
import LoginPage from './components/auth/LoginPage';
import { syncService } from './services/SyncService';
import UpdateNotification from './components/ui/UpdateNotification';
import { createBackup, restoreBackup } from './services/backupService';
import { useProgress } from './context/ProgressContext';

// Note: electronAPI type declarations are in other files (UpdateCheck.tsx, UpdateNotification.tsx)
// Using type assertion (window as any).electronAPI to avoid type conflicts

// Lazy Load Components
const DashboardPage = React.lazy(() => import('./components/dashboard/DashboardPage'));
const TransactionsPage = React.lazy(() => import('./components/transactions/TransactionsPage'));
const SettingsPage = React.lazy(() => import('./components/settings/SettingsPage'));
const ImportPage = React.lazy(() => import('./components/settings/ImportPage'));
const RentalManagementPage = React.lazy(() => import('./components/rentalManagement/RentalManagementPage'));
const ProjectManagementPage = React.lazy(() => import('./components/projectManagement/ProjectManagementPage'));
const LoanManagementPage = React.lazy(() => import('./components/loans/LoanManagementPage'));
const VendorDirectoryPage = React.lazy(() => import('./components/vendors/VendorDirectoryPage'));
const ContactsPage = React.lazy(() => import('./components/contacts/ContactsPage'));
const TodoList = React.lazy(() => import('./components/TodoList').then(module => ({ default: module.TodoList })));
const BudgetManagement = React.lazy(() => import('./components/settings/BudgetManagement'));
const MobilePaymentsPage = React.lazy(() => import('./components/mobile/MobilePaymentsPage'));
const GlobalPayrollPage = React.lazy(() => import('./components/payroll/GlobalPayrollPage')); // Added

// Define page groups to determine which component instance handles which routes
const PAGE_GROUPS = {
  DASHBOARD: ['dashboard'],
  TRANSACTIONS: ['transactions'],
  PAYMENTS: ['payments'],
  LOANS: ['loans'],
  VENDORS: ['vendorDirectory'],
  CONTACTS: ['contacts'],
  BUDGETS: ['budgets'],
  TASKS: ['tasks'],
  RENTAL: ['rentalManagement', 'rentalInvoices', 'rentalAgreements', 'ownerPayouts'],
  PROJECT: ['projectManagement', 'projectInvoices', 'bills'],
  PAYROLL: ['payroll'], // Added Payroll Group
  SETTINGS: ['settings'],
  IMPORT: ['import'],
};

const App: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const { currentPage, currentUser } = state;
  const { isOpen: isCustomKeyboardOpen } = useKeyboard();
  const { isPanelOpen } = useKpis();
  const { isExpired } = useLicense(); // License Check
  const progress = useProgress();

  // State to track if the native OS keyboard is likely open
  const [isNativeKeyboardOpen, setIsNativeKeyboardOpen] = useState(false);
  
  // Simple memoized navigation handler - no transitions, instant response
  const handleSetPage = useCallback((page: Page) => {
    dispatch({ type: 'SET_PAGE', payload: page });
  }, [dispatch]);

  // Initialize Sync Service with access to dispatch
  useEffect(() => {
      syncService.init(dispatch, () => state);
  }, [dispatch, state]);

  // Listen for menu actions (Electron only)
  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    if (typeof window !== 'undefined' && electronAPI?.onOpenUpdateSettings) {
      const cleanup = electronAPI.onOpenUpdateSettings(() => {
        // Navigate to settings page
        dispatch({ type: 'SET_PAGE', payload: 'settings' });
        // Scroll to update section after a brief delay to allow page to render
        setTimeout(() => {
          const updateSection = document.querySelector('[data-update-section]');
          if (updateSection) {
            updateSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 100);
      });
      return cleanup;
    }
  }, [dispatch]);

  // Listen for create backup menu action
  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    if (typeof window !== 'undefined' && electronAPI?.onMenuCreateBackup) {
      const cleanup = electronAPI.onMenuCreateBackup(() => {
        createBackup(progress, dispatch);
      });
      return cleanup;
    }
  }, [dispatch, progress]);

  // Listen for restore backup menu action
  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    if (typeof window !== 'undefined' && electronAPI?.onMenuRestoreBackup) {
      const cleanup = electronAPI.onMenuRestoreBackup((data: { fileName: string; fileData: number[] }) => {
        // Convert the array back to a File object
        const uint8Array = new Uint8Array(data.fileData);
        const blob = new Blob([uint8Array], { type: 'application/octet-stream' });
        const file = new File([blob], data.fileName, { type: 'application/octet-stream' });
        restoreBackup(file, dispatch, progress);
      });
      return cleanup;
    }
  }, [dispatch, progress]);

  // Listen for open help section menu action
  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    if (typeof window !== 'undefined' && electronAPI?.onOpenHelpSection) {
      const cleanup = electronAPI.onOpenHelpSection(() => {
        // Navigate to settings page
        dispatch({ type: 'SET_PAGE', payload: 'settings' });
        // Scroll to help section after a brief delay to allow page to render
        setTimeout(() => {
          const helpButton = document.querySelector('[data-help-section]');
          if (helpButton) {
            helpButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Click the help button to activate it
            (helpButton as HTMLElement).click();
          }
        }, 100);
      });
      return cleanup;
    }
  }, [dispatch]);

  // Handle URL shortcuts (PWA actions)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const page = params.get('page');
    const action = params.get('action');

    if (page) {
        // Validate page
        const isValidPage = Object.values(PAGE_GROUPS).flat().includes(page);
        if (isValidPage) {
            dispatch({ type: 'SET_PAGE', payload: page as Page });
            
            // Handle Actions
            if (action === 'new' && page === 'transactions') {
                dispatch({ type: 'SET_INITIAL_TRANSACTION_TYPE', payload: TransactionType.EXPENSE }); // Default
            }
            
            // Clean URL
            window.history.replaceState({}, '', window.location.pathname);
        }
    }
  }, [dispatch]);

  useEffect(() => {
      const handleFocusIn = (e: Event) => {
          const target = e.target as HTMLElement;
          const tagName = target.tagName;
          if ((tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') && !target.hasAttribute('readonly')) {
              setIsNativeKeyboardOpen(true);
          }
      };

      const handleFocusOut = () => {
           setTimeout(() => {
               const active = document.activeElement as HTMLElement;
               if (!active || !['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) {
                   setIsNativeKeyboardOpen(false);
               }
           }, 100);
      };

      window.addEventListener('focusin', handleFocusIn);
      window.addEventListener('focusout', handleFocusOut);

      return () => {
          window.removeEventListener('focusin', handleFocusIn);
          window.removeEventListener('focusout', handleFocusOut);
      };
  }, []);

  const [visitedGroups, setVisitedGroups] = useState<Set<string>>(new Set());

  const activeGroup = useMemo(() => {
    for (const [group, pages] of Object.entries(PAGE_GROUPS)) {
      if (pages.includes(currentPage)) return group;
    }
    return 'DASHBOARD';
  }, [currentPage]);

  useEffect(() => {
    setVisitedGroups(prev => {
      if (!prev.has(activeGroup)) {
        return new Set(prev).add(activeGroup);
      }
      return prev;
    });
  }, [activeGroup]);

  // Redundant SW check removed as it is now handled in PWAContext/Header

  const getPageTitle = (page: Page): string => {
      switch(page) {
          case 'dashboard': return 'Dashboard';
          case 'transactions': return 'General Ledger';
          case 'payments': return 'Payments';
          case 'bills': return 'Bill Management';
          case 'loans': return 'Loan Manager';
          case 'rentalManagement': return 'Rental Management';
          case 'rentalInvoices': return 'Rental Invoices';
          case 'rentalAgreements': return 'Rental Agreements';
          case 'ownerPayouts': return 'Owner Payouts';
          case 'projectManagement': return 'Project Management';
          case 'projectInvoices': return 'Project Invoices';
          case 'settings': return 'Configuration';
          case 'import': return 'Import Data';
          case 'vendorDirectory': return 'Vendor Directory';
          case 'contacts': return 'Contacts';
          case 'budgets': return 'Budget Planner';
          case 'tasks': return 'Tasks';
          case 'payroll': return 'Global Payroll';
          default: return 'My Projects Pro';
      }
  };

  const getPageBackground = (groupKey: string) => {
    return 'bg-white'; // QuickBooks-style white background
  };

  // Optimized page renderer - only render active page for better performance
  const renderPersistentPage = useCallback((groupKey: string, content: React.ReactNode) => {
    // Only render if visited before (lazy load on first visit)
    if (!visitedGroups.has(groupKey)) return null;
    
    const isActive = activeGroup === groupKey;
    
    // PERFORMANCE: Only render active page, unmount inactive pages
    if (!isActive) return null;
    
    const shouldHideFooter = isCustomKeyboardOpen || isNativeKeyboardOpen;
    const pageId = `page-${groupKey}`;
    
    // Fixed layout for certain complex modules
    const isFixedLayout = groupKey === 'RENTAL' || groupKey === 'PROJECT' || groupKey === 'PAYMENTS' || groupKey === 'PAYROLL';
    const overflowClass = isFixedLayout ? 'overflow-hidden' : 'overflow-y-auto';
    const bgClass = getPageBackground(groupKey);

    return (
      <div 
        className={`absolute inset-0 ${overflowClass} overflow-x-hidden p-4 md:p-6 scroll-smooth overscroll-none ${bgClass} ${shouldHideFooter ? 'pb-4' : 'pb-24 md:pb-6'}`}
        id={pageId}
      >
        <div className="w-full h-full">
          <Suspense fallback={<Loading />}>
             {content}
          </Suspense>
        </div>
        {!isFixedLayout && <ScrollToTop containerId={pageId} />}
      </div>
    );
  }, [visitedGroups, activeGroup, isCustomKeyboardOpen, isNativeKeyboardOpen]);

  const shouldShowFooter = !isCustomKeyboardOpen && !isNativeKeyboardOpen;

  // BLOCK APP IF EXPIRED
  if (isExpired) {
      return <LicenseLockScreen />;
  }

  // --- LOGIN CHECK ---
  if (!currentUser) {
      return <LoginPage />;
  }

  return (
    <div 
      className="flex h-screen bg-white overflow-hidden font-sans text-gray-900 overscroll-none"
      onContextMenu={(e) => e.preventDefault()}
    >
        {/* Left Fixed Sidebar (Desktop) */}
        <Sidebar currentPage={currentPage} setCurrentPage={handleSetPage} />

        {/* Main Content Wrapper */}
        <div 
            className="flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out md:pl-64"
            style={{ marginRight: 'var(--right-sidebar-width, 0px)' }} 
        >
            <Header title={getPageTitle(currentPage)} />
            
            <main className="flex-1 relative overflow-hidden overscroll-none" id="main-container">
                <ErrorBoundary dispatch={dispatch}>
                    {renderPersistentPage('DASHBOARD', <DashboardPage />)}
                    {renderPersistentPage('TRANSACTIONS', <TransactionsPage />)}
                    {renderPersistentPage('PAYMENTS', <MobilePaymentsPage />)}
                    {renderPersistentPage('LOANS', <LoanManagementPage />)}
                    {renderPersistentPage('VENDORS', <VendorDirectoryPage />)}
                    {renderPersistentPage('CONTACTS', <ContactsPage />)}
                    {renderPersistentPage('BUDGETS', <BudgetManagement />)}
                    {renderPersistentPage('TASKS', <TodoList />)}
                    {renderPersistentPage('RENTAL', <RentalManagementPage initialPage={currentPage} />)}
                    {renderPersistentPage('PROJECT', <ProjectManagementPage initialPage={currentPage} />)}
                    {renderPersistentPage('PAYROLL', <GlobalPayrollPage />)}
                    {renderPersistentPage('SETTINGS', <SettingsPage />)}
                    {renderPersistentPage('IMPORT', <ImportPage />)}
                </ErrorBoundary>
            </main>

            {/* Mobile Footer Navigation */}
            <div className={`md:hidden fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300 ${shouldShowFooter ? 'translate-y-0' : 'translate-y-full'}`}>
                <Footer isPanelOpen={isPanelOpen} />
            </div>
        </div>
        
        {/* Right Sidebar (KPI Panel) */}
        <KPIPanel />
        <KPIDrilldown />
        <ProgressDisplay />
        
        {/* Auto-Update Notification (Electron only) */}
        <UpdateNotification />
        
        {isCustomKeyboardOpen && (
            <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up">
                <CustomKeyboard />
            </div>
        )}
    </div>
  );
};

export default App;
