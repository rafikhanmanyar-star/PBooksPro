/**
 * Cloud PostgreSQL Service
 * 
 * Client-side service for connecting to cloud PostgreSQL database.
 * Used by both desktop (for sync) and mobile (as primary database).
 * 
 * Note: This runs in the browser and connects to cloud PostgreSQL via API proxy
 * or direct connection (if CORS is configured).
 */

import { getCloudDatabaseConnectionString, isCloudPostgreSQLEnabled } from '../../config/database';

export interface CloudPostgreSQLConfig {
  connectionString: string;
  ssl?: boolean;
  maxConnections?: number;
}

class PostgreSQLLocalService {
  private config: CloudPostgreSQLConfig | null = null;
  private isInitialized = false;
  private initializationError: Error | null = null;
  private apiBaseUrl: string;

  constructor() {
    // Use API base URL for cloud database operations
    // The actual PostgreSQL connection happens server-side via API
    this.apiBaseUrl = process.env.VITE_API_BASE_URL || 
                     (typeof window !== 'undefined' ? 
                       `${window.location.protocol}//${window.location.hostname}:3000` : 
                       'http://localhost:3000');
  }

  /**
   * Initialize the cloud PostgreSQL service
   * For client-side, we use the API endpoints rather than direct connection
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Check if cloud PostgreSQL is enabled
      if (!isCloudPostgreSQLEnabled()) {
        throw new Error('Cloud PostgreSQL is not configured');
      }

      // For client-side, we don't establish direct connection
      // Instead, we'll use API endpoints which handle the PostgreSQL connection server-side
      // This service acts as a client wrapper
      
      this.config = {
        connectionString: getCloudDatabaseConnectionString(),
        ssl: true,
        maxConnections: 20,
      };

      // Test connection by making a health check API call
      // Health endpoint is at /health (not /api/health)
      // apiBaseUrl might already include /api, so we need to handle both cases
      const healthUrl = this.apiBaseUrl.includes('/api') 
        ? this.apiBaseUrl.replace(/\/api$/, '') + '/health'
        : this.apiBaseUrl + '/health';
      
      try {
        const response = await fetch(healthUrl, {
          method: 'GET',
          cache: 'no-cache',
        });
        if (!response.ok) {
          throw new Error(`Health check failed: ${response.statusText}`);
        }
      } catch (error) {
        console.warn('⚠️ Cloud database health check failed, but continuing:', error);
        // Don't throw - allow service to be used even if health check fails
        // The actual queries will fail gracefully if connection is down
      }

      this.isInitialized = true;
      console.log('✅ Cloud PostgreSQL service initialized (via API)');
    } catch (error) {
      this.initializationError = error as Error;
      console.error('❌ Failed to initialize cloud PostgreSQL service:', error);
      throw error;
    }
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.initializationError === null;
  }

  /**
   * Get initialization error if any
   */
  getInitializationError(): Error | null {
    return this.initializationError;
  }

  /**
   * Health check - test if cloud database is accessible
   */
  async healthCheck(): Promise<boolean> {
    if (!this.isReady()) {
      return false;
    }

    try {
      // Health endpoint is at /health (not /api/health)
      // apiBaseUrl might already include /api, so we need to handle both cases
      const healthUrl = this.apiBaseUrl.includes('/api') 
        ? this.apiBaseUrl.replace(/\/api$/, '') + '/health'
        : this.apiBaseUrl + '/health';
      
      const response = await fetch(healthUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-cache',
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });
      
      if (!response.ok) {
        console.warn(`[CloudPostgreSQL] Health check returned ${response.status}`);
        return false;
      }
      
      return true;
    } catch (error) {
      // If it's a timeout or network error, but browser says online, 
      // assume we're online (the API might be slow but working)
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        console.warn('[CloudPostgreSQL] Health check failed but browser is online, assuming online:', error);
        return true; // Optimistic - data operations will fail gracefully if actually offline
      }
      console.warn('[CloudPostgreSQL] Health check failed:', error);
      return false;
    }
  }

  /**
   * Get API base URL for cloud operations
   */
  getApiBaseUrl(): string {
    return this.apiBaseUrl;
  }
}

// Singleton instance
let cloudServiceInstance: PostgreSQLLocalService | null = null;

export function getCloudPostgreSQLService(): PostgreSQLLocalService {
  if (!cloudServiceInstance) {
    cloudServiceInstance = new PostgreSQLLocalService();
  }
  return cloudServiceInstance;
}
