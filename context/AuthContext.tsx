/**
 * Authentication Context
 * 
 * Manages tenant authentication, user session, and license status.
 * Provides authentication state and methods throughout the application.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { getApiBaseUrl, isLocalOnlyMode, setSessionDataSource, clearSessionDataSource } from '../config/apiUrl';
import {
  clearDemoSessionFlags,
  markDemoSessionActive,
  DEMO_PUBLIC_TENANT_ID,
} from '../config/demoEnvironment';
import {
  clearWebsiteDemoEntry,
  isAutoDemoUrl,
  isWebsiteDemoEntry,
  resolveDemoAuthHandoff,
} from '../utils/demoAuthBootstrap';
import { trackEvent } from '../services/analytics/trackEvent';
import { resetDemoTourSession } from '../services/tours/demoTourSession';
import { apiClient } from '../services/api/client';
import { logger } from '../services/logger';
import { useCompanyOptional } from './CompanyContext';
import { applyDisplayTimezoneFromProfile, setDisplayTimeZoneUserContext } from '../utils/dateUtils';

export interface User {
  id: string;
  username: string;
  name: string;
  role: string;
  tenantId: string;
  /** IANA zone from `users.display_timezone` (PostgreSQL), or null = device local */
  displayTimezone?: string | null;
  /** Executive mobile vs full ERP preference (cloud only). */
  interfaceMode?: 'auto' | 'full_erp' | 'executive_mobile';
}

function syncDisplayTimezoneFromUser(user: User | null): void {
  if (!user?.id) {
    setDisplayTimeZoneUserContext(null);
    return;
  }
  setDisplayTimeZoneUserContext(user.id);
  if (user.displayTimezone !== undefined) {
    applyDisplayTimezoneFromProfile(user.displayTimezone);
  }
}

export interface Tenant {
  id: string;
  name: string;
  companyName: string;
}

export type CompanySummary = {
  id: string;
  name: string;
};

export type PendingCompanySelection = {
  companies: CompanySummary[];
  selectionToken: string;
  preferredCompanyId?: string | null;
  emailForStorage?: string;
};

export type CompanySwitchRequest = {
  companies: CompanySummary[];
};

const LOCAL_USER: User = {
  id: 'local-user',
  username: 'admin',
  name: 'Administrator',
  role: 'Admin',
  tenantId: 'local',
};

const LOCAL_TENANT: Tenant = {
  id: 'local',
  name: 'Local',
  companyName: 'Local',
};

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  tenant: Tenant | null;
  /** Login / register / MFA in progress (forms only — must not unmount ApiLoginScreen). */
  isLoading: boolean;
  /** One-time startup auth check (App shell may show a full-page loader). */
  isInitializing: boolean;
  error: string | null;
  /** After credential check when user has multiple organizations. */
  pendingCompanySelection: PendingCompanySelection | null;
  /** In-app organization switch (authenticated). */
  companySwitchRequest: CompanySwitchRequest | null;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string, tenantId?: string) => Promise<LoginResult>;
  selectCompany: (companyId: string, selectionToken?: string, isSwitch?: boolean) => Promise<LoginResult>;
  startCompanySwitch: () => Promise<void>;
  cancelCompanySelection: () => void;
  clearAuthError: () => void;
  verifyMfaLogin: (input: {
    mfaToken: string;
    totpCode?: string;
    recoveryCode?: string;
    usernameForStorage?: string;
  }) => Promise<void>;
  completeMfaSetupLogin: (input: {
    mfaSetupToken: string;
    code: string;
    usernameForStorage?: string;
  }) => Promise<{ backupCodes: string[] }>;
  lookupTenants: (organizationEmail: string) => Promise<Array<{ id: string; name: string; company_name: string; email: string }>>;
  smartLogin: (username: string, password: string, tenantId: string) => Promise<void>;
  unifiedLogin: (organizationEmail: string, username: string, password: string) => Promise<void>;
  registerTenant: (data: TenantRegistrationData) => Promise<{
    tenantId: string;
    trialDaysRemaining: number;
    registrationReference?: string;
    pendingApproval?: boolean;
    status?: string;
  }>;
  enterDemoSession: () => Promise<void>;
  logout: () => void;
  updateUserProfile: (patch: Partial<User>) => void;
  checkLicenseStatus: () => Promise<{
    isValid?: boolean;
    licenseType?: string;
    licenseStatus?: string;
    expiryDate?: string | null;
    daysRemaining?: number;
    isExpired?: boolean;
    modules?: string[];
  }>;
}

export interface TenantRegistrationData {
  companyName: string;
  email: string;
  phone?: string;
  address?: string;
  adminUsername: string;
  adminPassword: string;
  adminName: string;
  isSupplier?: boolean;
  /** Optional; server validates uniqueness and format. */
  requestedTenantId?: string;
  /** Referral code from invite link (?ref=). */
  referralCode?: string;
  /** Invitation token from email link (?invite=). */
  inviteToken?: string;
  legalAcceptances: Array<{ documentType: string; documentVersion: string }>;
  country?: string;
  captchaToken?: string;
}

export type LoginResult =
  | { status: 'authenticated' }
  | {
      status: 'company_selection_required';
      companies: CompanySummary[];
      selectionToken: string;
      preferredCompanyId?: string | null;
    }
  | {
      status: 'mfa_required';
      mfaToken: string;
      loginEventId?: string;
      user: User;
      tenant: Tenant;
    }
  | {
      status: 'mfa_setup_required';
      mfaSetupToken: string;
      loginEventId?: string;
      user: User;
      tenant: Tenant;
    };

