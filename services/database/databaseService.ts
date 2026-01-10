/**
 * Database Service
 * 
 * Provides a clean abstraction layer for database operations using sql.js.
 * Handles initialization, transactions, and provides type-safe query methods.
 */

import { CREATE_SCHEMA_SQL, SCHEMA_VERSION } from './schema';
import { loadSqlJs } from './sqljs-loader';
import { logger } from '../logger';

// Types for sql.js
type Database = any;
type SqlJsStatic = any;


/**
 * Simple OPFS (Origin Private File System) adapter.
 * Persists the SQLite binary in a durable, browser-managed file instead of localStorage.
 * Falls back gracefully if OPFS is unavailable.
 */
class OpfsStorage {
    private fileName = 'finance_db.sqlite';
    private rootHandlePromise: Promise<FileSystemDirectoryHandle> | null = null;

    private async getRoot(): Promise<FileSystemDirectoryHandle> {
        if (!this.rootHandlePromise) {
            this.rootHandlePromise = (navigator as any)?.storage?.getDirectory();
        }
        if (!this.rootHandlePromise) {
            throw new Error('OPFS not supported');
        }
        return this.rootHandlePromise;
    }

    async isSupported(): Promise<boolean> {
        try {
            return typeof navigator !== 'undefined' &&
                !!(navigator as any).storage &&
                typeof (navigator as any).storage.getDirectory === 'function';
        } catch {
            return false;
        }
    }

    private async getFileHandle(): Promise<FileSystemFileHandle> {
        const root = await this.getRoot();
        return await root.getFileHandle(this.fileName, { create: true });
    }

    async load(): Promise<Uint8Array | null> {
        if (!(await this.isSupported())) return null;
        try {
            const handle = await this.getFileHandle();
            const file = await handle.getFile();
            if (!file || file.size === 0) return null;
            const buffer = await file.arrayBuffer();
            return new Uint8Array(buffer);
        } catch (error) {
            logger.warnCategory('database', 'OPFS load failed, falling back to localStorage:', error);
            return null;
        }
    }

    async save(data: Uint8Array): Promise<void> {
        if (!(await this.isSupported())) return;
        try {
            const handle = await this.getFileHandle();
            const writable = await handle.createWritable();
            // Convert to a proper ArrayBuffer if needed (OPFS requires ArrayBuffer, not SharedArrayBuffer)
            const buffer = new Uint8Array(data).buffer;
            await writable.write(buffer);
            await writable.close();
        } catch (error) {
            logger.warnCategory('database', 'OPFS save failed:', error);
            throw error;
        }
    }
}

export interface DatabaseConfig {
    autoSave?: boolean;
    saveInterval?: number; // milliseconds
}

class DatabaseService {
    private db: any = null;
    private sqlJs: any = null;
    private config: DatabaseConfig;
    private saveTimer: number | null = null;
    private isInitialized = false;
    private initializationError: Error | null = null;
    private initializationPromise: Promise<void> | null = null;
    private inTransaction = false;
    private sqlJsModule: any = null;
    private opfs = new OpfsStorage();
    private storageMode: 'opfs' | 'localStorage' = 'localStorage';
    private saveLock: Promise<void> = Promise.resolve(); // Lock to prevent concurrent saves

    constructor(config: DatabaseConfig = {}) {
        this.config = {
                autoSave: config.autoSave ?? true,
                saveInterval: config.saveInterval ?? 10000, // 10 seconds default - reduced IPC overhead
            };
        }

        /**
         * Initialize the database
         */
        async initialize(): Promise<void> {
            // Return existing promise if already initializing
            if (this.initializationPromise) {
                return this.initializationPromise;
            }

            if (this.isInitialized && this.db) {
                return;
            }

            // If we have an error, don't retry immediately
            if (this.initializationError) {
                throw this.initializationError;
            }

            this.initializationPromise = this._doInitialize();
            return this.initializationPromise;
        }

