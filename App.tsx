
import React, { useEffect, useState, useMemo, Suspense, useCallback, useTransition } from 'react';
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
import { useLicense } from './context/LicenseContext';
import LicenseLockScreen from './components/license/LicenseLockScreen';
import { useAuth } from './context/AuthContext';
import CloudLoginPage from './components/auth/CloudLoginPage';
// Initialize Sync Service removed
import UpdateNotification from './components/ui/UpdateNotification';
import { createBackup, restoreBackup } from './services/backupService';
import { useProgress } from './context/ProgressContext';
import { usePagePreloader } from './hooks/usePagePreloader';
import Loading from './components/ui/Loading';

// Note: electronAPI type declarations are in other files (UpdateCheck.tsx, UpdateNotification.tsx)
// Using type assertion (window as any).electronAPI to avoid type conflicts

// Lazy Load Components
const DashboardPage = React.lazy(() => import('./components/dashboard/DashboardPage'));
const EnhancedLedgerPage = React.lazy(() => import('./components/transactions/EnhancedLedgerPage'));
const SettingsPage = React.lazy(() => import('./components/settings/SettingsPage'));
const ImportPage = React.lazy(() => import('./components/settings/ImportPage'));
const RentalManagementPage = React.lazy(() => import('./components/rentalManagement/RentalManagementPage'));
const ProjectManagementPage = React.lazy(() => import('./components/projectManagement/ProjectManagementPage'));
const InvestmentManagementPage = React.lazy(() => import('./components/investmentManagement/InvestmentManagementPage'));
const PMConfigPage = React.lazy(() => import('./components/pmConfig/PMConfigPage'));
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
  INVESTMENT: ['investmentManagement'],
  PM_CONFIG: ['pmConfig'],
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
  const { isAuthenticated, isLoading: authLoading } = useAuth(); // Cloud authentication

  // State to track if the native OS keyboard is likely open
  const [isNativeKeyboardOpen, setIsNativeKeyboardOpen] = useState(false);

  // Use React 18 startTransition for non-blocking navigation (improves INP)
  const [isPending, startNavTransition] = useTransition();

  // State to control loading overlay visibility (with small delay to avoid flashing)
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);
  const loadingTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const minLoadingTimeRef = React.useRef<NodeJS.Timeout | null>(null);

  // Delay showing loading overlay for quick navigations, but ensure minimum display time
  useEffect(() => {
    if (isPending) {
      // Clear any existing timeouts
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      if (minLoadingTimeRef.current) {
        clearTimeout(minLoadingTimeRef.current);
        minLoadingTimeRef.current = null;
      }

      // Show loading after small delay
      loadingTimeoutRef.current = setTimeout(() => {
        setShowLoadingOverlay(true);
      }, 100); // Reduced from 150ms to 100ms for faster feedback

      return () => {
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      };
    } else {
      // Clear the show timeout if navigation completes before it triggers
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }

      // When navigation completes, ensure loading shows for minimum time (300ms) for better UX
      if (showLoadingOverlay) {
        // Already showing, wait minimum time before hiding
        minLoadingTimeRef.current = setTimeout(() => {
          setShowLoadingOverlay(false);
          minLoadingTimeRef.current = null;
        }, 300); // Minimum display time
      }

      return () => {
        if (minLoadingTimeRef.current) {
          clearTimeout(minLoadingTimeRef.current);
          minLoadingTimeRef.current = null;
        }
      };
    }
  }, [isPending, showLoadingOverlay]);

  // Preload pages for instant navigation
  usePagePreloader();

  // Optimized navigation handler - uses startTransition for non-blocking updates
  const handleSetPage = useCallback((page: Page) => {
    // Mark navigation as non-urgent to keep UI responsive
    startNavTransition(() => {
      dispatch({ type: 'SET_PAGE', payload: page });
    });
  }, [dispatch, startNavTransition]);


  // Listen for menu actions (Electron only)
  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    if (typeof window !== 'undefined' && electronAPI?.onOpenUpdateSettings) {
      const cleanup = electronAPI.onOpenUpdateSettings(() => {
        // Navigate to settings page and ensure data management section is visible
        dispatch({ type: 'SET_PAGE', payload: 'settings' });
        // Dispatch custom event to set active category to 'data' (Data Management)
        window.dispatchEvent(new CustomEvent('open-data-management-section'));
        // Scroll to update section after a brief delay to allow page to render
        setTimeout(() => {
          const updateSection = document.querySelector('[data-update-section]');
          if (updateSection) {
            updateSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 200);
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

  // Listen for open backup & restore page menu action
  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    if (typeof window !== 'undefined' && electronAPI?.onOpenBackupRestore) {
      const cleanup = electronAPI.onOpenBackupRestore(() => {
        // Navigate to settings page
        dispatch({ type: 'SET_PAGE', payload: 'settings' });
        // Dispatch custom event to set active category to 'backup'
        window.dispatchEvent(new CustomEvent('open-backup-restore-section'));
        // Scroll to backup section after a brief delay to allow page to render
        setTimeout(() => {
          const backupButton = document.querySelector('[data-backup-section]');
          if (backupButton) {
            backupButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Click the backup button to activate it
            (backupButton as HTMLElement).click();
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
    switch (page) {
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
      case 'investmentManagement': return 'Investment Management';
      case 'pmConfig': return 'PM Config.';
      case 'settings': return 'Configuration';
      case 'import': return 'Import Data';
      case 'vendorDirectory': return 'Vendor Directory';
      case 'contacts': return 'Contacts';
      case 'budgets': return 'Budget Planner';
      case 'tasks': return 'Tasks';
      case 'payroll': return 'Global Payroll';
      default: return 'PBooks Pro';
    }
  };

  const getPageBackground = (groupKey: string) => {
    return 'bg-white'; // QuickBooks-style white background
  };

  // Optimized page renderer - use React.memo and Suspense for better performance
  const renderPage = useCallback((page: Page, component: React.ReactNode) => {
    // Use React.startTransition for non-blocking page switches
    if (currentPage === page) {
      return (
        <Suspense fallback={
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mb-2"></div>
              <p className="text-sm text-gray-600">Loading...</p>
            </div>
          </div>
        }>
          {component}
        </Suspense>
      );
    }
    return null;
  }, [currentPage]);

  // Optimized page renderer - preserves page state by keeping pages mounted but hidden
  // Memoized with minimal dependencies to prevent unnecessary re-renders
  const renderPersistentPage = useCallback((groupKey: string, content: React.ReactNode) => {
    // Only render if visited before (lazy load on first visit)
    if (!visitedGroups.has(groupKey)) return null;

    const isActive = activeGroup === groupKey;

    // PERFORMANCE: Keep pages mounted but hidden to preserve state and avoid reloading
    // Use CSS to hide inactive pages instead of unmounting them
    const shouldHideFooter = isCustomKeyboardOpen || isNativeKeyboardOpen;
    const pageId = `page-${groupKey}`;

    // Fixed layout for certain complex modules
    const isFixedLayout = groupKey === 'RENTAL' || groupKey === 'PROJECT' || groupKey === 'INVESTMENT' || groupKey === 'PM_CONFIG' || groupKey === 'PAYMENTS' || groupKey === 'PAYROLL';
    const overflowClass = isFixedLayout ? 'overflow-hidden' : 'overflow-y-auto';
    const bgClass = getPageBackground(groupKey);

    return (
      <div
        key={groupKey}
        className={`absolute inset-0 ${overflowClass} overflow-x-hidden p-4 md:p-6 scroll-smooth overscroll-none ${bgClass} ${shouldHideFooter ? 'pb-4' : 'pb-24 md:pb-6'} ${isActive ? 'opacity-100 pointer-events-auto z-10 visible' : 'opacity-0 pointer-events-none z-0 invisible'}`}
        style={{
          transition: 'opacity 0.15s ease-in-out, visibility 0.15s ease-in-out'
        }}
        id={pageId}
      >
        <div className="w-full h-full">
          <Suspense fallback={<Loading message="Loading Records" />}>
            {content}
          </Suspense>
        </div>
        {!isFixedLayout && isActive && <ScrollToTop containerId={pageId} />}
      </div>
    );
  }, [visitedGroups, activeGroup, isCustomKeyboardOpen, isNativeKeyboardOpen]);

  const shouldShowFooter = !isCustomKeyboardOpen && !isNativeKeyboardOpen;

  // Show loading while checking authentication
  if (authLoading) {
    return <Loading message="Checking authentication..." />;
  }

  // --- CLOUD AUTHENTICATION CHECK ---
  // If using cloud authentication, check AuthContext first
  // Otherwise fall back to local user check for backward compatibility
  if (!isAuthenticated && !currentUser) {
    return <CloudLoginPage />;
  }

  // BLOCK APP IF EXPIRED (only if authenticated)
  if (isAuthenticated && isExpired) {
    return <LicenseLockScreen />;
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
        <Header title={getPageTitle(currentPage)} isNavigating={isPending} />

        <main className="flex-1 relative overflow-hidden overscroll-none" id="main-container">
          <ErrorBoundary dispatch={dispatch}>
            {renderPersistentPage('DASHBOARD', <DashboardPage />)}
            {renderPersistentPage('TRANSACTIONS', <EnhancedLedgerPage />)}
            {renderPersistentPage('PAYMENTS', <MobilePaymentsPage />)}
            {renderPersistentPage('LOANS', <LoanManagementPage />)}
            {renderPersistentPage('VENDORS', <VendorDirectoryPage />)}
            {renderPersistentPage('CONTACTS', <ContactsPage />)}
            {renderPersistentPage('BUDGETS', <BudgetManagement />)}
            {renderPersistentPage('TASKS', <TodoList />)}
            {renderPersistentPage('RENTAL', <RentalManagementPage initialPage={currentPage} />)}
            {renderPersistentPage('PROJECT', <ProjectManagementPage initialPage={currentPage} />)}
            {renderPersistentPage('INVESTMENT', <InvestmentManagementPage />)}
            {renderPersistentPage('PM_CONFIG', <PMConfigPage />)}
            {renderPersistentPage('PAYROLL', <GlobalPayrollPage />)}
            {renderPersistentPage('SETTINGS', <SettingsPage />)}
            {renderPersistentPage('IMPORT', <ImportPage />)}
          </ErrorBoundary>

          {/* Loading Overlay - Shows when navigating between pages (excluded for PROJECT, RENTAL, INVESTMENT, and PM_CONFIG groups to avoid duplicates with Suspense) */}
          {showLoadingOverlay && activeGroup !== 'PROJECT' && activeGroup !== 'RENTAL' && activeGroup !== 'INVESTMENT' && activeGroup !== 'PM_CONFIG' && (
            <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-50 flex items-center justify-center transition-opacity duration-200 animate-fade-in">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-gray-200 border-t-green-600 rounded-full animate-spin"></div>
                  <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-r-green-400 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
                </div>
                <div className="text-center">
                  <p className="text-gray-700 text-base font-semibold mb-1">Loading Records</p>
                  <p className="text-gray-500 text-sm">{getPageTitle(currentPage)}</p>
                </div>
                {/* Progress dots animation */}
                <div className="flex gap-1.5 mt-2">
                  <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse" style={{ animationDelay: '0s' }}></div>
                  <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Mobile Footer Navigation */}
        <div className={`md:hidden fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300 ${shouldShowFooter ? 'translate-y-0' : 'translate-y-full'}`}>
          <Footer isPanelOpen={isPanelOpen} onNavigate={handleSetPage} />
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
