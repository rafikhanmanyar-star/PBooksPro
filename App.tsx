
import React, { useEffect, useLayoutEffect, useState, useMemo, useRef, Suspense, useCallback, useTransition } from 'react';
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
import PaymentSuccessPage from './components/license/PaymentSuccessPage';
import PaddleCheckoutPage from './components/license/PaddleCheckoutPage';
import { useAuth } from './context/AuthContext';
import { getApiBaseUrl, isLanBackendApi, isLocalOnlyMode } from './config/apiUrl';
import { verifyServerReachable } from './services/lanDiscovery';
import { useCompanyOptional } from './context/CompanyContext';
import { apiClient } from './services/api/client';
// Initialize Sync Service removed
import UpdateNotification from './components/ui/UpdateNotification';
import { getUnifiedDatabaseService } from './services/database/unifiedDatabaseService';
import {
  connectionMonitorStub as _connectionMonitor,
  syncManagerStub as _syncManager,
  lockManagerStub as _lockManager,
  offlineLockManagerStub as _offlineLockManager,
  realtimeSyncHandlerStub as _realtimeSyncHandler,
  websocketClientStub as _websocketClient,
} from './services/sync/localOnlyStubs';
const getConnectionMonitor = () => _connectionMonitor;
const getSyncManager = () => _syncManager;
const getLockManager = () => _lockManager;
const getOfflineLockManager = () => _offlineLockManager;
const getRealtimeSyncHandler = () => _realtimeSyncHandler;
const getWebSocketClient = () => _websocketClient as any;
import { VersionUpdateNotification } from './components/ui/VersionUpdateNotification';
import { createBackup, restoreBackup } from './services/backupService';
import { useProgress } from './context/ProgressContext';
import { usePagePreloader } from './hooks/usePagePreloader';
import Loading from './components/ui/Loading';
import LoadingShell from './components/ui/LoadingShell';
import { OfflineProvider } from './context/OfflineContext';
import MobileOfflineWarning from './components/ui/MobileOfflineWarning';
import { ContactsApiRepository } from './services/api/repositories/contactsApi';
import { VendorsApiRepository } from './services/api/repositories/vendorsApi';
import { devLogger } from './utils/devLogger';
import { navPerfLog } from './utils/navPerfLogger';
import { lazyWithRetry } from './utils/lazyWithRetry';
import { PrintController } from './components/print/PrintController';
import SchemaBlockedScreen from './components/diagnostics/SchemaBlockedScreen';
import StabilityBanner from './components/stability/StabilityBanner';
import ApiLoginScreen from './components/auth/ApiLoginScreen';
import ConnectServerScreen from './components/auth/ConnectServerScreen';


// Lazy Load Components
const DashboardPage = lazyWithRetry(() => import('./components/dashboard/DashboardPage'));
const EnhancedLedgerPage = lazyWithRetry(() => import('./components/transactions/EnhancedLedgerPage'));
const SettingsPage = lazyWithRetry(() => import('./components/settings/SettingsPage'));
const ImportExportWizard = lazyWithRetry(() => import('./components/settings/ImportExportWizard'));
const RentalManagementPage = lazyWithRetry(() => import('./components/rentalManagement/RentalManagementPage'));
const ProjectManagementPage = lazyWithRetry(() => import('./components/projectManagement/ProjectManagementPage'));
const InvestmentManagementPage = lazyWithRetry(() => import('./components/investmentManagement/InvestmentManagementPage'));
const PMConfigPage = lazyWithRetry(() => import('./components/pmConfig/PMConfigPage'));
const LoanManagementPage = lazyWithRetry(() => import('./components/loans/LoanManagementPage'));
const VendorDirectoryPage = lazyWithRetry(() => import('./components/vendors/VendorDirectoryPage'));
const ContactsPage = lazyWithRetry(() => import('./components/contacts/ContactsPage'));
const BudgetManagement = lazyWithRetry(() => import('./components/settings/BudgetManagement'));
const MobilePaymentsPage = lazyWithRetry(() => import('./components/mobile/MobilePaymentsPage'));

const PayrollHub = lazyWithRetry(() => import('./components/payroll/PayrollHub'));
const PersonalTransactionsPage = lazyWithRetry(() => import('./components/personalTransactions/PersonalTransactionsPage'));

const SetPasswordModal = lazyWithRetry(() => import('./components/company/SetPasswordModal'));