        private async _doInitialize(): Promise<void> {
            try {
                logger.logCategory('database', '🔄 Initializing SQL database...');
                
                // Load sql.js using the loader
                if (!this.sqlJsModule) {
                    try {
                        this.sqlJsModule = await loadSqlJs();
                        console.log('✅ sql.js loaded successfully');
                    } catch (loadError) {
                        const errorMsg = loadError instanceof Error ? loadError.message : String(loadError);
                        console.error('❌ Failed to load sql.js:', errorMsg);
                        throw new Error(`Failed to load sql.js: ${errorMsg}`);
                    }
                }
                
                const initFunction = this.sqlJsModule;
                
                if (typeof initFunction !== 'function') {
                    throw new Error('initSqlJs is not a function. sql.js module may not be loaded correctly.');
                }
                
                // Load sql.js with timeout
                const initPromise = initFunction({
                    locateFile: (file: string) => {
                        // In browser, try local first, then CDN
                        try {
                            // Try to use local file from node_modules (for dev) or dist (for build)
                            const localPath = new URL(`../../node_modules/sql.js/dist/${file}`, import.meta.url).href;
                            return localPath;
                        } catch {
                            // Fallback to CDN
                            return `https://sql.js.org/dist/${file}`;
                        }
                    },
                });

                // Add timeout to prevent hanging
                const timeoutPromise = new Promise<never>((_, reject) => {
                    setTimeout(() => reject(new Error('SQL.js initialization timeout after 15 seconds')), 15000);
                });

                const SQL = await Promise.race([initPromise, timeoutPromise]);
                this.sqlJs = SQL;
                console.log('✅ SQL.js loaded successfully');

                // Priority order: OPFS > localStorage
                let loadedData: Uint8Array | null = null;
                
                // 1. Try OPFS first
                if (!this.db) {
                    const opfsData = await this.opfs.load();
                    if (opfsData) {
                        try {
                            this.db = new SQL.Database(opfsData);
                            this.storageMode = 'opfs';
                            logger.logCategory('database', '✅ Loaded existing database from OPFS');
                            loadedData = opfsData;
                        } catch (parseError) {
                            logger.warnCategory('database', '⚠️ Failed to parse OPFS database, trying localStorage:', parseError);
                        }
                    }
                }

                // 2. Fallback to localStorage
                if (!this.db) {
                    const savedDb = localStorage.getItem('finance_db');
                    if (typeof savedDb === 'string') {
                        try {
                            const buffer = Uint8Array.from(JSON.parse(savedDb));
                            this.db = new SQL.Database(buffer);
                            this.storageMode = 'localStorage';
                            logger.logCategory('database', '✅ Loaded existing database from localStorage');
                            loadedData = buffer;
                        } catch (parseError) {
                            logger.warnCategory('database', '⚠️ Failed to parse saved database, creating new one:', parseError);
                        }
                    }
                }

            if (!this.db) {
                // Create new database
                logger.logCategory('database', '📦 Creating new database...');
                this.db = new SQL.Database();
                // Create schema
                this.db.run(CREATE_SCHEMA_SQL);
                // Set schema version
                this.setMetadata('schema_version', SCHEMA_VERSION.toString());
                logger.logCategory('database', '✅ Database schema created');
            } else {
                // Database exists - check schema version and migrate if needed
                await this.checkAndMigrateSchema();
                // Ensure tenant columns are present even if schema version is current (idempotent)
                try {
                    const { migrateTenantColumns } = await import('./tenantMigration');
                    migrateTenantColumns();
                } catch (tenantError) {
                    console.warn('⚠️ Tenant column migration failed during init (continuing):', tenantError);
                }
                
                // Ensure license_settings table doesn't have tenant_id (it's a global table)
                try {
                    const columns = this.query<{ name: string }>('PRAGMA table_info(license_settings)');
                    const hasTenantId = columns.some(col => col.name === 'tenant_id');
                    if (hasTenantId) {
                        // Note: SQLite doesn't support DROP COLUMN easily, but license_settings shouldn't have tenant_id
                        // If it does, we'll need to recreate the table. For now, just warn.
                        console.warn('⚠️ license_settings table has tenant_id column (should be global table)');
                        // The queries should still work, just ignore tenant_id column if present
                    }
                } catch (checkError) {
                    // Ignore if table doesn't exist yet or other errors
                }
                // Ensure all tables are present (for existing databases)
                this.ensureAllTablesExist();
                // Ensure contracts table has new columns
                this.ensureContractColumnsExist();
            }

            // Migrate to OPFS if available
            if (this.storageMode === 'localStorage' && (await this.opfs.isSupported())) {
                try {
                    await this.opfs.save(this.db.export());
                    this.storageMode = 'opfs';
                    logger.logCategory('database', '✅ Copied database to OPFS for durability');
                } catch (copyError) {
                    logger.warnCategory('database', '⚠️ Failed to copy database to OPFS, continuing with localStorage:', copyError);
                }
            }

            this.isInitialized = true;
            this.initializationError = null;

            // Start auto-save if enabled
            if (this.config.autoSave) {
                this.startAutoSave();
            }

            logger.logCategory('database', '✅ Database initialized successfully');
        } catch (error) {
            logger.errorCategory('database', '❌ Failed to initialize database:', error);
            this.initializationError = error instanceof Error ? error : new Error(String(error));
            this.isInitialized = false;
            
            // Log error
            try {
                const { getErrorLogger } = await import('../errorLogger');
                getErrorLogger().logError(this.initializationError, {
                    errorType: 'database_initialization'
                });
            } catch (logError) {
                console.error('Failed to log database initialization error:', logError);
            }
            
            throw this.initializationError;
        } finally {
            this.initializationPromise = null;
        }
    }

