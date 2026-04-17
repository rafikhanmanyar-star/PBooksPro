/**
 * Authentication Context
 * 
 * Manages tenant authentication, user session, and license status.
 * Provides authentication state and methods throughout the application.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { getApiBaseUrl } from '../config/apiUrl';
import { isLocalOnlyMode } from '../config/apiUrl';
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
  isLoading: boolean;
  error: string | null;
}

interface AuthContextType extends AuthState {
  login: (username: string, password: string, tenantId: string) => Promise<void>;
  lookupTenants: (organizationEmail: string) => Promise<Array<{ id: string; name: string; company_name: string; email: string }>>;
  smartLogin: (username: string, password: string, tenantId: string) => Promise<void>;
  unifiedLogin: (organizationEmail: string, username: string, password: string) => Promise<void>;
  registerTenant: (data: TenantRegistrationData) => Promise<{ tenantId: string; trialDaysRemaining: number }>;
  logout: () => void;
  checkLicenseStatus: () => Promise<{ isValid: boolean; daysRemaining?: number; type?: string; modules?: string[] }>;
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    tenant: null,
    isLoading: true,
    error: null,
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
        modules: ['real_estate', 'rental', 'shop'],
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
        error: null,
      });
      syncDisplayTimezoneFromUser(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('tenant_id');
        localStorage.removeItem('user_id');
      }
      return;
    }

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
      error: null,
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

        await apiClient.post('/auth/logout', {});
        logger.logCategory('auth', '✅ Logout API call completed, user status updated in cloud DB');
      } catch (error) {
        logger.errorCategory('auth', 'Logout API error:', error);
      } finally {
        apiClient.clearAuth();
        localStorage.removeItem('user_id');
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('pbooks_api_last_sync_at');
          sessionStorage.removeItem('pbooks_api_sync_tenant_id');
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
        if (token && typeof navigator !== 'undefined' && navigator.sendBeacon) {
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
              error: null,
            });
          }
          return;
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
              error: null,
            });
          }
          return;
        }

        if (isMounted) {
          setState(prev => ({ ...prev, isLoading: false }));
        }
      } catch (error) {
        if (isMounted) {
          logger.errorCategory('auth', 'Auth check error:', error);
          setState(prev => ({ ...prev, isLoading: false }));
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
      setState({
        isAuthenticated: true,
        user,
        tenant,
        isLoading: false,
        error: null,
      });
      syncDisplayTimezoneFromUser(user);
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

        setState({
          isAuthenticated: true,
          user: response.user,
          tenant: response.tenant,
          isLoading: false,
          error: null,
        });
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
      setState({
        isAuthenticated: false,
        user: null,
        tenant: null,
        isLoading: false,
        error: errorMessage,
      });
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
      setState({
        isAuthenticated: true,
        user,
        tenant,
        isLoading: false,
        error: null,
      });
      syncDisplayTimezoneFromUser(user);
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

        setState({
          isAuthenticated: true,
          user: response.user,
          tenant: response.tenant,
          isLoading: false,
          error: null,
        });
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
      setState({
        isAuthenticated: false,
        user: null,
        tenant: null,
        isLoading: false,
        error: errorMessage,
      });
      throw error;
    }
  }, [companyCtx?.authenticatedUser, companyCtx?.activeCompany, checkLicenseStatus]);

  /**
   * Login with username, password, and tenant ID (legacy - kept for backward compatibility)
   */
  const login = useCallback(async (username: string, password: string, tenantId: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await apiClient.post<{
        token: string;
        user: User;
        tenant: Tenant;
      }>('/auth/login', {
        username,
        password,
        tenantId,
      });

      // Store last used tenant in localStorage
      localStorage.setItem('last_tenant_id', response.tenant.id);
      localStorage.setItem('last_identifier', username);
      if (response.user?.id) {
        localStorage.setItem('user_id', response.user.id); // Store user_id for local database tracking
      }

      // Set authentication
      apiClient.setAuth(response.token, response.tenant.id);

      // Force a full API load on next sync (fresh baseline after login; incremental sync covers ongoing changes)
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('pbooks_api_last_sync_at');
        sessionStorage.removeItem('pbooks_api_sync_tenant_id');
      }

      setState({
        isAuthenticated: true,
        user: response.user,
        tenant: response.tenant,
        isLoading: false,
        error: null,
      });
      syncDisplayTimezoneFromUser(response.user);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:login-success'));
      }

      // Load license immediately so features enable without waiting for LicenseContext effect
      checkLicenseStatus()
        .then((licenseStatus) => {
          if (typeof window !== 'undefined' && licenseStatus && ('licenseType' in licenseStatus || 'licenseStatus' in licenseStatus)) {
            const dispatch = () => window.dispatchEvent(new CustomEvent('license-status-loaded', { detail: licenseStatus }));
            if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(dispatch);
            else setTimeout(dispatch, 0);
          }
        })
        .catch((err) => logger.warnCategory('auth', 'Post-login license fetch failed (will retry in context):', err));
    } catch (error: any) {
      const errorMessage = error.error || error.message || 'Login failed';
      setState({
        isAuthenticated: false,
        user: null,
        tenant: null,
        isLoading: false,
        error: errorMessage,
      });
      throw error;
    }
  }, [checkLicenseStatus]);

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
      }>('/auth/register-tenant', data);

      setState(prev => ({ ...prev, isLoading: false }));

      return {
        tenantId: response.tenantId,
        trialDaysRemaining: response.trialDaysRemaining,
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

  const contextValue = useMemo(() => ({
    ...state,
    login,
    lookupTenants,
    smartLogin,
    unifiedLogin,
    registerTenant,
    logout,
    checkLicenseStatus,
  }), [state.isAuthenticated, state.user, state.tenant, state.isLoading, state.error,
       login, lookupTenants, smartLogin, unifiedLogin, registerTenant, logout, checkLicenseStatus]);

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
      error: null,
      login: async () => { },
      lookupTenants: async () => [],
      smartLogin: async () => { },
      unifiedLogin: async () => { },
      registerTenant: async () => ({ tenantId: '', trialDaysRemaining: 0 }),
      logout: () => { },
      checkLicenseStatus: async () => ({ isValid: false }),
    };
  }
  return context;
};

