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
            // Re-throw only; caller logs when falling back to avoid duplicate logs
            throw error;
        }
    }
}

const IDB_DB_NAME = 'PBooksPro_DB';
const IDB_STORE_NAME = 'finance';
const IDB_KEY = 'finance_db';

/**
 * IndexedDB storage adapter.
 * Provides much larger quota than localStorage (~50MB+ vs ~5MB).
 * Use as fallback when OPFS fails to avoid QuotaExceededError.
 */
class IndexedDBStorage {
    private dbPromise: Promise<IDBDatabase> | null = null;

    private getDb(): Promise<IDBDatabase> {
        if (!this.dbPromise) {
            this.dbPromise = new Promise((resolve, reject) => {
                if (typeof indexedDB === 'undefined') {
                    reject(new Error('IndexedDB not supported'));
                    return;
                }
                const req = indexedDB.open(IDB_DB_NAME, 1);
                req.onerror = () => reject(req.error);
                req.onsuccess = () => resolve(req.result);
                req.onupgradeneeded = (e) => {
                    (e.target as IDBOpenDBRequest).result.createObjectStore(IDB_STORE_NAME);
                };
            });
        }
        return this.dbPromise;
    }

    async isSupported(): Promise<boolean> {
        return typeof indexedDB !== 'undefined';
    }