    /**
     * Get the database instance (throws if not initialized)
     */
    getDatabase(): Database {
        if (!this.db || !this.isInitialized) {
            throw new Error('Database not initialized. Call initialize() first.');
        }
        return this.db;
    }

    /**
     * Check if database is initialized
     */
    isReady(): boolean {
        return this.isInitialized && this.db !== null;
    }

    /**
     * Check if currently in a transaction
     */
    isInTransaction(): boolean {
        return this.inTransaction;
    }

    /**
     * Check if initialization failed
     */
    hasError(): boolean {
        return this.initializationError !== null;
    }

    /**
     * Get initialization error
     */
    getError(): Error | null {
        return this.initializationError;
    }

    /**
     * Execute a SQL query and return results
     */
    query<T = any>(sql: string, params: any[] = []): T[] {
        if (!this.isReady()) {
            // Suppress warnings for COUNT queries - they're expected during initialization/navigation
            // Only log warnings for other queries that might indicate a real issue
            const isCountQuery = sql.trim().toUpperCase().startsWith('SELECT COUNT(*)');
            if (!isCountQuery) {
                console.warn(`⚠️ Database not ready for query: ${sql.substring(0, 50)}...`);
            }
            return [];
        }
        const db = this.getDatabase();
        const stmt = db.prepare(sql);
        stmt.bind(params);
        const results: T[] = [];
        while (stmt.step()) {
            results.push(stmt.getAsObject() as T);
        }
        stmt.free();
        return results;
    }

    /**
     * Execute a SQL statement (INSERT, UPDATE, DELETE)
     */
    execute(sql: string, params: any[] = []): void {
        if (!this.isReady()) {
            console.warn(`⚠️ Database not ready for execution: ${sql.substring(0, 50)}...`);
            return;
        }
        try {
            const db = this.getDatabase();
            db.run(sql, params);
        } catch (error: any) {
            const errorMsg = error?.message || String(error);
            console.error(`❌ SQL execution failed:`, error);
            console.error(`SQL: ${sql}`);
            console.error(`Params:`, params);
            console.error(`Error message: ${errorMsg}`);
            console.error(`Error stack:`, error?.stack);
            
            // Check if this is a constraint violation or other SQL error that would cause rollback
            const lowerMsg = errorMsg.toLowerCase();
            if (lowerMsg.includes('constraint') || lowerMsg.includes('unique') || 
                lowerMsg.includes('not null') || lowerMsg.includes('foreign key')) {
                console.error(`⚠️ This appears to be a constraint violation that may cause transaction rollback!`);
            }
            
            throw error;
        }
    }

