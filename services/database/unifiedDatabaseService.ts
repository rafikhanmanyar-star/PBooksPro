/**
 * Unified Database Service
 * 
 * Platform-aware database service that provides a unified interface
 * for database operations across different platforms:
 * 
 * - Desktop: Uses API repositories (which connect to cloud PostgreSQL)
 *            with optional local SQLite caching for offline support
 * - Mobile: Uses API repositories only (cloud PostgreSQL, requires internet)
 * 
 * Note: Since this is a web app, PostgreSQL cannot run directly in the browser.
 * All PostgreSQL operations go through the API backend.
 */

import { getPlatform, isMobileDevice, canRunLocalPostgreSQL } from '../../utils/platformDetection';
import { getDatabaseService, DatabaseService } from './databaseService';
import { getCloudPostgreSQLService } from './postgresqlCloudService';
import { apiClient } from '../api/client';

export type DatabaseMode = 'local' | 'cloud' | 'hybrid' | 'api';

export interface UnifiedDatabaseService {
  initialize(): Promise<void>;
  query<T>(sql: string, params?: any[]): Promise<T[]>;
  execute(sql: string, params?: any[]): Promise<void>;
  transaction<T>(operations: () => Promise<T>): Promise<T>;
  isReady(): boolean;
  getPlatform(): 'mobile' | 'desktop';
  getDatabaseMode(): DatabaseMode;
  isOnline(): Promise<boolean>;
}

class UnifiedDatabaseServiceImpl implements UnifiedDatabaseService {
  private platform: 'mobile' | 'desktop';
  private mode: DatabaseMode = 'api';
  private localDbService: DatabaseService | null = null;
  private cloudService: ReturnType<typeof getCloudPostgreSQLService> | null = null;
  private isInitialized = false;
  private initializationError: Error | null = null;

  constructor() {
    this.platform = getPlatform();
  }

  /**
   * Initialize the unified database service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      console.log(`[UnifiedDatabaseService] Initializing for platform: ${this.platform}`);

      // Always use hybrid mode (local SQLite + cloud PostgreSQL via API)
      // This enables offline support and local caching on all devices including mobile
      await this.initializeHybrid();

      this.isInitialized = true;
      console.log(`[UnifiedDatabaseService] Initialized successfully in ${this.mode} mode`);
    } catch (error) {
      this.initializationError = error as Error;
      console.error('[UnifiedDatabaseService] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Initialize hybrid database mode (local + cloud)
   */
  private async initializeHybrid(): Promise<void> {
    this.mode = 'hybrid';
    
    // Initialize local SQLite (for offline support)
    try {
      this.localDbService = getDatabaseService();
      await this.localDbService.initialize();
      console.log('[UnifiedDatabaseService] Local SQLite initialized');
    } catch (error) {
      console.warn('[UnifiedDatabaseService] Local SQLite initialization failed:', error);
      // Continue with API-only mode
      this.mode = 'api';
    }

    // Initialize cloud service (for health checks)
    try {
      this.cloudService = getCloudPostgreSQLService();
      await this.cloudService.initialize();
    } catch (error) {
      console.warn('[UnifiedDatabaseService] Cloud service initialization failed (non-critical):', error);
    }

    console.log(`[UnifiedDatabaseService] Database mode: ${this.mode} (local + cloud via API)`);
  }

  /**
   * Execute a query
   * Note: For web apps, queries go through API, not direct SQL
   * This method is kept for compatibility but should use repositories instead
   */
  async query<T>(sql: string, params?: any[]): Promise<T[]> {
    if (!this.isReady()) {
      throw new Error('Database service not initialized');
    }

    // For web apps, direct SQL queries are not supported
    // Use API repositories instead
    throw new Error(
      'Direct SQL queries are not supported in web app. ' +
      'Use API repositories (e.g., ContactsApiRepository, TransactionsApiRepository) instead.'
    );
  }

  /**
   * Execute a SQL statement
   * Note: For web apps, this is not supported - use API repositories
   */
  async execute(sql: string, params?: any[]): Promise<void> {
    if (!this.isReady()) {
      throw new Error('Database service not initialized');
    }

    // For web apps, direct SQL execution is not supported
    throw new Error(
      'Direct SQL execution is not supported in web app. ' +
      'Use API repositories instead.'
    );
  }

  /**
   * Execute operations in a transaction
   * Note: For web apps, transactions are handled by the API backend
   */
  async transaction<T>(operations: () => Promise<T>): Promise<T> {
    if (!this.isReady()) {
      throw new Error('Database service not initialized');
    }

    // For desktop with local DB, use local transaction
    if (this.mode === 'hybrid' && this.localDbService) {
      return this.localDbService.transaction(operations);
    }

    // For API mode, execute operations directly (backend handles transactions)
    return operations();
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.initializationError === null;
  }

  /**
   * Get current platform
   */
  getPlatform(): 'mobile' | 'desktop' {
    return this.platform;
  }

  /**
   * Get current database mode
   */
  getDatabaseMode(): DatabaseMode {
    return this.mode;
  }

  /**
   * Check if online (cloud database accessible)
   */
  async isOnline(): Promise<boolean> {
    if (!this.cloudService) {
      return false;
    }

    try {
      return await this.cloudService.healthCheck();
    } catch (error) {
      return false;
    }
  }

  /**
   * Get local database service (desktop only)
   */
  getLocalDatabaseService(): DatabaseService | null {
    return this.localDbService;
  }

  /**
   * Check if local database is available (desktop only)
   */
  hasLocalDatabase(): boolean {
    return this.localDbService !== null && this.localDbService.isReady();
  }
}

// Singleton instance
let unifiedServiceInstance: UnifiedDatabaseServiceImpl | null = null;

export function getUnifiedDatabaseService(): UnifiedDatabaseService {
  if (!unifiedServiceInstance) {
    unifiedServiceInstance = new UnifiedDatabaseServiceImpl();
  }
  return unifiedServiceInstance;
}

/**
 * Helper function to get the appropriate database service based on platform
 * For backward compatibility with existing code
 */
export function getDatabaseServiceForPlatform(): UnifiedDatabaseService {
  return getUnifiedDatabaseService();
}
