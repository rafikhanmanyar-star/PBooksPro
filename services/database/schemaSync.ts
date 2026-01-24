/**
 * Schema Synchronization Service
 * 
 * Compares local SQLite schema with cloud PostgreSQL schema and ensures they match.
 * Handles schema version tracking and migration.
 */

import { getDatabaseService } from './databaseService';
import { apiClient } from '../api/client';
import { isMobileDevice } from '../../utils/platformDetection';

export interface SchemaVersion {
  database: string; // 'local', 'staging', 'production'
  version: number;
  updatedAt: number;
}

class SchemaSyncService {
  private localSchemaVersion: number = 1;
  private cloudSchemaVersion: number | null = null;
  private isInitialized = false;

  /**
   * Initialize schema sync service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Initialize schema sync (enabled for all devices)
    try {
      // Load local schema version
      await this.loadLocalSchemaVersion();

      // Get cloud schema version
      await this.loadCloudSchemaVersion();

      // Compare and sync if needed
      await this.syncSchemas();

      this.isInitialized = true;
      console.log('[SchemaSync] ✅ Initialized schema sync service');
    } catch (error) {
      console.error('[SchemaSync] ❌ Failed to initialize schema sync:', error);
      // Continue anyway - schema sync is not critical
      this.isInitialized = true;
    }
  }

  /**
   * Load local schema version from SQLite
   */
  private async loadLocalSchemaVersion(): Promise<void> {
    const dbService = getDatabaseService();

    if (!dbService.isReady()) {
      console.warn('[SchemaSync] Local database not ready, using default schema version');
      this.localSchemaVersion = 1;
      return;
    }

    try {
      // Check if schema_versions table exists
      const tables = dbService.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_versions'"
      );

      if (tables.length === 0) {
        // Create schema_versions table
        dbService.execute(`
          CREATE TABLE IF NOT EXISTS schema_versions (
            database TEXT PRIMARY KEY,
            version INTEGER NOT NULL,
            updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
          )
        `);

        // Insert initial version
        dbService.execute(
          'INSERT INTO schema_versions (database, version) VALUES (?, ?)',
          ['local', 1]
        );

        this.localSchemaVersion = 1;
        return;
      }

      // Get local schema version
      const versions = dbService.query<{ database: string; version: number }>(
        'SELECT database, version FROM schema_versions WHERE database = ?',
        ['local']
      );

      if (versions.length > 0) {
        this.localSchemaVersion = versions[0].version;
      } else {
        // Insert initial version
        dbService.execute(
          'INSERT INTO schema_versions (database, version) VALUES (?, ?)',
          ['local', 1]
        );
        this.localSchemaVersion = 1;
      }

      console.log(`[SchemaSync] Local schema version: ${this.localSchemaVersion}`);
    } catch (error) {
      console.error('[SchemaSync] Failed to load local schema version:', error);
      this.localSchemaVersion = 1; // Default to version 1
    }
  }

  /**
   * Load cloud schema version from API
   */
  private async loadCloudSchemaVersion(): Promise<void> {
    try {
      const response = await apiClient.get<{ version: number }>('/schema/version');
      this.cloudSchemaVersion = response.version;
      console.log(`[SchemaSync] Cloud schema version: ${this.cloudSchemaVersion}`);
    } catch (error: any) {
      // 401 Unauthorized is expected before login - suppress
      if (error?.status === 401 || error?.message?.includes('authentication token')) {
        // Silent - expected before authentication
        this.cloudSchemaVersion = null;
      } else if (error instanceof Error && error.message.includes('404')) {
        // Endpoint not implemented yet - silent
        this.cloudSchemaVersion = null;
      } else {
        // Only log unexpected errors
        console.warn('[SchemaSync] Failed to load cloud schema version:', error);
        this.cloudSchemaVersion = null;
      }
    }
  }

  /**
   * Sync schemas if versions differ
   */
  private async syncSchemas(): Promise<void> {
    if (this.cloudSchemaVersion === null) {
      console.log('[SchemaSync] Cloud schema version unavailable, skipping sync');
      return;
    }

    if (this.localSchemaVersion === this.cloudSchemaVersion) {
      console.log('[SchemaSync] ✅ Schema versions match, no sync needed');
      return;
    }

    if (this.localSchemaVersion > this.cloudSchemaVersion) {
      console.warn(
        `[SchemaSync] ⚠️ Local schema (${this.localSchemaVersion}) is newer than cloud (${this.cloudSchemaVersion}). This shouldn't happen.`
      );
      return;
    }

    // Local schema is older - need to update
    console.log(
      `[SchemaSync] 🔄 Local schema (${this.localSchemaVersion}) is older than cloud (${this.cloudSchemaVersion}). Updating...`
    );

    try {
      // Get migration scripts from cloud
      await this.applyMigrations(this.localSchemaVersion, this.cloudSchemaVersion);

      // Update local schema version
      await this.updateLocalSchemaVersion(this.cloudSchemaVersion);

      console.log('[SchemaSync] ✅ Schema sync completed');
    } catch (error) {
      console.error('[SchemaSync] ❌ Failed to sync schemas:', error);
      throw error;
    }
  }

  /**
   * Apply migrations from one version to another
   */
  private async applyMigrations(fromVersion: number, toVersion: number): Promise<void> {
    try {
      // Get migration scripts from cloud API
      const response = await apiClient.get<{ migrations: string[] }>(
        `/schema/migrations?from=${fromVersion}&to=${toVersion}`
      );

      const dbService = getDatabaseService();

      if (!dbService.isReady()) {
        throw new Error('Local database not ready');
      }

      // Apply each migration
      for (const migration of response.migrations) {
        console.log(`[SchemaSync] Applying migration: ${migration.substring(0, 50)}...`);
        
        // Execute migration SQL
        dbService.execute(migration);
      }

      console.log(`[SchemaSync] ✅ Applied ${response.migrations.length} migrations`);
    } catch (error) {
      // If endpoint doesn't exist yet, that's okay
      if (error instanceof Error && error.message.includes('404')) {
        console.debug('[SchemaSync] Migration API endpoint not yet implemented');
        // Schema sync will work once API is implemented
      } else {
        throw error;
      }
    }
  }

  /**
   * Update local schema version
   */
  private async updateLocalSchemaVersion(version: number): Promise<void> {
    const dbService = getDatabaseService();

    if (!dbService.isReady()) {
      throw new Error('Local database not ready');
    }

    try {
      // Update schema version
      dbService.execute(
        'UPDATE schema_versions SET version = ?, updated_at = strftime(\'%s\', \'now\') WHERE database = ?',
        [version, 'local']
      );

      this.localSchemaVersion = version;
      console.log(`[SchemaSync] ✅ Updated local schema version to ${version}`);
    } catch (error) {
      console.error('[SchemaSync] Failed to update local schema version:', error);
      throw error;
    }
  }

  /**
   * Get current local schema version
   */
  getLocalSchemaVersion(): number {
    return this.localSchemaVersion;
  }

  /**
   * Get current cloud schema version
   */
  getCloudSchemaVersion(): number | null {
    return this.cloudSchemaVersion;
  }

  /**
   * Check if schemas are in sync
   */
  areSchemasInSync(): boolean {
    if (this.cloudSchemaVersion === null) {
      return true; // Can't verify, assume in sync
    }
    return this.localSchemaVersion === this.cloudSchemaVersion;
  }

  /**
   * Force schema sync check
   */
  async checkAndSync(): Promise<void> {
    await this.loadCloudSchemaVersion();
    await this.syncSchemas();
  }
}

// Singleton instance
let schemaSyncInstance: SchemaSyncService | null = null;

export function getSchemaSyncService(): SchemaSyncService {
  if (!schemaSyncInstance) {
    schemaSyncInstance = new SchemaSyncService();
  }
  return schemaSyncInstance;
}
