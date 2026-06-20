
import React, { createContext, useContext, useReducer, useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { AppState, AppAction, Transaction, TransactionType, Account, Category, AccountType, LoanSubtype, InvoiceStatus, TransactionLogEntry, Page, Contract, ContractStatus, User, UserRole, ProjectAgreementStatus, Bill, SalesReturn, SalesReturnStatus, SalesReturnReason, Contact, Vendor, Invoice, RecurringInvoiceTemplate, ProjectReceivedAsset, Budget, PMCycleAllocation, Project, InstallmentPlan, PlanAmenity, Unit, RentalAgreement } from '../types';
import useDatabaseState from '../hooks/useDatabaseState';
import { useDatabaseStateFallback } from '../hooks/useDatabaseStateFallback';
import { getPersistableStateFingerprint } from '../services/state/persistableStateFingerprint';
import { MANDATORY_SYSTEM_ACCOUNTS } from '../constants/mandatorySystemAccounts';
import { MANDATORY_SYSTEM_CATEGORIES } from '../constants/mandatorySystemCategories';
import { findSalesReturnCategory } from '../constants/salesReturnSystemCategories';
import { resolveSystemCategoryId } from '../services/systemEntityIds';
import packageJson from '../package.json';
import { roleHasPermission } from '../shared/rbac/permissions';
import { isAccountingBackedByRemoteApi } from '../config/apiUrl';
import { notifyDatabaseError } from '../services/dbErrorNotification';
import { logger } from '../services/logger';
import { formatApiErrorMessage } from '../utils/formatApiErrorMessage';
import { reconcileRentalAgreementsList } from '../services/rentalAgreementReconcile';
import { resolveExpenseCategoryForBillPayment } from '../utils/rentalBillPayments';
import {
    adjustOrRemoveRentAggregateExpenseAfterIncomeRemoved,
    findSecuritySettlementCascadeDeletePartners,
    syncBillPaymentIncomeFromPairedExpense,
    syncPairedBillExpenseFromSecurityIncome,
    syncPairedExpenseToRentFromSecurityIncome,
    syncRentFromSecurityIncomeToPairedExpense,
} from '../utils/rentalSecurityDepositSettlement';
import { disconnectRealtimeSocket } from '../core/socket';
import { getQueryClient } from '../config/queryClient';
import {
    API_REFRESH_COOLDOWN_MS,
    API_REFRESH_DEBOUNCE_MS,
    TAB_VISIBILITY_COOLDOWN_MS,
    isWithinRefreshCooldown,
} from '../services/realtime/entityEventRefreshPolicy';
import { applyEntityReducerPatch } from '../services/realtime/entityReducerPatch';
import { initRealtimeDispatchHub } from '../services/realtime/RealtimeDispatchHub';
import {
    logPaymentTrace,
    logPaymentTraceTransition,
    logPaymentTraceAddTransaction,
    logPaymentTraceAddTransactionEnter,
    buildPaymentTraceTxExtra,
    buildExistsBeforeExtra,
    buildExistsAfterExtra,
    installPaymentDebugDevGlobals,
    syncDevAppStateExposure,
} from '../services/debug/paymentDisappearanceTrace';
import { toLocalDateString } from '../utils/dateUtils';
import { scheduleAfterNextPaint } from '../utils/interactionScheduling';
import {
    resolveOwnerForPropertyOnDate,
} from '../services/propertyOwnershipService';
import { syncPayslipsAfterTransactionAction, getTenantIdForPayroll, type TransactionPayslipSyncInput } from '../components/payroll/services/payrollRevert';
import { maybeQueueTransactionLogSync } from './syncTransactionLogToApi';
import InitializationScreen from '../components/InitializationScreen';
import {
  applyTxToInvoiceCopy,
  applyTxToBillCopy,
  txnFinancialSignature,
  updateContractStatus,
} from './reducers/appReducerEffects';

import { initialState } from './appInitialState';
import {
  _getAppState,
  _getAppDispatch,
  _getInitialDataLoading,
  _subscribeAppState,
  _notifyStateListeners,
  _setAppState,
  _setAppDispatch,
  _setInitialDataLoading,
  _setApiHydrationLoading,
  enqueueTransactionApiSave,
  enqueueInvoiceApiSave,
  RENTAL_ROLLUP_SYNC_INVALIDATE_MIN_MS,
  getRentalRollupLastInvalidateAfterSyncAt,
  setRentalRollupLastInvalidateAfterSyncAt,
} from './appStateStore';
import { appReducer } from './reducers/appReducer';
import {
  mergeTenantSettingsFromAction,
  mergePartialStateIntoBaseline,
} from './reducers/appStateMerge';
import { useAuth } from './AuthContext';
import { useCompanyOptional } from './CompanyContext';

// Re-export store accessors for backward compatibility (useSelectiveState, personalFinanceSync, etc.)
export {
  _getAppState,
  _getAppDispatch,
  _getInitialDataLoading,
  _subscribeAppState,
} from './appStateStore';

const AppContext = createContext<any>(undefined) as React.Context<{ state: AppState; dispatch: React.Dispatch<AppAction>; isInitialDataLoading?: boolean } | undefined>;

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Get auth status - must be called unconditionally at top level
    // AuthProvider wraps AppProvider in index.tsx, so this should work
    const auth = useAuth();
    const companyOpt = useCompanyOptional();
    const companyDbReloadTrigger = undefined;

    // Track previous auth state to detect when user re-authenticates
    const prevAuthRef = React.useRef<boolean>(false);
    const isAuthenticated = auth.isAuthenticated;

    // Track tenant ID to detect tenant switches (prevents cross-org data leaks).
    // Must follow auth.tenant.id — localStorage alone does not re-render when org changes in-session (e.g. live demo).
    const currentTenantId = React.useMemo(() => {
        const fromAuth = auth.tenant?.id?.trim();
        if (fromAuth) return fromAuth;
        try {
            if (typeof window !== 'undefined') {
                return localStorage.getItem('tenant_id');
            }
            return null;
        } catch (error) {
            console.warn('Failed to get tenant ID:', error);
            return null;
        }
    }, [auth.tenant?.id, companyOpt?.activeCompany?.id]);
    const prevTenantIdRef = React.useRef<string | null>(currentTenantId);
    const sessionRestoreRefreshDoneRef = useRef(false);
    const didPostAuthApiMergeRef = useRef(false);

    const [isInitializing, setIsInitializing] = useState(true);
    const [isInitialDataLoading, setIsInitialDataLoading] = useState(false);
    const [initMessage, setInitMessage] = useState('Initializing application...');
    const [initProgress, setInitProgress] = useState(0);
    const [useFallback, setUseFallback] = useState(false);
    const [initError, setInitError] = useState<string | null>(null);
    /** LAN/API mode: initial loadState() failed — do not hydrate from SQLite or continue as if data were synced. */
    const [apiStateLoadFailed, setApiStateLoadFailed] = useState(false);
    const [loadProgress, setLoadProgress] = useState<{ loaded: number; total: number } | null>(null);

    // 1. Initialize State with Database (with fallback to localStorage)
    // Hooks must be called unconditionally - always call both hooks
    // Then use the appropriate one based on useFallback state
    // Add error boundary logging before hooks

    const [dbState, setDbState, dbStateHelpers] = useDatabaseState<AppState>('finance_app_state_v4', initialState, companyDbReloadTrigger);
    const [fallbackState, setFallbackState] = useDatabaseStateFallback<AppState>('finance_app_state_v4', initialState);


    // Initialize storedState safely - use initialState as fallback if hooks aren't ready
    const storedState = (useFallback ? fallbackState : dbState) || initialState;
    const setStoredState = useFallback ? setFallbackState : setDbState;
    // Single saver contract: persist only via hook’s saveNow (see doc/DB_STATE_LOADER_SAVER_CONTRACT.md)
    const saveNow = dbStateHelpers?.saveNow;
    const dbIsLoading = dbStateHelpers?.isLoading ?? false;
    const markDbLoadCompleteRef = useRef(dbStateHelpers?.markDbLoadComplete);
    markDbLoadCompleteRef.current = dbStateHelpers?.markDbLoadComplete;

    useEffect(() => {
        setIsInitialDataLoading(!isInitializing && dbIsLoading);
    }, [isInitializing, dbIsLoading]);

    // Use a ref to track storedState to avoid initialization issues in dependency arrays
    // Initialize ref with initialState to ensure it's always defined
    const storedStateRef = useRef<AppState>(initialState);
    // Ref for dispatch so init effect (declared before useReducer) can update reducer when background sync completes
    const dispatchRef = useRef<React.Dispatch<AppAction> | null>(null);
    /** Set after refreshFromApi is defined; used from dispatch for post-conflict merge (declared early for closure). */
    const refreshFromApiRef = useRef<(() => Promise<void>) | null>(null);
    /** Shared across socket debounce, reconnect, and tab-visibility refresh (Phase 1). */
    const lastApiRefreshAtRef = useRef(0);
    useEffect(() => {
        if (storedState) {
            storedStateRef.current = storedState;
        }
    }, [storedState]);

    // 2. Version check and logout on version update or app relaunch
    useEffect(() => {
        const VERSION_STORAGE_KEY = 'app_version';
        const SESSION_FLAG_KEY = 'app_session_active';
        const currentVersion = packageJson.version;

        // Check if app was just launched (no session flag) or version changed
        const isAppRelaunched = !sessionStorage.getItem(SESSION_FLAG_KEY);
        const storedVersion = localStorage.getItem(VERSION_STORAGE_KEY);
        const versionChanged = storedVersion !== null && storedVersion !== currentVersion;
        const isFirstInstall = storedVersion === null;

        // Always update version if it doesn't exist or changed
        if (isFirstInstall || versionChanged) {
            localStorage.setItem(VERSION_STORAGE_KEY, currentVersion);
        }

        // Logout user if app relaunched OR version changed
        // Use functional update to avoid accessing storedState before initialization
        setStoredState(prev => {
            if (prev.currentUser && (isAppRelaunched || versionChanged)) {
                const reason = versionChanged ? `Version changed (${storedVersion} -> ${currentVersion})` : 'Application relaunched';
                return { ...prev, currentUser: null };
            }
            return prev;
        });

        // Set session flag to indicate app is running
        sessionStorage.setItem(SESSION_FLAG_KEY, 'true');

        // Clear session flag when page unloads (app closes)
        const handleBeforeUnload = () => {
            sessionStorage.removeItem(SESSION_FLAG_KEY);
        };
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, []); // Run only once on mount

    // 3. Run migration on mount if needed
    useEffect(() => {
        let isMounted = true;
        let timeoutId: NodeJS.Timeout;
        let forceTimeoutId: NodeJS.Timeout;

        const runMigration = async () => {
            try {

                // Safety timeout - if initialization takes more than 30 seconds, show error
                timeoutId = setTimeout(() => {
                    if (isMounted) {
                        console.warn('⚠️ Initialization timeout - continuing anyway');
                        setInitMessage('Taking longer than expected...');
                    }
                }, 30000);

                // Force continue after 45 seconds no matter what
                forceTimeoutId = setTimeout(() => {
                    if (isMounted) {
                        console.warn('⚠️ Force continuing initialization after 45 seconds');
                        setUseFallback(true);
                        setIsInitializing(false);
                    }
                }, 45000);

                setInitMessage('Loading application data...');
                setInitProgress(50);

                if (isAuthenticated) {
                    try {
                        setInitMessage('Loading application data from server...');
                        setInitProgress(60);
                        const { getAppStateApiService, pickTenantSettingsPartial } = await import('../services/api/appStateApi');
                        logger.logCategory('sync', '[STARTUP_SYNC_BEGIN] Starting initial full load via loadStateBulkChunked');
                        const partial = await getAppStateApiService().loadStateBulkChunked(
                            (loaded, total) => {
                                if (isMounted && total > 0) {
                                    const pct = Math.min(95, 60 + Math.floor((loaded / total) * 35));
                                    setInitProgress(pct);
                                }
                            }
                        );
                        if (isMounted) {
                            const mergedInit = { ...initialState, ...partial, ...pickTenantSettingsPartial(partial) } as AppState;
                            setStoredState(mergedInit);
                            if (typeof sessionStorage !== 'undefined') {
                                sessionStorage.setItem('pbooks_api_last_sync_at', new Date().toISOString());
                                if (currentTenantId) sessionStorage.setItem('pbooks_api_sync_tenant_id', currentTenantId);
                            }
                            // Suppress Executions 2 + 3: init already performed the full startup load.
                            didPostAuthApiMergeRef.current = true;
                            sessionRestoreRefreshDoneRef.current = true;
                            markDbLoadCompleteRef.current?.();
                            logger.logCategory('sync', '[STARTUP_SYNC_COMPLETE] Initial full load done — duplicate effects suppressed');
                        }
                    } catch (apiErr) {
                        logger.warnCategory(
                            'sync',
                            'API load failed — not using local database (no offline fallback to SQLite in API mode):',
                            apiErr
                        );
                        const msg =
                            apiErr instanceof Error
                                ? apiErr.message
                                : typeof apiErr === 'string'
                                  ? apiErr
                                  : 'Could not reach the server or load your data.';
                        if (!isMounted) return;
                        if (timeoutId) clearTimeout(timeoutId);
                        if (forceTimeoutId) clearTimeout(forceTimeoutId);
                        setInitError(msg);
                        setInitMessage('Could not load data from the server.');
                        setInitProgress(100);
                        setApiStateLoadFailed(true);
                        setIsInitializing(false);
                        return;
                    }
                    if (!isMounted) return;
                    if (timeoutId) clearTimeout(timeoutId);
                    if (forceTimeoutId) clearTimeout(forceTimeoutId);
                    setInitProgress(100);
                    setInitMessage('Ready!');
                    setTimeout(() => {
                        if (isMounted) setIsInitializing(false);
                    }, 300);
                } else {
                    if (!isMounted) return;
                    if (timeoutId) clearTimeout(timeoutId);
                    if (forceTimeoutId) clearTimeout(forceTimeoutId);
                    setInitProgress(100);
                    setInitMessage('Ready!');
                    setTimeout(() => {
                        if (isMounted) setIsInitializing(false);
                    }, 300);
                }
            } catch (error) {
                if (!isMounted) return;
                if (timeoutId) clearTimeout(timeoutId);
                if (forceTimeoutId) clearTimeout(forceTimeoutId);

                console.error('❌ Initialization error:', error);
                const errorMsg = error instanceof Error ? error.message : 'Unknown initialization error';

                // Log error
                try {
                    const { getErrorLogger } = await import('../services/errorLogger');
                    getErrorLogger().logError(error instanceof Error ? error : new Error(String(error)), {
                        errorType: 'initialization',
                        componentStack: 'AppProvider initialization'
                    });
                } catch (logError) {
                    console.error('Failed to log initialization error:', logError);
                }

                setInitMessage(`⚠️ Warning: ${errorMsg}. Using localStorage fallback.`);
                // Switch to fallback mode
                setUseFallback(true);
                // Still allow app to continue with initial state - don't block the UI
                setTimeout(() => {
                    if (isMounted) {
                        setIsInitializing(false);
                    }
                }, 2000);
            }
        };

        runMigration();

        return () => {
            isMounted = false;
            if (timeoutId) clearTimeout(timeoutId);
            if (forceTimeoutId) clearTimeout(forceTimeoutId);
        };
    }, []);

    // 2. Wrap Reducer to Persist - OPTIMIZED: Skip sync for navigation actions
    const reducerWithPersistence = useCallback((state: AppState, action: AppAction) => {
        const newState = appReducer(state, action);

        // Optimization: If state didn't change (e.g. duplicate add), do nothing (no sync, no persistence)
        if (newState === state) {
            return newState;
        }

        const a = action as { type?: string; payload?: unknown };
        const txnTypes = new Set([
            'DELETE_TRANSACTION',
            'BATCH_DELETE_TRANSACTIONS',
            'UPDATE_TRANSACTION',
            'ADD_TRANSACTION',
            'BATCH_ADD_TRANSACTIONS',
            'RESTORE_TRANSACTION',
        ]);
        if (a.type && txnTypes.has(a.type)) {
            syncPayslipsAfterTransactionAction(
                getTenantIdForPayroll(),
                a.type,
                a.payload,
                state.transactions as unknown as TransactionPayslipSyncInput[],
                newState.transactions as unknown as TransactionPayslipSyncInput[]
            );
        }

        if (!(action as { _isRemote?: boolean })._isRemote) {
            maybeQueueTransactionLogSync(
                a.type,
                !!(action as { _isRemote?: boolean })._isRemote,
                state.transactionLog,
                newState.transactionLog
            );
        }

        // Sync Broadcast - Skip for navigation-only actions (performance optimization)
        if (!(action as any)._isRemote) {
            const NAVIGATION_ACTIONS = ['SET_PAGE', 'SET_INITIAL_TABS', 'CLEAR_INITIAL_TABS',
                'SET_INITIAL_TRANSACTION_TYPE', 'CLEAR_INITIAL_TRANSACTION_TYPE',
                'SET_INITIAL_TRANSACTION_FILTER', 'SET_INITIAL_IMPORT_TYPE',
                'CLEAR_INITIAL_IMPORT_TYPE', 'SET_EDITING_ENTITY', 'CLEAR_EDITING_ENTITY'];

            // Local-only: persistence runs via useDatabaseState / save hooks; no cloud broadcast.
        }

        return newState;
    }, []);

    // Use a ref to track if we've initialized the reducer with database state
    const reducerInitializedRef = useRef(false);

    // Initialize reducer with initialState first, then sync with storedState when ready
    // This avoids initialization issues with storedState
    const [state, baseDispatch] = useReducer(reducerWithPersistence, initialState);
    const latestStateRef = useRef(state);
    latestStateRef.current = state;

    /**
     * LAN/API session: SQLite is not source of truth for saving; persist mutations to PostgreSQL via REST.
     * Uses isAccountingBackedByRemoteApi (JWT + non-local tenant + API session) rather than build flags alone.
     * Transactions must be POSTed here — RentalPaymentModal and most flows only dispatch ADD_TRANSACTION.
     * Also sync invoice/bill paid amounts after payment transactions (applyTransactionEffect is local-only).
     * Skip when action came from server merge ( _isRemote ) to avoid feedback loops.
     */
    const lastInvoiceSaveErrorNoticeAtRef = useRef(0);
    const dispatch = useCallback(
        (action: AppAction) => {
            // LAN/API: allow REST sync when AuthContext says logged in OR a JWT is present (header uses token; context can lag).
            const hasAuthToken =
                typeof window !== 'undefined' && !!localStorage.getItem('auth_token');
            if (!isAccountingBackedByRemoteApi()) {
                baseDispatch(action);
                return;
            }
            if ((action as { _isRemote?: boolean })._isRemote) {
                const remote = action as { type: string; payload?: unknown; _isRemote?: boolean };
                const remotePrev = latestStateRef.current;
                if (remote.type === 'ADD_TRANSACTION') {
                    const tx = remote.payload as Transaction;
                    logPaymentTraceAddTransactionEnter('dispatch remote before baseDispatch', remotePrev.transactions, tx, {
                        isRemote: true,
                    });
                    baseDispatch(action);
                    logPaymentTraceAddTransaction(
                        'dispatch remote after baseDispatch',
                        remotePrev.transactions,
                        latestStateRef.current.transactions,
                        tx,
                        { isRemote: true }
                    );
                    return;
                } else if (remote.type === 'UPDATE_TRANSACTION') {
                    const tx = remote.payload as Transaction;
                    logPaymentTrace('UPDATE_TRANSACTION', 'dispatch remote (_isRemote)', remotePrev.transactions, {
                        ...buildExistsBeforeExtra(remotePrev.transactions, tx),
                    });
                } else if (remote.type === 'SET_STATE') {
                    const partial = remote.payload as Partial<AppState>;
                    logPaymentTrace('SET_STATE', 'dispatch remote (_isRemote) before reducer', remotePrev.transactions, {
                        payloadTransactionCount: partial.transactions?.length,
                        ...buildExistsAfterExtra(remotePrev.transactions, partial.transactions ?? remotePrev.transactions),
                    });
                }
                baseDispatch(action);
                return;
            }

            const a = action as { type: string; payload?: unknown };
            const prev = latestStateRef.current;

            if (a.type === 'ADD_TRANSACTION') {
                const tx = a.payload as Transaction;
                logPaymentTraceAddTransactionEnter('dispatch intercept before baseDispatch', prev.transactions, tx);
                const invoiceToSave =
                    tx.invoiceId && tx.id
                        ? (() => {
                              const inv = prev.invoices.find(i => i.id === tx.invoiceId);
                              return inv ? applyTxToInvoiceCopy(inv, tx, true) : undefined;
                          })()
                        : undefined;
                const billToSave =
                    tx.billId && tx.id
                        ? (() => {
                              const b = prev.bills.find(x => x.id === tx.billId);
                              return b ? applyTxToBillCopy(b, tx, true) : undefined;
                          })()
                        : undefined;
                baseDispatch(action);
                logPaymentTraceAddTransaction(
                    'dispatch intercept after baseDispatch',
                    prev.transactions,
                    latestStateRef.current.transactions,
                    tx
                );
                if (!tx?.id) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    const api = getAppStateApiService();
                    api.saveTransaction(tx)
                        .then(async (saved) => {
                            const v = typeof saved?.version === 'number' ? saved.version : undefined;
                            if (typeof v === 'number') {
                                dispatch({
                                    type: 'UPDATE_TRANSACTION',
                                    payload: { ...tx, version: v },
                                    _isRemote: true,
                                } as AppAction);
                                logPaymentTrace(
                                    'UPDATE_TRANSACTION',
                                    'dispatch intercept saveTransaction HTTP ack',
                                    latestStateRef.current.transactions,
                                    {
                                        ...buildPaymentTraceTxExtra({ ...tx, version: v }),
                                        transactionCountBefore: prev.transactions.length,
                                        transactionCountAfter: latestStateRef.current.transactions.length,
                                    }
                                );
                            }
                            // Server recalculates invoice/bill paid_amount + version in the same txn; do not POST stale rows (409 + spurious modal).
                            if (invoiceToSave && tx.invoiceId) {
                                const savedInv = await api.fetchInvoice(tx.invoiceId);
                                if (savedInv?.id) {
                                    dispatch({
                                        type: 'UPDATE_INVOICE',
                                        payload: savedInv,
                                        _isRemote: true,
                                    } as AppAction);
                                }
                            }
                            if (billToSave && tx.billId) {
                                const savedBill = await api.fetchBill(tx.billId);
                                if (savedBill?.id) {
                                    dispatch({
                                        type: 'UPDATE_BILL',
                                        payload: savedBill,
                                        _isRemote: true,
                                    } as AppAction);
                                }
                            }
                            queueMicrotask(() => {
                                void Promise.all([
                                    import('../config/queryClient'),
                                    import('../hooks/queries/useRentalRollupQueries'),
                                ])
                                    .then(([{ getQueryClient }, { rentalRollupQueryKeys }]) => {
                                        getQueryClient().invalidateQueries({ queryKey: rentalRollupQueryKeys.root });
                                    })
                                    .catch(() => {});
                            });
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist transaction (or linked invoice/bill) to API:', err);
                            notifyDatabaseError(new Error(formatApiErrorMessage(err)), {
                                title: 'Could not save to server',
                                context:
                                    'This change was not written to PostgreSQL. It may disappear after refresh or login and other users will not see it.',
                            });
                        });
                });
                return;
            }

            if (a.type === 'BATCH_ADD_TRANSACTIONS') {
                const txs = a.payload as Transaction[];
                const invoiceIds = [...new Set(txs.map(t => t.invoiceId).filter(Boolean) as string[])];
                const billIds = [...new Set(txs.map(t => t.billId).filter(Boolean) as string[])];
                const invoicesAfter = new Map<string, Invoice>();
                for (const id of invoiceIds) {
                    let inv = prev.invoices.find(i => i.id === id);
                    if (!inv) continue;
                    for (const tx of txs) {
                        if (tx.invoiceId === id) inv = applyTxToInvoiceCopy(inv, tx, true);
                    }
                    invoicesAfter.set(id, inv);
                }
                const billsAfter = new Map<string, Bill>();
                for (const id of billIds) {
                    let b = prev.bills.find(x => x.id === id);
                    if (!b) continue;
                    for (const tx of txs) {
                        if (tx.billId === id) b = applyTxToBillCopy(b, tx, true);
                    }
                    billsAfter.set(id, b);
                }
                baseDispatch(action);
                if (!txs?.length) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    const api = getAppStateApiService();
                    const accountIds = new Set<string>();
                    txs.forEach((tx) => {
                        if (tx.fromAccountId) accountIds.add(tx.fromAccountId);
                        if (tx.toAccountId) accountIds.add(tx.toAccountId);
                        if (tx.accountId) accountIds.add(tx.accountId);
                    });
                    const accountsToUpsert = [...accountIds]
                        .map((id) => prev.accounts.find((acc) => acc.id === id))
                        .filter((acc): acc is Account => !!acc);
                    const syncAccountsFirst = () =>
                        accountsToUpsert.length === 0
                            ? Promise.resolve<Account[]>([])
                            : Promise.all(
                                  accountsToUpsert.map((acc) =>
                                      // Omit client version: a previous batch (e.g. profit distribution) may have
                                      // already POSTed these accounts and bumped server version while the client
                                      // still holds the old version — stale version causes 409 CONFLICT.
                                      api.saveAccount({ ...acc, version: undefined })
                                  )
                              );
                    syncAccountsFirst()
                        .then((savedAccounts) => {
                            for (const saved of savedAccounts) {
                                if (saved?.id) {
                                    dispatch({
                                        type: 'UPDATE_ACCOUNT',
                                        payload: saved,
                                        _isRemote: true,
                                    } as AppAction);
                                }
                            }
                            return Promise.all(txs.map((tx) => api.saveTransaction(tx)));
                        })
                        .then(async (savedList) => {
                            for (let i = 0; i < txs.length; i++) {
                                const s = savedList[i];
                                const origTx = txs[i];
                                if (s && typeof s.version === 'number' && origTx?.id) {
                                    dispatch({
                                        type: 'UPDATE_TRANSACTION',
                                        payload: { ...origTx, version: s.version },
                                        _isRemote: true,
                                    } as AppAction);
                                }
                            }
                            for (const id of invoicesAfter.keys()) {
                                const savedInv = await api.fetchInvoice(id);
                                if (savedInv?.id) {
                                    dispatch({
                                        type: 'UPDATE_INVOICE',
                                        payload: savedInv,
                                        _isRemote: true,
                                    } as AppAction);
                                }
                            }
                            for (const id of billsAfter.keys()) {
                                const savedBill = await api.fetchBill(id);
                                if (savedBill?.id) {
                                    dispatch({
                                        type: 'UPDATE_BILL',
                                        payload: savedBill,
                                        _isRemote: true,
                                    } as AppAction);
                                }
                            }
                            queueMicrotask(() => {
                                void Promise.all([
                                    import('../config/queryClient'),
                                    import('../hooks/queries/useRentalRollupQueries'),
                                ])
                                    .then(([{ getQueryClient }, { rentalRollupQueryKeys }]) => {
                                        getQueryClient().invalidateQueries({ queryKey: rentalRollupQueryKeys.root });
                                    })
                                    .catch(() => {});
                            });
                        })
                        .catch((err: unknown) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist batch transactions to API:', err);
                            const e = err as { status?: number; code?: string };
                            if (e?.status === 409 || e?.code === 'LOCK_HELD' || e?.code === 'CONFLICT') {
                                void refreshFromApiRef.current?.();
                            } else {
                                notifyDatabaseError(new Error(formatApiErrorMessage(err)), {
                                    title: 'Could not save to server',
                                    context:
                                        'These transactions were not written to PostgreSQL. They may disappear after refresh or login.',
                                });
                            }
                        });
                });
                return;
            }

            if (a.type === 'BATCH_DELETE_TRANSACTIONS') {
                const payload = a.payload as { transactionIds: string[]; projectAssetIdToDelete?: string };
                const projectAssetIdToDelete = payload.projectAssetIdToDelete;
                const projectAssetVersionForApi = projectAssetIdToDelete
                    ? prev.projectReceivedAssets?.find((x) => x.id === projectAssetIdToDelete)?.version
                    : undefined;
                baseDispatch(action);

                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    const api = getAppStateApiService();
                    void (async () => {
                        try {
                            const afterSnap = latestStateRef.current;
                            const afterTxIds = new Set(afterSnap.transactions.map(t => t.id));
                            const removedTxs = prev.transactions.filter(t => !afterTxIds.has(t.id));
                            await Promise.all(removedTxs.map(r => api.deleteTransaction(r.id)));

                            const invoiceIds = new Set<string>();
                            const billIds = new Set<string>();
                            removedTxs.forEach((t) => {
                                if (t.invoiceId) invoiceIds.add(t.invoiceId);
                                if (t.billId) billIds.add(t.billId);
                            });

                            const assetDeleted = new Set<string>();
                            for (const rtx of removedTxs) {
                                const aid = rtx.projectAssetId;
                                if (!aid || assetDeleted.has(aid)) continue;
                                if (!afterSnap.transactions.some((t) => t.projectAssetId === aid)) {
                                    const ver = prev.projectReceivedAssets?.find(x => x.id === aid)?.version;
                                    await api.deleteProjectReceivedAsset(aid, ver).catch(() => {});
                                    assetDeleted.add(aid);
                                }
                            }

                            for (const iid of invoiceIds) {
                                const savedInv = await api.fetchInvoice(iid);
                                if (savedInv?.id) {
                                    dispatch({
                                        type: 'UPDATE_INVOICE',
                                        payload: savedInv,
                                        _isRemote: true,
                                    } as AppAction);
                                }
                            }
                            for (const bid of billIds) {
                                const savedBill = await api.fetchBill(bid);
                                if (savedBill?.id) {
                                    dispatch({
                                        type: 'UPDATE_BILL',
                                        payload: savedBill,
                                        _isRemote: true,
                                    } as AppAction);
                                }
                            }

                            if (projectAssetIdToDelete) {
                                await api
                                    .deleteProjectReceivedAsset(projectAssetIdToDelete, projectAssetVersionForApi)
                                    .catch(() => {});
                            }
                        } catch (err) {
                            logger.warnCategory('sync', '⚠️ Failed to persist batch transaction deletes to API:', err);
                        }
                    })();
                });
                return;
            }

            if (a.type === 'SET_LAST_SERVICE_CHARGE_RUN') {
                const lastRun = a.payload as string;
                baseDispatch(action);
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    const merged = { ...prev, lastServiceChargeRun: lastRun } as AppState;
                    void getAppStateApiService().flushTenantSettingsNow(merged);
                });
                return;
            }

            if (a.type === 'UPDATE_TRANSACTION') {
                const updatedTx = a.payload as Transaction;
                logPaymentTrace('UPDATE_TRANSACTION', 'dispatch intercept before baseDispatch', prev.transactions, {
                    ...buildExistsBeforeExtra(prev.transactions, updatedTx),
                    isRemote: !!(action as { _isRemote?: boolean })._isRemote,
                });
                flushSync(() => {
                    baseDispatch(action);
                });
                logPaymentTrace('UPDATE_TRANSACTION', 'dispatch intercept after baseDispatch', latestStateRef.current.transactions, {
                    ...buildExistsAfterExtra(prev.transactions, latestStateRef.current.transactions, updatedTx),
                });
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    const api = getAppStateApiService();
                    void enqueueTransactionApiSave(updatedTx.id, async () => {
                        try {
                            const beforeById = new Map(prev.transactions.map((t) => [t.id, t]));
                            const afterList = latestStateRef.current.transactions;
                            const touchedIds = new Set<string>();
                            for (const nt of afterList) {
                                const ot = beforeById.get(nt.id);
                                if (ot && txnFinancialSignature(nt) !== txnFinancialSignature(ot)) {
                                    touchedIds.add(nt.id);
                                }
                            }
                            if (
                                touchedIds.size === 0 &&
                                afterList.some((t) => t.id === updatedTx.id)
                            ) {
                                touchedIds.add(updatedTx.id);
                            }

                            const invoiceIdsToRefetch = new Set<string>();
                            const billIdsToRefetch = new Set<string>();

                            for (const tid of touchedIds) {
                                const row = latestStateRef.current.transactions.find((t) => t.id === tid);
                                if (!row) continue;

                                const saved = await api.saveTransaction(row);
                                const mergedVersion =
                                    typeof saved.version === 'number' ? saved.version : row.version;

                                dispatch({
                                    type: 'UPDATE_TRANSACTION',
                                    payload: { ...row, version: mergedVersion },
                                    _isRemote: true,
                                } as AppAction);

                                const synced = latestStateRef.current.transactions.find((x) => x.id === tid) ?? {
                                    ...row,
                                    version: mergedVersion,
                                };
                                if (synced.invoiceId) invoiceIdsToRefetch.add(synced.invoiceId);
                                if (synced.billId) billIdsToRefetch.add(synced.billId);
                            }

                            for (const iid of invoiceIdsToRefetch) {
                                const savedInv = await api.fetchInvoice(iid);
                                if (savedInv?.id) {
                                    dispatch({
                                        type: 'UPDATE_INVOICE',
                                        payload: savedInv,
                                        _isRemote: true,
                                    } as AppAction);
                                }
                            }
                            for (const bid of billIdsToRefetch) {
                                const savedBill = await api.fetchBill(bid);
                                if (savedBill?.id) {
                                    dispatch({
                                        type: 'UPDATE_BILL',
                                        payload: savedBill,
                                        _isRemote: true,
                                    } as AppAction);
                                }
                            }

                            const st = latestStateRef.current;
                            const cTx = st.transactions.find((t) => t.id === updatedTx.id);
                            if (cTx?.contractId) {
                                const cid = cTx.contractId;
                                const totalPaid = st.transactions
                                    .filter((t) => t.contractId === cid)
                                    .reduce((sum, t) => {
                                        const amt = t.id === cTx.id ? cTx.amount : t.amount;
                                        const n = typeof amt === 'number' ? amt : parseFloat(String(amt)) || 0;
                                        return sum + n;
                                    }, 0);
                                const c = st.contracts.find((x) => x.id === cid);
                                if (c && c.status !== ContractStatus.TERMINATED) {
                                    const isFullyPaid = totalPaid >= c.totalAmount - 1.0;
                                    let newStatus = c.status;
                                    if (isFullyPaid && c.status === ContractStatus.ACTIVE) {
                                        newStatus = ContractStatus.COMPLETED;
                                    } else if (!isFullyPaid && c.status === ContractStatus.COMPLETED) {
                                        newStatus = ContractStatus.ACTIVE;
                                    }
                                    if (newStatus !== c.status) {
                                        await api.saveContract({
                                            ...c,
                                            status: newStatus,
                                            version: c.version,
                                        });
                                    }
                                }
                            }
                        } catch (err) {
                            logger.warnCategory('sync', '⚠️ Failed to persist transaction update to API:', err);
                        }
                    });
                });
                return;
            }

            if (a.type === 'DELETE_TRANSACTION' && typeof a.payload === 'string') {
                const id = a.payload;
                baseDispatch(action);
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    const api = getAppStateApiService();
                    void (async () => {
                        try {
                            const afterSnap = latestStateRef.current;
                            const afterTxIds = new Set(afterSnap.transactions.map(t => t.id));
                            const removedTxs = prev.transactions.filter(t => !afterTxIds.has(t.id));

                            await Promise.all(removedTxs.map(r => api.deleteTransaction(r.id)));

                            const invoiceIds = new Set<string>();
                            const billIds = new Set<string>();
                            removedTxs.forEach((t) => {
                                if (t.invoiceId) invoiceIds.add(t.invoiceId);
                                if (t.billId) billIds.add(t.billId);
                            });

                            const assetHandled = new Set<string>();
                            for (const rtx of removedTxs) {
                                const aid = rtx.projectAssetId;
                                if (!aid || assetHandled.has(aid)) continue;
                                if (!afterSnap.transactions.some((t) => t.projectAssetId === aid)) {
                                    const ver = prev.projectReceivedAssets?.find(x => x.id === aid)?.version;
                                    await api.deleteProjectReceivedAsset(aid, ver).catch(() => {});
                                    assetHandled.add(aid);
                                }
                            }

                            for (const iid of invoiceIds) {
                                const savedInv = await api.fetchInvoice(iid);
                                if (savedInv?.id) {
                                    dispatch({
                                        type: 'UPDATE_INVOICE',
                                        payload: savedInv,
                                        _isRemote: true,
                                    } as AppAction);
                                }
                            }
                            for (const bid of billIds) {
                                const savedBill = await api.fetchBill(bid);
                                if (savedBill?.id) {
                                    dispatch({
                                        type: 'UPDATE_BILL',
                                        payload: savedBill,
                                        _isRemote: true,
                                    } as AppAction);
                                }
                            }
                        } catch (err) {
                            logger.warnCategory('sync', '⚠️ Failed to delete transaction on API:', err);
                        }
                    })();
                });
                return;
            }

            if (a.type === 'DELETE_INVOICE' && typeof a.payload === 'string') {
                const id = a.payload;
                const version = prev.invoices.find((i) => i.id === id)?.version;
                baseDispatch(action);
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .deleteInvoice(id, version)
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to delete invoice on API:', err);
                        });
                });
                return;
            }

            if (a.type === 'DELETE_PROJECT_RECEIVED_ASSET' && typeof a.payload === 'string') {
                const id = a.payload;
                const version = prev.projectReceivedAssets?.find((x) => x.id === id)?.version;
                baseDispatch(action);
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .deleteProjectReceivedAsset(id, version)
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to delete project received asset on API:', err);
                        });
                });
                return;
            }

            if (a.type === 'DELETE_SALES_RETURN' && typeof a.payload === 'string') {
                const id = a.payload;
                const version = prev.salesReturns?.find((x) => x.id === id)?.version;
                baseDispatch(action);
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .deleteSalesReturn(id, version)
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to delete sales return on API:', err);
                        });
                });
                return;
            }

            if (a.type === 'PROCESS_SALES_RETURN') {
                const { returnId } = a.payload as { returnId: string };
                const returnRecord = prev.salesReturns?.find(sr => sr.id === returnId);
                baseDispatch(action);
                if (!returnRecord) return;
                const updated: SalesReturn = {
                    ...returnRecord,
                    status: SalesReturnStatus.PROCESSED,
                    processedDate: new Date().toISOString(),
                };
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .saveSalesReturn(updated)
                        .then((saved) => {
                            if (saved && typeof saved.version === 'number') {
                                dispatch({
                                    type: 'UPDATE_SALES_RETURN',
                                    payload: { ...updated, ...saved },
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist processed sales return to API:', err);
                        });
                });
                return;
            }

            if (a.type === 'MARK_RETURN_REFUNDED') {
                const { returnId, refundDate } = a.payload as { returnId: string; refundDate: string };
                const returnRecord = prev.salesReturns?.find(sr => sr.id === returnId);
                baseDispatch(action);
                if (!returnRecord) return;
                const updated: SalesReturn = {
                    ...returnRecord,
                    status: SalesReturnStatus.REFUNDED,
                    refundedDate: refundDate,
                };
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .saveSalesReturn(updated)
                        .then((saved) => {
                            if (saved && typeof saved.version === 'number') {
                                dispatch({
                                    type: 'UPDATE_SALES_RETURN',
                                    payload: { ...updated, ...saved },
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist refunded sales return to API:', err);
                        });
                });
                return;
            }

            if (a.type === 'ADD_ACCOUNT') {
                const acc = a.payload as Account;
                baseDispatch(action);
                if (!acc?.id) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .saveAccount(acc)
                        .then((saved) => {
                            if (saved?.id) {
                                dispatch({
                                    type: 'UPDATE_ACCOUNT',
                                    payload: { ...acc, ...saved } as Account,
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist account to API:', err);
                        });
                });
                return;
            }

            if (a.type === 'UPDATE_ACCOUNT') {
                const acc = a.payload as Account;
                baseDispatch(action);
                if (!acc?.id) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .saveAccount(acc)
                        .then((saved) => {
                            if (saved?.id) {
                                dispatch({
                                    type: 'UPDATE_ACCOUNT',
                                    payload: { ...acc, ...saved } as Account,
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist account update to API:', err);
                        });
                });
                return;
            }

            if (a.type === 'DELETE_ACCOUNT' && typeof a.payload === 'string') {
                const id = a.payload;
                baseDispatch(action);
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .deleteAccount(id)
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to delete account on API:', err);
                        });
                });
                return;
            }

            baseDispatch(action);

            if (a.type === 'ADD_INVOICE' || a.type === 'UPDATE_INVOICE') {
                const inv = a.payload as Invoice;
                if (!inv?.id) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    void enqueueInvoiceApiSave(async () => {
                        try {
                            const saved = await getAppStateApiService().saveInvoice(inv);
                            if (saved && typeof saved.version === 'number') {
                                dispatch({
                                    type: 'UPDATE_INVOICE',
                                    payload: { ...inv, ...saved },
                                    _isRemote: true,
                                } as AppAction);
                            }
                        } catch (err) {
                            logger.warnCategory('sync', '⚠️ Failed to persist invoice to API:', err);
                            const now = Date.now();
                            if (now - lastInvoiceSaveErrorNoticeAtRef.current > 10_000) {
                                lastInvoiceSaveErrorNoticeAtRef.current = now;
                                notifyDatabaseError(new Error(formatApiErrorMessage(err)), {
                                    title: 'Could not save to server',
                                    context:
                                        'This invoice was not written to PostgreSQL. Other users cannot see it until it is saved successfully.',
                                });
                            }
                        }
                    });
                });
            } else if (a.type === 'ADD_BILL' || a.type === 'UPDATE_BILL') {
                const bill = a.payload as Bill;
                if (!bill?.id) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .saveBill(bill)
                        .then((saved) => {
                            if (saved && typeof saved.version === 'number') {
                                const merged = { ...bill, ...saved };
                                if (bill.id && saved.id && bill.id !== saved.id) {
                                    logger.logCategory(
                                        'sync',
                                        `↩️ Bill id reconciled for creator after save: ${bill.id} → ${saved.id} (${merged.billNumber})`
                                    );
                                }
                                dispatch({
                                    type: 'UPDATE_BILL',
                                    payload: merged,
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist bill to API:', err);
                            notifyDatabaseError(new Error(formatApiErrorMessage(err)), {
                                title: 'Could not save to server',
                                context:
                                    'This bill was not written to PostgreSQL. It may disappear after refresh or login.',
                            });
                        });
                });
            } else if (a.type === 'ADD_PM_CYCLE_ALLOCATION' || a.type === 'UPDATE_PM_CYCLE_ALLOCATION') {
                const alloc = a.payload as PMCycleAllocation;
                if (!alloc?.id) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    const api = getAppStateApiService();
                    const run = async () => {
                        if (alloc.billId) {
                            const b = latestStateRef.current.bills.find((x) => x.id === alloc.billId);
                            if (b) {
                                try {
                                    await api.saveBill(b);
                                } catch (be) {
                                    logger.warnCategory('sync', '⚠️ PM allocation: could not persist linked bill before allocation:', be);
                                }
                            }
                        }
                        return api.savePMCycleAllocation(alloc);
                    };
                    run()
                        .then((saved) => {
                            if (saved && typeof saved.version === 'number') {
                                dispatch({
                                    type: 'UPDATE_PM_CYCLE_ALLOCATION',
                                    payload: { ...alloc, ...saved },
                                    _isRemote: true,
                                } as any);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist PM cycle allocation to API:', err);
                        });
                });
            } else if (a.type === 'DELETE_PM_CYCLE_ALLOCATION' && typeof a.payload === 'string') {
                const id = a.payload;
                const version = prev.pmCycleAllocations?.find((x) => x.id === id)?.version;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .deletePMCycleAllocation(id, version)
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to delete PM cycle allocation on API:', err);
                        });
                });
            } else if (a.type === 'DELETE_BILL' && typeof a.payload === 'string') {
                const id = a.payload;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .deleteBill(id)
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to delete bill on API:', err);
                        });
                });
            } else if (a.type === 'ADD_CATEGORY' || a.type === 'UPDATE_CATEGORY') {
                const cat = a.payload as Category;
                if (!cat?.id) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .saveCategory(cat)
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist category to API:', err);
                        });
                });
            } else if (a.type === 'DELETE_CATEGORY' && typeof a.payload === 'string') {
                const id = a.payload;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .deleteCategory(id)
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to delete category on API:', err);
                        });
                });
            } else if (a.type === 'ADD_RECURRING_TEMPLATE' || a.type === 'UPDATE_RECURRING_TEMPLATE') {
                const tpl = a.payload as RecurringInvoiceTemplate;
                if (!tpl?.id) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .saveRecurringTemplate(tpl)
                        .then((saved) => {
                            if (saved && typeof saved.version === 'number') {
                                dispatch({
                                    type: 'UPDATE_RECURRING_TEMPLATE',
                                    payload: { ...tpl, version: saved.version },
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist recurring template to API:', err);
                        });
                });
            } else if (a.type === 'DELETE_RECURRING_TEMPLATE' && typeof a.payload === 'string') {
                const id = a.payload;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .deleteRecurringTemplate(id)
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to delete recurring template on API:', err);
                        });
                });
            } else if (a.type === 'ADD_PROJECT_RECEIVED_ASSET' || a.type === 'UPDATE_PROJECT_RECEIVED_ASSET') {
                const asset = a.payload as ProjectReceivedAsset;
                if (!asset?.id) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .saveProjectReceivedAsset(asset)
                        .then((saved) => {
                            if (saved && typeof saved.version === 'number') {
                                dispatch({
                                    type: 'UPDATE_PROJECT_RECEIVED_ASSET',
                                    payload: { ...asset, ...saved },
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist project received asset to API:', err);
                        });
                });
            } else if (a.type === 'ADD_SALES_RETURN' || a.type === 'UPDATE_SALES_RETURN') {
                const sr = a.payload as SalesReturn;
                if (!sr?.id) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .saveSalesReturn(sr)
                        .then((saved) => {
                            if (saved && typeof saved.version === 'number') {
                                dispatch({
                                    type: 'UPDATE_SALES_RETURN',
                                    payload: { ...sr, ...saved },
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist sales return to API:', err);
                        });
                });
            } else if (a.type === 'ADD_CONTRACT' || a.type === 'UPDATE_CONTRACT') {
                const c = a.payload as Contract;
                if (!c?.id) return;
                const version = c.version ?? prev.contracts?.find((x) => x.id === c.id)?.version;
                const contractForApi =
                    a.type === 'UPDATE_CONTRACT'
                        ? (() => {
                              const merged: AppState = {
                                  ...prev,
                                  contracts: (prev.contracts || []).map((x) => (x.id === c.id ? c : x)),
                              };
                              const reconciled = updateContractStatus(merged, c.id);
                              return reconciled.contracts?.find((x) => x.id === c.id) ?? c;
                          })()
                        : c;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .saveContract({ ...contractForApi, version })
                        .then((saved) => {
                            if (saved && typeof saved.version === 'number') {
                                dispatch({
                                    type: 'UPDATE_CONTRACT',
                                    payload: { ...contractForApi, ...saved },
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist contract to API:', err);
                        });
                });
            } else if (a.type === 'ADD_QUOTATION' || a.type === 'UPDATE_QUOTATION') {
                const quotation = a.payload as import('../types').Quotation;
                if (!quotation?.id) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .saveQuotation(quotation)
                        .then((saved) => {
                            dispatch({
                                type: 'UPDATE_QUOTATION',
                                payload: { ...quotation, ...saved },
                                _isRemote: true,
                            } as AppAction);
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist quotation to API:', err);
                            notifyDatabaseError(new Error(formatApiErrorMessage(err)), {
                                title: 'Could not save quotation',
                                context: 'The quotation was not written to PostgreSQL.',
                            });
                        });
                });
            } else if (a.type === 'DELETE_QUOTATION' && typeof a.payload === 'string') {
                const id = a.payload;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .deleteQuotation(id)
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to delete quotation on API:', err);
                        });
                });
            } else if (a.type === 'DELETE_CONTRACT' && typeof a.payload === 'string') {
                const id = a.payload;
                const version = prev.contracts?.find((x) => x.id === id)?.version;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .deleteContract(id, version)
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to delete contract on API:', err);
                        });
                });
            } else if (a.type === 'ADD_RENTAL_AGREEMENT') {
                const ra = a.payload as RentalAgreement;
                if (!ra?.id) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    const nextList = [...(prev.rentalAgreements || []), ra];
                    const reconciled = reconcileRentalAgreementsList(nextList);
                    const toSave = reconciled.find((r) => r.id === ra.id) ?? ra;
                    getAppStateApiService()
                        .saveRentalAgreement(toSave)
                        .then((saved) => {
                            if (saved?.id) {
                                dispatch({
                                    type: 'UPDATE_RENTAL_AGREEMENT',
                                    payload: { ...toSave, ...saved },
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist new rental agreement to API:', err);
                        });
                });
            } else if (a.type === 'UPDATE_RENTAL_AGREEMENT') {
                const ra = a.payload as RentalAgreement;
                if (!ra?.id) return;
                const version = ra.version ?? prev.rentalAgreements?.find((x) => x.id === ra.id)?.version;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .updateRentalAgreement(ra.id, { ...ra, version })
                        .then((saved) => {
                            if (saved?.id) {
                                dispatch({
                                    type: 'UPDATE_RENTAL_AGREEMENT',
                                    payload: { ...ra, ...saved },
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist rental agreement update to API:', err);
                        });
                });
            } else if (a.type === 'ADD_BUDGET' || a.type === 'UPDATE_BUDGET') {
                const b = a.payload as Budget;
                if (!b?.id) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .saveBudget(b)
                        .then((saved) => {
                            if (saved?.id) {
                                dispatch({
                                    type: 'UPDATE_BUDGET',
                                    payload: { ...b, ...saved },
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist budget to API:', err);
                        });
                });
            } else if (a.type === 'DELETE_BUDGET' && typeof a.payload === 'string') {
                const id = a.payload;
                const version = prev.budgets?.find((x) => x.id === id)?.version;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .deleteBudget(id, version)
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to delete budget on API:', err);
                        });
                });
            } else if (a.type === 'ADD_INSTALLMENT_PLAN' || a.type === 'UPDATE_INSTALLMENT_PLAN') {
                const plan = a.payload as InstallmentPlan;
                if (!plan?.id) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .saveInstallmentPlan(plan)
                        .then((saved) => {
                            if (saved && typeof saved.version === 'number') {
                                dispatch({
                                    type: 'UPDATE_INSTALLMENT_PLAN',
                                    payload: { ...plan, ...saved },
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist installment plan to API:', err);
                        });
                });
            } else if (a.type === 'DELETE_INSTALLMENT_PLAN' && typeof a.payload === 'string') {
                const id = a.payload;
                const version = prev.installmentPlans?.find((x) => x.id === id)?.version;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .deleteInstallmentPlan(id, version)
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to delete installment plan on API:', err);
                        });
                });
            } else if (a.type === 'ADD_PLAN_AMENITY' || a.type === 'UPDATE_PLAN_AMENITY') {
                const amenity = a.payload as PlanAmenity;
                if (!amenity?.id) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .savePlanAmenity(amenity)
                        .then((saved) => {
                            if (saved && typeof saved.version === 'number') {
                                dispatch({
                                    type: 'UPDATE_PLAN_AMENITY',
                                    payload: { ...amenity, ...saved },
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist plan amenity to API:', err);
                        });
                });
            } else if (a.type === 'DELETE_PLAN_AMENITY' && typeof a.payload === 'string') {
                const id = a.payload;
                const version = prev.planAmenities?.find((x) => x.id === id)?.version;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .deletePlanAmenity(id, version)
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to delete plan amenity on API:', err);
                        });
                });
            } else if (a.type === 'ADD_PROJECT') {
                const proj = a.payload as Project;
                if (!proj?.id) return;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .saveProject(proj)
                        .then((saved) => {
                            if (saved && typeof saved.version === 'number') {
                                dispatch({
                                    type: 'UPDATE_PROJECT',
                                    payload: { ...proj, ...saved },
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist project to API:', err);
                        });
                });
            } else if (a.type === 'UPDATE_PROJECT') {
                const proj = a.payload as Project;
                if (!proj?.id) return;
                const version = proj.version ?? prev.projects?.find((x) => x.id === proj.id)?.version;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .updateProject(proj.id, { ...proj, version })
                        .then((saved) => {
                            if (saved && typeof saved.version === 'number') {
                                dispatch({
                                    type: 'UPDATE_PROJECT',
                                    payload: { ...proj, ...saved },
                                    _isRemote: true,
                                } as AppAction);
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist project update to API:', err);
                        });
                });
            } else if (a.type === 'DELETE_PROJECT' && typeof a.payload === 'string') {
                const id = a.payload;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    getAppStateApiService()
                        .deleteProject(id)
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to delete project on API:', err);
                        });
                });
            } else if (a.type === 'ADD_UNIT' || a.type === 'UPDATE_UNIT') {
                const unit = a.payload as Unit;
                if (!unit?.id) return;
                const version = unit.version ?? prev.units?.find((x) => x.id === unit.id)?.version;
                void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                    const api = getAppStateApiService();
                    const save =
                        a.type === 'ADD_UNIT'
                            ? api.saveUnit(unit)
                            : api.updateUnit(unit.id, { ...unit, version });
                    save
                        .then((saved) => {
                            if (saved?.id) {
                                dispatch({
                                    type: 'UPDATE_UNIT',
                                    payload: { ...unit, ...saved },
                                    _isRemote: true,
                                } as AppAction);
                                void invalidateQueriesForEntityEvent(getQueryClient(), {
                                    type: 'unit',
                                    action: 'updated',
                                });
                            }
                        })
                        .catch((err) => {
                            logger.warnCategory('sync', '⚠️ Failed to persist unit to API:', err);
                        });
                });
            } else {
                const mergedForFlush = mergeTenantSettingsFromAction(prev, action as AppAction);
                if (mergedForFlush) {
                    void import('../services/api/appStateApi').then(({ getAppStateApiService }) => {
                        getAppStateApiService()
                            .flushTenantSettingsNow(mergedForFlush)
                            .catch((err) => {
                                logger.warnCategory('sync', '⚠️ Failed to persist tenant settings to API:', err);
                            });
                    });
                }
            }
        },
        [baseDispatch, isAuthenticated]
    );

    useEffect(() => {
        dispatchRef.current = dispatch;
        return () => {
            dispatchRef.current = null;
        };
    }, [dispatch]);

    // Sync reducer state with loaded database state (critical for first load)
    // Initialize with storedState when it's ready (after initialization)
    useEffect(() => {
        // Wait for initialization to complete and storedState to be ready
        if (!isInitializing && !apiStateLoadFailed && storedStateRef.current) {
            reducerInitializedRef.current = true;
            return;
        }
        // Only depend on isInitializing/apiStateLoadFailed to avoid running on every state change.
        // The ref guard (reducerInitializedRef) ensures this dispatches at most once; state
        // comparisons read from storedStateRef and the current state snapshot inside the effect.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isInitializing, apiStateLoadFailed, dispatch]);

    // Track latest state to avoid stale captures in async effects
    const stateRef = useRef(state);
    useEffect(() => {
        stateRef.current = state;
        syncDevAppStateExposure(state);
    }, [state]);

    useEffect(() => {
        installPaymentDebugDevGlobals();
    }, []);

    // Tenant isolation: clear all cached state when the tenant/organization changes.
    // Prevents data from one company leaking into another company's session.
    useEffect(() => {
        const prevTenantId = prevTenantIdRef.current;
        if (
            currentTenantId &&
            prevTenantId &&
            currentTenantId !== prevTenantId
        ) {
            logger.logCategory('sync', `🔒 Tenant switched (${prevTenantId} → ${currentTenantId}), clearing previous tenant state`);
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.removeItem('pbooks_api_last_sync_at');
            }
            dispatch({ type: 'SET_STATE', payload: initialState, _isRemote: true } as any);
            setStoredState(initialState);
            sessionRestoreRefreshDoneRef.current = false;
            didPostAuthApiMergeRef.current = false;
            void refreshFromApiRef.current?.();
        }
        prevTenantIdRef.current = currentTenantId;
    }, [currentTenantId, dispatch, setStoredState]);

    /**
     * Merge latest server state into React + persisted state (LAN / PostgreSQL API).
     * Required so User B sees projects/units created by User A without reloading the app.
     */
    const refreshFromApi = useCallback(async (_onCriticalLoaded?: () => void) => {
        if (!isAuthenticated) return;
        let hydrationStarted = false;
        try {
            const { getAppStateApiService, pickTenantSettingsPartial, getServerTimeIso } = await import('../services/api/appStateApi');
            // Use latestStateRef (updated synchronously in render body) rather than stateRef
            // (updated in a passive useEffect). The async refresh continuation can run before the
            // effect flushes, so stateRef may be one render stale and miss a just-added optimistic
            // payment — which then gets dropped by the merge if the server snapshot also lacks it.
            const base = latestStateRef.current;
            logPaymentTrace('refreshFromApi', 'start', base.transactions, {
                path: 'enter',
            });
            const lastSync = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('pbooks_api_last_sync_at') : null;
            const syncTenant = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('pbooks_api_sync_tenant_id') : null;

            // Guard: if the sync cursor belongs to a different tenant, discard it to force a
            // full load. Prevents merging another organization's deltas into the current session.
            const cursorMatchesTenant = !lastSync || (syncTenant === currentTenantId);

            // Incremental sync returns deltas (vendors, contacts, rental_agreements, project_agreements, invoices, bills, accounts, transactions, categories, app settings).
            // It does not re-fetch projects, buildings, properties, etc. Using it when the baseline is
            // still empty would leave PostgreSQL-backed data missing after a fresh login or when sessionStorage still
            // has pbooks_api_last_sync_at from an earlier tab session.
            // Do not use accounts/categories length: initialState always includes system seeds, which falsely
            // marked the baseline as "hydrated" and caused incremental-only merges to drop rental bills.
            const baselineHasCoreData =
                (base.projects?.length ?? 0) > 0 ||
                (base.contacts?.length ?? 0) > 0 ||
                (base.buildings?.length ?? 0) > 0 ||
                (base.properties?.length ?? 0) > 0 ||
                (base.vendors?.length ?? 0) > 0 ||
                (base.rentalAgreements?.length ?? 0) > 0 ||
                (base.invoices?.length ?? 0) > 0 ||
                (base.bills?.length ?? 0) > 0 ||
                (base.transactions?.length ?? 0) > 0;

            let merged: AppState;
            let nextSyncCursor: string;

            if (!baselineHasCoreData) {
                hydrationStarted = true;
                _setApiHydrationLoading(true);
            }

            if (lastSync && cursorMatchesTenant && baselineHasCoreData) {
                try {
                    const { merged: inc, serverCursor } = await getAppStateApiService().loadStateViaIncrementalSync(
                        lastSync,
                        latestStateRef.current
                    );
                    const mergeBaseline = latestStateRef.current;
                    logPaymentTrace('refreshFromApi', 'before merge (incremental)', mergeBaseline.transactions, {
                        path: 'incremental',
                        lastSync,
                    });
                    merged = mergePartialStateIntoBaseline(
                        mergeBaseline,
                        inc,
                        pickTenantSettingsPartial(inc)
                    );
                    logPaymentTraceTransition(
                        'refreshFromApi',
                        'after merge (incremental)',
                        mergeBaseline.transactions,
                        merged.transactions,
                        { path: 'incremental', lastSync, nextSyncCursor: serverCursor }
                    );
                    nextSyncCursor = serverCursor;
                } catch {
                    const partial = await getAppStateApiService().loadStateForSyncRefresh();
                    const mergeBaseline = latestStateRef.current;
                    logPaymentTrace('refreshFromApi', 'before merge (incremental fallback full)', mergeBaseline.transactions, {
                        path: 'incremental-fallback-full',
                    });
                    merged = mergePartialStateIntoBaseline(
                        mergeBaseline,
                        partial,
                        pickTenantSettingsPartial(partial)
                    );
                    logPaymentTraceTransition(
                        'refreshFromApi',
                        'after merge (incremental fallback full)',
                        mergeBaseline.transactions,
                        merged.transactions,
                        { path: 'incremental-fallback-full' }
                    );
                    nextSyncCursor = await getServerTimeIso();
                }
            } else {
                const partial = await getAppStateApiService().loadStateForSyncRefresh();
                const mergeBaseline = latestStateRef.current;
                // When the sync cursor doesn't match the current tenant (or is missing),
                // use initialState as the baseline to avoid mixing old tenant data.
                const safeBase = cursorMatchesTenant ? mergeBaseline : initialState;
                logPaymentTrace('refreshFromApi', 'before merge (full)', safeBase.transactions, {
                    path: 'full',
                    lastSync,
                    cursorMatchesTenant,
                });
                merged = mergePartialStateIntoBaseline(
                    safeBase,
                    partial,
                    pickTenantSettingsPartial(partial)
                );
                logPaymentTraceTransition(
                    'refreshFromApi',
                    'after merge (full)',
                    safeBase.transactions,
                    merged.transactions,
                    { path: 'full', lastSync }
                );
                nextSyncCursor = await getServerTimeIso();
            }

            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem('pbooks_api_last_sync_at', nextSyncCursor);
                if (currentTenantId) sessionStorage.setItem('pbooks_api_sync_tenant_id', currentTenantId);
            }

            dispatch({ type: 'SET_STATE', payload: merged, _isRemote: true } as any);
            logPaymentTrace('SET_STATE', 'dispatch from refreshFromApi', merged.transactions, {
                path: 'refreshFromApi',
                incremental: !!(lastSync && baselineHasCoreData),
            });
            setStoredState(prev => ({ ...prev, ...merged } as AppState));

            if (currentTenantId && roleHasPermission(auth.user?.role, 'payroll.read')) {
                const tenantForPayroll = currentTenantId;
                scheduleAfterNextPaint(() => {
                    void (async () => {
                        try {
                            const { storageService } = await import('../components/payroll/services/storageService');
                            storageService.init(tenantForPayroll);
                            await storageService.syncPayrollListsFromApi(tenantForPayroll);
                        } catch (pe) {
                            logger.warnCategory('sync', 'payroll list sync failed', pe);
                        }
                    })();
                });
            }

            logger.logCategory('sync', '✅ refreshFromApi: merged server state', {
                projects: merged.projects?.length ?? 0,
                units: merged.units?.length ?? 0,
                vendors: merged.vendors?.length ?? 0,
                contacts: merged.contacts?.length ?? 0,
                rentalAgreements: merged.rentalAgreements?.length ?? 0,
                projectAgreements: merged.projectAgreements?.length ?? 0,
                projectReceivedAssets: merged.projectReceivedAssets?.length ?? 0,
                salesReturns: merged.salesReturns?.length ?? 0,
                contracts: merged.contracts?.length ?? 0,
                invoices: merged.invoices?.length ?? 0,
                bills: merged.bills?.length ?? 0,
                accounts: merged.accounts?.length ?? 0,
                categories: merged.categories?.length ?? 0,
                transactions: merged.transactions?.length ?? 0,
                personalCategories: merged.personalCategories?.length ?? 0,
                personalTransactions: merged.personalTransactions?.length ?? 0,
                pmCycleAllocations: merged.pmCycleAllocations?.length ?? 0,
                incremental: !!(lastSync && baselineHasCoreData),
            });
            try {
                const { getQueryClient } = await import('../config/queryClient');
                const now = Date.now();
                if (now - getRentalRollupLastInvalidateAfterSyncAt() < RENTAL_ROLLUP_SYNC_INVALIDATE_MIN_MS) {
                    /* skip: rollup queries refetch is heavy for large tenants; tx saves still invalidate */
                } else {
                    setRentalRollupLastInvalidateAfterSyncAt(now);
                    const { rentalRollupQueryKeys } = await import('../hooks/queries/useRentalRollupQueries');
                    getQueryClient().invalidateQueries({ queryKey: rentalRollupQueryKeys.root });
                }
                const { dashboardMetricsQueryKeys } = await import('../hooks/useDashboardMetrics');
                void getQueryClient().invalidateQueries({ queryKey: dashboardMetricsQueryKeys.root });
            } catch {
                /* optional: query client not ready */
            }
            _onCriticalLoaded?.();
        } catch (e) {
            logger.warnCategory('sync', '⚠️ refreshFromApi failed:', e);
        } finally {
            if (hydrationStarted) {
                _setApiHydrationLoading(false);
            }
        }
    }, [isAuthenticated, dispatch, setStoredState, currentTenantId, auth.user?.role]);

    useEffect(() => {
        refreshFromApiRef.current = refreshFromApi;
    }, [refreshFromApi]);

    useEffect(() => {
        const onRequestApiRefresh = () => {
            void refreshFromApi();
        };
        if (typeof window === 'undefined') return;
        window.addEventListener('pbooks:request-api-refresh', onRequestApiRefresh);
        return () => window.removeEventListener('pbooks:request-api-refresh', onRequestApiRefresh);
    }, [refreshFromApi]);

    /** After auth hydrates, if init ran before isAuthenticated was true, SQLite had no API-backed projects — merge once. */
    useEffect(() => {
        if (!isAuthenticated) {
            didPostAuthApiMergeRef.current = false;
            return;
        }
        if (isInitializing || apiStateLoadFailed) return;
        if (didPostAuthApiMergeRef.current) {
            logger.logCategory('sync', '[STARTUP_SYNC_SKIPPED] didPostAuthApiMerge: initial load already complete');
            return;
        }
        didPostAuthApiMergeRef.current = true;
        void refreshFromApi();
    }, [isAuthenticated, isInitializing, apiStateLoadFailed, refreshFromApi]);

    /** Socket.IO: RealtimeDispatchHub owns connect + entity/financial/notification/reconnect listeners. */
    useEffect(() => {
        if (!isAuthenticated || apiStateLoadFailed) {
            disconnectRealtimeSocket();
            return;
        }
        const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
        if (!token) {
            disconnectRealtimeSocket();
            return;
        }

        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        const DEBOUNCE_MS = API_REFRESH_DEBOUNCE_MS;
        const COOLDOWN_MS = API_REFRESH_COOLDOWN_MS;

        const runRefreshFromApi = () => {
            lastApiRefreshAtRef.current = Date.now();
            void refreshFromApiRef.current?.();
        };

        const scheduleRefresh = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            const sinceLastRefresh = Date.now() - lastApiRefreshAtRef.current;
            if (sinceLastRefresh < COOLDOWN_MS) {
                debounceTimer = setTimeout(() => {
                    debounceTimer = null;
                    runRefreshFromApi();
                }, COOLDOWN_MS - sinceLastRefresh);
                return;
            }
            debounceTimer = setTimeout(() => {
                debounceTimer = null;
                runRefreshFromApi();
            }, DEBOUNCE_MS);
        };

        const cleanupHub = initRealtimeDispatchHub({
            authToken: token,
            queryClient: getQueryClient(),
            currentUserId: auth.user?.id,
            currentTenantId: currentTenantId ?? undefined,
            getLastRefreshAt: () => lastApiRefreshAtRef.current,
            scheduleRefresh,
            runRefreshFromApi,
            onEntityReducerPatch: (payload) => {
                applyEntityReducerPatch(payload, {
                    latestState: latestStateRef.current,
                    dispatch: baseDispatch,
                });
            },
        });

        return () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            cleanupHub();
        };
    }, [isAuthenticated, auth.user?.id, currentTenantId, apiStateLoadFailed]);

    /** When user returns to the tab, refresh from API so multi-user changes (e.g. new projects) appear. */
    useEffect(() => {
        if (!isAuthenticated || apiStateLoadFailed) return;
        let debounce: ReturnType<typeof setTimeout> | null = null;
        const onVisibility = () => {
            if (document.visibilityState !== 'visible') return;
            if (isWithinRefreshCooldown(Date.now(), lastApiRefreshAtRef.current, TAB_VISIBILITY_COOLDOWN_MS)) {
                return;
            }
            if (debounce) clearTimeout(debounce);
            debounce = setTimeout(() => {
                debounce = null;
                lastApiRefreshAtRef.current = Date.now();
                void refreshFromApiRef.current?.();
            }, 1200);
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            if (debounce) clearTimeout(debounce);
        };
    }, [isAuthenticated, apiStateLoadFailed]);


    // Reload AppContext from API when bidirectional sync completes
    useEffect(() => {
        const handleBidirDownstreamComplete = async () => {
            if (!isAuthenticated) return;
            try {
                const { getAppStateApiService, pickTenantSettingsPartial } = await import('../services/api/appStateApi');
                const partial = await getAppStateApiService().loadStateForSyncRefresh();
                // Synchronous ref (see refreshFromApi) so a just-created payment isn't dropped when
                // the bidir-complete handler runs before stateRef's passive effect has flushed.
                const mergeBaseline = latestStateRef.current;
                const lastSync =
                    typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('pbooks_api_last_sync_at') : null;
                const syncTenant =
                    typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('pbooks_api_sync_tenant_id') : null;
                const cursorMatchesTenant = !lastSync || syncTenant === currentTenantId;
                const safeBase = cursorMatchesTenant ? mergeBaseline : initialState;
                const loadedState = mergePartialStateIntoBaseline(
                    safeBase,
                    partial,
                    pickTenantSettingsPartial(partial)
                );
                if (
                    loadedState &&
                    (loadedState.transactions?.length > 0 ||
                        loadedState.contacts?.length > 0 ||
                        loadedState.invoices?.length > 0 ||
                        loadedState.accounts?.length > 0 ||
                        (loadedState.rentalAgreements?.length ?? 0) > 0)
                ) {
                    dispatch({ type: 'SET_STATE', payload: loadedState, _isRemote: true } as any);
                    setStoredState(loadedState as AppState);
                    markDbLoadCompleteRef.current?.();
                    logger.logCategory('sync', '✅ Reloaded AppContext from API after bidirectional sync');
                }
            } catch (apiErr) {
                logger.warnCategory('sync', '⚠️ Bidir reload: could not load from API:', apiErr);
            }
        };
        window.addEventListener('sync:bidir-downstream-complete', handleBidirDownstreamComplete as EventListener);
        return () => window.removeEventListener('sync:bidir-downstream-complete', handleBidirDownstreamComplete as EventListener);
    }, [dispatch, setStoredState, isAuthenticated, currentTenantId]);

    // Listen for cloud settings loaded after login
    useEffect(() => {
        const handleCloudSettingsLoaded = async (event: CustomEvent) => {
            const cloudSettings = event.detail;
            if (!cloudSettings || typeof cloudSettings !== 'object') return;


            // Apply settings to state
            if (cloudSettings.printSettings) {
                dispatch({ type: 'UPDATE_PRINT_SETTINGS', payload: cloudSettings.printSettings });
            }
            if (cloudSettings.whatsAppTemplates) {
                dispatch({ type: 'UPDATE_WHATSAPP_TEMPLATES', payload: cloudSettings.whatsAppTemplates });
            }
            if (cloudSettings.showSystemTransactions !== undefined) {
                dispatch({ type: 'TOGGLE_SYSTEM_TRANSACTIONS', payload: cloudSettings.showSystemTransactions });
            }
            if (cloudSettings.enableColorCoding !== undefined) {
                dispatch({ type: 'TOGGLE_COLOR_CODING', payload: cloudSettings.enableColorCoding });
            }
            if (cloudSettings.enableBeepOnSave !== undefined) {
                dispatch({ type: 'TOGGLE_BEEP_ON_SAVE', payload: cloudSettings.enableBeepOnSave });
            }
            if (cloudSettings.enableDatePreservation !== undefined) {
                dispatch({ type: 'TOGGLE_DATE_PRESERVATION', payload: cloudSettings.enableDatePreservation });
            }
            if (cloudSettings.defaultProjectId !== undefined) {
                dispatch({ type: 'UPDATE_DEFAULT_PROJECT', payload: cloudSettings.defaultProjectId });
            }
            if (cloudSettings.dashboardConfig) {
                dispatch({ type: 'UPDATE_DASHBOARD_CONFIG', payload: cloudSettings.dashboardConfig });
            }
            if (cloudSettings.accountConsistency) {
                dispatch({ type: 'UPDATE_ACCOUNT_CONSISTENCY', payload: cloudSettings.accountConsistency });
            }
            if (cloudSettings.agreementSettings) {
                dispatch({ type: 'UPDATE_AGREEMENT_SETTINGS', payload: cloudSettings.agreementSettings });
            }
            if (cloudSettings.projectAgreementSettings) {
                dispatch({ type: 'UPDATE_PROJECT_AGREEMENT_SETTINGS', payload: cloudSettings.projectAgreementSettings });
            }
            if (cloudSettings.rentalInvoiceSettings) {
                dispatch({ type: 'UPDATE_RENTAL_INVOICE_SETTINGS', payload: cloudSettings.rentalInvoiceSettings });
            }
            if (cloudSettings.projectInvoiceSettings) {
                dispatch({ type: 'UPDATE_PROJECT_INVOICE_SETTINGS', payload: cloudSettings.projectInvoiceSettings });
            }

        };

        window.addEventListener('load-cloud-settings', handleCloudSettingsLoaded as EventListener);
        return () => {
            window.removeEventListener('load-cloud-settings', handleCloudSettingsLoaded as EventListener);
        };
    }, [dispatch]);


    // 3. Unified SQLite persistence: any change to persisted data (add/update/delete) triggers saveNow.
    // Uses a full-data fingerprint (excluding navigation/UI-only fields) so in-place edits are detected,
    // not only array length changes. Serializes saves via a promise chain so rapid edits flush in order.
    const persistBaselineFingerprintRef = useRef<string | null>(null);
    const persistQueueRef = useRef(Promise.resolve());

    useEffect(() => {
        if (isInitializing || useFallback || !saveNow) return;

        const fp = getPersistableStateFingerprint(state);
        if (persistBaselineFingerprintRef.current === null) {
            persistBaselineFingerprintRef.current = fp;
            return;
        }
        if (fp === persistBaselineFingerprintRef.current) return;

        persistQueueRef.current = persistQueueRef.current
            .then(async () => {
                try {
                    await saveNow(stateRef.current);
                    persistBaselineFingerprintRef.current = getPersistableStateFingerprint(stateRef.current);
                } catch (error) {
                    console.error('❌ Failed to persist state to SQLite:', error);
                    try {
                        const { getErrorLogger } = await import('../services/errorLogger');
                        getErrorLogger().logError(error instanceof Error ? error : new Error(String(error)), {
                            errorType: 'auto_persist_failed',
                            componentStack: 'AppContext unified persist',
                        });
                    } catch {
                        /* ignore */
                    }
                }
            })
            .catch(() => {});
    }, [state, isInitializing, useFallback, saveNow]);

    // 🔧 FIX: Sync authenticated user from AuthContext to AppContext state
    useEffect(() => {
        if (auth.user && auth.isAuthenticated) {
            // User is authenticated - sync to state if not already synced
            if (!state.currentUser || state.currentUser.id !== auth.user.id) {
                dispatch({
                    type: 'LOGIN',
                    payload: {
                        id: auth.user.id,
                        username: auth.user.username,
                        name: auth.user.name,
                        role: auth.user.role as UserRole
                    }
                });
            }
        } else if (!auth.isAuthenticated && state.currentUser) {
            // User logged out - clear from state
            dispatch({ type: 'LOGOUT' });
        }
    }, [auth.user, auth.isAuthenticated, state.currentUser]);

    useEffect(() => {
        if (!isInitializing && state.currentUser && !useFallback && saveNow) {
            const saveTimer = setTimeout(async () => {
                try {
                    await saveNow(stateRef.current);
                } catch (error) {
                    console.error('Failed to save state after login:', error);
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    if (errorMsg.includes('no such table')) {
                        console.error('❌ CRITICAL: Missing database table!', errorMsg);

                        const errorDiv = document.createElement('div');
                        errorDiv.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#dc2626;color:white;padding:16px 24px;border-radius:8px;z-index:9999;max-width:600px;box-shadow:0 4px 6px rgba(0,0,0,0.1);';
                        errorDiv.innerHTML = `
                            <strong>⚠️ Database Error Detected</strong><br/>
                            <small>Missing table: ${errorMsg.match(/no such table: (\w+)/)?.[1]}</small><br/>
                            <button id="fixDbButton" 
                                style="margin-top:8px;background:white;color:#dc2626;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;font-weight:bold;">
                                Click to Fix Now
                            </button>
                            <button onclick="this.parentElement.remove()" 
                                style="margin-top:8px;margin-left:8px;background:transparent;color:white;border:1px solid white;padding:8px 16px;border-radius:4px;cursor:pointer;">
                                Dismiss
                            </button>
                        `;
                        document.body.appendChild(errorDiv);

                        const fixButton = document.getElementById('fixDbButton');
                        if (fixButton) {
                            fixButton.onclick = async () => {
                                fixButton.textContent = 'Fixing...';
                                fixButton.style.opacity = '0.5';
                                fixButton.style.cursor = 'wait';

                                try {
                                    setTimeout(() => location.reload(), 500);
                                } catch (error) {
                                    console.error('Error during fix:', error);
                                    fixButton.textContent = 'Error - Try again';
                                    fixButton.style.opacity = '1';
                                    fixButton.style.cursor = 'pointer';
                                }
                            };
                        }

                        setTimeout(() => errorDiv.remove(), 30000);
                    }
                }
            }, 100);

            return () => clearTimeout(saveTimer);
        }
        // Uses stateRef.current for the save snapshot; only re-run when login state changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.currentUser, isInitializing, useFallback, saveNow]);

    // Listen for logout event to save state before logout / update install (must dispatch detail.success for UpdateContext.installUpdate)
    useEffect(() => {
        const handleSaveStateBeforeLogout = async (_event: CustomEvent) => {
            let success = false;
            const snapshot = stateRef.current;
            try {
                logger.logCategory('database', '💾 Saving state before logout...');
                if (useFallback) {
                    // No native SQLite path; nothing to flush here
                    success = true;
                } else if (saveNow) {
                    await saveNow(snapshot, { disableSyncQueueing: true });
                    logger.logCategory('database', '✅ State saved successfully before logout');
                    success = true;
                } else {
                    success = true;
                }
            } catch (error) {
                logger.errorCategory('database', '❌ Failed to save state before logout:', error);
                success = false;
            }
            window.dispatchEvent(new CustomEvent('state-saved-for-logout', { detail: { success } }));
        };

        if (typeof window !== 'undefined') {
            window.addEventListener('save-state-before-logout', handleSaveStateBeforeLogout as EventListener);
            return () => {
                window.removeEventListener('save-state-before-logout', handleSaveStateBeforeLogout as EventListener);
            };
        }
    }, [useFallback, saveNow]);

    // Listen for incremental sync updates — accumulate chunks and dispatch once via requestIdleCallback
    useEffect(() => {
        let pendingEntities: Record<string, any[]> = {};
        let flushScheduled = false;

        const flushPending = () => {
            flushScheduled = false;
            if (Object.keys(pendingEntities).length === 0) return;
            dispatch({ type: 'BATCH_UPSERT_ENTITIES', payload: pendingEntities });
            pendingEntities = {};
        };

        const scheduleFlush = () => {
            if (flushScheduled) return;
            flushScheduled = true;
            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(flushPending, { timeout: 300 });
            } else {
                setTimeout(flushPending, 150);
            }
        };

        const handleChunkApplied = (event: CustomEvent) => {
            const { entities } = event.detail;
            if (!entities) return;
            for (const [key, items] of Object.entries(entities)) {
                if (!Array.isArray(items) || items.length === 0) continue;
                if (!pendingEntities[key]) pendingEntities[key] = [];
                pendingEntities[key].push(...items);
            }
            scheduleFlush();
        };

        if (typeof window !== 'undefined') {
            window.addEventListener('sync:chunk-applied', handleChunkApplied as EventListener);
            return () => {
                window.removeEventListener('sync:chunk-applied', handleChunkApplied as EventListener);
                if (Object.keys(pendingEntities).length > 0) flushPending();
            };
        }
    }, [dispatch]);

    // Auto-sync: on session restore, load from API when state is empty (init may have run before auth completed)
    useEffect(() => {
        // When authenticated and init done, if state has no core records OR no projects (API-only master data), refresh from API
        if (
            isAuthenticated &&
            !isInitializing &&
            !apiStateLoadFailed &&
            !sessionRestoreRefreshDoneRef.current
        ) {
            const hasData =
                (state.accounts?.length ?? 0) > 0 ||
                (state.transactions?.length ?? 0) > 0 ||
                (state.projects?.length ?? 0) > 0;
            const missingProjects = (state.projects?.length ?? 0) === 0;
            sessionRestoreRefreshDoneRef.current = true;
            if (!hasData || missingProjects) {
                logger.logCategory('sync', '[STARTUP_SYNC_BEGIN] sessionRestoreRefresh: state empty after init, triggering full load');
                void refreshFromApiRef.current?.();
            } else {
                logger.logCategory('sync', '[STARTUP_SYNC_SKIPPED] sessionRestoreRefresh: state already populated by init load');
            }
        }
        if (!isAuthenticated) {
            sessionRestoreRefreshDoneRef.current = false;
        }

        // Update previous auth state
        prevAuthRef.current = isAuthenticated;
    }, [
        isAuthenticated,
        isInitializing,
        apiStateLoadFailed,
        state.transactions?.length,
        state.accounts?.length,
        state.projects?.length,
    ]);

    // PERFORMANCE: Removed duplicate "reload data from API" effect that was dead code.
    // The condition `!prevAuthRef.current` could never be true here because the preceding
    // useEffect (auto-sync) already sets `prevAuthRef.current = isAuthenticated` before
    // this effect runs (React runs effects in declaration order).
    // The actual API load is handled by the refreshFromApi effect at line ~2738.

    // Keep module-level store in sync for useSyncExternalStore-based selective hooks.
    // State is set synchronously during render to avoid stale snapshots.
    // Dispatch is stable (from useReducer) so only needs to be set once.
    _setAppState(state);
    _setAppDispatch(dispatch);
    _setInitialDataLoading(isInitialDataLoading);
    useEffect(() => {
        _notifyStateListeners();
    });

    // PERFORMANCE: Memoize the context value to prevent cascading re-renders.
    // Without this, every render of AppProvider creates a new { state, dispatch } object,
    // causing ALL 155+ context consumers to re-render even when nothing changed.
    // IMPORTANT: This useMemo MUST be called before any conditional returns below,
    // because React hooks must be called in the same order on every render.
    const contextValue = useMemo(() => ({ state, dispatch, isInitialDataLoading }), [state, dispatch, isInitialDataLoading]);

    // Always mount AppContext.Provider so any descendant (e.g. KPIProvider) never renders outside the
    // context — conditional returns that omit the Provider caused "useAppContext must be used within an AppProvider".
    return (
        <AppContext.Provider value={contextValue}>
            {isInitializing || apiStateLoadFailed ? (
                <InitializationScreen
                    initMessage={initMessage}
                    initProgress={initProgress}
                    useFallback={useFallback}
                    errorMessage={apiStateLoadFailed ? initError : null}
                    onRetry={apiStateLoadFailed ? () => window.location.reload() : undefined}
                />
            ) : (
                children
            )}
        </AppContext.Provider>
    );
};

export const useAppContext = () => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};
