/**
 * Authentication Context
 * 
 * Manages tenant authentication, user session, and license status.
 * Provides authentication state and methods throughout the application.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiClient } from '../services/api/client';

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
  smartLogin: (identifier: string, password: string, tenantId?: string) => Promise<{
    requiresTenantSelection: boolean;
    tenants?: Array<{ id: string; name: string; company_name: string; email: string }>;
    success?: boolean;
  }>;
  registerTenant: (data: TenantRegistrationData) => Promise<{ tenantId: string; trialDaysRemaining: number }>;
  logout: () => void;
  activateLicense: (licenseKey: string) => Promise<void>;
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
      // Call logout API to clear session on server
      await apiClient.post('/auth/logout', {});
    } catch (error) {
      console.error('Logout API error:', error);
      // Continue with local logout even if API fails
    } finally {
      // Clear local auth
      apiClient.clearAuth();
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
   * Check if user is already authenticated (from localStorage)
   */
  useEffect(() => {
    // Listen for auth expiration events from API client
    const handleAuthExpired = () => {
      console.log('Auth expired event received, logging out...');
      logout();
    };
    
    if (typeof window !== 'undefined') {
      window.addEventListener('auth:expired', handleAuthExpired);
    }
    
    const checkAuth = async () => {
      try {
        const token = apiClient.getToken();
        const tenantId = apiClient.getTenantId();

        if (token && tenantId) {
          // Check if token is expired before making API call
          if (apiClient.isTokenExpired()) {
            console.log('Token in localStorage is expired, clearing auth');
            apiClient.clearAuth();
            setState({
              isAuthenticated: false,
              user: null,
              tenant: null,
              isLoading: false,
              error: null,
            });
            return;
          }

          // Verify token is still valid by checking license status
          try {
            const licenseStatus = await apiClient.get<{ isValid: boolean }>('/tenants/license-status');
            if (licenseStatus.isValid) {
              // Token is valid, restore session
              // Fetch user and tenant info from API
              try {
                const tenantInfo = await apiClient.get<{
                  id: string;
                  name: string;
                  company_name: string;
                }>('/tenants/me');
                
                setState({
                  isAuthenticated: true,
                  user: {
                    id: 'current-user', // Will be fetched from token if needed
                    username: 'user', // Will be fetched from token if needed
                    name: 'User',
                    role: 'User',
                    tenantId: tenantInfo.id,
                  },
                  tenant: {
                    id: tenantInfo.id,
                    name: tenantInfo.name,
                    companyName: tenantInfo.company_name,
                  },
                  isLoading: false,
                  error: null,
                });
              } catch (fetchError) {
                // If we can't fetch tenant info, still allow access (token is valid)
                setState(prev => ({
                  ...prev,
                  isAuthenticated: true,
                  isLoading: false,
                }));
              }
            } else {
              // License expired, clear auth
              apiClient.clearAuth();
              setState({
                isAuthenticated: false,
                user: null,
                tenant: null,
                isLoading: false,
                error: 'License has expired. Please renew your license.',
              });
            }
          } catch (error: any) {
            // Token invalid or expired, or network error
            // Don't clear auth on network errors - might be temporary
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // Check if it's a 401 error (token invalid/expired)
            if (error?.status === 401) {
              // Token is invalid or expired - clear auth silently
              // Don't log as error - this is expected if token is expired
              console.log('Token verification failed (401) - clearing auth, user needs to re-login');
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
              console.warn('Token verification failed with unexpected error:', error);
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
          setState(prev => ({ ...prev, isLoading: false }));
        }
      } catch (error) {
        console.error('Auth check error:', error);
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };

    checkAuth();
    
    // Cleanup: remove event listener
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('auth:expired', handleAuthExpired);
      }
    };
  }, [logout]);

  /**
   * Smart login - auto-resolves tenant from email/username
   */
  const smartLogin = useCallback(async (identifier: string, password: string, tenantId?: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await apiClient.post<{
        token?: string;
        user?: User;
        tenant?: Tenant;
        requiresTenantSelection?: boolean;
        tenants?: Array<{ id: string; name: string; company_name: string; email: string }>;
      }>('/auth/smart-login', {
        identifier,
        password,
        tenantId,
      });

      // If multiple tenants found, return them for selection
      if (response.requiresTenantSelection && response.tenants) {
        setState(prev => ({ ...prev, isLoading: false }));
        return {
          requiresTenantSelection: true,
          tenants: response.tenants,
        };
      }

      // Single tenant - proceed with login
      if (response.token && response.user && response.tenant) {
        // Store last used tenant in localStorage
        localStorage.setItem('last_tenant_id', response.tenant.id);
        localStorage.setItem('last_identifier', identifier);

        // Set authentication
        apiClient.setAuth(response.token, response.tenant.id);
        
        // Verify token is valid by checking it can be decoded
        try {
          const parts = response.token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            const exp = payload.exp * 1000;
            if (Date.now() >= exp) {
              console.error('❌ Token received from server is already expired!');
              throw new Error('Token is expired');
            }
            console.log('✅ Token validated - expires at:', new Date(exp).toISOString());
          }
        } catch (tokenError) {
          console.error('❌ Invalid token format received from server:', tokenError);
          throw new Error('Invalid token received from server');
        }

        setState({
          isAuthenticated: true,
          user: response.user,
          tenant: response.tenant,
          isLoading: false,
          error: null,
        });

        return {
          requiresTenantSelection: false,
          success: true,
        };
      }

      throw new Error('Invalid response from server');
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
      console.error('registerTenant error:', error);
      
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
      
      console.log('Setting error message:', errorMessage);
      
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      throw error;
    }
  }, []);

  /**
   * Activate a license key
   */
  const activateLicense = useCallback(async (licenseKey: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      await apiClient.post('/tenants/activate-license', {
        licenseKey,
      });

      setState(prev => ({ ...prev, isLoading: false }));
    } catch (error: any) {
      const errorMessage = error.error || error.message || 'License activation failed';
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
      console.error('License check error:', error);
      return { isValid: false };
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        smartLogin,
        registerTenant,
        logout,
        activateLicense,
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
      registerTenant: async () => ({ tenantId: '', trialDaysRemaining: 0 }),
      logout: () => {},
      activateLicense: async () => {},
      checkLicenseStatus: async () => ({ isValid: false }),
    };
  }
  return context;
};