type AuthSessionPayload = {
  token: string;
  loginEventId?: string;
  user: User;
  tenant: Tenant;
  usernameForStorage?: string;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    tenant: null,
    isLoading: false,
    isInitializing: true,
    error: null,
    pendingCompanySelection: null,
    companySwitchRequest: null,
  });

  // Multi-company integration: derive user from CompanyContext in local-only mode
  const companyCtx = useCompanyOptional();

  /**
   * Check license status. Throws on error so callers (e.g. LicenseContext) don't treat fallback as valid data.
   * Defined before smart/unified/login so hooks can reference it safely.
   */
  const checkLicenseStatus = useCallback(async () => {
    if (isLocalOnlyMode()) {
      return {
        isValid: true,
        daysRemaining: 999,
        licenseType: 'perpetual',
        licenseStatus: 'active',
        isExpired: false,
        modules: ['real_estate', 'rental'],
      };
    }
    const response = await apiClient.get<{
      isValid?: boolean;
      licenseType?: string;
      licenseStatus?: string;
      expiryDate?: string | null;
      daysRemaining?: number;
      isExpired?: boolean;
      modules?: string[];
    }>('/tenants/license-status');
    return response;
  }, []);

  // Flag to prevent heartbeat from re-creating sessions during logout
  const loggingOutRef = React.useRef(false);

  /**
   * Logout
   * Shows login page immediately so the user can type credentials while save/API/cleanup run in the background.
   */
  const logout = useCallback(async () => {
    // Local-only: save all data to SQLite first, then clear state (prevents loss of agreements etc. on logout)
    if (isLocalOnlyMode()) {
      if (typeof window !== 'undefined') {
        try {
          clearSessionDataSource();
        } catch {
          /* ignore */
        }
        try {
          logger.logCategory('auth', '💾 Saving data to SQLite before logout (local-only)...');
          await new Promise<void>((resolve) => {
            const handleSaveComplete = () => {
              window.removeEventListener('state-saved-for-logout', handleSaveComplete);
              resolve();
            };
            window.addEventListener('state-saved-for-logout', handleSaveComplete);
            window.dispatchEvent(new CustomEvent('save-state-before-logout'));
            setTimeout(() => {
              window.removeEventListener('state-saved-for-logout', handleSaveComplete);
              logger.warnCategory('auth', '⚠️ State save timeout, proceeding with logout');
              resolve();
            }, 30000);
          });
          logger.logCategory('auth', '✅ Data saved, clearing session');
        } catch (e) {
          logger.errorCategory('auth', 'Save before logout failed:', e);
        }
      }
      setState({
        isAuthenticated: false,
        user: null,
        tenant: null,
        isLoading: false,
        isInitializing: false,
        error: null,
        pendingCompanySelection: null,
        companySwitchRequest: null,
      });
      syncDisplayTimezoneFromUser(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('tenant_id');
        localStorage.removeItem('user_id');
      }
      return;
    }

    clearDemoSessionFlags();

    // Set flag FIRST to prevent heartbeat from re-creating sessions
    loggingOutRef.current = true;
    apiClient.setLoggingOut(true);

    // Capture before clearing so background cleanup can use them
    const currentTenantId = apiClient.getTenantId();

    // Show login page immediately so username/password fields are usable without delay
    setState({
      isAuthenticated: false,
      user: null,
      tenant: null,
      isLoading: false,
      isInitializing: false,
      error: null,
      pendingCompanySelection: null,
      companySwitchRequest: null,
    });
    syncDisplayTimezoneFromUser(null);

    // Run save, API logout, and cleanup in background (no blocking)
    (async () => {
      try {
        logger.logCategory('auth', '💾 Saving data before logout...');
        const savePromise = new Promise<void>((resolve) => {
          const handleSaveComplete = () => {
            window.removeEventListener('state-saved-for-logout', handleSaveComplete);
            resolve();
          };
          window.addEventListener('state-saved-for-logout', handleSaveComplete);
          window.dispatchEvent(new CustomEvent('save-state-before-logout'));
          setTimeout(() => {
            window.removeEventListener('state-saved-for-logout', handleSaveComplete);
            logger.warnCategory('auth', '⚠️ State save timeout, proceeding with logout');
            resolve();
          }, 15000);
        });
        await savePromise;
        logger.logCategory('auth', '✅ Data saved, proceeding with logout');

        await apiClient.post('/auth/logout', {
          loginEventId:
            typeof window !== 'undefined'
              ? sessionStorage.getItem('pbooks_login_event_id') ?? undefined
              : undefined,
        });
        logger.logCategory('auth', '✅ Logout API call completed, user status updated in cloud DB');
      } catch (error) {
        logger.errorCategory('auth', 'Logout API error:', error);
      } finally {
        apiClient.clearAuth();
        localStorage.removeItem('user_id');
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('pbooks_api_last_sync_at');
          sessionStorage.removeItem('pbooks_api_sync_tenant_id');
          sessionStorage.removeItem('pbooks_login_event_id');
        }
        apiClient.setLoggingOut(false);
      }
    })();
  }, []);

  /**
   * Heartbeat mechanism - keeps session alive by updating last_activity
   */
  useEffect(() => {
    if (!state.isAuthenticated || isLocalOnlyMode()) return;

    // Reset logout flag on fresh login so heartbeat works normally
    loggingOutRef.current = false;

    const HEARTBEAT_INTERVAL = 1 * 60 * 1000; // 1 minute (reduced from 2 minutes to ensure session stays active with 5-minute inactivity threshold)
    const INITIAL_DELAY = 5000; // 5 seconds delay before first heartbeat to avoid race condition
    let heartbeatInterval: NodeJS.Timeout | null = null;
    let initialTimeout: NodeJS.Timeout | null = null;

    const sendHeartbeat = async () => {
      if (loggingOutRef.current) return;
      try {
        await apiClient.post('/auth/heartbeat', {});
      } catch (error: any) {
        if (error?.code === 'SESSION_NOT_FOUND') {
          logger.logCategory('auth', 'Heartbeat: Session not found (may be race condition), will retry on next interval');
        } else if (error?.status === 401) {
          logger.logCategory('auth', 'Heartbeat failed (session may be invalid)');
        } else {
          logger.logCategory('auth', 'Heartbeat error:', error?.message || error);
        }
      }
    };

    // Delay first heartbeat to avoid race condition with session creation
    initialTimeout = setTimeout(() => {
      sendHeartbeat();
      heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    }, INITIAL_DELAY);

    return () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      if (initialTimeout) {
        clearTimeout(initialTimeout);
      }
    };
  }, [state.isAuthenticated]);

  // Bi-directional sync removed -- local-only architecture

  /**
   * Handle app close/refresh - attempt to logout gracefully
   */
  useEffect(() => {
    if (!state.isAuthenticated || isLocalOnlyMode()) return;

    const handleBeforeUnload = async (event: BeforeUnloadEvent) => {
      // Attempt to logout when app is closing
      // Note: This is best-effort - may not complete if page closes too quickly
      try {
        // Use sendBeacon for more reliable delivery during page unload
        const token = apiClient.getToken();
        if (token && typeof navigator !== 'undefined') {
          // Construct logout URL (same host as app so works when opened from another PC)
          const API_BASE_URL = getApiBaseUrl();
          const logoutUrl = `${API_BASE_URL}/auth/logout`;

          // Create headers with token
          const headers = new Headers();
          headers.append('Authorization', `Bearer ${token}`);
          headers.append('Content-Type', 'application/json');

          // sendBeacon doesn't support custom headers, so we'll use fetch with keepalive
          fetch(logoutUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({}),
            keepalive: true, // This allows the request to continue after page unload
          }).catch(() => {
            // Ignore errors - page is closing anyway
          });
        } else {
          // Fallback: try regular API call (may not complete if page closes quickly)
          await apiClient.post('/auth/logout', {}).catch(() => {
            // Ignore errors - page is closing anyway
          });
        }
      } catch (error) {
        // Ignore errors during page unload
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    }
  }, [state.isAuthenticated]);

  /**
   * Network disconnect detection
   */
  useEffect(() => {
    if (!state.isAuthenticated || isLocalOnlyMode()) return;

    const handleOnline = () => {
      logger.logCategory('auth', 'Network connection restored');
      // Session will be validated on next API call
    };

    const handleOffline = () => {
      logger.logCategory('auth', 'Network connection lost - session will be marked inactive');
      // Session will be marked inactive by middleware after 30 minutes of no activity
      // No need to do anything here - the heartbeat will fail and session will become stale
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, [state.isAuthenticated]);

  /**
   * Check authentication state on app load.
   * Auto-login from stored token is DISABLED - users must always enter credentials
   * to prevent unintended access and avoid fallback to generic "User" display name.
   */
  useEffect(() => {
    let isMounted = true;

    // Listen for auth expiration events from API client
    const handleAuthExpired = () => {
      logger.logCategory('auth', 'Auth expired event received, logging out...');
      logout();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('auth:expired', handleAuthExpired);
    }

    const checkAuth = async () => {
      try {
        // Local-only mode: derive user from CompanyContext (multi-company)
        if (isLocalOnlyMode()) {
          const companyUser = companyCtx?.authenticatedUser;
          const activeCompany = companyCtx?.activeCompany;
          // Only authenticated when user has logged in via company login (select company → login)
          const isAuthenticated = !!companyUser;

          const user: User | null = companyUser
            ? { id: companyUser.id, username: companyUser.username, name: companyUser.name, role: companyUser.role, tenantId: 'local' }
            : null;

          const tenant: Tenant | null = activeCompany
            ? { id: 'local', name: activeCompany.company_name, companyName: activeCompany.company_name }
            : null;

          if (typeof window !== 'undefined') {
            localStorage.setItem('tenant_id', 'local');
            if (user) localStorage.setItem('user_id', user.id);
            else localStorage.removeItem('user_id');
          }
          if (isMounted) {
            setState({
              isAuthenticated,
              user,
              tenant,
              isLoading: false,
              isInitializing: false,
              error: null,
            });
          }
          return;
        }

        // Website live demo: enter directly — never show the organization login picker.
        if (
          isWebsiteDemoEntry() ||
          isAutoDemoUrl() ||
          (typeof window !== 'undefined' && sessionStorage.getItem('pbooks_demo_auth'))
        ) {
          const demoPayload = await resolveDemoAuthHandoff();
          if (demoPayload && isMounted) {
            const { token, loginEventId, user, tenant } = demoPayload;
            localStorage.setItem('last_tenant_id', tenant.id);
            localStorage.setItem('last_identifier', user.username);
            localStorage.setItem('user_id', user.id);
            if (loginEventId) {
              sessionStorage.setItem('pbooks_login_event_id', loginEventId);
            }
            apiClient.setAuth(token, tenant.id);
            setSessionDataSource('postgres_api');
            sessionStorage.removeItem('pbooks_api_last_sync_at');
            sessionStorage.removeItem('pbooks_api_sync_tenant_id');
            syncDisplayTimezoneFromUser(user);
            markDemoSessionActive();
            resetDemoTourSession();
            clearWebsiteDemoEntry();
            trackEvent('demo_session_started', { source: 'bootstrap' });
            setState({
              isAuthenticated: true,
              user,
              tenant,
              isLoading: false,
              isInitializing: false,
              error: null,
            });
            window.dispatchEvent(new CustomEvent('auth:login-success'));
            return;
          }
          if (isMounted) {
            setState({
              isAuthenticated: false,
              user: null,
              tenant: null,
              isLoading: false,
              isInitializing: false,
              error: 'Live demo is unavailable right now. Please try again shortly.',
            });
            return;
          }
        }

        const token = apiClient.getToken();
        const tenantId = apiClient.getTenantId();

        if (token && tenantId) {
          // Auto-login disabled: clear any stored auth and require explicit credentials.
          // This prevents the app from logging in without user interaction and avoids
          // displaying the generic "User" fallback when JWT lacks user details.
          if (isMounted) {
            logger.logCategory('auth', 'Auto-login disabled: clearing stored auth, user must sign in');
            apiClient.clearAuth();
            if (typeof window !== 'undefined') {
              localStorage.removeItem('user_id');
            }
            setState({
              isAuthenticated: false,
              user: null,
              tenant: null,
              isLoading: false,
              isInitializing: false,
              error: null,
            });
          }
          return;
        }

        if (isMounted) {
          setState(prev => ({ ...prev, isLoading: false, isInitializing: false }));
        }
      } catch (error) {
        if (isMounted) {
          logger.errorCategory('auth', 'Auth check error:', error);
          setState(prev => ({ ...prev, isLoading: false, isInitializing: false }));
        }
      }
    };

    checkAuth();

    // Cleanup: remove event listener and mark as unmounted
    return () => {
      isMounted = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener('auth:expired', handleAuthExpired);
      }
    };
  }, [logout, companyCtx?.authenticatedUser, companyCtx?.activeCompany]);

  /**
   * Lookup tenants by organization email (Step 1 of login flow)
   */
  const lookupTenants = useCallback(async (organizationEmail: string) => {
    logger.logCategory('auth', '🔍 Looking up tenants for email:', organizationEmail.substring(0, 10) + '...');

    try {
      const response = await apiClient.post<{
        tenants: Array<{ id: string; name: string; company_name: string; email: string }>;
      }>('/auth/lookup-tenants', {
        organizationEmail,
      });

      logger.logCategory('auth', '📥 Received tenant lookup response:', {
        tenantsCount: response.tenants?.length || 0
      });

      return response.tenants || [];
    } catch (error: any) {
      logger.errorCategory('auth', '❌ Tenant lookup error:', {
        error: error,
        message: error?.message,
        status: error?.status,
        errorProperty: error?.error
      });
      throw error;
    }
  }, []);

  /**
   * Smart login - requires tenantId (Step 2 of login flow)
   */
  const smartLogin = useCallback(async (username: string, password: string, tenantId: string) => {
    if (isLocalOnlyMode()) {
      const companyUser = companyCtx?.authenticatedUser;
      const activeCompany = companyCtx?.activeCompany;
      const user: User = companyUser
        ? {
            id: companyUser.id,
            username: companyUser.username,
            name: companyUser.name,
            role: companyUser.role,
            tenantId: 'local',
            displayTimezone: companyUser.displayTimezone,
          }
        : LOCAL_USER;
      const tenant: Tenant = activeCompany
        ? { id: 'local', name: activeCompany.company_name, companyName: activeCompany.company_name }
        : LOCAL_TENANT;
      if (typeof window !== 'undefined') {
        localStorage.setItem('tenant_id', 'local');
        localStorage.setItem('user_id', user.id);
      }
      setState(prev => ({
        ...prev,
        isAuthenticated: true,
        user,
        tenant,
        isLoading: false,
        error: null,
      }));
      syncDisplayTimezoneFromUser(user);
      setSessionDataSource('sqlite');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:login-success'));
      }
      return;
    }
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    logger.logCategory('auth', '🔐 Starting smart login:', { username: username.substring(0, 10) + '...', hasPassword: !!password, tenantId });

    try {
      logger.logCategory('auth', '📤 Sending login request to server...');
      const response = await apiClient.post<{
        token: string;
        user: User;
        tenant: Tenant;
      }>('/auth/smart-login', {
        username,
        password,
        tenantId,
      });

      logger.logCategory('auth', '📥 Received login response:', {
        hasToken: !!response.token,
        hasUser: !!response.user,
        hasTenant: !!response.tenant
      });

      if (response.token && response.user && response.tenant) {
        logger.logCategory('auth', '✅ Login successful, processing response...');

        // Store tenant info in localStorage for post-login session management
        localStorage.setItem('last_tenant_id', response.tenant.id);
        localStorage.setItem('last_username', username);
        localStorage.setItem('user_id', response.user.id); // Store user_id for local database tracking

        // Set authentication
        apiClient.setAuth(response.token, response.tenant.id);
        setSessionDataSource('postgres_api');

        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('pbooks_api_last_sync_at');
          sessionStorage.removeItem('pbooks_api_sync_tenant_id');
        }

        // Verify token is valid by checking it can be decoded
        try {
          const parts = response.token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            const exp = payload.exp * 1000;
            if (Date.now() >= exp) {
              logger.errorCategory('auth', '❌ Token received from server is already expired!');
              throw new Error('Token is expired');
            }
            logger.logCategory('auth', '✅ Token validated - expires at:', new Date(exp).toISOString());
          }
        } catch (tokenError) {
          logger.errorCategory('auth', '❌ Invalid token format received from server:', tokenError);
          throw new Error('Invalid token received from server');
        }

        setState(prev => ({
          ...prev,
          isAuthenticated: true,
          user: response.user,
          tenant: response.tenant,
          isLoading: false,
          error: null,
        }));
        syncDisplayTimezoneFromUser(response.user);

        logger.logCategory('auth', '✅ Login completed successfully');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('auth:login-success'));
        }

      } else {
        logger.errorCategory('auth', 'Invalid response from server:', { response });
        throw new Error('Invalid response from server - missing token, user, or tenant');
      }
    } catch (error: any) {
      logger.errorCategory('auth', 'Login error caught:', {
        error: error,
        message: error?.message,
        status: error?.status,
        errorProperty: error?.error
      });
      const errorMessage = error?.error || error?.message || 'Login failed';
      setState(prev => ({
        ...prev,
        isAuthenticated: false,
        user: null,
        tenant: null,
        isLoading: false,
        error: errorMessage,
      }));
      throw error;
    }
  }, [companyCtx?.authenticatedUser, companyCtx?.activeCompany]);

  /**
   * Unified login - takes organizationEmail, username, and password all at once
   */
  const unifiedLogin = useCallback(async (organizationEmail: string, username: string, password: string) => {
    if (isLocalOnlyMode()) {
      const companyUser = companyCtx?.authenticatedUser;
      const activeCompany = companyCtx?.activeCompany;
      const user: User = companyUser
        ? {
            id: companyUser.id,
            username: companyUser.username,
            name: companyUser.name,
            role: companyUser.role,
            tenantId: 'local',
            displayTimezone: companyUser.displayTimezone,
          }
        : LOCAL_USER;
      const tenant: Tenant = activeCompany
        ? { id: 'local', name: activeCompany.company_name, companyName: activeCompany.company_name }
        : LOCAL_TENANT;
      if (typeof window !== 'undefined') {
        localStorage.setItem('tenant_id', 'local');
        localStorage.setItem('user_id', user.id);
      }
      setState(prev => ({
        ...prev,
        isAuthenticated: true,
        user,
        tenant,
        isLoading: false,
        error: null,
      }));
      syncDisplayTimezoneFromUser(user);
      setSessionDataSource('sqlite');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:login-success'));
      }
      return;
    }
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    logger.logCategory('auth', '🔐 Starting unified login:', {
      orgEmail: organizationEmail.substring(0, 15) + '...',
      username: username.substring(0, 10) + '...',
      hasPassword: !!password
    });

    try {
      logger.logCategory('auth', '📤 Sending unified login request to server...');
      const response = await apiClient.post<{
        token: string;
        user: User;
        tenant: Tenant;
      }>('/auth/unified-login', {
        organizationEmail,
        username,
        password,
      });

      logger.logCategory('auth', '📥 Received unified login response:', {
        hasToken: !!response.token,
        hasUser: !!response.user,
        hasTenant: !!response.tenant
      });

      if (response.token && response.user && response.tenant) {
        logger.logCategory('auth', '✅ Unified login successful, processing response...');

        // Store tenant info in localStorage for post-login session management
        localStorage.setItem('last_tenant_id', response.tenant.id);
        localStorage.setItem('last_username', username);
        localStorage.setItem('last_organization_email', organizationEmail);
        localStorage.setItem('user_id', response.user.id); // Store user_id for local database tracking

        // Set authentication
        apiClient.setAuth(response.token, response.tenant.id);
        setSessionDataSource('postgres_api');

        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('pbooks_api_last_sync_at');
          sessionStorage.removeItem('pbooks_api_sync_tenant_id');
        }

        // Verify token is valid by checking it can be decoded
        try {
          const parts = response.token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            const exp = payload.exp * 1000;
            if (Date.now() >= exp) {
              logger.errorCategory('auth', '❌ Token received from server is already expired!');
              throw new Error('Token is expired');
            }
            logger.logCategory('auth', '✅ Token validated - expires at:', new Date(exp).toISOString());
          }
        } catch (tokenError) {
          logger.errorCategory('auth', '❌ Invalid token format received from server:', tokenError);
          throw new Error('Invalid token received from server');
        }

        setState(prev => ({
          ...prev,
          isAuthenticated: true,
          user: response.user,
          tenant: response.tenant,
          isLoading: false,
          error: null,
        }));
        syncDisplayTimezoneFromUser(response.user);

        logger.logCategory('auth', '✅ Unified login completed successfully');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('auth:login-success'));
        }

        // Load license immediately so features enable without waiting for LicenseContext effect.
        // Defer dispatch so LicenseContext has committed and can receive the event.
        checkLicenseStatus()
          .then((licenseStatus) => {
            if (typeof window !== 'undefined' && licenseStatus && ('licenseType' in licenseStatus || 'licenseStatus' in licenseStatus)) {
              const dispatch = () => window.dispatchEvent(new CustomEvent('license-status-loaded', { detail: licenseStatus }));
              if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(dispatch);
              else setTimeout(dispatch, 0);
            }
          })
          .catch((err) => logger.warnCategory('auth', 'Post-login license fetch failed (will retry in context):', err));

        // Cloud settings sync removed -- local-only architecture
        try {
          const cloudSettings: any = null;

          // Dispatch settings to AppContext if available
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('load-cloud-settings', {
              detail: cloudSettings
            }));
          }

          logger.logCategory('auth', '✅ Settings loaded from cloud database');
        } catch (settingsError) {
          logger.warnCategory('auth', '⚠️ Failed to load settings from cloud, will use local settings:', settingsError);
        }
      } else {
        logger.errorCategory('auth', '❌ Invalid response from server:', { response });
        throw new Error('Invalid response from server - missing token, user, or tenant');
      }
    } catch (error: any) {
      logger.errorCategory('auth', '❌ Unified login error caught:', {
        error: error,
        message: error?.message,
        status: error?.status,
        errorProperty: error?.error
      });
      const errorMessage = error?.error || error?.message || 'Login failed';
      setState(prev => ({
        ...prev,
        isAuthenticated: false,
        user: null,
        tenant: null,
        isLoading: false,
        error: errorMessage,
      }));
      throw error;
    }
  }, [companyCtx?.authenticatedUser, companyCtx?.activeCompany, checkLicenseStatus]);

  /**
   * Apply a successful auth session (JWT + user + tenant) after login or MFA.
   */
  const applyAuthSession = useCallback((payload: AuthSessionPayload) => {
    const { token, loginEventId, user, tenant, usernameForStorage } = payload;
    localStorage.setItem('last_tenant_id', tenant.id);
    if (usernameForStorage) {
      localStorage.setItem('last_identifier', usernameForStorage);
    }
    if (user?.id) {
      localStorage.setItem('user_id', user.id);
    }
    if (loginEventId && typeof window !== 'undefined') {
      sessionStorage.setItem('pbooks_login_event_id', loginEventId);
    }
    apiClient.setAuth(token, tenant.id);
    setSessionDataSource('postgres_api');
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('pbooks_api_last_sync_at');
      sessionStorage.removeItem('pbooks_api_sync_tenant_id');
    }
    setState(prev => ({
      ...prev,
      isAuthenticated: true,
      user,
      tenant,
      isLoading: false,
      error: null,
      pendingCompanySelection: null,
      companySwitchRequest: null,
    }));
    syncDisplayTimezoneFromUser(user);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth:login-success'));
    }
    checkLicenseStatus()
      .then((licenseStatus) => {
        if (typeof window !== 'undefined' && licenseStatus && ('licenseType' in licenseStatus || 'licenseStatus' in licenseStatus)) {
          const dispatch = () => window.dispatchEvent(new CustomEvent('license-status-loaded', { detail: licenseStatus }));
          if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(dispatch);
          else setTimeout(dispatch, 0);
        }
      })
      .catch((err) => logger.warnCategory('auth', 'Post-login license fetch failed (will retry in context):', err));
  }, [checkLicenseStatus]);

  const parseAuthLoginResponse = useCallback(
    (
      response: {
        requiresCompanySelection?: boolean;
        selectionToken?: string;
        companies?: CompanySummary[];
        preferredCompanyId?: string | null;
        token?: string;
        mfaRequired?: boolean;
        mfaToken?: string;
        mfaSetupRequired?: boolean;
        mfaSetupToken?: string;
        loginEventId?: string;
        user?: User;
        tenant?: Tenant;
        company?: Tenant;
      },
      emailForStorage: string
    ): LoginResult => {
      if (response.requiresCompanySelection && response.selectionToken && response.companies?.length) {
        apiClient.clearAuth();
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: null,
          pendingCompanySelection: {
            companies: response.companies!,
            selectionToken: response.selectionToken!,
            preferredCompanyId: response.preferredCompanyId,
            emailForStorage,
          },
        }));
        return {
          status: 'company_selection_required',
          companies: response.companies,
          selectionToken: response.selectionToken,
          preferredCompanyId: response.preferredCompanyId,
        };
      }

      if (response.mfaRequired && response.mfaToken && response.user && response.tenant) {
        apiClient.clearAuth();
        setState(prev => ({ ...prev, isLoading: false, error: null }));
        return {
          status: 'mfa_required',
          mfaToken: response.mfaToken,
          loginEventId: response.loginEventId,
          user: response.user,
          tenant: response.tenant,
        };
      }

      if (response.mfaSetupRequired && response.mfaSetupToken && response.user && response.tenant) {
        apiClient.clearAuth();
        setState(prev => ({ ...prev, isLoading: false, error: null }));
        return {
          status: 'mfa_setup_required',
          mfaSetupToken: response.mfaSetupToken,
          loginEventId: response.loginEventId,
          user: response.user,
          tenant: response.tenant,
        };
      }

      if (!response.token || !response.user || !response.tenant) {
        throw new Error('Login failed: no session returned');
      }

      applyAuthSession({
        token: response.token,
        loginEventId: response.loginEventId,
        user: response.user,
        tenant: response.tenant,
        usernameForStorage: emailForStorage,
      });
      return { status: 'authenticated' };
    },
    [applyAuthSession]
  );

  /**
   * Sign in with email and password (no organization picker before auth).
   */
  const login = useCallback(async (email: string, password: string, tenantId?: string): Promise<LoginResult> => {
    setState(prev => ({ ...prev, isLoading: true, error: null, pendingCompanySelection: null }));

    try {
      const body: { email: string; password: string; tenantId?: string; username?: string } = {
        email: email.trim(),
        password,
      };
      if (tenantId?.trim()) {
        body.tenantId = tenantId.trim();
        body.username = email.trim();
      }

      const response = await apiClient.post<{
        requiresCompanySelection?: boolean;
        selectionToken?: string;
        companies?: CompanySummary[];
        preferredCompanyId?: string | null;
        token?: string;
        mfaRequired?: boolean;
        mfaToken?: string;
        mfaSetupRequired?: boolean;
        mfaSetupToken?: string;
        loginEventId?: string;
        user?: User;
        tenant?: Tenant;
        company?: Tenant;
      }>('/auth/login', body);

      const result = parseAuthLoginResponse(response, email.trim());
      if (result.status === 'authenticated' && tenantId?.trim() === DEMO_PUBLIC_TENANT_ID) {
        markDemoSessionActive();
        trackEvent('demo_session_started', { source: 'login', tenantId: DEMO_PUBLIC_TENANT_ID });
      }
      return result;
    } catch (error: any) {
      const errorMessage = error.error || error.message || 'Login failed';
      setState(prev => ({
        ...prev,
        isAuthenticated: false,
        user: null,
        tenant: null,
        isLoading: false,
        error: errorMessage,
        pendingCompanySelection: null,
      }));
      throw error;
    }
  }, [applyAuthSession, parseAuthLoginResponse]);

  const selectCompany = useCallback(async (
    companyId: string,
    selectionToken?: string,
    isSwitch = false
  ): Promise<LoginResult> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await apiClient.post<{
        token?: string;
        mfaRequired?: boolean;
        mfaToken?: string;
        mfaSetupRequired?: boolean;
        mfaSetupToken?: string;
        loginEventId?: string;
        user?: User;
        tenant?: Tenant;
      }>('/auth/select-company', {
        companyId,
        ...(selectionToken ? { selectionToken } : {}),
      });

      const emailForStorage =
        state.pendingCompanySelection?.emailForStorage ||
        localStorage.getItem('last_identifier') ||
        response.user?.username ||
        '';

      const result = parseAuthLoginResponse(response, emailForStorage);
      if (result.status === 'authenticated' && isSwitch && typeof window !== 'undefined') {
        window.location.reload();
      }
      return result;
    } catch (error: any) {
      const errorMessage = error.error || error.message || 'Could not open organization';
      setState(prev => ({ ...prev, isLoading: false, error: errorMessage }));
      throw error;
    }
  }, [parseAuthLoginResponse, state.pendingCompanySelection?.emailForStorage]);

  const startCompanySwitch = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const companies = await apiClient.get<CompanySummary[]>('/auth/my-companies');
      const list = Array.isArray(companies) ? companies : [];
      if (list.length <= 1) {
        setState(prev => ({ ...prev, isLoading: false }));
        return;
      }
      setState(prev => ({
        ...prev,
        isLoading: false,
        companySwitchRequest: { companies: list },
      }));
    } catch (error: any) {
      const errorMessage = error.error || error.message || 'Could not load organizations';
      setState(prev => ({ ...prev, isLoading: false, error: errorMessage }));
      throw error;
    }
  }, []);

  const cancelCompanySelection = useCallback(() => {
    setState(prev => ({
      ...prev,
      pendingCompanySelection: null,
      companySwitchRequest: null,
      isLoading: false,
      error: null,
    }));
  }, []);

  const clearAuthError = useCallback(() => {
    setState(prev => (prev.error ? { ...prev, error: null } : prev));
  }, []);

  const verifyMfaLogin = useCallback(async (input: {
    mfaToken: string;
    totpCode?: string;
    recoveryCode?: string;
    usernameForStorage?: string;
  }) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const { mfaApi } = await import('../services/api/mfaApi');
      const response = await mfaApi.verify({
        mfaToken: input.mfaToken,
        totpCode: input.totpCode,
        recoveryCode: input.recoveryCode,
      });
      applyAuthSession({
        token: response.token,
        loginEventId: response.loginEventId,
        user: response.user,
        tenant: response.tenant,
        usernameForStorage: input.usernameForStorage,
      });
    } catch (error: any) {
      const errorMessage = error.error || error.message || 'MFA verification failed';
      setState(prev => ({ ...prev, isLoading: false, error: errorMessage }));
      throw error;
    }
  }, [applyAuthSession]);

  const completeMfaSetupLogin = useCallback(async (input: {
    mfaSetupToken: string;
    code: string;
    usernameForStorage?: string;
  }): Promise<{ backupCodes: string[] }> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const { mfaApi } = await import('../services/api/mfaApi');
      const response = await mfaApi.enable(input.code, input.mfaSetupToken);
      if (!response.token || !response.user || !response.tenant) {
        throw new Error('MFA setup did not return a session token');
      }
      applyAuthSession({
        token: response.token,
        loginEventId: response.loginEventId,
        user: response.user,
        tenant: response.tenant,
        usernameForStorage: input.usernameForStorage,
      });
      return { backupCodes: response.backupCodes };
    } catch (error: any) {
      const errorMessage = error.error || error.message || 'MFA setup failed';
      setState(prev => ({ ...prev, isLoading: false, error: errorMessage }));
      throw error;
    }
  }, [applyAuthSession]);

  const enterDemoSession = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await apiClient.post<{
        token: string;
        loginEventId?: string;
        user: User;
        tenant: Tenant;
      }>('/demo/enter', {});

      if (!response.token) {
        throw new Error('Demo session unavailable');
      }

      applyAuthSession({
        token: response.token,
        loginEventId: response.loginEventId,
        user: response.user,
        tenant: response.tenant,
        usernameForStorage: response.user.username,
      });
      markDemoSessionActive();
      resetDemoTourSession();
      clearWebsiteDemoEntry();
      trackEvent('demo_session_started', { source: 'in_app', tenantId: DEMO_PUBLIC_TENANT_ID });
    } catch (error: unknown) {
      const err = error as { error?: string; message?: string };
      const errorMessage = err.error || err.message || 'Could not start live demo';
      setState(prev => ({
        ...prev,
        isAuthenticated: false,
        user: null,
        tenant: null,
        isLoading: false,
        error: errorMessage,
      }));
      throw error;
    }
  }, [applyAuthSession]);

  /**
   * Register a new tenant (self-signup with free trial)
   */
  const registerTenant = useCallback(async (data: TenantRegistrationData) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await apiClient.post<{
        success: boolean;
        tenantId: string;
        message: string;
        trialDaysRemaining: number;
        registrationReference?: string;
        pendingApproval?: boolean;
        status?: string;
      }>('/auth/register-tenant', data);

      setState(prev => ({ ...prev, isLoading: false }));

      return {
        tenantId: response.tenantId,
        trialDaysRemaining: response.trialDaysRemaining,
        registrationReference: response.registrationReference,
        pendingApproval: response.pendingApproval,
        status: response.status,
      };
    } catch (error: any) {
      logger.errorCategory('auth', 'registerTenant error:', error);

      // Extract error message from various possible formats
      let errorMessage = 'Registration failed';

      if (error) {
        if (typeof error === 'string') {
          errorMessage = error;
        } else if (error.error) {
          errorMessage = error.error;
        } else if (error.message) {
          errorMessage = error.message;
        } else if (typeof error === 'object') {
          // Try to extract message from error object
          const errorStr = JSON.stringify(error);
          if (errorStr !== '{}') {
            errorMessage = errorStr;
          }
        }
      }

      // Error message set (no log needed)

      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      throw error;
    }
  }, []);

  const updateUserProfile = useCallback((patch: Partial<User>) => {
    setState((prev) => ({
      ...prev,
      user: prev.user ? { ...prev.user, ...patch } : prev.user,
    }));
  }, []);

  const contextValue = useMemo(() => ({
    ...state,
    login,
    selectCompany,
    startCompanySwitch,
    cancelCompanySelection,
    clearAuthError,
    verifyMfaLogin,
    completeMfaSetupLogin,
    lookupTenants,
    smartLogin,
    unifiedLogin,
    registerTenant,
    enterDemoSession,
    logout,
    updateUserProfile,
    checkLicenseStatus,
  }), [
    state,
    login,
    selectCompany,
    startCompanySwitch,
    cancelCompanySelection,
    clearAuthError,
    verifyMfaLogin,
    completeMfaSetupLogin,
    lookupTenants,
    smartLogin,
    unifiedLogin,
    registerTenant,
    enterDemoSession,
    logout,
    updateUserProfile,
    checkLicenseStatus,
  ]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * Hook to use authentication context
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    // Return default values instead of throwing to prevent module load errors
    // This allows AppContext to load even if AuthProvider isn't set up yet
    console.warn('useAuth called outside AuthProvider, returning default values');
    return {
      isAuthenticated: false,
      user: null,
      tenant: null,
      isLoading: false,
      isInitializing: false,
      error: null,
      pendingCompanySelection: null,
      companySwitchRequest: null,
      login: async () => { throw new Error('AuthProvider not mounted'); },
      selectCompany: async () => { throw new Error('AuthProvider not mounted'); },
      startCompanySwitch: async () => { },
      cancelCompanySelection: () => { },
      clearAuthError: () => { },
      verifyMfaLogin: async () => { throw new Error('AuthProvider not mounted'); },
      completeMfaSetupLogin: async () => { throw new Error('AuthProvider not mounted'); },
      lookupTenants: async () => [],
      smartLogin: async () => { },
      unifiedLogin: async () => { },
      registerTenant: async () => ({ tenantId: '', trialDaysRemaining: 0, pendingApproval: false }),
      enterDemoSession: async () => { },
      logout: () => { },
      updateUserProfile: () => { },
      checkLicenseStatus: async () => ({ isValid: false }),
    };
  }
  return context;
};