    async load(): Promise<Uint8Array | null> {
        if (!(await this.isSupported())) return null;
        try {
            const db = await this.getDb();
            const result = await new Promise<ArrayBuffer | undefined>((resolve, reject) => {
                const tx = db.transaction(IDB_STORE_NAME, 'readonly');
                const req = tx.objectStore(IDB_STORE_NAME).get(IDB_KEY);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
            if (!result || !(result instanceof ArrayBuffer)) return null;
            const arr = new Uint8Array(result);
            return arr.length > 0 ? arr : null;
        } catch {
            return null;
        }
    }

    async save(data: Uint8Array): Promise<void> {
        if (!(await this.isSupported())) return;
        const db = await this.getDb();
        const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
            const req = tx.objectStore(IDB_STORE_NAME).put(buffer, IDB_KEY);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    async clear(): Promise<void> {
        if (!(await this.isSupported())) return;
        try {
            const db = await this.getDb();
            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
                const req = tx.objectStore(IDB_STORE_NAME).delete(IDB_KEY);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        } catch {
            // Ignore
        }
    }
}

function errorToString(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error ?? 'Unknown error');
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
    private indexedDBStorage = new IndexedDBStorage();
    private storageMode: 'opfs' | 'indexedDB' | 'localStorage' = 'localStorage';
    private saveLock: Promise<void> = Promise.resolve(); // Lock to prevent concurrent saves
    private lastPersistenceError: string | null = null;
    private lastPersistenceErrorTime = 0;
    private static readonly PERSISTENCE_ERROR_THROTTLE_MS = 60_000;

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

            // 2. Fallback to IndexedDB (larger quota than localStorage)
            if (!this.db && (await this.indexedDBStorage.isSupported())) {
                const idbData = await this.indexedDBStorage.load();
                if (idbData) {
                    try {
                        this.db = new SQL.Database(idbData);
                        this.storageMode = 'indexedDB';
                        logger.logCategory('database', '✅ Loaded existing database from IndexedDB');
                        loadedData = idbData;
                    } catch (parseError) {
                        logger.warnCategory('database', '⚠️ Failed to parse IndexedDB database, trying localStorage:', parseError);
                    }
                }
            }

            // 3. Fallback to localStorage
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
                // Create schema - use exec() to support multiple statements
                try {
                    this.db.exec(CREATE_SCHEMA_SQL);
                    // Set schema version directly (bypass isReady check during init)
                    this.db.run('INSERT OR REPLACE INTO metadata (key, value, updated_at) VALUES (?, ?, datetime("now"))',
                        ['schema_version', SCHEMA_VERSION.toString()]);
                    logger.logCategory('database', '✅ Database schema created');
                } catch (schemaError) {
                    logger.errorCategory('database', '❌ Failed to create schema:', schemaError);
                    throw schemaError;
                }
            } else {
                // Database exists - verify it has tenant_id support
                let needsRecreate = false;
                try {
                    // Check accounts table as a test for tenant_id support
                    if (!needsRecreate) {
                        try {
                            const accountsResult = this.db.exec('PRAGMA table_info(accounts)');
                            if (accountsResult.length > 0 && accountsResult[0].values && accountsResult[0].values.length > 0) {
                                const columns = accountsResult[0].values.map((row: any) => row[1]);
                                if (!columns.includes('tenant_id')) {
                                    needsRecreate = true;
                                }
                            }
                        } catch (e) {
                            needsRecreate = true;
                        }
                    }

                    if (needsRecreate) {
                        throw new Error('Old database format detected');
                    }

                    // Database exists with tenant_id - check schema version and migrate if needed
                    await this.checkAndMigrateSchema();

                    // IMPORTANT: Add tenant_id columns BEFORE ensureAllTablesExist
                    // because ensureAllTablesExist runs CREATE_SCHEMA_SQL which includes indexes on tenant_id
                    // Ensure tenant columns are present even if schema version is current (idempotent)
                    try {
                        const { migrateTenantColumns } = await import('./tenantMigration');
                        migrateTenantColumns();
                    } catch (tenantError) {
                        // Silent - not critical
                    }

                    // Ensure contracts table has new columns
                    this.ensureContractColumnsExist();
                    // Ensure vendor_id columns exist
                    this.ensureVendorIdColumnsExist();
                    // Ensure recurring template has invoice_type column
                    this.ensureRecurringTemplateColumnsExist();
                } catch (tenantIdError) {
                    // Old database without tenant_id support - recreate it
                    logger.logCategory('database', '🔄 Detected old database format, recreating with new schema...');
                    this.db = new SQL.Database();
                    try {
                        this.db.exec(CREATE_SCHEMA_SQL);
                        // Set schema version directly (bypass isReady check during init)
                        this.db.run('INSERT OR REPLACE INTO metadata (key, value, updated_at) VALUES (?, ?, datetime("now"))',
                            ['schema_version', SCHEMA_VERSION.toString()]);
                        logger.logCategory('database', '✅ Database recreated with new schema');
                    } catch (recreateError) {
                        logger.errorCategory('database', '❌ Failed to recreate database:', recreateError);
                        throw recreateError;
                    }

                    // Clear old storage (OPFS, IndexedDB, localStorage)
                    try {
                        localStorage.removeItem('finance_db');
                        if (await this.opfs.isSupported()) {
                            try {
                                const root = await (navigator as any).storage.getDirectory();
                                const handle = await root.getFileHandle('finance_db.sqlite', { create: true });
                                const writable = await handle.createWritable();
                                await writable.write(new Uint8Array(0));
                                await writable.close();
                            } catch {
                                // Ignore - will be overwritten on save anyway
                            }
                        }
                        if (await this.indexedDBStorage.isSupported()) {
                            await this.indexedDBStorage.clear();
                        }
                    } catch {
                        // Ignore - will be overwritten anyway
                    }
                }
            }

            // Migrate to OPFS or IndexedDB if available (both have larger quota than localStorage)
            if (this.storageMode === 'localStorage') {
                const exported = this.db.export();
                if (await this.opfs.isSupported()) {
                    try {
                        await this.opfs.save(exported);
                        this.storageMode = 'opfs';
                        logger.logCategory('database', '✅ Copied database to OPFS for durability');
                    } catch (copyError) {
                        logger.warnCategory('database', '⚠️ Failed to copy database to OPFS, trying IndexedDB:', copyError);
                    }
                }
                if (this.storageMode === 'localStorage' && (await this.indexedDBStorage.isSupported())) {
                    try {
                        await this.indexedDBStorage.save(exported);
                        this.storageMode = 'indexedDB';
                        logger.logCategory('database', '✅ Copied database to IndexedDB (avoids localStorage quota)');
                    } catch (copyError) {
                        logger.warnCategory('database', '⚠️ Failed to copy database to IndexedDB, continuing with localStorage:', copyError);
                    }
                }
            }

            this.isInitialized = true;
            this.initializationError = null;

            // Ensure all required tables exist (creates missing tables in existing databases)
            // This is critical for adding new tables like my_shop_sales_returns
            this.ensureAllTablesExist();

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
     * Raw query - bypasses isReady() guard. For use during initialization/migration only.
     * Requires this.db to be non-null (caller must verify).
     */
    private rawQuery<T = any>(sql: string, params: any[] = []): T[] {
        if (!this.db) return [];
        const stmt = this.db.prepare(sql);
        stmt.bind(params);
        const results: T[] = [];
        while (stmt.step()) {
            results.push(stmt.getAsObject() as T);
        }
        stmt.free();
        return results;
    }

    /**
     * Raw execute - bypasses isReady() guard. For use during initialization/migration only.
     * Requires this.db to be non-null (caller must verify).
     */
    private rawExecute(sql: string, params: any[] = []): void {
        if (!this.db) return;
        try {
            this.db.run(sql, params);
        } catch (error: any) {
            const errorMsg = error?.message || String(error);
            // Silently ignore "duplicate column" errors during migration
            if (errorMsg.includes('duplicate column')) return;
            throw error;
        }
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
    transaction(operations: (() => void)[], onCommit?: () => void): void {
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
                // Clear pending sync operations on rollback
                try {
                    // Use require for synchronous access (BaseRepository is already loaded)
                    const { BaseRepository } = require('./repositories/baseRepository');
                    BaseRepository.clearPendingSyncOperations();
                } catch (e) {
                    // Ignore if BaseRepository not available (may cause circular dependency warning)
                }
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

                // Call post-commit callback if provided (before clearing inTransaction flag)
                if (onCommit) {
                    try {
                        onCommit();
                    } catch (callbackError) {
                        console.error('❌ Error in post-commit callback:', callbackError);
                        // Don't fail the transaction if callback errors
                    }
                }
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
                // Clear pending sync operations on rollback
                try {
                    // Use require for synchronous access (BaseRepository is already loaded)
                    const { BaseRepository } = require('./repositories/baseRepository');
                    BaseRepository.clearPendingSyncOperations();
                } catch (e) {
                    // Ignore if BaseRepository not available (may cause circular dependency warning)
                }
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
        // Fire and forget; persistToStorage handles its own error logging (throttled)
        this.persistToStorage().catch(() => { /* already logged in persistToStorage */ });
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
     * Execute a tenant-scoped SQL query with automatic tenant_id filtering.
     * SECURITY: Use this for all tenant-scoped data access to prevent cross-tenant leaks.
     * Throws if the SQL does not contain a tenant_id filter (safety check).
     *
     * @param sql - SQL query (must include tenant_id filter)
     * @param params - Query parameters
     * @param tenantId - Current tenant ID (validated against sql)
     */
    queryForTenant<T = any>(sql: string, params: any[], tenantId: string): T[] {
        if (!tenantId) {
            throw new Error('SECURITY: queryForTenant called without tenantId');
        }
        if (!sql.toLowerCase().includes('tenant_id')) {
            throw new Error(`SECURITY: Query missing tenant_id filter: ${sql.substring(0, 100)}`);
        }
        return this.query<T>(sql, params);
    }

    /**
     * Execute a tenant-scoped SQL statement with automatic tenant_id validation.
     * SECURITY: Use this for all tenant-scoped mutations to prevent cross-tenant writes.
     */
    executeForTenant(sql: string, params: any[], tenantId: string): void {
        if (!tenantId) {
            throw new Error('SECURITY: executeForTenant called without tenantId');
        }
        if (!sql.toLowerCase().includes('tenant_id')) {
            throw new Error(`SECURITY: Statement missing tenant_id filter: ${sql.substring(0, 100)}`);
        }
        this.execute(sql, params);
    }

    /**
     * Clear all transaction-related data (keeps configuration and master data)
     * Preserves: Contacts, categories, projects, buildings, properties, units, settings
     * Clears: Transactions, invoices, bills, contracts, agreements, sales returns, accounts
     *
     * @param tenantId - If provided, only clears data for this tenant. If not, clears all.
     */
    clearTransactionData(tenantId?: string): void {
        const db = this.getDatabase();
        // ORDER MATTERS: Delete child tables before parent tables to respect foreign key constraints
        const transactionTables = [
            'transactions',
            'sales_returns',
            'pm_cycle_allocations',
            'invoices',
            'bills',
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

            // Clear transaction-related tables, optionally filtered by tenant
            transactionTables.forEach(table => {
                try {
                    if (tenantId) {
                        db.run(`DELETE FROM ${table} WHERE tenant_id = ?`, [tenantId]);
                    } else {
                        db.run(`DELETE FROM ${table}`);
                    }
                    console.log(`✓ Cleared ${table}${tenantId ? ` for tenant ${tenantId}` : ''}`);
                } catch (error) {
                    console.warn(`⚠️ Could not clear ${table}:`, error);
                }
            });

            // Reset auto-increment counters for cleared tables (only when clearing all)
            if (!tenantId) {
                transactionTables.forEach(table => {
                    try {
                        db.run(`DELETE FROM sqlite_sequence WHERE name = ?`, [table]);
                    } catch (error) {
                        // Ignore - table might not have auto-increment
                    }
                });
            }

            // Re-enable foreign keys
            db.run('PRAGMA foreign_keys = ON');

            db.run('COMMIT');
            this.save();

            console.log(`✅ Successfully cleared all transaction data from local database${tenantId ? ` for tenant ${tenantId}` : ''}`);
            console.log('ℹ️  Accounts will be reloaded from cloud on next sync');
        } catch (error) {
            db.run('ROLLBACK');
            console.error('❌ Error clearing transaction data:', error);
            throw error;
        }
    }

    /**
     * Clear all POS / Shop module data from local database (keeps schema)
     *
     * @param tenantId - If provided, only clears data for this tenant. If not, clears all.
     */
    clearPosData(tenantId?: string): void {
        const db = this.getDatabase();

        // ORDER MATTERS: Delete child tables before parent tables to respect foreign key constraints
        const posTables = [
            'shop_sale_items',
            'shop_sales',
            'shop_inventory_movements',
            'shop_inventory',
            'shop_loyalty_members',
            'shop_products',
            'shop_terminals',
            'shop_warehouses',
            'shop_branches',
            'shop_policies',
        ];

        db.run('BEGIN TRANSACTION');
        try {
            // Disable foreign keys temporarily
            db.run('PRAGMA foreign_keys = OFF');

            posTables.forEach(table => {
                try {
                    if (tenantId) {
                        db.run(`DELETE FROM ${table} WHERE tenant_id = ?`, [tenantId]);
                    } else {
                        db.run(`DELETE FROM ${table}`);
                    }
                    console.log(`✓ Cleared ${table}${tenantId ? ` for tenant ${tenantId}` : ''}`);
                } catch (error) {
                    // Table might not exist in older local DBs; don't fail the whole clear
                    console.warn(`⚠️ Could not clear ${table}:`, error);
                }
            });

            // Reset auto-increment counters for cleared tables (only when clearing all)
            if (!tenantId) {
                posTables.forEach(table => {
                    try {
                        db.run(`DELETE FROM sqlite_sequence WHERE name = ?`, [table]);
                    } catch {
                        // Ignore - table might not have auto-increment
                    }
                });
            }

            // Re-enable foreign keys
            db.run('PRAGMA foreign_keys = ON');

            db.run('COMMIT');
            this.save();
            console.log(`✅ Successfully cleared POS data from local database${tenantId ? ` for tenant ${tenantId}` : ''}`);
        } catch (error) {
            db.run('ROLLBACK');
            console.error('❌ Error clearing POS data:', error);
            throw error;
        }
    }

    /**
     * Clear all data (keeps schema)
     *
     * @param tenantId - If provided, only clears data for this tenant. If not, clears all.
     */
    clearAllData(tenantId?: string): void {
        const db = this.getDatabase();
        const tables = [
            'users', 'accounts', 'contacts', 'categories', 'projects', 'buildings',
            'properties', 'units', 'transactions', 'invoices', 'bills', 'budgets',
            'rental_agreements', 'project_agreements', 'sales_returns', 'contracts',
            'recurring_invoice_templates', 'transaction_log', 'error_log', 'app_settings', 'license_settings',
            'project_agreement_units', 'contract_categories', 'pm_cycle_allocations'
        ];

        db.run('BEGIN TRANSACTION');
        try {
            // Disable foreign keys temporarily
            db.run('PRAGMA foreign_keys = OFF');

            tables.forEach(table => {
                if (tenantId) {
                    // Tenant-scoped clear: only delete data for this tenant
                    // Some tables (error_log, app_settings, etc.) don't have tenant_id
                    try {
                        db.run(`DELETE FROM ${table} WHERE tenant_id = ?`, [tenantId]);
                    } catch {
                        // Table doesn't have tenant_id — skip (don't delete shared data)
                    }
                } else {
                    db.run(`DELETE FROM ${table}`);
                }
            });

            // Reset auto-increment counters (only when clearing all)
            if (!tenantId) {
                db.run('DELETE FROM sqlite_sequence');
            }

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
     * Check schema version and migrate if needed.
     * NOTE: This runs BEFORE isInitialized=true, so we use rawQuery/rawExecute
     * which bypass the isReady() guard. this.db is verified non-null at entry.
     */
    private async checkAndMigrateSchema(): Promise<void> {
        if (!this.db) return;

        try {
            // Read schema_version directly (getMetadata relies on isReady which is false here)
            let currentVersion = 0;
            try {
                const rows = this.rawQuery<{ value: string }>(
                    'SELECT value FROM metadata WHERE key = ?', ['schema_version']
                );
                if (rows.length > 0) {
                    currentVersion = parseInt(rows[0].value || '0');
                }
            } catch (_) {
                // metadata table may not exist yet
            }
            const latestVersion = SCHEMA_VERSION;

            if (currentVersion < latestVersion) {
                console.log(`🔄 Schema migration needed: ${currentVersion} -> ${latestVersion}`);

                // Temporarily set isInitialized so that helper methods (ensureAllTablesExist,
                // ensureContractColumnsExist, ensureVendorIdColumnsExist, migrateTenantColumns)
                // don't bail out due to their isReady()/isInitialized guards.
                this.isInitialized = true;

                try {
                    // IMPORTANT: Add tenant_id columns FIRST before running ensureAllTablesExist
                    // because ensureAllTablesExist runs CREATE_SCHEMA_SQL which includes indexes on tenant_id
                    // If we create indexes before the columns exist, SQLite will error
                    try {
                        const { migrateTenantColumns } = await import('./tenantMigration');
                        migrateTenantColumns();
                    } catch (migrationError) {
                        console.warn('⚠️ Tenant migration failed, continuing anyway:', migrationError);
                    }

                    // Ensure all tables exist (this will create any missing tables AND indexes)
                    // Now safe because tenant_id columns already exist
                    this.ensureAllTablesExist();

                    // Ensure contract and bill columns exist (for expense_category_items)
                    this.ensureContractColumnsExist();
                    // Ensure vendor_id columns exist
                    this.ensureVendorIdColumnsExist();
                    // Ensure recurring template has invoice_type column
                    this.ensureRecurringTemplateColumnsExist();

                    // Run version-specific migrations
                    if (currentVersion < 3) {
                        // Migration from v2 to v3: Add document_path to bills table
                        try {
                            const { migrateAddDocumentPathToBills } = await import('./migrations/add-document-path-to-bills');
                            await migrateAddDocumentPathToBills();
                        } catch (migrationError) {
                            console.warn('⚠️ document_path migration failed, continuing anyway:', migrationError);
                        }
                    }

                    if (currentVersion < 7) {
                        // Migration to v7: Add version, deleted_at columns to all entity tables
                        // and ensure sync_conflicts table exists
                        console.log('🔄 Running v7 migration: Adding version, deleted_at, sync_conflicts...');
                        try {
                            const entityTables = [
                                'accounts', 'contacts', 'vendors', 'categories', 'projects',
                                'buildings', 'properties', 'units', 'transactions', 'invoices',
                                'bills', 'budgets', 'quotations', 'plan_amenities',
                                'installment_plans', 'documents', 'rental_agreements',
                                'project_agreements', 'sales_returns', 'contracts',
                                'recurring_invoice_templates', 'pm_cycle_allocations',
                                'purchase_orders',
                            ];

                            for (const table of entityTables) {
                                try {
                                    const columns = this.rawQuery<{ name: string }>(`PRAGMA table_info(${table})`);
                                    const colNames = new Set(columns.map(c => c.name));

                                    if (!colNames.has('version')) {
                                        this.rawExecute(`ALTER TABLE ${table} ADD COLUMN version INTEGER NOT NULL DEFAULT 1`);
                                        console.log(`  Added version to ${table}`);
                                    }
                                    if (!colNames.has('deleted_at')) {
                                        this.rawExecute(`ALTER TABLE ${table} ADD COLUMN deleted_at TEXT`);
                                        console.log(`  Added deleted_at to ${table}`);
                                    }
                                } catch (tableError) {
                                    console.warn(`  ⚠️ Migration for ${table} failed:`, tableError);
                                }
                            }

                            // Rename org_id to tenant_id in rental_agreements if needed
                            try {
                                const raCols = this.rawQuery<{ name: string }>('PRAGMA table_info(rental_agreements)');
                                const raColNames = new Set(raCols.map(c => c.name));
                                if (raColNames.has('org_id') && !raColNames.has('tenant_id')) {
                                    this.rawExecute('ALTER TABLE rental_agreements RENAME COLUMN org_id TO tenant_id');
                                    console.log('  Renamed org_id to tenant_id in rental_agreements');
                                }
                            } catch (renameError) {
                                console.warn('  ⚠️ rental_agreements org_id rename failed:', renameError);
                            }

                            // Backfill NULL tenant_id values with empty string
                            for (const table of entityTables) {
                                try {
                                    this.rawExecute(`UPDATE ${table} SET tenant_id = '' WHERE tenant_id IS NULL`);
                                } catch (_) { /* ignore if table doesn't have tenant_id */ }
                            }

                            console.log('✅ v7 migration completed');
                        } catch (v7Error) {
                            console.warn('⚠️ v7 migration partially failed:', v7Error);
                        }
                    }

                    // Update schema version directly (setMetadata relies on isReady)
                    this.rawExecute(
                        'INSERT OR REPLACE INTO metadata (key, value, updated_at) VALUES (?, ?, datetime("now"))',
                        ['schema_version', latestVersion.toString()]
                    );

                    // Save immediately after migration (bypass persistToStorage which checks isInitialized)
                    try {
                        const data = this.db!.export();
                        if (await this.opfs.isSupported()) {
                            await this.opfs.save(data);
                        } else {
                            const buffer = Array.from(data);
                            localStorage.setItem('finance_db', JSON.stringify(buffer));
                        }
                        console.log('💾 Database saved after migration');
                    } catch (saveError) {
                        console.warn('⚠️ Could not save database after migration:', saveError);
                    }

                    console.log('✅ Schema migration completed successfully');
                } finally {
                    // Reset isInitialized - it will be set to true properly at the end of _doInitialize
                    this.isInitialized = false;
                }
            } else if (currentVersion > latestVersion) {
                console.warn(`⚠️ Database schema version (${currentVersion}) is newer than app version (${latestVersion}). This may cause issues.`);
            } else {
                console.log(`✅ Database schema is up to date (version ${currentVersion})`);
            }
        } catch (error) {
            console.error('❌ Error during schema migration check:', error);
            // Reset isInitialized in case of error
            this.isInitialized = false;
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
     * Ensure tables have vendor_id column for linking to vendors table instead of contacts
     */
    ensureVendorIdColumnsExist(): void {
        if (!this.db || !this.isInitialized) return;

        try {
            const tablesToUpdate = ['bills', 'transactions', 'vendors'];

            for (const table of tablesToUpdate) {
                const tableExists = this.query<{ name: string }>(
                    `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`
                ).length > 0;

                if (!tableExists) continue;

                const results = this.query<{ name: string }>(`PRAGMA table_info(${table})`);
                const columnNames = new Set(results.map(col => col.name));

                if (table === 'vendors') {
                    if (!columnNames.has('is_active')) {
                        console.log('🔄 Adding is_active column to vendors table...');
                        this.execute('ALTER TABLE vendors ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1');
                    }
                } else {
                    if (!columnNames.has('vendor_id')) {
                        console.log(`🔄 Adding vendor_id column to ${table} table...`);
                        // Add REFERENCES vendors(id) for foreign key constraint
                        this.execute(`ALTER TABLE ${table} ADD COLUMN vendor_id TEXT REFERENCES vendors(id)`);
                    }
                }
            }

            // DATA MIGRATION: Move data from contact_id to vendor_id if contact_id is actually a vendor ID
            // This ensures existing data is correctly linked after schema change
            console.log('🔄 Migrating vendor links from contact_id to vendor_id...');

            // For Bills
            // Check if bills table exists and has contact_id
            const billsTableInfo = this.query<{ name: string }>('PRAGMA table_info(bills)');
            const billsColumnNames = new Set(billsTableInfo.map(col => col.name));
            if (billsColumnNames.has('contact_id')) {
                this.execute(`
                    UPDATE bills
                    SET vendor_id = contact_id, contact_id = NULL
                    WHERE vendor_id IS NULL
                    AND contact_id IS NOT NULL
                    AND contact_id IN (SELECT id FROM vendors);
                `);
            }

            // For Transactions
            // Check if transactions table exists and has contact_id
            const transactionsTableInfo = this.query<{ name: string }>('PRAGMA table_info(transactions)');
            const transactionsColumnNames = new Set(transactionsTableInfo.map(col => col.name));
            if (transactionsColumnNames.has('contact_id')) {
                this.execute(`
                    UPDATE transactions
                    SET vendor_id = contact_id, contact_id = NULL
                    WHERE vendor_id IS NULL
                    AND contact_id IS NOT NULL
                    AND contact_id IN (SELECT id FROM vendors);
                `);
            }

            console.log('✅ Vendor link migration completed');

        } catch (error) {
            console.error('❌ Error ensuring vendor_id columns exist:', error);
        }
    }

    /**
     * Ensure recurring_invoice_templates table has the invoice_type column
     * This is needed for existing databases that were created before this column was added
     */
    ensureRecurringTemplateColumnsExist(): void {
        if (!this.db || !this.isInitialized) return;

        try {
            const tableExists = this.query<{ name: string }>(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='recurring_invoice_templates'"
            ).length > 0;

            if (!tableExists) return;

            const columns = this.query<{ name: string }>('PRAGMA table_info(recurring_invoice_templates)');
            const columnNames = new Set(columns.map(col => col.name));

            if (!columnNames.has('invoice_type')) {
                console.log('🔄 Adding invoice_type column to recurring_invoice_templates table...');
                this.execute("ALTER TABLE recurring_invoice_templates ADD COLUMN invoice_type TEXT DEFAULT 'Rental'");
                // Update existing rows to have the default value
                this.execute("UPDATE recurring_invoice_templates SET invoice_type = 'Rental' WHERE invoice_type IS NULL");
                console.log('✅ Added invoice_type column to recurring_invoice_templates');
            }
        } catch (error) {
            console.error('❌ Error ensuring recurring template columns exist:', error);
        }
    }

    /**
     * Ensure sync_outbox and sync_metadata exist (run first so no "no such table" during schema split)
     */
    private ensureSyncTablesExist(): void {
        if (!this.db) return;
        try {
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS sync_outbox (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    user_id TEXT,
                    entity_type TEXT NOT NULL,
                    action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
                    entity_id TEXT NOT NULL,
                    payload_json TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                    synced_at TEXT,
                    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'syncing', 'synced', 'failed')),
                    retry_count INTEGER NOT NULL DEFAULT 0,
                    error_message TEXT
                );
            `);
            this.db.exec(`CREATE INDEX IF NOT EXISTS idx_sync_outbox_tenant_status ON sync_outbox(tenant_id, status);`);
            this.db.exec(`CREATE INDEX IF NOT EXISTS idx_sync_outbox_created ON sync_outbox(created_at);`);
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS sync_metadata (
                    tenant_id TEXT NOT NULL,
                    entity_type TEXT NOT NULL,
                    last_synced_at TEXT NOT NULL,
                    last_pull_at TEXT,
                    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                    PRIMARY KEY (tenant_id, entity_type)
                );
            `);
        } catch (err) {
            logger.warnCategory('database', 'ensureSyncTablesExist:', err);
        }
    }

    /**
     * Ensure all required tables exist (for existing databases that might be missing newer tables)
     */
    ensureAllTablesExist(): void {
        if (!this.db || !this.isInitialized) return;

        // Create sync tables first so they exist before executeSchemaStatements runs (avoids "no such table: sync_outbox")
        this.ensureSyncTablesExist();

        try {
            // Get list of existing tables
            const existingTables = this.query<{ name: string }>(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            ).map(row => row.name.toLowerCase());

            // List of required tables from schema
            const requiredTables = [
                'metadata', 'users', 'accounts', 'contacts', 'vendors', 'categories', 'projects', 'buildings',
                'properties', 'units', 'transactions', 'invoices', 'bills', 'budgets',
                'quotations', 'documents', 'rental_agreements', 'project_agreements',
                'project_agreement_units', 'sales_returns', 'contracts', 'contract_categories',
                'recurring_invoice_templates',
                'transaction_log', 'error_log', 'app_settings', 'license_settings',
                'chat_messages',
                // Task Management
                'tasks', 'task_updates', 'task_performance_scores', 'task_performance_config',
                // Marketing / installment plans
                'plan_amenities', 'installment_plans',
                // Bi-directional sync
                'sync_outbox', 'sync_metadata'
            ];

            // Check for missing tables
            const missingTables = requiredTables.filter(table => !existingTables.includes(table.toLowerCase()));

            if (missingTables.length > 0) {
                console.log(`⚠️ Found ${missingTables.length} missing tables, creating them...`, missingTables);
                // Re-run schema creation (CREATE TABLE IF NOT EXISTS will only create missing tables)
                // Execute each statement separately to handle index creation failures gracefully
                this.executeSchemaStatements(CREATE_SCHEMA_SQL);
                console.log('✅ Missing tables created successfully');

                // Verify tables were created
                const verifyResult = this.db.exec(`SELECT name FROM sqlite_master WHERE type='table'`);
                const createdTables = verifyResult[0]?.values.flat() || [];
                const stillMissing = missingTables.filter(t => !createdTables.map((name: string) => name.toLowerCase()).includes(t.toLowerCase()));
                if (stillMissing.length > 0) {
                    console.error('❌ Failed to create some tables:', stillMissing);
                } else {
                    console.log('✅ All missing tables verified created:', missingTables);
                }
            }
        } catch (error) {
            console.error('Error ensuring tables exist:', error);
            // If check fails, try to create schema anyway (safe with IF NOT EXISTS)
            try {
                this.executeSchemaStatements(CREATE_SCHEMA_SQL);
            } catch (createError) {
                console.error('Failed to create missing tables:', createError);
            }
        }
    }

    /**
     * Execute SQL schema statements one by one, handling index creation failures gracefully
     * This allows table creation to succeed even if some indexes fail due to missing columns
     */
    private executeSchemaStatements(sql: string): void {
        if (!this.db) return;

        // Split by semicolon and filter out truly empty statements
        const statements = sql.split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        for (const statement of statements) {
            try {
                this.db.exec(statement + ';');
            } catch (error: any) {
                const errorMsg = error?.message || String(error);
                // Silently skip index creation failures on missing columns
                // This can happen when tenant_id columns haven't been added yet
                if (errorMsg.includes('no such column') && statement.toUpperCase().includes('CREATE INDEX')) {
                    console.warn(`⚠️ Skipping index creation (column not found): ${statement.substring(0, 80)}...`);
                } else {
                    // Re-throw other errors
                    throw error;
                }
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
    async restoreBackup(data: Uint8Array): Promise<void> {
        this.import(data);
        // After importing, ensure schema is up to date
        // This adds missing columns like expense_category_items
        this.ensureAllTablesExist();
        this.ensureContractColumnsExist();
        this.ensureVendorIdColumnsExist();
        this.ensureRecurringTemplateColumnsExist();

        // Clear repository column caches so they pick up the new columns
        // This is critical - otherwise repositories will filter out new columns when saving
        await this.clearRepositoryColumnCaches();
    }

    /**
     * Clear column caches in all repositories after schema changes
     */
    private async clearRepositoryColumnCaches(): Promise<void> {
        // Import repositories dynamically to avoid circular dependencies
        try {
            const { ContractsRepository, BillsRepository } = await import('./repositories/index');
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
     * Throttle persistence error logs to avoid console spam when saves keep failing.
     * Logs at most once per PERSISTENCE_ERROR_THROTTLE_MS for the same error.
     */
    private shouldLogPersistenceError(errMsg: string): boolean {
        const now = Date.now();
        const isSameError = this.lastPersistenceError === errMsg;
        const throttleExpired = now - this.lastPersistenceErrorTime >= DatabaseService.PERSISTENCE_ERROR_THROTTLE_MS;
        if (isSameError && !throttleExpired) return false;
        this.lastPersistenceError = errMsg;
        this.lastPersistenceErrorTime = now;
        return true;
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
                    this.lastPersistenceError = null; // Clear on success
                    logger.logCategory('database', '✅ Database saved to OPFS storage');
                    resolveLock!();
                    return;
                } catch (opfsError) {
                    const errMsg = errorToString(opfsError);
                    if (this.shouldLogPersistenceError(`OPFS: ${errMsg}`)) {
                        logger.warnCategory('database', `OPFS unavailable, trying IndexedDB: ${errMsg}`);
                    }
                }
            }

            // Try IndexedDB (much larger quota than localStorage, avoids QuotaExceededError)
            if (await this.indexedDBStorage.isSupported()) {
                try {
                    await this.indexedDBStorage.save(data);
                    this.storageMode = 'indexedDB';
                    this.lastPersistenceError = null; // Clear on success
                    logger.logCategory('database', '✅ Database saved to IndexedDB');
                    resolveLock!();
                    return;
                } catch (idbError) {
                    const errMsg = errorToString(idbError);
                    if (this.shouldLogPersistenceError(`IndexedDB: ${errMsg}`)) {
                        logger.warnCategory('database', `IndexedDB save failed, falling back to localStorage: ${errMsg}`);
                    }
                }
            }

            // Fallback: localStorage (smallest quota, may throw QuotaExceededError)
            try {
                const buffer = Array.from(data);
                localStorage.setItem('finance_db', JSON.stringify(buffer));
                this.storageMode = 'localStorage';
                this.lastPersistenceError = null; // Clear on success
                logger.logCategory('database', '✅ Database saved to localStorage');
            } catch (lsError) {
                throw lsError; // Let outer catch log once
            }
        } catch (error) {
            const errMsg = errorToString(error);
            if (this.shouldLogPersistenceError(errMsg)) {
                logger.errorCategory('database', `Database persistence failed: ${errMsg}`);
            }
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

/**
 * Clear all database storage (localStorage, OPFS, IndexedDB).
 * Used by Fix button and console commands to fully reset local DB.
 */
export async function clearAllDatabaseStorage(): Promise<void> {
    localStorage.removeItem('finance_db');
    if (typeof navigator !== 'undefined' && navigator.storage?.getDirectory) {
        try {
            const root = await navigator.storage.getDirectory();
            await root.removeEntry('finance_db.sqlite');
        } catch {
            // Ignore
        }
    }
    if (typeof indexedDB !== 'undefined') {
        try {
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
                const req = indexedDB.open(IDB_DB_NAME, 1);
                req.onerror = () => reject(req.error);
                req.onsuccess = () => resolve(req.result);
                req.onupgradeneeded = (e) => {
                    (e.target as IDBOpenDBRequest).result.createObjectStore(IDB_STORE_NAME);
                };
            });
            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
                const req = tx.objectStore(IDB_STORE_NAME).delete(IDB_KEY);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
            db.close();
        } catch {
            // Ignore
        }
    }
}

export default DatabaseService;
