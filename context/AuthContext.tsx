/**
 * Authentication Context
 * 
 * Manages tenant authentication, user session, and license status.
 * Provides authentication state and methods throughout the application.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getApiBaseUrl } from '../config/apiUrl';
import { apiClient } from '../services/api/client';
import { logger } from '../services/logger';

export interface User {
  id: string;
  username: string;
  name: string;
  role: string;
  tenantId: string;
}

export interface Tenant {
  id: string;
  name: string;
  companyName: string;
}

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
  checkLicenseStatus: () => Promise<{ isValid: boolean; daysRemaining?: number; type?: string }>;
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

  /**
   * Logout
   */
  const logout = useCallback(async () => {
    try {
      // Save all data to database before logout
      logger.logCategory('auth', '💾 Saving data before logout...');
      
      // Dispatch event to trigger state save and wait for completion
      const savePromise = new Promise<void>((resolve) => {
        const handleSaveComplete = () => {
          window.removeEventListener('state-saved-for-logout', handleSaveComplete);
          resolve();
        };
        window.addEventListener('state-saved-for-logout', handleSaveComplete);
        
        // Dispatch event to trigger save
        window.dispatchEvent(new CustomEvent('save-state-before-logout'));
        
        // Timeout after 5 seconds to prevent hanging
        setTimeout(() => {
          window.removeEventListener('state-saved-for-logout', handleSaveComplete);
          logger.warnCategory('auth', '⚠️ State save timeout, proceeding with logout');
          resolve();
        }, 5000);
      });
      
      await savePromise;
      logger.logCategory('auth', '✅ Data saved, proceeding with logout');
      
      // Call logout API to clear session on server and update login_status = FALSE
      await apiClient.post('/auth/logout', {});
      logger.logCategory('auth', '✅ Logout API call completed, user status updated in cloud DB');
    } catch (error) {
      logger.errorCategory('auth', 'Logout API error:', error);
      // Continue with local logout even if API fails
    } finally {
      // Clear local auth
      apiClient.clearAuth();
      
      // Clear user_id from localStorage on logout
      localStorage.removeItem('user_id');
      
      try {
        const { getBidirectionalSyncService } = await import('../services/sync/bidirectionalSyncService');
        getBidirectionalSyncService().stop();
      } catch (_) {}
      setState({
        isAuthenticated: false,
        user: null,
        tenant: null,
        isLoading: false,
        error: null,
      });
    }
  }, []);

  /**
   * Heartbeat mechanism - keeps session alive by updating last_activity
   */
  useEffect(() => {
    if (!state.isAuthenticated) return;

    const HEARTBEAT_INTERVAL = 1 * 60 * 1000; // 1 minute (reduced from 2 minutes to ensure session stays active with 5-minute inactivity threshold)
    const INITIAL_DELAY = 5000; // 5 seconds delay before first heartbeat to avoid race condition
    let heartbeatInterval: NodeJS.Timeout | null = null;
    let initialTimeout: NodeJS.Timeout | null = null;

    const sendHeartbeat = async () => {
      try {
        await apiClient.post('/auth/heartbeat', {});
      } catch (error: any) {
        // If heartbeat fails with SESSION_NOT_FOUND, it might be a race condition
        // Don't trigger logout immediately - wait for next heartbeat
        if (error?.code === 'SESSION_NOT_FOUND') {
          logger.logCategory('auth', 'Heartbeat: Session not found (may be race condition), will retry on next interval');
        } else if (error?.status === 401) {
          // Only log, don't trigger logout - let middleware handle it on actual API calls
          logger.logCategory('auth', 'Heartbeat failed (session may be invalid)');
        } else {
          // Other errors (network, etc.) - just log
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

  /**
   * Start bi-directional sync when authenticated (connectivity-driven + run once)
   */
  useEffect(() => {
    if (!state.isAuthenticated || !state.tenant?.id) return;
    (async () => {
      try {
        const { isMobileDevice } = await import('../utils/platformDetection');
        if (isMobileDevice()) return;
        const { getBidirectionalSyncService } = await import('../services/sync/bidirectionalSyncService');
        const bidir = getBidirectionalSyncService();
        bidir.start(state.tenant!.id);
        await bidir.runSync(state.tenant!.id);
      } catch (_) {}
    })();
  }, [state.isAuthenticated, state.tenant?.id]);

  /**
   * Handle app close/refresh - attempt to logout gracefully
   */
  useEffect(() => {
    if (!state.isAuthenticated) return;

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
    if (!state.isAuthenticated) return;

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
   * Check if user is already authenticated (from localStorage)
   */
  useEffect(() => {
    // Use a ref to prevent multiple simultaneous auth checks
    let isChecking = false;
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
      // Prevent multiple simultaneous checks
      if (isChecking) {
        return;
      }
      isChecking = true;
      try {
        const token = apiClient.getToken();
        const tenantId = apiClient.getTenantId();

        if (token && tenantId) {
          // Check if token is expired before making API call
          if (apiClient.isTokenExpired()) {
            if (isMounted) {
              logger.logCategory('auth', 'Token in localStorage is expired, clearing auth');
              apiClient.clearAuth();
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

          // Verify token is still valid by checking license status
          try {
            const licenseStatus = await apiClient.get<{
              isValid?: boolean;
              isExpired?: boolean;
              licenseStatus?: string;
            }>('/tenants/license-status');
            if (!isMounted) return;

            const isValid = typeof licenseStatus.isValid === 'boolean'
              ? licenseStatus.isValid
              : !(licenseStatus.isExpired === true || licenseStatus.licenseStatus === 'expired');

            if (isValid) {
              // Token is valid, restore session
              // Fetch user and tenant info from API
              try {
                const tenantInfo = await apiClient.get<{
                  id: string;
                  name: string;
                  company_name: string;
                }>('/tenants/me');
                
                // Try to decode user info from JWT token
                let userInfo = {
                  id: localStorage.getItem('user_id') || 'current-user',
                  username: 'user',
                  name: 'User',
                  role: 'User',
                  tenantId: tenantInfo.id,
                };
                
                try {
                  // Decode JWT to get user info
                  const parts = token.split('.');
                  if (parts.length === 3) {
                    const payload = JSON.parse(atob(parts[1]));
                    userInfo = {
                      id: payload.userId || payload.sub || localStorage.getItem('user_id') || 'current-user',
                      username: payload.username || 'user',
                      name: payload.name || 'User',
                      role: payload.role || 'User',
                      tenantId: tenantInfo.id,
                    };
                  }
                } catch (decodeError) {
                  logger.warnCategory('auth', 'Could not decode user info from token:', decodeError);
                }
                
                if (isMounted) {
                  setState({
                    isAuthenticated: true,
                    user: userInfo,
                    tenant: {
                      id: tenantInfo.id,
                      name: tenantInfo.name,
                      companyName: tenantInfo.company_name,
                    },
                    isLoading: false,
                    error: null,
                  });
                }
              } catch (fetchError) {
                // If we can't fetch tenant info, still allow access (token is valid)
                if (isMounted) {
                  setState(prev => ({
                    ...prev,
                    isAuthenticated: true,
                    isLoading: false,
                  }));
                }
              }
            } else {
              // License expired, clear auth
              if (isMounted) {
                apiClient.clearAuth();
                setState({
                  isAuthenticated: false,
                  user: null,
                  tenant: null,
                  isLoading: false,
                  error: 'License has expired. Please renew your license.',
                });
              }
            }
          } catch (error: any) {
            if (!isMounted) return;
            
            // Token invalid or expired, or network error
            // Don't clear auth on network errors - might be temporary
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // Check if it's a 401 error (token invalid/expired)
            if (error?.status === 401) {
              // Token is invalid or expired - clear auth silently
              // Don't log as error - this is expected if token is expired
              logger.logCategory('auth', 'Token verification failed (401) - clearing auth, user needs to re-login');
              apiClient.clearAuth();
              setState({
                isAuthenticated: false,
                user: null,
                tenant: null,
                isLoading: false,
                error: null,
              });
            } else if (errorMessage.includes('Network') || errorMessage.includes('Failed to fetch')) {
              // Network error - keep token but mark as not authenticated
              // User can retry when network is back
              setState({
                isAuthenticated: false,
                user: null,
                tenant: null,
                isLoading: false,
                error: 'Unable to verify authentication. Please check your connection.',
              });
            } else {
              // Other error - clear auth
              logger.warnCategory('auth', 'Token verification failed with unexpected error:', error);
              apiClient.clearAuth();
              setState({
                isAuthenticated: false,
                user: null,
                tenant: null,
                isLoading: false,
                error: null,
              });
            }
          }
        } else {
          if (isMounted) {
            setState(prev => ({ ...prev, isLoading: false }));
          }
        }
      } catch (error) {
        if (isMounted) {
          logger.errorCategory('auth', 'Auth check error:', error);
          setState(prev => ({ ...prev, isLoading: false }));
        }
      } finally {
        isChecking = false;
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
  }, [logout]);

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

        logger.logCategory('auth', '✅ Login completed successfully');

        // Sync pending operations after successful login
        try {
          const { isMobileDevice } = await import('../utils/platformDetection');
          if (!isMobileDevice()) {
            logger.logCategory('auth', '🔄 Syncing pending operations after login...');
            const { getSyncManager } = await import('../services/sync/syncManager');
            const syncManager = getSyncManager();
            await syncManager.syncOnLogin();
          }
        } catch (syncError) {
          logger.warnCategory('auth', '⚠️ Failed to sync on login:', syncError);
        }

        // Load settings from cloud database after successful login
        try {
          logger.logCategory('auth', '📥 Loading settings from cloud database...');
          const { settingsSyncService } = await import('../services/settingsSyncService');
          const cloudSettings = await settingsSyncService.syncFromCloud();
          
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
      logger.errorCategory('auth', '❌ Login error caught:', {
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
  }, []);

  /**
   * Unified login - takes organizationEmail, username, and password all at once
   */
  const unifiedLogin = useCallback(async (organizationEmail: string, username: string, password: string) => {
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

        logger.logCategory('auth', '✅ Unified login completed successfully');

        // Sync pending operations after successful login
        try {
          const { isMobileDevice } = await import('../utils/platformDetection');
          if (!isMobileDevice()) {
            logger.logCategory('auth', '🔄 Syncing pending operations after login...');
            const { getSyncManager } = await import('../services/sync/syncManager');
            const syncManager = getSyncManager();
            await syncManager.syncOnLogin();
          }
        } catch (syncError) {
          logger.warnCategory('auth', '⚠️ Failed to sync on login:', syncError);
        }

        // Load settings from cloud database after successful login
        try {
          logger.logCategory('auth', '📥 Loading settings from cloud database...');
          const { settingsSyncService } = await import('../services/settingsSyncService');
          const cloudSettings = await settingsSyncService.syncFromCloud();
          
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
  }, []);

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

      setState({
        isAuthenticated: true,
        user: response.user,
        tenant: response.tenant,
        isLoading: false,
        error: null,
      });
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
  }, []);

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

  /**
   * Check license status
   */
  const checkLicenseStatus = useCallback(async () => {
    try {
      const response = await apiClient.get<{
        isValid: boolean;
        daysRemaining?: number;
        type?: string;
        status?: string;
      }>('/tenants/license-status');

      return response;
    } catch (error: any) {
      logger.errorCategory('auth', 'License check error:', error);
      return { isValid: false };
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        lookupTenants,
        smartLogin,
        unifiedLogin,
        registerTenant,
        logout,
        checkLicenseStatus,
      }}
    >
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
      login: async () => {},
      lookupTenants: async () => [],
      smartLogin: async () => {},
      unifiedLogin: async () => {},
      registerTenant: async () => ({ tenantId: '', trialDaysRemaining: 0 }),
      logout: () => {},
      checkLicenseStatus: async () => ({ isValid: false }),
    };
  }
  return context;
};

