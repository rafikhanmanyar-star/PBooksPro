/**
 * API Client Service
 * 
 * Provides a centralized HTTP client for communicating with the backend API.
 * Handles authentication, error handling, and request/response transformation.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

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
   * Make an API request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Add auth token if available
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
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
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('Network request failed')) {
          throw new Error('Network error: Unable to connect to server. Please check your connection and ensure the backend is running on port 3000.');
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