// Define page groups to determine which component instance handles which routes
const PAGE_GROUPS = {
  DASHBOARD: ['dashboard'],
  TRANSACTIONS: ['transactions'],
  PAYMENTS: ['payments'],
  LOANS: ['loans'],
  VENDORS: ['vendorDirectory'],
  CONTACTS: ['contacts'],
  BUDGETS: ['budgets'],
  RENTAL: ['rentalManagement', 'rentalInvoices', 'rentalAgreements', 'ownerPayouts'],
  PROJECT: ['projectManagement', 'bills'],
  PROJECT_SELLING: ['projectSelling', 'projectInvoices'],
  INVESTMENT: ['investmentManagement'],
  PM_CONFIG: ['pmConfig'],

  SETTINGS: ['settings'],
  IMPORT: ['import'],
  PAYROLL: ['payroll'],
  PERSONAL_TRANSACTIONS: ['personalTransactions'],
};

const App: React.FC = () => {
  const { state, dispatch, isInitialDataLoading } = useAppContext();
  const { currentPage, currentUser } = state;
  const { isOpen: isCustomKeyboardOpen, closeKeyboard } = useKeyboard();
  const { isPanelOpen } = useKpis();
  const { isExpired } = useLicense(); // License Check
  const progress = useProgress();
  const { isAuthenticated, isLoading: authLoading, user, tenant } = useAuth(); // Cloud authentication
  const companyCtx = useCompanyOptional();

  /** Local-only: block UI when main-process schema validation reports a critical failure. */
  const [schemaGate, setSchemaGate] = useState<'unset' | 'ok' | { errors: string[] }>('ok');

  /** LAN / API: discover + persisted server reachability (skipped for hosted cloud API URLs). */
  const [lanServerPhase, setLanServerPhase] = useState<'checking' | 'need-server' | 'ready'>(() =>
    isLocalOnlyMode() || !isLanBackendApi() ? 'ready' : 'checking'
  );
  const [lanServerLost, setLanServerLost] = useState(false);

  useEffect(() => {
    if (isLocalOnlyMode() || !isLanBackendApi()) return;
    let cancelled = false;
    void (async () => {
      const ok = await verifyServerReachable(getApiBaseUrl());
      if (cancelled) return;
      setLanServerPhase(ok ? 'ready' : 'need-server');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const h = () => setLanServerLost(true);
    window.addEventListener('pbooks:server-unreachable', h);
    return () => window.removeEventListener('pbooks:server-unreachable', h);
  }, []);

  useLayoutEffect(() => {
    if (isLocalOnlyMode() && companyCtx?.activeCompany) {
      setSchemaGate('unset');
    } else if (!companyCtx?.activeCompany) {
      setSchemaGate('ok');
    }
  }, [companyCtx?.activeCompany?.id]);

  useEffect(() => {
    if (!isLocalOnlyMode() || !companyCtx?.activeCompany) {
      return;
    }
    let mounted = true;
    (async () => {
      const { fetchSchemaHealth } = await import('./services/database/schemaHealth');
      const h = await fetchSchemaHealth();
      if (!mounted) return;
      if (h?.blocking) {
        setSchemaGate({
          errors: [
            ...(h.errors || []),
            ...(h.integrityOk === false ? ['SQLite integrity_check failed'] : []),
          ],
        });
      } else {
        setSchemaGate('ok');
      }
    })();
    return () => {
      mounted = false;
    };
  }, [companyCtx?.activeCompany?.id]);

  // State to track if the native OS keyboard is likely open
  const [isNativeKeyboardOpen, setIsNativeKeyboardOpen] = useState(false);

  // Use React 18 startTransition for non-blocking navigation (improves INP)
  const [isPending, startNavTransition] = useTransition();

  // State to control loading overlay visibility (with small delay to avoid flashing)
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);
  const loadingTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const minLoadingTimeRef = React.useRef<NodeJS.Timeout | null>(null);

  // Check for payment success page URL - MUST be before any early returns
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);
  const [showPaddleCheckout, setShowPaddleCheckout] = useState(false);

  // Clear any stuck body styles from previous session (e.g. resize drag that never got mouseup)
  useEffect(() => {
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }, []);

  // API mode: closing the custom numpad avoids stray state; pair with login-screen focus recovery after logout
  useEffect(() => {
    if (isLocalOnlyMode() || authLoading) return;
    if (!isAuthenticated) closeKeyboard();
  }, [isAuthenticated, authLoading, closeKeyboard]);

  // Electron window close is handled in CompanyContext (always mounted) so File → Exit and X work on company select screen too.

  useEffect(() => {
    // Check if current URL path matches payment success route
    const pathname = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);
    const hasPaymentParams =
      searchParams.has('payment_intent') ||
      searchParams.has('payment_status') ||
      searchParams.has('status') ||
      searchParams.has('_ptxn');

    if (pathname === '/license/paddle-checkout' || pathname.endsWith('/license/paddle-checkout')) {
      setShowPaddleCheckout(true);
      setShowPaymentSuccess(false);
      return;
    }

    if (pathname === '/license/payment-success' ||
      pathname.endsWith('/license/payment-success') ||
      (pathname === '/' && hasPaymentParams)) {
      setShowPaymentSuccess(true);
      setShowPaddleCheckout(false);
    } else {
      setShowPaymentSuccess(false);
      setShowPaddleCheckout(false);
    }
  }, []);

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

  // Initialize database services (unified database, connection monitor, sync manager)
  // OPTIMIZED: Batch all service initialization to reduce mount time
  useEffect(() => {
    // In multi-company mode, skip service init until a company DB is open
    if (isLocalOnlyMode() && companyCtx && !companyCtx.activeCompany) {
      return;
    }

    let isMounted = true;

    const initializeServices = async () => {
      try {
        devLogger.log('[App] Initializing database services...');

        const [unifiedDb] = await Promise.all([
          getUnifiedDatabaseService().initialize(),
        ]);

        if (!isMounted) return;
        devLogger.log('[App] ✅ Unified database service initialized');

        // Skip cloud/sync/WebSocket init when in local-only mode
        if (!isLocalOnlyMode()) {
          const connectionMonitor = getConnectionMonitor();
          const lockManager = getLockManager();
          const offlineLockManager = getOfflineLockManager();
          const realtimeSyncHandler = getRealtimeSyncHandler();

          connectionMonitor.startMonitoring({
            onStatusChange: (status) => devLogger.log(`[App] Connection: ${status}`),
            onOnline: () => devLogger.log('[App] ✅ Online'),
            onOffline: () => devLogger.log('[App] ⚠️ Offline'),
          });
          realtimeSyncHandler.initialize();

          if (isAuthenticated) {
            const wsClient = getWebSocketClient();
            const token = apiClient.getToken();
            const tenantId = apiClient.getTenantId();
            if (token && tenantId && !apiClient.isTokenExpired()) {
              wsClient.connect(token, tenantId);
              devLogger.log('[App] ✅ WebSocket connecting');
            }
          }
        }

        devLogger.log('[App] ✅ All services initialized');
      } catch (error) {
        console.error('[App] ❌ Service initialization failed:', error);
        // Don't block app from loading - services will retry or work in degraded mode
      }
    };

    initializeServices();

    // Cleanup on unmount
    return () => {
      isMounted = false;
      if (!isLocalOnlyMode()) {
        try {
          getSyncManager().destroy();
          getConnectionMonitor().destroy();
          getLockManager().destroy();
          getOfflineLockManager().destroy();
          getRealtimeSyncHandler().destroy();
          getWebSocketClient().disconnect();
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    };
  }, [companyCtx?.screen]); // Re-run when company screen transitions to 'app'

  // Set user context for offline lock manager when authenticated (skip in local-only)
  useEffect(() => {
    if (!isLocalOnlyMode() && isAuthenticated && user && tenant) {
      const offlineLockManager = getOfflineLockManager();
      offlineLockManager.setUserContext(user.id, tenant.id);
      devLogger.log('[App] ✅ User context set');
    }
  }, [isAuthenticated, user, tenant]);

  // Connect WebSocket when authenticated and set up real-time sync (skip in local-only)
  useEffect(() => {
    if (!isAuthenticated || isLocalOnlyMode()) return;

    const wsClient = getWebSocketClient();
    const token = apiClient.getToken();
    const tenantId = apiClient.getTenantId();

    if (token && tenantId && !apiClient.isTokenExpired()) {
      wsClient.connect(token, tenantId);

      // Set dispatch callback, current user ID, and tenant ID for real-time sync handler
      const realtimeSyncHandler = getRealtimeSyncHandler();
      realtimeSyncHandler.setDispatch(dispatch);
      realtimeSyncHandler.setCurrentUserId(user?.id || null);
      realtimeSyncHandler.setCurrentTenantId(tenantId || null);

      // Also set tenant ID on SyncManager for tenant-scoped queue
      getSyncManager().setTenantId(tenantId || null);

      devLogger.log('[App] ✅ WebSocket & sync connected');

      return () => {
        wsClient.disconnect();
        realtimeSyncHandler.setDispatch(null);
        realtimeSyncHandler.setCurrentUserId(null);
        realtimeSyncHandler.setCurrentTenantId(null);
      };
    }
  }, [isAuthenticated, dispatch, user?.id]);

  // Optimized navigation handler - uses startTransition for non-blocking updates
  const handleSetPage = useCallback((page: Page) => {
    navPerfLog('nav requested', { page });

    // Project Selling: preserve and restore last sub-page (projectSelling vs projectInvoices)
    const projectSellingPages = PAGE_GROUPS.PROJECT_SELLING;
    const isLeavingProjectSelling = projectSellingPages.includes(currentPage) && !projectSellingPages.includes(page);
    const isEnteringProjectSelling = page === 'projectSelling';

    if (isLeavingProjectSelling) {
      try {
        sessionStorage.setItem('lastProjectSellingPage', currentPage);
      } catch (_) {}
    }

    // Rental: preserve and restore last sub-page (rentalManagement, rentalInvoices, rentalAgreements, ownerPayouts)
    const rentalPages = PAGE_GROUPS.RENTAL;
    const isLeavingRental = rentalPages.includes(currentPage) && !rentalPages.includes(page);
    const isEnteringRental = page === 'rentalManagement';

    if (isLeavingRental) {
      try {
        sessionStorage.setItem('lastRentalPage', currentPage);
      } catch (_) {}
    }

    let pageToSet: Page = page;
    if (isEnteringProjectSelling) {
      try {
        const last = sessionStorage.getItem('lastProjectSellingPage');
        if (last === 'projectSelling' || last === 'projectInvoices') pageToSet = last as Page;
        else pageToSet = 'projectSelling';
      } catch (_) {
        pageToSet = 'projectSelling';
      }
    } else if (isEnteringRental) {
      try {
        const last = sessionStorage.getItem('lastRentalPage');
        if (last && rentalPages.includes(last)) pageToSet = last as Page;
        else pageToSet = 'rentalManagement';
      } catch (_) {
        pageToSet = 'rentalManagement';
      }
    }

    startNavTransition(() => {
      dispatch({ type: 'SET_PAGE', payload: pageToSet });
    });
  }, [dispatch, startNavTransition, currentPage]);

  // Log when currentPage actually updates (to measure delay between request and commit)
  useEffect(() => {
    navPerfLog('currentPage updated', { page: currentPage });
  }, [currentPage]);



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

  // PERFORMANCE: Limit persistent pages to reduce memory and re-render overhead.
  // Previously ALL visited pages stayed mounted forever, causing memory leaks and
  // cascading re-renders from context changes. Now we keep only the 3 most recently
  // visited pages mounted (LRU eviction). This prevents 10+ pages from accumulating
  // in the DOM with their effects, event listeners, and state all active.
  const MAX_PERSISTENT_PAGES = 3;
  const [visitedGroups, setVisitedGroups] = useState<Set<string>>(new Set());
  const visitOrderRef = useRef<string[]>([]);

  const activeGroup = useMemo(() => {
    for (const [group, pages] of Object.entries(PAGE_GROUPS)) {
      if (pages.includes(currentPage)) return group;
    }
    return 'DASHBOARD';
  }, [currentPage]);

  useEffect(() => {
    setVisitedGroups(prev => {
      // Update visit order (move to front if already visited)
      const order = visitOrderRef.current.filter(g => g !== activeGroup);
      order.unshift(activeGroup);
      visitOrderRef.current = order;

      // Keep only the most recent N pages
      const keepSet = new Set(order.slice(0, MAX_PERSISTENT_PAGES));
      // Check if the set actually changed to avoid unnecessary re-renders
      if (keepSet.size === prev.size && [...keepSet].every(g => prev.has(g))) {
        return prev;
      }
      return keepSet;
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
      case 'projectSelling': return 'Project Selling';
      case 'projectInvoices': return 'Project Invoices';
      case 'investmentManagement': return 'Inv. Cycle';
      case 'pmConfig': return 'PM Config.';
      case 'settings': return 'Configuration';
      case 'import': return 'Import Data';
      case 'vendorDirectory': return 'Vendor Directory';
      case 'contacts': return 'Contacts';
      case 'budgets': return 'Budget Planner';

      case 'payroll': return 'Payroll Management';
      case 'personalTransactions': return 'Personal transactions';

      default: return 'PBooks Pro';
    }
  };

  const getPageBackground = (_groupKey: string) => {
    return 'bg-app-bg';
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
              <p className="text-sm text-app-muted">Loading...</p>
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
    const isFixedLayout = groupKey === 'RENTAL' || groupKey === 'PROJECT' || groupKey === 'PROJECT_SELLING' || groupKey === 'INVESTMENT' || groupKey === 'PM_CONFIG' || groupKey === 'PAYMENTS' || groupKey === 'PAYROLL' || groupKey === 'PERSONAL_TRANSACTIONS';
    const overflowClass = isFixedLayout ? 'overflow-hidden' : 'overflow-y-auto';
    const bgClass = getPageBackground(groupKey);
    // Project Selling: no top padding so tab row sits directly under header
    // Rental: same — second-level module nav sits directly under header / banners
    const noTopPad = groupKey === 'PROJECT_SELLING' || groupKey === 'RENTAL' || groupKey === 'PERSONAL_TRANSACTIONS' || groupKey === 'PAYROLL' || groupKey === 'INVESTMENT';

    return (
      <div
        key={groupKey}
        className={`absolute inset-0 layout-content-area overflow-x-hidden scroll-smooth overscroll-none ${noTopPad ? 'pt-0' : ''} ${overflowClass} ${bgClass} ${shouldHideFooter ? 'pb-2 sm:pb-3 md:pb-4' : 'pb-20 sm:pb-24 md:pb-6'} ${isActive ? 'opacity-100 pointer-events-auto z-10 visible' : 'opacity-0 pointer-events-none z-0 invisible'}`}
        style={{
          transition: 'opacity 0.15s ease-in-out, visibility 0.15s ease-in-out'
        }}
        id={pageId}
      >
        <div className="w-full h-full min-h-0">
          <Suspense fallback={<Loading message="Loading Records" />}>
            {content}
          </Suspense>
        </div>
        {!isFixedLayout && isActive && <ScrollToTop containerId={pageId} />}
      </div>
    );
  }, [visitedGroups, activeGroup, isCustomKeyboardOpen, isNativeKeyboardOpen]);

  const shouldShowFooter = !isCustomKeyboardOpen && !isNativeKeyboardOpen;

  // Company selection flow (loading/select/create/login) is rendered by CompanyGate
  // outside AppProvider so the Create Company form is not affected by DB load errors.

  // Show loading while checking authentication
  if (authLoading) {
    return <Loading message="Checking authentication..." />;
  }

  // LAN / API: ensure backend is reachable (discover) before sign-in; reconnect flow when connection drops
  if (!isLocalOnlyMode() && isLanBackendApi()) {
    if (lanServerPhase === 'checking') {
      return <Loading message="Connecting to server..." />;
    }
    if (lanServerPhase === 'need-server' || lanServerLost) {
      return (
        <ConnectServerScreen
          onConnected={() => {
            setLanServerPhase('ready');
            setLanServerLost(false);
          }}
          variant={lanServerLost ? 'lost' : 'initial'}
        />
      );
    }
  }

  // LAN / API mode: require server login (CompanyGate only applies in local-only mode)
  if (!isLocalOnlyMode() && !isAuthenticated) {
    return <ApiLoginScreen />;
  }

  // Show Paddle checkout page if URL matches
  if (showPaddleCheckout) {
    return <PaddleCheckoutPage />;
  }

  // Show payment success page if URL matches
  if (showPaymentSuccess) {
    return <PaymentSuccessPage />;
  }

  // Local-only builds never show cloud login (CompanyContext + company user login instead).

  // BLOCK APP IF EXPIRED (only if authenticated)
  if (isAuthenticated && isExpired) {
    return <LicenseLockScreen />;
  }

  // Local-only: schema integrity / critical validation (before heavy data load)
  if (isAuthenticated && isLocalOnlyMode() && companyCtx?.activeCompany && schemaGate === 'unset') {
    return <Loading message="Checking database…" />;
  }
  if (isAuthenticated && isLocalOnlyMode() && companyCtx?.activeCompany && schemaGate !== 'ok' && schemaGate !== 'unset') {
    return (
      <SchemaBlockedScreen
        errors={schemaGate.errors}
        onOpenSettingsBackup={() => {
          dispatch({ type: 'SET_PAGE', payload: 'settings' });
          window.dispatchEvent(new CustomEvent('open-backup-restore-section'));
        }}
      />
    );
  }

  // Show loading shell while initial data loads (improves LCP/INP after login)
  if (isAuthenticated && isInitialDataLoading) {
    return <LoadingShell />;
  }

  return (
    <OfflineProvider>
      <PrintController />
      {/* Force password change modal for new company admin */}
      {isLocalOnlyMode() && companyCtx?.forcePasswordChange && (
        <Suspense fallback={null}>
          <SetPasswordModal />
        </Suspense>
      )}
      <div
        className="flex h-screen bg-app-bg overflow-hidden font-sans text-app-text overscroll-none"
        onContextMenu={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('input, textarea, [contenteditable="true"]')) {
            return;
          }
          e.preventDefault();
        }}
      >
        {/* Left Fixed Sidebar (Desktop) */}
        <Sidebar currentPage={currentPage} setCurrentPage={handleSetPage} />

        {/* Main Content Wrapper – left padding follows ViewportContext (compact on 1366x768 etc.) */}
        <div
          className="flex-1 flex flex-col min-w-0 max-w-full overflow-x-hidden transition-all duration-300 ease-in-out main-content-offset"
          style={{ marginRight: 'var(--right-sidebar-width, 0px)' }}
        >
          <Header title={getPageTitle(currentPage)} isNavigating={isPending} />

          <StabilityBanner />

          {/* Mobile Offline Warning Banner */}
          <MobileOfflineWarning />

          <main className="flex-1 relative overflow-hidden overscroll-none" id="main-container">
            <ErrorBoundary dispatch={dispatch}>
              {renderPersistentPage('DASHBOARD', <DashboardPage />)}
              {renderPersistentPage('TRANSACTIONS', <EnhancedLedgerPage />)}
              {renderPersistentPage('PAYMENTS', <MobilePaymentsPage />)}
              {renderPersistentPage('LOANS', <LoanManagementPage />)}
              {renderPersistentPage('VENDORS', <VendorDirectoryPage />)}
              {renderPersistentPage('CONTACTS', <ContactsPage />)}
              {renderPersistentPage('BUDGETS', <BudgetManagement />)}
              {renderPersistentPage('RENTAL', <RentalManagementPage initialPage={currentPage} />)}
              {renderPersistentPage('PROJECT', <ProjectManagementPage initialPage={currentPage} />)}
              {renderPersistentPage('PROJECT_SELLING', <ProjectManagementPage initialPage={currentPage} />)}
              {renderPersistentPage('INVESTMENT', <InvestmentManagementPage />)}
              {renderPersistentPage('PM_CONFIG', <PMConfigPage />)}
              {renderPersistentPage('PAYROLL', <PayrollHub />)}
              {renderPersistentPage('PERSONAL_TRANSACTIONS', <PersonalTransactionsPage />)}
              {renderPersistentPage('SETTINGS', <SettingsPage />)}
              {renderPersistentPage('IMPORT', <ImportExportWizard />)}
            </ErrorBoundary>

            {/* Loading Overlay - Shows when navigating between pages (excluded for PROJECT, RENTAL, INVESTMENT, and PM_CONFIG groups to avoid duplicates with Suspense) */}
            {showLoadingOverlay && activeGroup !== 'PROJECT' && activeGroup !== 'PROJECT_SELLING' && activeGroup !== 'RENTAL' && activeGroup !== 'INVESTMENT' && activeGroup !== 'PM_CONFIG' && activeGroup !== 'PERSONAL_TRANSACTIONS' && activeGroup !== 'PAYROLL' && (
              <div className="absolute inset-0 bg-app-bg/90 backdrop-blur-sm z-50 flex items-center justify-center transition-opacity duration-200 animate-fade-in pointer-events-none" aria-hidden="true">
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

        <UpdateNotification />
        <VersionUpdateNotification onUpdateRequested={() => {
          // Use PWA context to apply update if available
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistration().then(registration => {
              if (registration?.waiting) {
                registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                setTimeout(() => window.location.reload(), 500);
              } else {
                // Fallback: just reload
                window.location.reload();
              }
            });
          } else {
            // Fallback: just reload
            window.location.reload();
          }
        }} />

        {isCustomKeyboardOpen && (
          <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up">
            <CustomKeyboard />
          </div>
        )}
      </div>
    </OfflineProvider>
  );
};

export default App;