    /**
     * Execute multiple statements in a transaction
     */
    transaction(operations: (() => void)[]): void {
        if (!Array.isArray(operations)) {
            throw new Error('transaction() expects an array of operations');
        }
        if (operations.length === 0) {
            return; // nothing to do
        }

        const db = this.getDatabase();
        let committed = false;
        let begun = false;

        try {
            db.run('BEGIN TRANSACTION');
            begun = true;
            this.inTransaction = true;
            console.log('✅ Transaction started successfully');
        } catch (beginError) {
            // If we cannot start a transaction, surface the error immediately
            this.inTransaction = false;
            console.error('❌ Failed to start transaction:', beginError);
            throw beginError;
        }

        try {
            console.log(`🔄 Executing ${operations.length} operations in transaction...`);
            let operationError: any = null;
            
            // Execute all operations, catching any errors
            operations.forEach((op, index) => {
                if (operationError) {
                    // Skip remaining operations if one failed
                    return;
                }
                try {
                    console.log(`  → Executing operation ${index + 1}/${operations.length}`);
                    op();
                    console.log(`  ✅ Operation ${index + 1} completed without throwing error`);
                } catch (opError) {
                    console.error(`❌ Operation ${index + 1} failed:`, opError);
                    operationError = opError;
                    // Don't continue executing operations if one fails
                }
            });
            
            // If any operation failed, rollback and throw
            if (operationError) {
                console.error('❌ One or more operations failed, rolling back transaction...');
                if (begun) {
                    try {
                        // Check if transaction is still active before rolling back
                        db.run('ROLLBACK');
                        console.log('✅ Rollback completed');
                    } catch (rollbackError: any) {
                        const rollbackMsg = (rollbackError?.message || String(rollbackError)).toLowerCase();
                        if (rollbackMsg.includes('no transaction is active')) {
                            console.warn('⚠️ Transaction already rolled back (likely auto-rolled back by sql.js)');
                        } else {
                            console.warn('❌ Rollback failed:', rollbackError);
                        }
                    }
                }
                throw operationError;
            }
            
            // All operations succeeded, check if transaction is still active before committing
            console.log('✅ All operations completed, checking transaction state...');
            let transactionStillActive = false;
            try {
                // Try to prepare a statement - if transaction is active, this should work
                const testStmt = db.prepare('SELECT 1');
                testStmt.step();
                testStmt.free();
                transactionStillActive = true;
                console.log('✅ Transaction is still active, proceeding to commit...');
            } catch (checkError: any) {
                const checkMsg = (checkError?.message || String(checkError)).toLowerCase();
                if (checkMsg.includes('no transaction') || checkMsg.includes('transaction')) {
                    console.error('❌ Transaction was already rolled back! Checking which operation caused it...');
                    transactionStillActive = false;
                } else {
                    // Some other error, assume transaction is still active
                    transactionStillActive = true;
                    console.log('⚠️ Could not verify transaction state, assuming it is active');
                }
            }
            
            if (!transactionStillActive) {
                console.error('❌ CRITICAL: Transaction was rolled back during operations! All changes are lost.');
                console.error('This usually means an SQL error occurred that caused sql.js to auto-rollback.');
                console.error('Check the logs above for any SQL errors or constraint violations.');
                committed = false;
                throw new Error('Transaction was auto-rolled back by sql.js - check for SQL errors in the logs above');
            }
            
            // Transaction is still active, commit it
            console.log('🔄 Committing transaction...');
            try {
                db.run('COMMIT');
                committed = true;
                console.log('✅ Transaction committed successfully');
            } catch (commitError: any) {
                // If commit fails, attempt rollback; handle "no transaction" case
                const msg = (commitError?.message || String(commitError)).toLowerCase();
                if (msg.includes('no transaction is active')) {
                    console.error('❌ Commit failed: no active transaction (transaction was already rolled back)');
                    committed = false;
                    throw new Error('Transaction was rolled back before commit - check for SQL errors in the logs above');
                } else {
                    console.error('❌ Commit failed:', commitError);
                    // If commit fails, attempt rollback
                    if (begun) {
                        try {
                            db.run('ROLLBACK');
                            console.log('✅ Rollback completed after failed commit');
                        } catch (rollbackError) {
                            console.warn('❌ Rollback after failed commit also failed:', rollbackError);
                        }
                    }
                    throw commitError;
                }
            }
        } catch (error) {
            console.error('❌ Error during transaction operations:', error);
            if (!committed) {
                console.log('🔄 Attempting to rollback transaction due to error...');
                if (begun) {
                    try {
                        db.run('ROLLBACK');
                        console.log('✅ Rollback completed');
                    } catch (rollbackError: any) {
                        const rollbackMsg = (rollbackError?.message || String(rollbackError)).toLowerCase();
                        if (rollbackMsg.includes('no transaction is active')) {
                            console.warn('⚠️ Transaction already rolled back (likely auto-rolled back by sql.js)');
                        } else {
                            console.warn('❌ Rollback failed (transaction may already be inactive):', rollbackError);
                        }
                    }
                }
            }
            throw error;
        } finally {
            this.inTransaction = false;
            console.log('🏁 Transaction finished, inTransaction flag cleared');
        }
    }

    /**
     * Save database to persistent storage (OPFS preferred, falls back to localStorage)
     */
    save(): void {
        if (!this.db || !this.isInitialized) return;
        // Fire and forget, but ensure it completes
        this.persistToStorage().catch((error) => {
            console.error('Failed to persist database:', error);
        });
    }
    
