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
   * Check if user is already authenticated (from localStorage)
   */
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = apiClient.getToken();
        const tenantId = apiClient.getTenantId();

        if (token && tenantId) {
          // Verify token is still valid by checking license status
          try {
            const licenseStatus = await apiClient.get<{ isValid: boolean }>('/api/tenants/license-status');
            if (licenseStatus.isValid) {
              // Token is valid, restore session
              // Fetch user and tenant info from API
              try {
                const tenantInfo = await apiClient.get<{
                  id: string;
                  name: string;
                  company_name: string;
                }>('/api/tenants/me');
                
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
          } catch (error) {
            // Token invalid or expired, or network error
            // Don't clear auth on network errors - might be temporary
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('Network') || errorMessage.includes('Failed to fetch')) {
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
              // Token invalid or expired
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
  }, []);

  /**
   * Login with username, password, and tenant ID
   */
  const login = useCallback(async (username: string, password: string, tenantId: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await apiClient.post<{
        token: string;
        user: User;
        tenant: Tenant;
      }>('/api/auth/login', {
        username,
        password,
        tenantId,
      });

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
      }>('/api/auth/register-tenant', data);

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
      await apiClient.post('/api/tenants/activate-license', {
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
      }>('/api/tenants/license-status');

      return response;
    } catch (error: any) {
      console.error('License check error:', error);
      return { isValid: false };
    }
  }, []);

  /**
   * Logout
   */
  const logout = useCallback(() => {
    apiClient.clearAuth();
    setState({
      isAuthenticated: false,
      user: null,
      tenant: null,
      isLoading: false,
      error: null,
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
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

