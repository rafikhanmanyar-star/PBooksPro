/**
 * API Client Service
 * 
 * Provides a centralized HTTP client for communicating with the backend API.
 * Handles authentication, error handling, and request/response transformation.
 */

import { getApiBaseUrl, isLanBackendApi, PBOOKS_API_BASE_STORAGE_KEY } from '../../config/apiUrl';
import { logger } from '../logger';
import { notifyApiConflictIfUserFacing } from '../dbErrorNotification';
import { stringifyApiJsonBody } from '../../utils/apiJsonSerialize';

/** Throttle "server unreachable" UI so a burst of failed requests does not flash repeatedly. */
let lastServerUnreachableDispatch = 0;
const SERVER_UNREACHABLE_DEBOUNCE_MS = 4000;

export interface ApiError {
  error: string;
  message?: string;
  status?: number;
  code?: string;
}

/** Reads `{ success, data, error: { code, message } }` or legacy `{ message, code }`. */
export function pickApiErrorFields(data: unknown): { message: string; code?: string } {
  if (!data || typeof data !== 'object') {
    return { message: 'Request failed' };
  }
  const d = data as Record<string, unknown>;
  const nested = d.error;
  if (nested && typeof nested === 'object' && nested !== null) {
    const ne = nested as Record<string, unknown>;
    if (typeof ne.message === 'string') {
      return {
        message: ne.message,
        code: typeof ne.code === 'string' ? ne.code : undefined,
      };
    }
  }
  const msg = d.message ?? d.error;
  if (typeof msg === 'string') return { message: msg, code: typeof d.code === 'string' ? d.code : undefined };
  return { message: 'Request failed' };
}

export { formatApiErrorMessage } from '../../utils/formatApiErrorMessage';