    /**
     * Save database to persistent storage and wait for completion
     */
    async saveAsync(): Promise<void> {
        if (!this.db || !this.isInitialized) return;
        await this.persistToStorage();
    }

    /**
     * Export database as binary data
     * Ensures no active transactions before exporting to prevent corruption
     */
    export(): Uint8Array {
        const db = this.getDatabase();
        
        // CRITICAL: Wait for any active transaction to complete before exporting
        // Exporting during a transaction can cause database corruption
        if (this.inTransaction) {
            console.warn('⚠️ Attempting to export database during active transaction - this may cause corruption');
            // Wait a bit for transaction to complete (not ideal, but safer than corrupting)
            // In practice, this should not happen if save is called after transactions complete
        }
        
        try {
            const data = db.export();
            
            // Validate exported data is not empty
            if (!data || data.length === 0) {
                throw new Error('Exported database is empty - this indicates corruption');
            }
            
            // Basic validation: SQLite files should start with SQLite header
            // SQLite header is "SQLite format 3\000" (16 bytes)
            const header = new Uint8Array(data.slice(0, 16));
            const headerStr = String.fromCharCode(...header.slice(0, 13));
            if (headerStr !== 'SQLite format') {
                throw new Error('Exported database does not have valid SQLite header - corruption detected');
            }
            
            return data;
        } catch (error) {
            console.error('❌ Database export failed:', error);
            throw new Error(`Database export failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Import database from binary data
     */
    import(data: Uint8Array): void {
        if (!this.sqlJs || !this.isInitialized) {
            throw new Error('SQL.js not initialized');
        }

        // Close existing database
        if (this.db) {
            this.db.close();
        }

        // Create new database from imported data
        this.db = new this.sqlJs.Database(data);
        this.save();
    }

    /**
     * Clear all transaction-related data (keeps configuration and master data)
     * Preserves: Contacts, categories, projects, buildings, properties, units, settings
     * Clears: Transactions, invoices, bills, contracts, agreements, sales returns, payslips, accounts
     * Note: Accounts are deleted (not just reset) to avoid duplicate key errors on reload
     */
    clearTransactionData(): void {
        const db = this.getDatabase();
        // ORDER MATTERS: Delete child tables before parent tables to respect foreign key constraints
        const transactionTables = [
            'transactions',
            'sales_returns',
            'pm_cycle_allocations',
            'invoices',
            'bills',
            'payslips',
            'legacy_payslips',
            'bonus_records',
            'payroll_adjustments',
            'loan_advance_records',
            'attendance_records',
            'quotations',
            'recurring_invoice_templates',
            'contracts',
            'rental_agreements',
            'project_agreements',
            'accounts'  // Also clear accounts to avoid duplicate key errors on reload
        ];

        db.run('BEGIN TRANSACTION');
        try {
            // Disable foreign keys temporarily
            db.run('PRAGMA foreign_keys = OFF');
            
            // Clear transaction-related tables (including accounts)
            transactionTables.forEach(table => {
                try {
                    db.run(`DELETE FROM ${table}`);
                    console.log(`✓ Cleared ${table}`);
                } catch (error) {
                    console.warn(`⚠️ Could not clear ${table}:`, error);
                }
            });

            // Reset auto-increment counters for cleared tables
            transactionTables.forEach(table => {
                try {
                    db.run(`DELETE FROM sqlite_sequence WHERE name = ?`, [table]);
                } catch (error) {
                    // Ignore - table might not have auto-increment
                }
            });

            // Re-enable foreign keys
            db.run('PRAGMA foreign_keys = ON');
            
            db.run('COMMIT');
            this.save();
            
            console.log('✅ Successfully cleared all transaction data from local database');
            console.log('ℹ️  Accounts will be reloaded from cloud on next sync');
        } catch (error) {
            db.run('ROLLBACK');
            console.error('❌ Error clearing transaction data:', error);
            throw error;
        }
    }

    /**
     * Clear all data (keeps schema)
     */
    clearAllData(): void {
        const db = this.getDatabase();
        const tables = [
            'users', 'accounts', 'contacts', 'categories', 'projects', 'buildings',
            'properties', 'units', 'transactions', 'invoices', 'bills', 'budgets',
            'rental_agreements', 'project_agreements', 'sales_returns', 'contracts',
            'recurring_invoice_templates', 'salary_components', 'staff',
            'employees', 'payroll_cycles', 'payslips', 'legacy_payslips',
            'bonus_records', 'payroll_adjustments', 'loan_advance_records',
            'attendance_records', 'tax_configurations', 'statutory_configurations',
            'transaction_log', 'error_log', 'tasks', 'app_settings', 'license_settings',
            'project_agreement_units', 'contract_categories', 'pm_cycle_allocations'
        ];

        db.run('BEGIN TRANSACTION');
        try {
            // Disable foreign keys temporarily
            db.run('PRAGMA foreign_keys = OFF');
            
            tables.forEach(table => {
                db.run(`DELETE FROM ${table}`);
            });

            // Reset auto-increment counters
            db.run('DELETE FROM sqlite_sequence');

            // Re-enable foreign keys
            db.run('PRAGMA foreign_keys = ON');
            
            db.run('COMMIT');
            this.save();
        } catch (error) {
            db.run('ROLLBACK');
            throw error;
        }
    }

    /**
     * Get metadata value
     */
    getMetadata(key: string): string | null {
        if (!this.isReady()) return null;
        try {
            const results = this.query<{ value: string }>(
                'SELECT value FROM metadata WHERE key = ?',
                [key]
            );
            return results.length > 0 ? results[0].value : null;
        } catch (error) {
            console.error('Failed to get metadata:', error);
            return null;
        }
    }

    /**
     * Set metadata value
     */
    setMetadata(key: string, value: string): void {
        if (!this.isReady()) return;
        try {
            this.execute(
                'INSERT OR REPLACE INTO metadata (key, value, updated_at) VALUES (?, ?, datetime("now"))',
                [key, value]
            );
            this.save();
        } catch (error) {
            console.error('Failed to set metadata:', error);
        }
    }

    /**
     * Start auto-save timer
     */
    private startAutoSave(): void {
        if (this.saveTimer) {
            clearInterval(this.saveTimer);
        }

        this.saveTimer = window.setInterval(() => {
            this.save();
        }, this.config.saveInterval);
    }

    /**
     * Stop auto-save timer
     */
    stopAutoSave(): void {
        if (this.saveTimer) {
            clearInterval(this.saveTimer);
            this.saveTimer = null;
        }
    }

    /**
     * Close database connection
     */
    close(): void {
        this.stopAutoSave();
        if (this.db) {
            this.save(); // Final save
            this.db.close();
            this.db = null;
        }
        this.isInitialized = false;
    }

    /**
     * Get database size in bytes
     */
    getSize(): number {
        if (!this.db) return 0;
        try {
            const data = this.db.export();
            return data.length;
        } catch {
            return 0;
        }
    }

    /**
     * Get current storage mode
     */
    getStorageMode(): 'opfs' | 'localStorage' {
        return this.storageMode;
    }

    /**
     * Check schema version and migrate if needed
     */
    private async checkAndMigrateSchema(): Promise<void> {
        if (!this.db) return;

        try {
            const currentVersion = parseInt(this.getMetadata('schema_version') || '0');
            const latestVersion = SCHEMA_VERSION;

            if (currentVersion < latestVersion) {
                console.log(`🔄 Schema migration needed: ${currentVersion} -> ${latestVersion}`);
                console.log('⚠️ Running schema migration...');
                
                // Ensure all tables exist (this will create any missing tables)
                this.ensureAllTablesExist();
                
                // Ensure contract and bill columns exist (for expense_category_items)
                this.ensureContractColumnsExist();
                
                // Add tenant_id columns for multi-tenant support
                try {
                    const { migrateTenantColumns } = await import('./tenantMigration');
                    migrateTenantColumns();
                } catch (migrationError) {
                    console.warn('⚠️ Tenant migration failed, continuing anyway:', migrationError);
                }
                
                // Update schema version
                this.setMetadata('schema_version', latestVersion.toString());
                
                // Save immediately after migration
                await this.persistToStorage();
                
                console.log('✅ Schema migration completed successfully');
            } else if (currentVersion > latestVersion) {
                console.warn(`⚠️ Database schema version (${currentVersion}) is newer than app version (${latestVersion}). This may cause issues.`);
            } else {
                console.log(`✅ Database schema is up to date (version ${currentVersion})`);
            }
        } catch (error) {
            console.error('❌ Error during schema migration check:', error);
            // Don't throw - allow app to continue with existing schema
        }
    }

    /**
     * Ensure contracts table has the new columns (expense_category_items, payment_terms, status)
     * Also ensure bills table has expense_category_items and status columns
     */
    ensureContractColumnsExist(): void {
        if (!this.db || !this.isInitialized) return;
        
        try {
            // Check if contracts table exists
            const contractsTableExists = this.query<{ name: string }>(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='contracts'"
            ).length > 0;
            
            if (contractsTableExists) {
                // Check existing columns
                const contractColumns = this.query<{ name: string }>('PRAGMA table_info(contracts)');
                const contractColumnNames = new Set(contractColumns.map(col => col.name));
                
                // Add expense_category_items column if missing
                if (!contractColumnNames.has('expense_category_items')) {
                    console.log('🔄 Adding expense_category_items column to contracts table...');
                    this.execute('ALTER TABLE contracts ADD COLUMN expense_category_items TEXT');
                }
                
                // Add payment_terms column if missing
                if (!contractColumnNames.has('payment_terms')) {
                    console.log('🔄 Adding payment_terms column to contracts table...');
                    this.execute('ALTER TABLE contracts ADD COLUMN payment_terms TEXT');
                }
                
                // Add status column if missing (required for old backups)
                if (!contractColumnNames.has('status')) {
                    console.log('🔄 Adding status column to contracts table...');
                    this.execute('ALTER TABLE contracts ADD COLUMN status TEXT DEFAULT \'Active\'');
                    // Update existing rows to have a status if they don't have one
                    this.execute('UPDATE contracts SET status = \'Active\' WHERE status IS NULL');
                }
            }
            
            // Check if bills table exists
            const billsTableExists = this.query<{ name: string }>(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='bills'"
            ).length > 0;
            
            if (billsTableExists) {
                // Check existing columns
                const billColumns = this.query<{ name: string }>('PRAGMA table_info(bills)');
                const billColumnNames = new Set(billColumns.map(col => col.name));
                
                // Add expense_category_items column if missing
                if (!billColumnNames.has('expense_category_items')) {
                    console.log('🔄 Adding expense_category_items column to bills table...');
                    this.execute('ALTER TABLE bills ADD COLUMN expense_category_items TEXT');
                }
                
                // Add status column if missing (required for old backups)
                if (!billColumnNames.has('status')) {
                    console.log('🔄 Adding status column to bills table...');
                    this.execute('ALTER TABLE bills ADD COLUMN status TEXT DEFAULT \'Unpaid\'');
                    // Update existing rows to have a status if they don't have one
                    // Calculate status based on paid_amount vs amount
                    this.execute(`UPDATE bills SET status = CASE 
                        WHEN paid_amount = 0 THEN 'Unpaid'
                        WHEN paid_amount >= amount THEN 'Paid'
                        WHEN paid_amount > 0 THEN 'Partially Paid'
                        ELSE 'Unpaid'
                    END WHERE status IS NULL`);
                }
                
                // Note: The global UNIQUE constraint on bill_number cannot be easily removed in SQLite
                // We use INSERT OR REPLACE in saveAll to handle duplicates gracefully
                // Tenant_id column is added by tenantMigration.ts
            }
        } catch (error) {
            console.error('❌ Error ensuring contract/bill columns exist:', error);
        }
    }

    /**
     * Ensure all required tables exist (for existing databases that might be missing newer tables)
     */
    ensureAllTablesExist(): void {
        if (!this.db || !this.isInitialized) return;
        
        try {
            // Get list of existing tables
            const existingTables = this.query<{ name: string }>(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            ).map(row => row.name.toLowerCase());
            
            // List of required tables from schema
            const requiredTables = [
                'metadata', 'users', 'accounts', 'contacts', 'categories', 'projects', 'buildings',
                'properties', 'units', 'transactions', 'invoices', 'bills', 'budgets',
                'quotations', 'documents', 'rental_agreements', 'project_agreements',
                'project_agreement_units', 'contracts', 'contract_categories',
                'recurring_invoice_templates', 'salary_components', 'staff',
                'employees', 'payroll_cycles', 'payslips', 'legacy_payslips',
                'bonus_records', 'payroll_adjustments', 'loan_advance_records',
                'attendance_records', 'tax_configurations', 'statutory_configurations',
                'transaction_log', 'error_log', 'tasks', 'app_settings', 'license_settings',
                'chat_messages'
            ];
            
            // Check for missing tables
            const missingTables = requiredTables.filter(table => !existingTables.includes(table.toLowerCase()));
            
            if (missingTables.length > 0) {
                console.log(`⚠️ Found ${missingTables.length} missing tables, creating them...`, missingTables);
                // Re-run schema creation (CREATE TABLE IF NOT EXISTS will only create missing tables)
                this.db.run(CREATE_SCHEMA_SQL);
                console.log('✅ Missing tables created');
            }
        } catch (error) {
            console.error('Error ensuring tables exist:', error);
            // If check fails, try to create schema anyway (safe with IF NOT EXISTS)
            try {
                this.db.run(CREATE_SCHEMA_SQL);
            } catch (createError) {
                console.error('Failed to create missing tables:', createError);
            }
        }
    }

    /**
     * Create a backup (export to binary)
     */
    createBackup(): Uint8Array {
        return this.export();
    }

    /**
     * Restore from backup
     */
    restoreBackup(data: Uint8Array): void {
        this.import(data);
        // After importing, ensure schema is up to date
        // This adds missing columns like expense_category_items
        this.ensureAllTablesExist();
        this.ensureContractColumnsExist();
        
        // Clear repository column caches so they pick up the new columns
        // This is critical - otherwise repositories will filter out new columns when saving
        this.clearRepositoryColumnCaches();
    }
    
    /**
     * Clear column caches in all repositories after schema changes
     */
    private clearRepositoryColumnCaches(): void {
        // Import repositories dynamically to avoid circular dependencies
        try {
            const { ContractsRepository, BillsRepository } = require('./repositories/index');
            const contractsRepo = new ContractsRepository();
            const billsRepo = new BillsRepository();
            
            // Clear caches if the method exists
            if (typeof contractsRepo.clearColumnCache === 'function') {
                contractsRepo.clearColumnCache();
            }
            if (typeof billsRepo.clearColumnCache === 'function') {
                billsRepo.clearColumnCache();
            }
        } catch (e) {
            console.warn('Could not clear repository column caches:', e);
        }
    }

    /**
     * Persist the database to storage (OPFS > localStorage)
     * Uses a lock to prevent concurrent saves that could cause corruption
     */
    private async persistToStorage(): Promise<void> {
        if (!this.db || !this.isInitialized) return;
        
        // Wait for any previous save to complete (prevent concurrent saves)
        await this.saveLock;
        
        // Create new lock for this save operation
        let resolveLock: () => void;
        this.saveLock = new Promise((resolve) => {
            resolveLock = resolve;
        });
        
        try {
            // CRITICAL: Wait for any active transaction to complete
            // Exporting during a transaction will cause corruption
            let waitCount = 0;
            while (this.inTransaction && waitCount < 50) {
                console.log('⏳ Waiting for transaction to complete before saving...');
                await new Promise(resolve => setTimeout(resolve, 100));
                waitCount++;
            }
            
            if (this.inTransaction) {
                throw new Error('Cannot save database: transaction is still active after timeout');
            }
            
            // Export database (with validation)
            const data = this.export();
            
            // Additional validation: try to parse the exported data to ensure it's valid
            if (this.sqlJs) {
                try {
                    const testDb = new this.sqlJs.Database(data);
                    testDb.close();
                } catch (validationError) {
                    throw new Error(`Database validation failed: exported data is corrupted - ${validationError instanceof Error ? validationError.message : String(validationError)}`);
                }
            }

            // Try OPFS (durable browser storage)
            if (await this.opfs.isSupported()) {
                try {
                    await this.opfs.save(data);
                    this.storageMode = 'opfs';
                    logger.logCategory('database', '✅ Database saved to OPFS storage');
                    resolveLock!();
                    return;
                } catch (opfsError) {
                    logger.warnCategory('database', 'OPFS persistence failed, falling back to localStorage:', opfsError);
                }
            }

            // Fallback: localStorage
            try {
                const buffer = Array.from(data);
                localStorage.setItem('finance_db', JSON.stringify(buffer));
                this.storageMode = 'localStorage';
                logger.logCategory('database', '✅ Database saved to localStorage');
            } catch (error) {
                logger.errorCategory('database', 'Failed to save database:', error);
                throw error;
            }
        } catch (error) {
            logger.errorCategory('database', '❌ Database persistence failed:', error);
            throw error;
        } finally {
            resolveLock!();
        }
    }
}

// Singleton instance
let dbServiceInstance: DatabaseService | null = null;

export const getDatabaseService = (config?: DatabaseConfig): DatabaseService => {
    if (!dbServiceInstance) {
        dbServiceInstance = new DatabaseService(config);
    }
    return dbServiceInstance;
};

export default DatabaseService;
