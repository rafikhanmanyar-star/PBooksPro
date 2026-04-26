/**
 * Database Service
 * 
 * Provides a clean abstraction layer for database operations using sql.js.
 * Handles initialization, transactions, and provides type-safe query methods.
 */

import { CREATE_SCHEMA_SQL, SCHEMA_VERSION } from './schema';
import { loadSqlJs } from './sqljs-loader';
import { logger } from '../logger';
import { ElectronDatabaseService } from './electronDatabaseService';
import { isLocalOnlyMode } from '../../config/apiUrl';

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
 * Electron file storage adapter.
 * Persists sql.js DB to a real file on disk via IPC. No browser quota/cache issues.
 */
const electronFileStorage = {
    async isSupported(): Promise<boolean> {
        return typeof window !== 'undefined' && !!(window as any).sqliteBridge?.loadBlob;
    },
    async load(): Promise<Uint8Array | null> {
        if (!(await this.isSupported())) return null;
        try {
            const data = await (window as any).sqliteBridge.loadBlob();
            return data && data.length > 0 ? new Uint8Array(data) : null;
        } catch (e) {
            logger.warnCategory('database', 'Electron file storage load failed:', e);
            return null;
        }
    },
    async save(data: Uint8Array): Promise<void> {
        if (!(await this.isSupported())) return;
        const bridge = (window as any).sqliteBridge;
        const result = await bridge.saveBlob(data);
        if (result && !result.ok) throw new Error(result.error || 'Save failed');
    },
    async clear(): Promise<void> {
        if (!(await this.isSupported())) return;
        try {
            await (window as any).sqliteBridge.clearBlob();
        } catch {
            // Ignore
        }
    },
};

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
            const result = await new Promise<ArrayBuffer | Blob | undefined>((resolve, reject) => {
                const tx = db.transaction(IDB_STORE_NAME, 'readonly');
                const req = tx.objectStore(IDB_STORE_NAME).get(IDB_KEY);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
            if (!result) return null;
            let arr: Uint8Array;
            if (result instanceof Blob) {
                arr = new Uint8Array(await result.arrayBuffer());
            } else if (result instanceof ArrayBuffer) {
                arr = new Uint8Array(result);
            } else {
                return null;
            }
            return arr.length > 0 ? arr : null;
        } catch {
            return null;
        }
    }

    async save(data: Uint8Array): Promise<void> {
        if (!(await this.isSupported())) return;
        const db = await this.getDb();
        // Use Blob instead of ArrayBuffer - better large-data support in Safari/private mode
        const blob = new Blob([data as any]);
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
            const req = tx.objectStore(IDB_STORE_NAME).put(blob, IDB_KEY);
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
    private storageMode: 'electron' | 'opfs' | 'indexedDB' | 'localStorage' = 'localStorage';
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

            // Priority order: Electron file > OPFS > IndexedDB > localStorage
            let loadedData: Uint8Array | null = null;

            /**
             * Run a quick integrity check on a freshly-opened sql.js Database.
             * Returns true when the DB is healthy, false when it is corrupted.
             * A malformed file may parse without error but fail on the first real read,
             * so we probe it before trusting it.
             */
            const isDbIntact = (candidate: any): boolean => {
                try {
                    const result = candidate.exec('PRAGMA integrity_check(1)');
                    const value = result?.[0]?.values?.[0]?.[0];
                    return value === 'ok';
                } catch {
                    return false;
                }
            };

            // 0. Electron: real file on disk (no browser storage issues)
            if (!this.db && (await electronFileStorage.isSupported())) {
                const electronData = await electronFileStorage.load();
                if (electronData) {
                    try {
                        const candidate = new SQL.Database(electronData);
                        if (isDbIntact(candidate)) {
                            this.db = candidate;
                            this.storageMode = 'electron';
                            logger.logCategory('database', '✅ Loaded existing database from Electron file storage');
                            loadedData = electronData;
                        } else {
                            candidate.close();
                            logger.warnCategory('database', '⚠️ Electron file database failed integrity check (malformed) — clearing and recreating');
                            await electronFileStorage.clear();
                        }
                    } catch (parseError) {
                        logger.warnCategory('database', '⚠️ Failed to parse Electron file database, trying OPFS:', parseError);
                    }
                }
            }

            // 1. Try OPFS
            if (!this.db) {
                const opfsData = await this.opfs.load();
                if (opfsData) {
                    try {
                        const candidate = new SQL.Database(opfsData);
                        if (isDbIntact(candidate)) {
                            this.db = candidate;
                            this.storageMode = 'opfs';
                            logger.logCategory('database', '✅ Loaded existing database from OPFS');
                            loadedData = opfsData;
                        } else {
                            candidate.close();
                            logger.warnCategory('database', '⚠️ OPFS database failed integrity check (malformed) — skipping');
                        }
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
                        const candidate = new SQL.Database(idbData);
                        if (isDbIntact(candidate)) {
                            this.db = candidate;
                            this.storageMode = 'indexedDB';
                            logger.logCategory('database', '✅ Loaded existing database from IndexedDB');
                            loadedData = idbData;
                        } else {
                            candidate.close();
                            logger.warnCategory('database', '⚠️ IndexedDB database failed integrity check (malformed) — skipping');
                        }
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
                        const candidate = new SQL.Database(buffer);
                        if (isDbIntact(candidate)) {
                            this.db = candidate;
                            this.storageMode = 'localStorage';
                            logger.logCategory('database', '✅ Loaded existing database from localStorage');
                            loadedData = buffer;
                        } else {
                            candidate.close();
                            logger.warnCategory('database', '⚠️ localStorage database failed integrity check (malformed) — clearing');
                            localStorage.removeItem('finance_db');
                        }
                    } catch (parseError) {
                        logger.warnCategory('database', '⚠️ Failed to parse saved database, creating new one:', parseError);
                    }
                }
            }

            if (!this.db) {
                // Create new database
                logger.logCategory('database', '[SchemaSync] Creating new database (no existing blob)');
                this.db = new SQL.Database();
                // Create schema statement-by-statement so one failure (e.g. index on a column that an
                // older table is missing) doesn't abort the entire schema creation. Each statement is
                // tried independently; CREATE INDEX errors on missing columns are silently skipped.
                try {
                    this.executeSchemaStatements(CREATE_SCHEMA_SQL);
                    // Set schema version directly (bypass isReady check during init)
                    this.db.run('INSERT OR REPLACE INTO metadata (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))',
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

                    // Unconditional repair: ensure rental_agreements.tenant_id is populated from org_id
                    this.repairRentalAgreementsOrgIdToTenantId();

                    // In local-only mode, normalize all tenant_ids to 'local'
                    this.normalizeLocalOnlyTenantIds();

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
                        this.executeSchemaStatements(CREATE_SCHEMA_SQL);
                        // Set schema version directly (bypass isReady check during init)
                        this.db.run('INSERT OR REPLACE INTO metadata (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))',
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
            return;
        }
        try {
            const db = this.getDatabase();
            db.run(sql, params);
        } catch (error: any) {
            const errorMsg = error?.message || String(error);
            const lowerMsg = errorMsg.toLowerCase();

            // Corrupted database — wipe stored file so the next launch starts fresh
            if (lowerMsg.includes('malformed') || lowerMsg.includes('disk image is malformed')) {
                console.error('❌ SQLite database is malformed. Clearing stored DB so next launch rebuilds a fresh database.');
                this._scheduleCorruptionReset();
            } else {
                console.error(`❌ SQL execution failed:`, error);
                console.error(`SQL: ${sql}`);
                console.error(`Params:`, params);
                console.error(`Error message: ${errorMsg}`);
                console.error(`Error stack:`, error?.stack);

                if (lowerMsg.includes('constraint') || lowerMsg.includes('unique') ||
                    lowerMsg.includes('not null') || lowerMsg.includes('foreign key')) {
                    console.error(`⚠️ This appears to be a constraint violation that may cause transaction rollback!`);
                }
            }

            throw error;
        }
    }

    /**
     * Called when a "malformed" error is detected at runtime.
     * Clears persisted storage asynchronously so the next app launch starts with a fresh DB.
     * We do not reset the in-memory DB here to avoid cascading errors in the current session.
     */
    private _corruptionResetScheduled = false;
    private _scheduleCorruptionReset(): void {
        if (this._corruptionResetScheduled) return;
        this._corruptionResetScheduled = true;
        (async () => {
            try {
                console.warn('🔄 [DatabaseService] Clearing corrupted database files from all storage layers...');
                await electronFileStorage.clear().catch(() => {});
                localStorage.removeItem('finance_db');
                if (await this.indexedDBStorage.isSupported()) {
                    await this.indexedDBStorage.clear().catch(() => {});
                }
                if (typeof navigator !== 'undefined' && (navigator as any).storage?.getDirectory) {
                    try {
                        const root = await (navigator as any).storage.getDirectory();
                        await root.removeEntry('finance_db.sqlite');
                    } catch {
                        // Ignore
                    }
                }
                console.warn('✅ [DatabaseService] Corrupted database cleared. Please restart the app to rebuild a fresh database.');
            } catch (e) {
                console.error('❌ [DatabaseService] Failed to clear corrupted database files:', e);
            }
        })();
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
            // PRAGMA foreign_keys must run BEFORE BEGIN - inside a transaction it is silently ignored
            try {
                db.run('PRAGMA foreign_keys = OFF');
            } catch (fkOffError) {
                console.warn('[DatabaseService] Failed to disable foreign keys for transaction:', fkOffError);
            }

            db.run('BEGIN TRANSACTION');
            begun = true;
            this.inTransaction = true;
        } catch (beginError) {
            // If we cannot start a transaction, surface the error immediately
            this.inTransaction = false;
            console.error('❌ Failed to start transaction:', beginError);
            throw beginError;
        }

        try {
            let operationError: any = null;

            // Execute all operations, catching any errors
            operations.forEach((op, index) => {
                if (operationError) {
                    return;
                }
                try {
                    op();
                } catch (opError) {
                    console.error(`❌ Operation ${index + 1} failed:`, opError);
                    operationError = opError;
                    // Don't continue executing operations if one fails
                }
            });

            // If any operation failed, rollback and throw
            if (operationError) {
                if (begun) {
                    try {
                        db.run('ROLLBACK');
                    } catch (rollbackError: any) {
                        const rollbackMsg = (rollbackError?.message || String(rollbackError)).toLowerCase();
                        if (!rollbackMsg.includes('no transaction is active')) {
                            console.error('Rollback failed:', rollbackError);
                        }
                    }
                    try {
                        db.run('PRAGMA foreign_keys = ON');
                    } catch (_) { }
                }
                throw operationError;
            }

            // All operations succeeded, check if transaction is still active before committing
            let transactionStillActive = false;
            try {
                // Try to prepare a statement - if transaction is active, this should work
                const testStmt = db.prepare('SELECT 1');
                testStmt.step();
                testStmt.free();
                transactionStillActive = true;
            } catch (checkError: any) {
                const checkMsg = (checkError?.message || String(checkError)).toLowerCase();
                if (checkMsg.includes('no transaction') || checkMsg.includes('transaction')) {
                    console.error('❌ Transaction was already rolled back! Checking which operation caused it...');
                    transactionStillActive = false;
                } else {
                    transactionStillActive = true;
                }
            }

            if (!transactionStillActive) {
                console.error('❌ CRITICAL: Transaction was rolled back during operations! All changes are lost.');
                console.error('This usually means an SQL error occurred that caused sql.js to auto-rollback.');
                console.error('Check the logs above for any SQL errors or constraint violations.');
                committed = false;
                throw new Error('Transaction was auto-rolled back by sql.js - check for SQL errors in the logs above');
            }

            try {
                db.run('COMMIT');
                committed = true;

                // Re-enable foreign keys after commit (must be outside transaction)
                try {
                    db.run('PRAGMA foreign_keys = ON');
                } catch (fkOnError) {
                    console.warn('[DatabaseService] Failed to re-enable foreign keys after commit:', fkOnError);
                }

                // Call post-commit callback if provided (before clearing inTransaction flag)
                if (onCommit) {
                    try {
                        onCommit();
                    } catch (callbackError) {
                        console.error('Post-commit callback error:', callbackError);
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
                            db.run('PRAGMA foreign_keys = ON');
                        } catch {
                            // Ignore
                        }
                    }
                    throw commitError;
                }
            }
        } catch (error) {
            if (!committed) {
                if (begun) {
                    try {
                        db.run('ROLLBACK');
                    } catch (rollbackError: any) {
                        const rollbackMsg = (rollbackError?.message || String(rollbackError)).toLowerCase();
                        if (!rollbackMsg.includes('no transaction is active')) {
                            console.error('Rollback failed:', rollbackError);
                        }
                    }
                    try {
                        db.run('PRAGMA foreign_keys = ON');
                    } catch (_) { }
                }
            }
            throw error;
        } finally {
            this.inTransaction = false;
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
                } catch (error) {
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

        } catch (error) {
            db.run('ROLLBACK');
            console.error('❌ Error clearing transaction data:', error);
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
                'INSERT OR REPLACE INTO metadata (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))',
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
    getStorageMode(): 'opfs' | 'localStorage' | 'electron' | 'indexedDB' {
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

                // Temporarily set isInitialized so that helper methods (ensureAllTablesExist,
                // ensureContractColumnsExist, ensureVendorIdColumnsExist, migrateTenantColumns)
                // don't bail out due to their isReady()/isInitialized guards.
                this.isInitialized = true;

                try {
                    // Ensure all tables exist (this will create any missing tables AND indexes)
                    this.ensureAllTablesExist();

                    // Ensure contract and bill columns exist (for expense_category_items)
                    this.ensureContractColumnsExist();
                    // Ensure vendor_id columns exist
                    this.ensureVendorIdColumnsExist();
                    // Ensure recurring template has invoice_type column
                    this.ensureRecurringTemplateColumnsExist();
                    // Ensure transactions has building_id, is_system, updated_at (no FK on building_id for sync)
                    this.ensureTransactionExtraColumnsExist();

                    this.repairRentalAgreementsOrgIdToTenantId();

                    // Run version-specific migrations
                    if (currentVersion < 7) {
                        // Migration to v7: Add version, deleted_at columns to all entity tables
                        // and ensure sync_conflicts table exists
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
                                    }
                                    if (!colNames.has('deleted_at')) {
                                        this.rawExecute(`ALTER TABLE ${table} ADD COLUMN deleted_at TEXT`);
                                    }
                                } catch (tableError) {
                                }
                            }

                            // Migrate rental_agreements: copy org_id into tenant_id and remove org_id
                            try {
                                this.repairRentalAgreementsOrgIdToTenantId();
                            } catch (renameError) {
                            }

                            // Backfill NULL tenant_id values with empty string
                            for (const table of entityTables) {
                                try {
                                    this.rawExecute(`UPDATE ${table} SET tenant_id = '' WHERE tenant_id IS NULL`);
                                } catch (_) { /* ignore if table doesn't have tenant_id */ }
                            }

                        } catch (v7Error) {
                        }
                    }

                    if (currentVersion < 9) {
                        try {
                            // v9: tenants table (stub for FK refs), users columns, installment_plans marketing columns, whatsapp_menu_sessions
                            this.rawExecute(
                                `CREATE TABLE IF NOT EXISTS tenants (
                                    id TEXT PRIMARY KEY,
                                    name TEXT NOT NULL DEFAULT '',
                                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                                    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                                )`
                            );
                            this.rawExecute(
                                `CREATE TABLE IF NOT EXISTS whatsapp_menu_sessions (
                                    id TEXT PRIMARY KEY,
                                    tenant_id TEXT NOT NULL DEFAULT '',
                                    phone_number TEXT NOT NULL,
                                    current_menu_path TEXT NOT NULL DEFAULT 'root',
                                    last_interaction_at TEXT NOT NULL DEFAULT (datetime('now')),
                                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                                    UNIQUE(tenant_id, phone_number)
                                )`
                            );
                            try {
                                this.rawExecute('CREATE INDEX IF NOT EXISTS idx_whatsapp_menu_sessions_tenant_phone ON whatsapp_menu_sessions(tenant_id, phone_number)');
                                this.rawExecute('CREATE INDEX IF NOT EXISTS idx_whatsapp_menu_sessions_last_interaction ON whatsapp_menu_sessions(tenant_id, last_interaction_at)');
                            } catch (_) { }

                            const userCols = this.rawQuery<{ name: string }>('PRAGMA table_info(users)');
                            const userNames = new Set(userCols.map(c => c.name));
                            if (!userNames.has('tenant_id')) this.rawExecute('ALTER TABLE users ADD COLUMN tenant_id TEXT NOT NULL DEFAULT ""');
                            if (!userNames.has('email')) this.rawExecute('ALTER TABLE users ADD COLUMN email TEXT');
                            if (!userNames.has('is_active')) this.rawExecute('ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1');
                            if (!userNames.has('login_status')) this.rawExecute('ALTER TABLE users ADD COLUMN login_status INTEGER NOT NULL DEFAULT 0');

                            const ipCols = this.rawQuery<{ name: string }>('PRAGMA table_info(installment_plans)');
                            const ipNames = new Set(ipCols.map(c => c.name));
                            const ipColumns = [
                                'duration_years INTEGER', 'down_payment_percentage REAL DEFAULT 0', 'frequency TEXT', 'list_price REAL DEFAULT 0',
                                'customer_discount REAL DEFAULT 0', 'floor_discount REAL DEFAULT 0', 'lump_sum_discount REAL DEFAULT 0', 'misc_discount REAL DEFAULT 0',
                                'down_payment_amount REAL DEFAULT 0', 'installment_amount REAL DEFAULT 0', 'total_installments INTEGER', 'description TEXT', 'user_id TEXT',
                                'intro_text TEXT', 'root_id TEXT', 'approval_requested_by TEXT', 'approval_requested_to TEXT', 'approval_requested_at TEXT',
                                'approval_reviewed_by TEXT', 'approval_reviewed_at TEXT', 'discounts TEXT', 'customer_discount_category_id TEXT',
                                'floor_discount_category_id TEXT', 'lump_sum_discount_category_id TEXT', 'misc_discount_category_id TEXT',
                                'selected_amenities TEXT', 'amenities_total REAL DEFAULT 0', 'updated_at TEXT'
                            ];
                            for (const colDef of ipColumns) {
                                const colName = colDef.split(' ')[0];
                                if (!ipNames.has(colName)) {
                                    try {
                                        this.rawExecute(`ALTER TABLE installment_plans ADD COLUMN ${colDef}`);
                                    } catch (_) { }
                                }
                            }
                        } catch (v9Error) {
                            // ignore
                        }
                    }

                    if (currentVersion < 14) {
                        try {
                            const catCols = this.rawQuery<{ name: string }>('PRAGMA table_info(categories)');
                            const catNames = new Set(catCols.map(c => c.name));
                            if (!catNames.has('is_hidden')) {
                                this.rawExecute('ALTER TABLE categories ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0');
                            }
                        } catch (_) { }
                    }

                    // Update schema version directly (setMetadata relies on isReady)
                    this.rawExecute(
                        'INSERT OR REPLACE INTO metadata (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))',
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
                    } catch (saveError) {
                    }

                } finally {
                    // Reset isInitialized - it will be set to true properly at the end of _doInitialize
                    this.isInitialized = false;
                }
            } else if (currentVersion > latestVersion) {
            } else {
            }
        } catch (error) {
            console.error('❌ Error during schema migration check:', error);
            // Reset isInitialized in case of error
            this.isInitialized = false;
            // Don't throw - allow app to continue with existing schema
        }
    }

    /**
     * Ensure all entity tables have the columns expected by the server API routes.
     * Missing columns prevent INSERT/UPSERT queries from succeeding during sync.
     */
    ensureContractColumnsExist(): void {
        if (!this.db || !this.isInitialized) return;

        try {
            const tableColumns: Record<string, [string, string][]> = {
                contracts: [
                    ['expense_category_items', 'TEXT'],
                    ['payment_terms', 'TEXT'],
                    ['status', "TEXT DEFAULT 'Active'"],
                    ['area', 'REAL'],
                    ['rate', 'REAL'],
                    ['start_date', 'TEXT'],
                    ['end_date', 'TEXT'],
                    ['category_ids', 'TEXT'],
                    ['terms_and_conditions', 'TEXT'],
                    ['description', 'TEXT'],
                    ['document_path', 'TEXT'],
                    ['document_id', 'TEXT'],
                    ['updated_at', "TEXT DEFAULT (datetime('now'))"],
                ],
                bills: [
                    ['expense_category_items', 'TEXT'],
                    ['status', "TEXT DEFAULT 'Unpaid'"],
                    ['due_date', 'TEXT'],
                    ['description', 'TEXT'],
                    ['category_id', 'TEXT'],
                    ['project_id', 'TEXT'],
                    ['building_id', 'TEXT'],
                    ['property_id', 'TEXT'],
                    ['project_agreement_id', 'TEXT'],
                    ['contract_id', 'TEXT'],
                    ['staff_id', 'TEXT'],
                    ['document_path', 'TEXT'],
                    ['document_id', 'TEXT'],
                    ['expense_bearer_type', 'TEXT'],
                    ['user_id', 'TEXT'],
                    ['updated_at', "TEXT DEFAULT (datetime('now'))"],
                ],
                invoices: [
                    ['description', 'TEXT'],
                    ['project_id', 'TEXT'],
                    ['building_id', 'TEXT'],
                    ['property_id', 'TEXT'],
                    ['unit_id', 'TEXT'],
                    ['category_id', 'TEXT'],
                    ['agreement_id', 'TEXT'],
                    ['security_deposit_charge', 'REAL'],
                    ['service_charges', 'REAL'],
                    ['rental_month', 'TEXT'],
                    ['user_id', 'TEXT'],
                    ['updated_at', "TEXT DEFAULT (datetime('now'))"],
                ],
                rental_agreements: [
                    ['rent_due_date', 'INTEGER'],
                    ['description', 'TEXT'],
                    ['security_deposit', 'REAL'],
                    ['broker_id', 'TEXT'],
                    ['broker_fee', 'REAL'],
                    ['owner_id', 'TEXT'],
                    ['updated_at', "TEXT DEFAULT (datetime('now'))"],
                ],
                transactions: [
                    ['subtype', 'TEXT'],
                    ['from_account_id', 'TEXT'],
                    ['to_account_id', 'TEXT'],
                    ['property_id', 'TEXT'],
                    ['unit_id', 'TEXT'],
                    ['payslip_id', 'TEXT'],
                    ['contract_id', 'TEXT'],
                    ['agreement_id', 'TEXT'],
                    ['batch_id', 'TEXT'],
                ],
                accounts: [
                    ['description', 'TEXT'],
                    ['user_id', 'TEXT'],
                    ['updated_at', "TEXT DEFAULT (datetime('now'))"],
                ],
                projects: [
                    ['description', 'TEXT'],
                    ['color', 'TEXT'],
                    ['pm_config', 'TEXT'],
                    ['installment_config', 'TEXT'],
                    ['user_id', 'TEXT'],
                    ['updated_at', "TEXT DEFAULT (datetime('now'))"],
                ],
                buildings: [
                    ['description', 'TEXT'],
                    ['color', 'TEXT'],
                    ['updated_at', "TEXT DEFAULT (datetime('now'))"],
                ],
                properties: [
                    ['description', 'TEXT'],
                    ['monthly_service_charge', 'REAL'],
                    ['updated_at', "TEXT DEFAULT (datetime('now'))"],
                ],
                property_ownership: [
                    ['transfer_document', 'TEXT'],
                    ['notes', 'TEXT'],
                ],
                units: [
                    ['sale_price', 'REAL'],
                    ['description', 'TEXT'],
                    ['type', 'TEXT'],
                    ['area', 'REAL'],
                    ['floor', 'TEXT'],
                    ['user_id', 'TEXT'],
                    ['updated_at', "TEXT DEFAULT (datetime('now'))"],
                ],
                project_agreements: [
                    ['unit_ids', 'TEXT'],
                    ['list_price', 'REAL'],
                    ['customer_discount', 'REAL'],
                    ['floor_discount', 'REAL'],
                    ['lump_sum_discount', 'REAL'],
                    ['misc_discount', 'REAL'],
                    ['rebate_amount', 'REAL'],
                    ['rebate_broker_id', 'TEXT'],
                    ['issue_date', 'TEXT'],
                    ['description', 'TEXT'],
                    ['cancellation_details', 'TEXT'],
                    ['list_price_category_id', 'TEXT'],
                    ['customer_discount_category_id', 'TEXT'],
                    ['floor_discount_category_id', 'TEXT'],
                    ['lump_sum_discount_category_id', 'TEXT'],
                    ['misc_discount_category_id', 'TEXT'],
                    ['selling_price_category_id', 'TEXT'],
                    ['rebate_category_id', 'TEXT'],
                    ['user_id', 'TEXT'],
                    ['updated_at', "TEXT DEFAULT (datetime('now'))"],
                ],
            };

            for (const [tableName, columns] of Object.entries(tableColumns)) {
                const tableExists = this.query<{ name: string }>(
                    `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`
                ).length > 0;
                if (!tableExists) continue;

                const existingCols = this.query<{ name: string }>(`PRAGMA table_info(${tableName})`);
                const existingColNames = new Set(existingCols.map(col => col.name));

                for (const [colName, colType] of columns) {
                    if (!existingColNames.has(colName)) {
                        try { this.execute(`ALTER TABLE ${tableName} ADD COLUMN ${colName} ${colType}`); } catch (_) { }
                    }
                }
            }

            // Special: backfill bills.status from payment amounts
            const billsTableExists = this.query<{ name: string }>(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='bills'"
            ).length > 0;
            if (billsTableExists) {
                this.execute(`UPDATE bills SET status = CASE 
                    WHEN paid_amount = 0 THEN 'Unpaid'
                    WHEN paid_amount >= amount THEN 'Paid'
                    WHEN paid_amount > 0 THEN 'Partially Paid'
                    ELSE 'Unpaid'
                END WHERE status IS NULL`);
            }

            // Special: backfill contracts.status
            const contractsTableExists = this.query<{ name: string }>(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='contracts'"
            ).length > 0;
            if (contractsTableExists) {
                this.execute("UPDATE contracts SET status = 'Active' WHERE status IS NULL");
            }
        } catch (error) {
            console.error('❌ Error ensuring entity columns exist:', error);
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
                        this.execute('ALTER TABLE vendors ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1');
                    }
                } else {
                    if (!columnNames.has('vendor_id')) {
                        // Add REFERENCES vendors(id) for foreign key constraint
                        this.execute(`ALTER TABLE ${table} ADD COLUMN vendor_id TEXT REFERENCES vendors(id)`);
                    }
                }
            }

            // DATA MIGRATION: Move data from contact_id to vendor_id if contact_id is actually a vendor ID
            // This ensures existing data is correctly linked after schema change

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
                this.execute("ALTER TABLE recurring_invoice_templates ADD COLUMN invoice_type TEXT DEFAULT 'Rental'");
                // Update existing rows to have the default value
                this.execute("UPDATE recurring_invoice_templates SET invoice_type = 'Rental' WHERE invoice_type IS NULL");
            }
        } catch (error) {
            console.error('❌ Error ensuring recurring template columns exist:', error);
        }
    }

    /** Unconditional repair: copy org_id into tenant_id, then remove org_id by recreating table if DROP COLUMN fails. */
    private repairRentalAgreementsOrgIdToTenantId(): void {
        if (!this.db) return;
        try {
            const raCols = this.rawQuery<{ name: string }>('PRAGMA table_info(rental_agreements)');
            if (raCols.length === 0) return;
            const raNames = new Set(raCols.map(c => c.name));
            if (!raNames.has('org_id')) return;
            if (raNames.has('tenant_id')) {
                this.rawExecute("UPDATE rental_agreements SET tenant_id = org_id WHERE (tenant_id IS NULL OR tenant_id = '') AND org_id IS NOT NULL AND org_id != ''");
            }
            try {
                this.rawExecute('ALTER TABLE rental_agreements DROP COLUMN org_id');
            } catch (_) {
                // SQLite < 3.35: recreate the table without org_id
                this.recreateRentalAgreementsWithoutOrgId();
            }
        } catch (_) { }
    }

    /** Recreate rental_agreements table without org_id (for SQLite versions that don't support DROP COLUMN). */
    private recreateRentalAgreementsWithoutOrgId(): void {
        if (!this.db) return;
        try {
            this.rawExecute('PRAGMA foreign_keys = OFF');
            this.rawExecute(`CREATE TABLE IF NOT EXISTS rental_agreements_new (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL DEFAULT '',
                agreement_number TEXT NOT NULL,
                contact_id TEXT NOT NULL,
                property_id TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                monthly_rent REAL NOT NULL,
                rent_due_date INTEGER,
                status TEXT NOT NULL,
                description TEXT,
                security_deposit REAL,
                broker_id TEXT,
                broker_fee REAL,
                owner_id TEXT,
                previous_agreement_id TEXT,
                user_id TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                version INTEGER NOT NULL DEFAULT 1,
                deleted_at TEXT,
                FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE RESTRICT,
                FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE RESTRICT,
                UNIQUE(tenant_id, agreement_number)
            )`);
            this.rawExecute(`INSERT INTO rental_agreements_new
                (id, tenant_id, agreement_number, contact_id, property_id, start_date, end_date,
                 monthly_rent, rent_due_date, status, description, security_deposit, broker_id,
                 broker_fee, owner_id, previous_agreement_id, user_id, created_at, updated_at, version, deleted_at)
                SELECT id, tenant_id, agreement_number, contact_id, property_id, start_date, end_date,
                 monthly_rent, rent_due_date, status, description, security_deposit, broker_id,
                 broker_fee, owner_id, previous_agreement_id, user_id, created_at, updated_at, version, deleted_at
                FROM rental_agreements`);
            this.rawExecute('DROP TABLE rental_agreements');
            this.rawExecute('ALTER TABLE rental_agreements_new RENAME TO rental_agreements');
            this.rawExecute('PRAGMA foreign_keys = ON');
            console.log('[DatabaseService] rental_agreements: recreated table without org_id');
        } catch (e) {
            console.warn('[DatabaseService] rental_agreements: table recreation failed:', e);
            this.rawExecute('PRAGMA foreign_keys = ON');
        }
    }

    /**
     * In local-only mode, normalize all tenant_id values to 'local' so the
     * tenant filter (WHERE tenant_id = 'local') matches existing data that
     * may have been imported with a cloud UUID as tenant_id.
     */
    private normalizeLocalOnlyTenantIds(): void {
        if (!this.db || !isLocalOnlyMode()) return;
        const tables = [
            'accounts', 'contacts', 'vendors', 'categories', 'projects', 'buildings',
            'properties', 'units', 'transactions', 'invoices', 'bills', 'budgets',
            'quotations', 'plan_amenities', 'installment_plans', 'documents',
            'rental_agreements', 'project_agreements', 'sales_returns', 'contracts',
            'recurring_invoice_templates', 'pm_cycle_allocations', 'users',
        ];
        let tablesUpdated = 0;
        for (const table of tables) {
            try {
                const exists = this.rawQuery<{ name: string }>(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name=?", [table]
                );
                if (exists.length === 0) continue;
                const cols = this.rawQuery<{ name: string }>(`PRAGMA table_info(${table})`);
                if (!cols.some(c => c.name === 'tenant_id')) continue;
                const nonLocal = this.rawQuery<{ cnt: number }>(
                    `SELECT COUNT(*) as cnt FROM ${table} WHERE tenant_id != 'local'`
                );
                if ((nonLocal[0]?.cnt ?? 0) > 0) {
                    // Use UPDATE OR IGNORE to skip rows violating UNIQUE constraints
                    // (multi-tenant backup data may have overlapping record numbers across tenants).
                    try {
                        this.rawExecute(`UPDATE OR IGNORE ${table} SET tenant_id = 'local' WHERE tenant_id != 'local'`);
                    } catch (_) {
                        this.rawExecute(`UPDATE ${table} SET tenant_id = 'local' WHERE tenant_id != 'local'`);
                    }
                    // Drop leftover duplicate rows from other tenants (their 'local' version now exists)
                    try { this.rawExecute(`DELETE FROM ${table} WHERE tenant_id != 'local'`); } catch (_) { }
                    tablesUpdated++;
                }
            } catch (_) { }
        }
        if (tablesUpdated > 0) {
            console.log(`[DatabaseService] Normalized tenant_id to 'local' in ${tablesUpdated} table(s)`);
        }
    }

    /**
     * Add building_id, is_system, updated_at to transactions if missing (no FK on building_id for sync order).
     */
    private ensureTransactionExtraColumnsExist(): void {
        if (!this.db || !this.isInitialized) return;
        try {
            const tableExists = this.query<{ name: string }>(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'"
            ).length > 0;
            if (!tableExists) return;
            const columnNames = new Set(this.query<{ name: string }>('PRAGMA table_info(transactions)').map(c => c.name));
            if (!columnNames.has('building_id')) this.execute('ALTER TABLE transactions ADD COLUMN building_id TEXT');
            if (!columnNames.has('is_system')) this.execute('ALTER TABLE transactions ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0');
            if (!columnNames.has('updated_at')) this.execute("ALTER TABLE transactions ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))");
            if (!columnNames.has('owner_id')) this.execute('ALTER TABLE transactions ADD COLUMN owner_id TEXT');
        } catch (error) {
            console.error('❌ Error ensuring transaction extra columns exist:', error);
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
     * Ensure all required tables exist (for existing databases that might be missing newer tables).
     * Always runs the full schema - CREATE TABLE IF NOT EXISTS is idempotent, so this safely adds
     * any new tables without affecting existing ones.
     */
    ensureAllTablesExist(): void {
        if (!this.db || !this.isInitialized) return;

        try {
            const beforeTables = this.rawQuery<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").map(r => r.name);
            logger.logCategory('database', `[SchemaSync] ensureAllTablesExist: ${beforeTables.length} tables before schema run`);

            // Create sync tables first so they exist before executeSchemaStatements runs (avoids "no such table: sync_outbox")
            this.ensureSyncTablesExist();

            // Always run full schema – ensures any new table in schema.ts gets created for existing DBs.
            // CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS are idempotent.
            this.executeSchemaStatements(CREATE_SCHEMA_SQL);

            // Ensure transactions has building_id, is_system, updated_at (for sync; no FK on building_id)
            this.ensureTransactionExtraColumnsExist();

            const afterTables = this.rawQuery<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").map(r => r.name);
            const added = afterTables.filter(t => !beforeTables.includes(t));
            if (added.length > 0) {
                logger.logCategory('database', `[SchemaSync] Created ${added.length} new table(s):`, added.join(', '));
            }
            logger.logCategory('database', `[SchemaSync] ensureAllTablesExist done: ${afterTables.length} tables total`);
        } catch (error) {
            console.error('[SchemaSync] Error ensuring tables exist:', error);
            try {
                this.executeSchemaStatements(CREATE_SCHEMA_SQL);
                logger.logCategory('database', '[SchemaSync] Retry succeeded');
            } catch (createError) {
                console.error('[SchemaSync] Failed to create missing tables:', createError);
            }
        }
    }

    /**
     * Split SQL on ';' but keep CREATE TRIGGER ... BEGIN ... END; as one statement.
     * Naive split breaks triggers: SELECT RAISE(...); appears inside BEGIN...END before END.
     */
    private splitSqlStatementsRespectingTriggers(sql: string): string[] {
        const stripped = sql.replace(/--[^\n]*/g, '');
        const raw = stripped
            .split(';')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        const out: string[] = [];
        let i = 0;
        while (i < raw.length) {
            let stmt = raw[i];
            if (/^CREATE\s+TRIGGER/i.test(stmt)) {
                while (!/\bEND\s*$/i.test(stmt.trim()) && i + 1 < raw.length) {
                    i++;
                    stmt += ';' + raw[i];
                }
            }
            out.push(stmt);
            i++;
        }
        return out;
    }

    /**
     * Execute SQL schema statements one by one, handling index creation failures gracefully
     * This allows table creation to succeed even if some indexes fail due to missing columns
     */
    private executeSchemaStatements(sql: string): void {
        if (!this.db) return;

        // Strip single-line SQL comments BEFORE splitting on ';' to avoid false splits
        // on semicolons that appear inside comments (e.g. "-- registered_suppliers; aligned with PostgreSQL")
        const stripped = sql.replace(/--[^\n]*/g, '').trim();

        // Fast path: single exec (handles triggers with internal semicolons)
        try {
            this.db.exec(stripped);
            return;
        } catch (firstError: unknown) {
            const msg = firstError instanceof Error ? firstError.message : String(firstError);
            logger.logCategory('database', `[SchemaSync] Full schema exec failed, using statement batching:`, msg.slice(0, 160));
        }

        const statements = this.splitSqlStatementsRespectingTriggers(stripped);

        let skippedIndex = 0;
        for (const statement of statements) {
            try {
                this.db.exec(statement + ';');
            } catch (error: any) {
                const errorMsg = error?.message || String(error);
                // Silently skip index creation failures on missing columns
                if (errorMsg.includes('no such column') && statement.toUpperCase().includes('CREATE INDEX')) {
                    skippedIndex++;
                } else {
                    const tableMatch = statement.match(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(\w+)/i) || statement.match(/CREATE INDEX.*ON\s+(\w+)/i);
                    const tableName = tableMatch ? tableMatch[1] : '(unknown)';
                    logger.logCategory('database', `[SchemaSync] executeSchemaStatements failed at ${tableName}:`, errorMsg.slice(0, 120));
                    throw error;
                }
            }
        }
        if (skippedIndex > 0) {
            logger.logCategory('database', `[SchemaSync] Skipped ${skippedIndex} index creation(s) (missing columns)`);
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
        this.ensureAllTablesExist();
        this.ensureContractColumnsExist();
        this.ensureVendorIdColumnsExist();
        this.ensureRecurringTemplateColumnsExist();

        // Clear repository column caches so they pick up the new columns
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

            // Try Electron file storage first (desktop app - no browser storage)
            if (await electronFileStorage.isSupported()) {
                try {
                    await electronFileStorage.save(data);
                    this.storageMode = 'electron';
                    this.lastPersistenceError = null;
                    logger.logCategory('database', '✅ Database saved to Electron file storage');
                    resolveLock!();
                    return;
                } catch (electronError) {
                    const errMsg = errorToString(electronError);
                    if (this.shouldLogPersistenceError(`Electron: ${errMsg}`)) {
                        logger.warnCategory('database', `Electron file save failed: ${errMsg}`);
                    }
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
                    const isQuotaError = errMsg.includes('QuotaExceeded') || errMsg.includes('quota');
                    if (this.shouldLogPersistenceError(`IndexedDB: ${errMsg}`)) {
                        logger.warnCategory('database', `IndexedDB save failed: ${errMsg}`);
                    }
                    // If IndexedDB hit quota, localStorage will fail too - skip it and throw
                    if (isQuotaError) {
                        const sizeMB = (data.length / (1024 * 1024)).toFixed(1);
                        throw new Error(
                            `Storage quota exceeded (DB ~${sizeMB}MB). Please clear site data: DevTools → Application → Storage → Clear site data, then reload.`
                        );
                    }
                }
            }

            // Fallback: localStorage only for small DBs (~4MB limit typical)
            const estimatedJsonSize = data.length * 2.5; // JSON overhead for number array
            const localStorageLimit = 4 * 1024 * 1024; // ~4MB
            if (estimatedJsonSize > localStorageLimit) {
                const sizeMB = (data.length / (1024 * 1024)).toFixed(1);
                throw new Error(
                    `Database too large for localStorage (~${sizeMB}MB). IndexedDB failed. Clear site data and reload, or use a different browser.`
                );
            }

            try {
                const buffer = Array.from(data);
                localStorage.setItem('finance_db', JSON.stringify(buffer));
                this.storageMode = 'localStorage';
                this.lastPersistenceError = null; // Clear on success
                logger.logCategory('database', '✅ Database saved to localStorage');
            } catch (lsError) {
                const errMsg = errorToString(lsError);
                if (errMsg.includes('QuotaExceeded') || errMsg.includes('quota')) {
                    throw new Error(
                        'Storage quota exceeded. Clear site data: DevTools → Application → Storage → Clear site data, then reload.'
                    );
                }
                throw lsError;
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

/** Detect Electron so we never try to load sql.js (externalized in Electron build and would fail). */
function isElectron(): boolean {
    return typeof window !== 'undefined' && !!(window as unknown as { electronAPI?: unknown }).electronAPI;
}

export const getDatabaseService = (config?: DatabaseConfig): DatabaseService => {
    if (!dbServiceInstance) {
        const win = typeof window !== 'undefined' ? (window as unknown as { sqliteBridge?: { querySync?: unknown; execSync?: (sql: string) => { ok: boolean; error?: string } } }) : null;
        const bridge = win?.sqliteBridge;

        if (isElectron()) {
            if (!bridge?.querySync) {
                throw new Error(
                    'Native SQLite bridge not available. The preload script may not have run yet, or the app may be misconfigured.'
                );
            }
            const check = bridge.execSync!('SELECT 1');
            if (!check.ok && check.error?.includes('No database open')) {
                // Multi-company mode: no company DB opened yet. Create the service
                // instance anyway — initialize() will detect this and defer.
                dbServiceInstance = new ElectronDatabaseService(config) as unknown as DatabaseService;
            } else if (!check.ok) {
                throw new Error(
                    'Native SQLite bridge health check failed. ' + (check.error || 'Ensure the database file is not locked.')
                );
            } else {
                dbServiceInstance = new ElectronDatabaseService(config) as unknown as DatabaseService;
            }
        } else if (bridge?.querySync) {
            const check = bridge.execSync!('SELECT 1');
            if (check.ok) {
                dbServiceInstance = new ElectronDatabaseService(config) as unknown as DatabaseService;
            } else if (check.error?.includes('No database open')) {
                dbServiceInstance = new ElectronDatabaseService(config) as unknown as DatabaseService;
            } else {
                logger.warnCategory('database', 'Native SQLite bridge not functional, falling back to sql.js');
                dbServiceInstance = new DatabaseService(config);
            }
        } else {
            dbServiceInstance = new DatabaseService(config);
        }
    }
    return dbServiceInstance;
};

/**
 * Clear all database storage (localStorage, OPFS, IndexedDB, native SQLite).
 * Used by Fix button and console commands to fully reset local DB.
 */
export async function clearAllDatabaseStorage(): Promise<void> {
    localStorage.removeItem('finance_db');
    if (typeof window !== 'undefined') {
        const bridge = (window as any).sqliteBridge;
        if (bridge?.resetAndDeleteDb) {
            try {
                await bridge.resetAndDeleteDb();
            } catch {
                // Ignore
            }
        } else if (bridge?.clearBlob) {
            try {
                await bridge.clearBlob();
            } catch {
                // Ignore
            }
        }
    }
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
