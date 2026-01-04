/**
 * API Client Service
 * 
 * Provides a centralized HTTP client for communicating with the backend API.
 * Handles authentication, error handling, and request/response transformation.
 */

// HARDCODED: Always use production API URL
// This ensures the deployed version always uses the correct URL
const API_BASE_URL = 'https://pbookspro-api.onrender.com/api';

import { logger } from '../logger';

// Debug: Log the API URL being used (filtered)
logger.logCategory('api', '🔧 Client API URL:', API_BASE_URL);

export interface ApiError {
  error: string;
  message?: string;
  status?: number;
}

export class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private tenantId: string | null = null;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
    // Load token and tenantId from localStorage
    this.loadAuth();
  }

  /**
   * Load authentication from localStorage
   */
  private loadAuth(): void {
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
      this.tenantId = localStorage.getItem('tenant_id');
      
      // Log for debugging (filtered)
      if (this.token) {
        logger.logCategory('auth', '🔑 Loaded auth token from localStorage:', this.token.substring(0, 20) + '...');
      } else {
        logger.warnCategory('auth', '⚠️ No auth token found in localStorage');
      }
    }
  }

  /**
   * Set authentication token and tenant ID
   */
  setAuth(token: string, tenantId: string): void {
    this.token = token;
    this.tenantId = tenantId;
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('tenant_id', tenantId);
      logger.logCategory('auth', '🔑 Auth token saved to localStorage and ApiClient instance');
    }
  }

  /**
   * Clear authentication
   */
  clearAuth(): void {
    this.token = null;
    this.tenantId = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('tenant_id');
    }
  }

  /**
   * Get current auth token
   */
  getToken(): string | null {
    return this.token;
  }

  /**
   * Get current tenant ID
   */
  getTenantId(): string | null {
    return this.tenantId;
  }

  /**
   * Check if token is expired (client-side check)
   * Note: This is a basic check - server validation is authoritative
   */
  isTokenExpired(): boolean {
    if (!this.token) return true;
    
    try {
      // JWT tokens have 3 parts separated by dots: header.payload.signature
      const parts = this.token.split('.');
      if (parts.length !== 3) return true;
      
      // Decode the payload (second part)
      const payload = JSON.parse(atob(parts[1]));
      
      // Check expiration (exp is in seconds, Date.now() is in milliseconds)
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        return true;
      }
      
      return false;
    } catch (error) {
      // If we can't decode the token, consider it invalid
      logger.errorCategory('auth', 'Error checking token expiration:', error);
      return true;
    }
  }

  /**
   * Make an API request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    // Reload auth from localStorage before each request to ensure we have the latest token
    // This is important because the token might be updated after the singleton is created
    this.loadAuth();
    
    // Check if token is expired before making the request
    if (this.token && this.isTokenExpired()) {
      logger.warnCategory('auth', '⚠️ Token is expired, clearing auth before request');
      this.clearAuth();
      // Don't dispatch event here - let the 401 response handle it
    }
    
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Add auth token if available
    if (this.token) {
      // Validate token format before sending
      const tokenParts = this.token.split('.');
      if (tokenParts.length !== 3) {
        logger.errorCategory('auth', '❌ Invalid token format - expected 3 parts, got:', tokenParts.length);
        logger.errorCategory('auth', 'Token preview:', this.token.substring(0, 50) + '...');
        throw {
          error: 'Invalid token format',
          message: 'Token format is invalid. Please login again.',
          status: 401
        };
      }
      
      headers['Authorization'] = `Bearer ${this.token}`;
      // Log token info for debugging (first 20 chars only) - filtered
      const tokenPreview = this.token.length > 20 ? this.token.substring(0, 20) + '...' : this.token;
      logger.logCategory('auth', `🔑 Sending request with token: ${tokenPreview} (length: ${this.token.length}) to ${endpoint}`);
    } else {
      // Log when token is missing for authenticated endpoints - filtered
      if (!endpoint.includes('/register-tenant') && !endpoint.includes('/auth/')) {
        logger.warnCategory('auth', `⚠️ No token available for request to ${endpoint}`);
      }
    }

    // Add tenant ID if available
    if (this.tenantId && !endpoint.includes('/register-tenant')) {
      headers['X-Tenant-ID'] = this.tenantId;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Handle non-JSON responses
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return {} as T;
      }

      let data: any;
      try {
        data = await response.json();
      } catch (jsonError) {
        // If JSON parsing fails, create error from response text
        const text = await response.text();
        throw new Error(`Server error (${response.status}): ${text || response.statusText}`);
      }

      // Handle 401 Unauthorized - token expired or invalid
      if (response.status === 401) {
        const error: ApiError = {
          error: data.error || 'Unauthorized',
          message: data.message || data.error || 'Your session has expired. Please login again.',
          status: 401,
        };
        
        // Only clear auth and dispatch event if we actually had a token
        // This prevents clearing auth on requests that were never authenticated
        const hadToken = !!this.token;
        
        if (hadToken) {
          // Check if this is a validation endpoint used during app initialization
          // Don't log as error - it's expected if token is invalid
          // These endpoints are used to verify token validity, not for user actions
          const isValidationEndpoint = endpoint.includes('/license-status') || 
                                       endpoint.includes('/tenants/me');
          
          // Check if this is a background sync operation (data operations)
          // Don't auto-logout for background syncs - let user continue working locally
          const isBackgroundSync = endpoint.includes('/contacts') || 
                                    endpoint.includes('/transactions') || 
                                    endpoint.includes('/accounts') ||
                                    endpoint.includes('/invoices') ||
                                    endpoint.includes('/bills') ||
                                    endpoint.includes('/categories') ||
                                    endpoint.includes('/projects') ||
                                    endpoint.includes('/buildings') ||
                                    endpoint.includes('/properties') ||
                                    endpoint.includes('/units') ||
                                    endpoint.includes('/rental-agreements') ||
                                    endpoint.includes('/project-agreements') ||
                                    endpoint.includes('/contracts') ||
                                    endpoint.includes('/budgets');
          
          if (isValidationEndpoint) {
            // Silent fail for validation endpoints - expected if token is invalid during app init
            // Don't log as error - AuthContext/AppContext will handle it gracefully
            // Don't clear auth or dispatch event - let the calling context handle it
          } else if (isBackgroundSync) {
            // For background syncs, just log the error but don't logout
            // Data is saved locally, user can re-login later to sync
            logger.warnCategory('sync', '⚠️ Background sync failed due to expired token. Data saved locally. Please re-login to sync.');
            // Don't clear auth or dispatch event - let user continue working
            // The error will still be thrown so the caller knows it failed
          } else {
            // For user-initiated actions (like fetching data, navigation, auth operations), logout immediately
            logger.errorCategory('auth', 'API Error (401 Unauthorized) - Token was present but invalid:', {
              error: data.error,
              code: data.code,
              endpoint
            });
            
            // Clear invalid auth
            this.clearAuth();
            
            // Dispatch custom event for auth context to handle
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('auth:expired', { detail: error }));
            }
          }
        } else {
          logger.warnCategory('auth', 'API Error (401 Unauthorized) - No token was present for request:', endpoint);
        }
        
        throw error;
      }

      if (!response.ok) {
        const error: ApiError = {
          error: data.error || data.message || 'Request failed',
          message: data.message || data.error,
          status: response.status,
        };
        console.error('API Error:', error);
        throw error;
      }

      return data as T;
    } catch (error) {
      // Log the error for debugging
      console.error('API Request Error:', error);
      
      if (error instanceof Error) {
        // Check if it's a network error
          if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('Network request failed') || error.message.includes('ERR_CONNECTION_REFUSED')) {
          throw new Error('Network error: Unable to connect to server. Please check your connection.');
        }
        // If it's already an ApiError, throw it as-is
        if ('error' in error && 'status' in error) {
          throw error;
        }
        // Otherwise, wrap it
        throw error;
      }
      
      // Handle non-Error types
      if (typeof error === 'string') {
        throw new Error(error);
      }
      
      if (error && typeof error === 'object' && 'error' in error) {
        throw error;
      }
      
      // Last resort - log and throw generic error
      console.error('Unknown error type:', typeof error, error);
      throw new Error('Unknown error occurred. Please check the console for details.');
    }
  }

  /**
   * GET request
   */
  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  /**
   * POST request
   */
  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * PUT request
   */
  async put<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * DELETE request
   */
  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  /**
   * PATCH request
   */
  async patch<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }
}

// Singleton instance
export const apiClient = new ApiClient();