export class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private tenantId: string | null = null;
  private shouldLog: boolean = false; // Only log during login/transaction operations
  /** When true, 401s are expected (logout in progress); suppress error logs and auth:expired. */
  private loggingOut: boolean = false;

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
   * Set API base URL (e.g. LAN server). Persists to localStorage for Electron file:// loads.
   */
  setBaseUrl(url: string): void {
    const trimmed = url.trim();
    if (!trimmed) return;
    let base = trimmed.replace(/\/+$/, '');
    if (!base.endsWith('/api')) {
      base = `${base}/api`;
    }
    this.baseUrl = base;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(PBOOKS_API_BASE_STORAGE_KEY, this.baseUrl);
      } catch {
        /* ignore */
      }
    }
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
   * Set whether logout is in progress (suppresses 401 error logs and auth:expired during logout).
   */
  setLoggingOut(value: boolean): void {
    this.loggingOut = value;
  }

  /**
   * Whether logout is in progress.
   */
  isLoggingOut(): boolean {
    return this.loggingOut;
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
    options: RequestInit & { skipConflictNotification?: boolean } = {}
  ): Promise<T> {
    const { skipConflictNotification, ...fetchOpts } = options;
    const shouldSkipConflictModal = skipConflictNotification === true;
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
    }

    // Guard: reject data endpoint requests when there is no token.
    // Auth endpoints (login, register, lookup) don't require a token.
    const isPublicEndpoint = endpoint.includes('/auth/') ||
                             endpoint.includes('/register-tenant') ||
                             endpoint.includes('/health') ||
                             endpoint.includes('/schema/version') ||
                             endpoint.includes('/app-info/version') ||
                             endpoint.includes('/discover');
    if (!this.token && !isPublicEndpoint) {
      throw {
        error: 'No authentication token',
        message: 'Not authenticated. Please login.',
        status: 401
      } as ApiError;
    }
    
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...fetchOpts.headers,
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
        logger.logCategory('api', `📤 API Request: ${fetchOpts.method || 'GET'} ${endpoint}`);
        if (fetchOpts.body && typeof fetchOpts.body === 'string') {
          try {
            const bodyData = JSON.parse(fetchOpts.body);
            logger.logCategory('api', `📤 Request body:`, { 
              ...bodyData, 
              // Truncate large fields for logging
              ...(bodyData.description && { description: bodyData.description.substring(0, 50) + '...' })
            });
          } catch (e) {
            // Body might not be JSON, log as-is
            logger.logCategory('api', `📤 Request body length: ${fetchOpts.body.length} bytes`);
          }
        }
      }
      
      const fetchInit: RequestInit = {
        ...fetchOpts,
        headers,
      };
      if (!fetchOpts.signal && typeof AbortSignal !== 'undefined' && typeof (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout === 'function') {
        fetchInit.signal = (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout(120_000);
      }
      const response = await fetch(url, fetchInit);

      // Diagnostic: always log state endpoint responses
      if (endpoint.includes('/state/')) {
        console.log(`[DIAG-HTTP] ${fetchOpts.method || 'GET'} ${url} → ${response.status} ${response.statusText}`);
      }

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
          // Suppress 401 errors for expected endpoints (schema/version before login) or during logout
          const is401 = response.status === 401;
          const isExpected401Endpoint = endpoint.includes('/schema/version');
          const isLogoutInProgress = this.loggingOut;
          
          if (is401 && (isExpected401Endpoint || isLogoutInProgress)) {
            // Silent - expected 401 before authentication or session already ended on logout
          } else if (
            response.status === 409 &&
            (() => {
              const c = pickApiErrorFields(data).code;
              return (
                c === 'VERSION_CONFLICT' || c === 'CONFLICT' || c === 'LOCK_HELD' || c === 'LOCK_LOST'
              );
            })()
          ) {
            // Silent - sync / optimistic lock / record lock / lock heartbeat (LOCK_LOST) handled by caller
          } else if (!(is401 && isLogoutInProgress)) {
            // Log other errors (and 401 only when not logging out)
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
        const fields = pickApiErrorFields(data);
        const error: ApiError = {
          error: fields.message || 'Unauthorized',
          message: fields.message || 'Your session has expired. Please login again.',
          status: 401,
          ...(fields.code && { code: fields.code }),
        };
        
        // During logout, 401s are expected (session already invalidated). Don't log or dispatch.
        if (this.loggingOut) {
          throw error;
        }
        
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
          const isBackgroundSync = endpoint.includes('/state/') ||
                                    endpoint.includes('/contacts') || 
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
                                    endpoint.includes('/app-settings') ||
                                    endpoint.includes('/state/') ||
                                    endpoint.includes('/quotations') ||
                                    endpoint.includes('/sales-returns') ||
                                    endpoint.includes('/documents') ||
                                    endpoint.includes('/recurring-invoice-templates') ||
                                    endpoint.includes('/pm-cycle-allocations') ||
                                    endpoint.includes('/transaction-audit') ||
                                    endpoint.includes('/personal-categories') ||
                                    endpoint.includes('/personal-transactions') ||
                                    endpoint.includes('/tasks') ||
                                    endpoint.includes('/rental/owner-balances') ||
                                    endpoint.includes('/rental/monthly-owner-summary');
          
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
            const isHeartbeatSessionNotFound =
              endpoint.includes('/auth/heartbeat') && pickApiErrorFields(data).code === 'SESSION_NOT_FOUND';
            
            if (isHeartbeatSessionNotFound) {
              // Don't logout for heartbeat session not found - might be race condition
              // Just throw the error, don't clear auth
              logger.logCategory('auth', 'Heartbeat: Session not found (may be race condition), not logging out');
            } else {
              // Always log auth errors, even if logging is disabled
              logger.errorCategory('auth', 'API Error (401 Unauthorized) - Token was present but invalid:', {
                error: fields.message,
                code: fields.code,
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

      // Committed-only contract: HTTP 2xx can still return success: false (e.g. lock refresh).
      if (
        data &&
        typeof data === 'object' &&
        'success' in data &&
        (data as { success?: boolean }).success === false
      ) {
        const fields = pickApiErrorFields(data);
        const code = fields.code;
        if (import.meta.env.DEV) {
          console.warn('[API] success=false', endpoint, data);
        }
        const err: ApiError & Record<string, unknown> = {
          error: fields.message,
          message: fields.message,
          status: response.status,
          ...(code && { code }),
          ...(data.existingRunId && { existingRunId: data.existingRunId }),
          ...(data.existingStatus && { existingStatus: data.existingStatus }),
          ...(data.serverVersion != null && { serverVersion: data.serverVersion }),
          ...(data.invoiceId != null && { invoiceId: data.invoiceId }),
          ...(data.invoiceNumber != null && { invoiceNumber: data.invoiceNumber }),
        };
        if (!shouldSkipConflictModal) {
          notifyApiConflictIfUserFacing(err, endpoint, fetchOpts.method || 'GET');
        }
        throw err;
      }

      if (!response.ok) {
        const fields = pickApiErrorFields(data);
        const error: ApiError & Record<string, unknown> = {
          error: fields.message || 'Request failed',
          message: fields.message,
          status: response.status,
          ...(fields.code && { code: fields.code }),
          ...(data.existingRunId && { existingRunId: data.existingRunId }),
          ...(data.existingStatus && { existingStatus: data.existingStatus }),
          ...(data.serverVersion != null && { serverVersion: data.serverVersion }),
          ...(data.invoiceId != null && { invoiceId: data.invoiceId }),
          ...(data.invoiceNumber != null && { invoiceNumber: data.invoiceNumber }),
        };
        const isVersionConflict = response.status === 409 && fields.code === 'VERSION_CONFLICT';
        if (isVersionConflict) {
          logger.logCategory('sync', `Version conflict for ${endpoint} (server v${data.serverVersion}) - sync will accept server version`);
        } else if (response.status === 409 && fields.code === 'CONFLICT') {
          logger.logCategory('sync', `Record conflict for ${endpoint}: ${fields.message || 'concurrent edit'}`);
        } else if (response.status === 409 && fields.code === 'LOCK_HELD') {
          logger.logCategory('sync', `Record lock for ${endpoint}: ${fields.message || 'another user'}`);
        } else if (response.status === 409 && fields.code === 'LOCK_LOST') {
          logger.logCategory('sync', `Lock heartbeat: ${endpoint} — ${fields.message || 'lock no longer held'}`);
        } else {
          console.error('API Error:', error);
        }
        if (!shouldSkipConflictModal) {
          notifyApiConflictIfUserFacing(error, endpoint, fetchOpts.method || 'GET');
        }
        throw error;
      }

      if (
        data &&
        typeof data === 'object' &&
        'success' in data &&
        (data as { success?: boolean }).success === true &&
        'data' in data &&
        (data as { data?: unknown }).data !== undefined
      ) {
        return (data as { data: T }).data as T;
      }

      return data as T;
    } catch (error) {
      // During logout, 401 is expected; avoid noisy console error
      const is401DuringLogout = error && typeof error === 'object' && (error as ApiError).status === 401 && this.loggingOut;
      const errCode = error && typeof error === 'object' ? (error as { code?: string }).code : undefined;
      const isVersionConflict = errCode === 'VERSION_CONFLICT';
      const isConflict = errCode === 'CONFLICT';
      const isLockHeld = errCode === 'LOCK_HELD';
      const isLockLost = errCode === 'LOCK_LOST';
      if (!is401DuringLogout && !isVersionConflict && !isConflict && !isLockHeld && !isLockLost) {
        if (import.meta.env.DEV) {
          console.error('API Request Error:', error);
        }
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw {
          error: 'Timeout',
          message: 'Cannot connect to server. The request timed out — please try again.',
          status: 408,
          code: 'TIMEOUT',
        } as ApiError;
      }

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

          if (
            typeof window !== 'undefined' &&
            this.token &&
            isLanBackendApi()
          ) {
            const now = Date.now();
            if (now - lastServerUnreachableDispatch > SERVER_UNREACHABLE_DEBOUNCE_MS) {
              lastServerUnreachableDispatch = now;
              window.dispatchEvent(new CustomEvent('pbooks:server-unreachable'));
            }
          }
          
          // When API is localhost, connection refused usually means server isn't running
          const isLocalApi = this.baseUrl.includes('localhost') || this.baseUrl.includes('127.0.0.1');
          const networkError: ApiError = {
            error: 'NetworkError',
            message: isLocalApi
              ? 'Cannot reach API server. Make sure it\'s running (e.g. npm run dev:backend).'
              : 'Cannot connect to server. Please check your network.',
            status: 0, // Special status code for network errors
            code: 'NETWORK_ERROR',
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
  async post<T>(endpoint: string, data?: any, options?: { headers?: Record<string, string> }): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? stringifyApiJsonBody(data) : undefined,
      headers: options?.headers,
    });
  }

  /**
   * PUT request
   */
  async put<T>(
    endpoint: string,
    data?: any,
    requestOptions?: { skipConflictNotification?: boolean; headers?: Record<string, string> }
  ): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? stringifyApiJsonBody(data) : undefined,
      headers: requestOptions?.headers,
      skipConflictNotification: requestOptions?.skipConflictNotification,
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
      body: data ? stringifyApiJsonBody(data) : undefined,
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

