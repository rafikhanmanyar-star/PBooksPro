/**
 * Unified Database Service
 *
 * Local SQLite only. Desktop uses Electron/sql.js; no cloud PostgreSQL.
 */

import { getPlatform } from '../../utils/platformDetection';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { getDatabaseService, DatabaseService } from './databaseService';

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
  private mode: DatabaseMode = 'local';
  private localDbService: DatabaseService | null = null;
  private isInitialized = false;
  private initializationError: Error | null = null;

  constructor() {
    this.platform = getPlatform();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (!isLocalOnlyMode()) {
      this.mode = 'api';
      this.localDbService = null;
      this.initializationError = null;
      return;
    }

    try {
      this.mode = 'local';
      this.localDbService = getDatabaseService();
      await this.localDbService.initialize();

      if (!this.localDbService.isReady()) {
        // No company DB open yet (multi-company mode) — silently defer.
        return;
      }

      this.isInitialized = true;
      this.initializationError = null;
      console.log(`[UnifiedDatabaseService] Initialized successfully in ${this.mode} mode`);
    } catch (error) {
      this.initializationError = error as Error;
      console.error('[UnifiedDatabaseService] Initialization failed:', error);
      throw error;
    }
  }

  async query<T>(sql: string, params?: any[]): Promise<T[]> {
    if (!this.isReady()) {
      throw new Error('Database service not initialized');
    }
    throw new Error(
      'Direct SQL queries are not supported. Use repositories instead.'
    );
  }

  async execute(sql: string, params?: any[]): Promise<void> {
    if (!this.isReady()) {
      throw new Error('Database service not initialized');
    }
    throw new Error(
      'Direct SQL execution is not supported. Use repositories instead.'
    );
  }

  async transaction<T>(operations: () => Promise<T>): Promise<T> {
    if (!this.isReady()) {
      throw new Error('Database service not initialized');
    }
    return operations();
  }

  isReady(): boolean {
    return this.isInitialized && this.initializationError === null;
  }

  getPlatform(): 'mobile' | 'desktop' {
    return this.platform;
  }

  getDatabaseMode(): DatabaseMode {
    return this.mode;
  }

  async isOnline(): Promise<boolean> {
    return true;
  }

  getLocalDatabaseService(): DatabaseService | null {
    return this.localDbService;
  }

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

export function getDatabaseServiceForPlatform(): UnifiedDatabaseService {
  return getUnifiedDatabaseService();
}
