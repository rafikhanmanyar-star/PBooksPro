/**
 * API Client Service
 * 
 * Provides a centralized HTTP client for communicating with the backend API.
 * Handles authentication, error handling, and request/response transformation.
 */

import { getApiBaseUrl } from '../../config/apiUrl';
import { logger } from '../logger';

export interface ApiError {
  error: string;
  message?: string;
  status?: number;
}

export class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private tenantId: string | null = null;
  private shouldLog: boolean = false; // Only log during login/transaction operations

  constructor(baseUrl: string = getApiBaseUrl()) {
    this.baseUrl = baseUrl;
    // Load token and tenantId from localStorage
    this.loadAuth(false); // Don't log during initialization
  }

  /**
   * Get the base URL for API requests
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Enable logging for this request (for login/transaction operations)
   */
  enableLogging(): void {
    this.shouldLog = true;
  }

  /**
   * Disable logging (for background/validation operations)
   */
  disableLogging(): void {
    this.shouldLog = false;
  }

  /**
   * Load authentication from localStorage
   */
  private loadAuth(shouldLog: boolean = false): void {
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
      this.tenantId = localStorage.getItem('tenant_id');
      const storedApiBase = localStorage.getItem('auth_api_base');
      if (storedApiBase && storedApiBase !== this.baseUrl) {
        if (shouldLog) {
          logger.warnCategory('auth', '⚠️ Auth base URL changed, clearing stored auth');
        }
        this.clearAuth();
        return;
      }
      
      // Only log if explicitly requested (during login operations)
      if (shouldLog && this.token) {
        logger.logCategory('auth', '🔑 Loaded auth token from localStorage:', this.token.substring(0, 20) + '...');
      }
    }
  }

  /**
   * Set authentication token and tenant ID
   */
  setAuth(token: string, tenantId: string, shouldLog: boolean = true): void {
    this.token = token;
    this.tenantId = tenantId;
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('tenant_id', tenantId);
      localStorage.setItem('auth_api_base', this.baseUrl);
      // Only log during login operations
      if (shouldLog) {
        logger.logCategory('auth', '🔑 Auth token saved to localStorage and ApiClient instance');
      }
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
      localStorage.removeItem('auth_api_base');
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
   * Check if user is authenticated (has a valid, non-expired token)
   */
  isAuthenticated(): boolean {
    return this.token !== null && !this.isTokenExpired();
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
      // Don't log here - errors will be caught in request() method if token is actually used
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
    // Determine if this is a login or transaction operation
    const isLoginOperation = endpoint.includes('/auth/login') || 
                             endpoint.includes('/auth/smart-login') || 
                             endpoint.includes('/auth/register');
    const isTransactionOperation = endpoint.includes('/transactions');
    
    // Enable logging only for login and transaction operations
    const shouldLogThisRequest = this.shouldLog || isLoginOperation || isTransactionOperation;
    
    // Reload auth from localStorage before each request to ensure we have the latest token
    // This is important because the token might be updated after the singleton is created
    this.loadAuth(shouldLogThisRequest);
    
    // Check if token is expired before making the request
    if (this.token && this.isTokenExpired()) {
      if (shouldLogThisRequest) {
        logger.warnCategory('auth', '⚠️ Token is expired, clearing auth before request');
      }
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
        // Always log errors, even if logging is disabled
        logger.errorCategory('auth', '❌ Invalid token format - expected 3 parts, got:', tokenParts.length);
        logger.errorCategory('auth', 'Token preview:', this.token.substring(0, 50) + '...');
        throw {
          error: 'Invalid token format',
          message: 'Token format is invalid. Please login again.',
          status: 401
        };
      }
      
      headers['Authorization'] = `Bearer ${this.token}`;
      // Only log token info during login/transaction operations
      if (shouldLogThisRequest) {
        const tokenPreview = this.token.length > 20 ? this.token.substring(0, 20) + '...' : this.token;
        logger.logCategory('auth', `🔑 Sending request with token: ${tokenPreview} (length: ${this.token.length}) to ${endpoint}`);
      }
    } else {
      // Only log when token is missing for authenticated endpoints during login/transaction operations
      if (shouldLogThisRequest && !endpoint.includes('/register-tenant') && !endpoint.includes('/auth/')) {
        logger.warnCategory('auth', `⚠️ No token available for request to ${endpoint}`);
      }
    }

    // Add tenant ID if available
    if (this.tenantId && !endpoint.includes('/register-tenant')) {
      headers['X-Tenant-ID'] = this.tenantId;
    }

    try {
      // Only log API requests during login/transaction operations
      if (shouldLogThisRequest) {
        logger.logCategory('api', `📤 API Request: ${options.method || 'GET'} ${endpoint}`);
        if (options.body && typeof options.body === 'string') {
          try {
            const bodyData = JSON.parse(options.body);
            logger.logCategory('api', `📤 Request body:`, { 
              ...bodyData, 
              // Truncate large fields for logging
              ...(bodyData.description && { description: bodyData.description.substring(0, 50) + '...' })
            });
          } catch (e) {
            // Body might not be JSON, log as-is
            logger.logCategory('api', `📤 Request body length: ${options.body.length} bytes`);
          }
        }
      }
      
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Only log API responses during login/transaction operations
      if (shouldLogThisRequest) {
        logger.logCategory('api', `📥 API Response: ${response.status} ${response.statusText} for ${endpoint}`);
      }

      // Handle non-JSON responses
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        if (!response.ok) {
          const text = await response.text();
          const isSchemaVersionEndpoint = endpoint.includes('/schema/version');
          const isExpectedUnavailable = isSchemaVersionEndpoint && (response.status === 404 || response.status === 503);
          if (!isExpectedUnavailable) {
            logger.errorCategory('api', `❌ Non-JSON error response for ${endpoint}:`, text);
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return {} as T;
      }

      let data: any;
      try {
        data = await response.json();
        if (response.ok) {
          // Only log success during login/transaction operations
          if (shouldLogThisRequest) {
            logger.logCategory('api', `✅ Success response for ${endpoint}`);
          }
        } else {
          // Suppress 401 errors for expected endpoints (schema/version before login)
          const is401 = response.status === 401;
          const isExpected401Endpoint = endpoint.includes('/schema/version');
          
          if (is401 && isExpected401Endpoint) {
            // Silent - expected 401 before authentication
          } else {
            // Log other errors
            logger.errorCategory('api', `❌ Error response for ${endpoint}:`, data);
          }
        }
      } catch (jsonError) {
        // If JSON parsing fails, create error from response text
        const text = await response.text();
        // Only log if not a 401 on expected endpoint
        const is401 = response.status === 401;
        const isExpected401Endpoint = endpoint.includes('/schema/version');
        
        if (!(is401 && isExpected401Endpoint)) {
          logger.errorCategory('api', `❌ Failed to parse JSON response for ${endpoint}:`, text);
        }
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
                                    endpoint.includes('/budgets') ||
                                    endpoint.includes('/vendors') ||
                                    endpoint.includes('/quotations') ||
                                    endpoint.includes('/sales-returns') ||
                                    endpoint.includes('/documents') ||
                                    endpoint.includes('/recurring-invoice-templates') ||
                                    endpoint.includes('/pm-cycle-allocations') ||
                                    endpoint.includes('/transaction-audit');
          
          if (isValidationEndpoint) {
            // Silent fail for validation endpoints - expected if token is invalid during app init
            // Don't log as error - AuthContext/AppContext will handle it gracefully
            // Don't clear auth or dispatch event - let the calling context handle it
          } else if (isBackgroundSync) {
            // For background syncs, only log if it's a transaction operation
            if (shouldLogThisRequest) {
              logger.warnCategory('sync', '⚠️ Background sync failed due to expired token. Data saved locally. Please re-login to sync.');
            }
            // Don't clear auth or dispatch event - let user continue working
            // The error will still be thrown so the caller knows it failed
          } else {
            // For user-initiated actions (like fetching data, navigation, auth operations), logout immediately
            // BUT: Don't logout for heartbeat SESSION_NOT_FOUND errors - might be race condition
            const isHeartbeatSessionNotFound = endpoint.includes('/auth/heartbeat') && data.code === 'SESSION_NOT_FOUND';
            
            if (isHeartbeatSessionNotFound) {
              // Don't logout for heartbeat session not found - might be race condition
              // Just throw the error, don't clear auth
              logger.logCategory('auth', 'Heartbeat: Session not found (may be race condition), not logging out');
            } else {
              // Always log auth errors, even if logging is disabled
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
          }
        } else {
          // Only log if it's a login/transaction operation
          if (shouldLogThisRequest) {
            logger.warnCategory('auth', 'API Error (401 Unauthorized) - No token was present for request:', endpoint);
          }
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
        if (error.message.includes('Failed to fetch') || 
            error.message.includes('NetworkError') || 
            error.message.includes('Network request failed') || 
            error.message.includes('ERR_CONNECTION_REFUSED') ||
            error.message.includes('ERR_INTERNET_DISCONNECTED') ||
            error.name === 'TypeError') {
          
          // Only log network errors during login/transaction operations
          if (shouldLogThisRequest) {
            logger.errorCategory('api', 'Network error:', error.message);
          }
          
          // Throw a specific network error (don't logout user)
          const networkError: ApiError = {
            error: 'NetworkError',
            message: 'No internet connection. Changes saved locally and will sync when online.',
            status: 0 // Special status code for network errors
          };
          throw networkError;
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

  /**
   * Refresh auth token
   */
  async refreshToken(): Promise<string | null> {
    if (!this.token) return null;

    const url = `${this.baseUrl}/auth/refresh-token`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw {
        error: 'Token refresh failed',
        status: response.status,
      };
    }

    const data = await response.json();
    const newToken = data?.token;
    if (!newToken) {
      throw {
        error: 'Token refresh failed',
        status: 401,
      };
    }

    const tenantId =
      this.tenantId ??
      (typeof window !== 'undefined' ? localStorage.getItem('tenant_id') : null);

    if (tenantId) {
      this.setAuth(newToken, tenantId, false);
    } else {
      this.token = newToken;
      if (typeof window !== 'undefined') {
        localStorage.setItem('auth_token', newToken);
      }
    }

    return newToken;
  }
}

function isTokenExpiredForToken(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload = JSON.parse(atob(parts[1]));
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return true;
    }
    return false;
  } catch (error) {
    return true;
  }
}

// Lazy singleton instance to avoid initialization issues during module load
let apiClientInstance: ApiClient | null = null;

export const apiClient = new Proxy({} as ApiClient, {
    get(target, prop) {
        if (!apiClientInstance) {
            apiClientInstance = new ApiClient(getApiBaseUrl());
        }
        const value = (apiClientInstance as any)[prop];
        if (typeof value === 'function') {
            return value.bind(apiClientInstance);
        }
        return value;
    }
});

/**
 * Safe auth check that tolerates module/proxy issues.
 */
export function isAuthenticatedSafe(): boolean {
  try {
    const authFn = (apiClient as any)?.isAuthenticated;
    if (typeof authFn === 'function') {
      return authFn.call(apiClient);
    }
  } catch (error) {
    logger.warnCategory('auth', '⚠️ Failed apiClient auth check, falling back:', error);
  }

  if (typeof window === 'undefined') return false;
  const token = localStorage.getItem('auth_token');
  if (!token) return false;
  return !isTokenExpiredForToken(token);
}

