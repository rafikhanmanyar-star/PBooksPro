/**
 * Base Repository
 * 
 * Provides common CRUD operations for all repositories.
 */

import { getDatabaseService } from '../databaseService';
import { objectToDbFormat, dbToObjectFormat, camelToSnake } from '../columnMapper';
import { getCurrentTenantId, shouldFilterByTenant } from '../tenantUtils';
import { getCurrentUserId, shouldTrackUserId } from '../userUtils';
import { isMobileDevice } from '../../../utils/platformDetection';
import { getSyncOutboxService } from '../../sync/syncOutboxService';

interface PendingSyncOperation {
    type: 'create' | 'update' | 'delete';
    entityId: string;
    data: any;
    tableName: string;
}

export abstract class BaseRepository<T> {
    protected tableName: string;
    protected primaryKey: string;
    /** Column for tenant isolation (default tenant_id). rental_agreements uses org_id to match PostgreSQL. */
    protected tenantColumn: string;
    private tableColumns: Set<string> | null = null;

    // Static tracker for pending sync operations during transactions
    private static pendingSyncOperations: PendingSyncOperation[] = [];

    // Flag to disable sync queueing when syncing FROM cloud TO local
    // This prevents creating sync operations for data that's already in the cloud
    private static syncQueueingDisabled = false;

    constructor(tableName: string, primaryKey: string = 'id', tenantColumn: string = 'tenant_id') {
        this.tableName = tableName;
        this.primaryKey = primaryKey;
        this.tenantColumn = tenantColumn;
    }

    /**
     * Get all pending sync operations and clear the tracker
     * Called after transaction successfully commits
     */
    static flushPendingSyncOperations(): PendingSyncOperation[] {
        const operations = [...BaseRepository.pendingSyncOperations];
        BaseRepository.pendingSyncOperations = [];
        return operations;
    }

    /**
     * Clear pending sync operations (called on rollback)
     */
    static clearPendingSyncOperations(): void {
        BaseRepository.pendingSyncOperations = [];
    }

    /**
     * Disable sync queueing (used when syncing FROM cloud TO local)
     * This prevents creating unnecessary sync operations for data already in cloud
     */
    static disableSyncQueueing(): void {
        BaseRepository.syncQueueingDisabled = true;
        // Sync queueing disabled when syncing from cloud
    }

    /**
     * Enable sync queueing (normal operation)
     */
    static enableSyncQueueing(): void {
        BaseRepository.syncQueueingDisabled = false;
        // Sync queueing enabled (normal operation)
    }

    /**
     * Check if sync queueing is currently disabled
     */
    static isSyncQueueingDisabled(): boolean {
        return BaseRepository.syncQueueingDisabled;
    }

    protected get db() {
        // BaseRepository is for local SQLite operations (desktop only)
        // Mobile devices should use API repositories instead
        if (isMobileDevice()) {
            throw new Error(
                `BaseRepository (local SQLite) is not available on mobile devices. ` +
                `Use API repositories (e.g., ${this.tableName}ApiRepository) instead.`
            );
        }
        return getDatabaseService();
    }

    /**
     * Check if this table supports soft delete (has deleted_at column).
     * Tables without deleted_at use hard delete.
     */
    protected tableSupportsSoftDelete(): boolean {
        const columnsSet = this.ensureTableColumns();
        return columnsSet.has('deleted_at');
    }

    /**
     * Add soft-delete filter to SQL if table supports it.
     * Returns SQL fragment and params to append.
     */
    private softDeleteFilter(): { sql: string; params: any[] } {
        if (!this.tableSupportsSoftDelete()) return { sql: '', params: [] };
        return { sql: ' AND (deleted_at IS NULL OR deleted_at = \'\')', params: [] };
    }

    /**
     * Find all records with options
     * Tenant isolation: if table is tenant-scoped but no tenant in context, return empty (never return other tenants' data).
     * When soft delete is supported, excludes deleted records.
     */
    findAll(options: {
        limit?: number;
        offset?: number;
        orderBy?: string;
        orderDir?: 'ASC' | 'DESC';
        condition?: string;
        params?: any[];
    } = {}): T[] {
        const { limit, offset, orderBy, orderDir = 'DESC', condition, params = [] } = options;

        if (this.shouldFilterByTenant()) {
            const tenantId = getCurrentTenantId();
            if (!tenantId) {
                return [];
            }
        }

        let sql = `SELECT * FROM ${this.tableName}`;
        const whereConditions: string[] = [];
        const whereParams: any[] = [];

        // Add tenant_id filter if tenant is logged in
        if (shouldFilterByTenant() && this.shouldFilterByTenant()) {
            const tenantId = getCurrentTenantId();
            if (tenantId) {
                whereConditions.push(`${this.tenantColumn} = ?`);
                whereParams.push(tenantId);
            }
        }

        // Add custom condition if provided
        if (condition) {
            whereConditions.push(condition);
            whereParams.push(...params);
        }

        // Exclude soft-deleted records when table supports it
        const softFilter = this.softDeleteFilter();
        if (softFilter.sql) {
            whereConditions.push(softFilter.sql.trim().replace(/^AND\s+/, ''));
            whereParams.push(...softFilter.params);
        }

        if (whereConditions.length > 0) {
            sql += ` WHERE ${whereConditions.join(' AND ')}`;
        }

        if (orderBy) {
            sql += ` ORDER BY ${camelToSnake(orderBy)} ${orderDir}`;
        }
        if (limit !== undefined) {
            sql += ` LIMIT ${limit}`;
        }
        if (offset !== undefined) {
            sql += ` OFFSET ${offset}`;
        }

        const results = this.db.query<Record<string, any>>(sql, whereParams);
        return results.map(row => dbToObjectFormat<T>(row));
    }

    /**
     * Check if this table should be filtered by tenant_id
     * Override in subclasses if needed
     */
    protected shouldFilterByTenant(): boolean {
        // Filter by tenant for all tables except global ones
        const globalTables = ['metadata', 'error_log', 'app_settings', 'license_settings'];
        return !globalTables.includes(this.tableName);
    }

    /**
     * Find by primary key
     * Tenant isolation: if table is tenant-scoped but no tenant in context, return null.
     */
    findById(id: string): T | null {
        if (this.shouldFilterByTenant() && !getCurrentTenantId()) {
            return null;
        }
        let sql = `SELECT * FROM ${this.tableName} WHERE ${camelToSnake(this.primaryKey)} = ?`;
        const params: any[] = [id];

        // Add tenant_id filter if tenant is logged in
        if (shouldFilterByTenant() && this.shouldFilterByTenant()) {
            const tenantId = getCurrentTenantId();
            if (tenantId) {
                const tenantColumn = this.tenantColumn;
                sql += ` AND ${tenantColumn} = ?`;
                params.push(tenantId);
            }
        }

        // Exclude soft-deleted records when table supports it
        const softFilter = this.softDeleteFilter();
        if (softFilter.sql) {
            sql += ` AND (deleted_at IS NULL OR deleted_at = '')`;
        }

        const results = this.db.query<Record<string, any>>(sql, params);
        return results.length > 0 ? dbToObjectFormat<T>(results[0]) : null;
    }

    /**
     * Find by condition
     * Tenant isolation: if table is tenant-scoped but no tenant in context, return empty.
     */
    findBy(condition: string, params: any[] = []): T[] {
        if (this.shouldFilterByTenant() && !getCurrentTenantId()) {
            return [];
        }
        let sql = `SELECT * FROM ${this.tableName} WHERE ${condition}`;
        const queryParams = [...params];

        // Add tenant_id filter if tenant is logged in
        if (shouldFilterByTenant() && this.shouldFilterByTenant()) {
            const tenantId = getCurrentTenantId();
            if (tenantId) {
                const tenantColumn = this.tenantColumn;
                sql += ` AND ${tenantColumn} = ?`;
                queryParams.push(tenantId);
            }
        }

        // Exclude soft-deleted records when table supports it
        if (this.tableSupportsSoftDelete()) {
            sql += ` AND (deleted_at IS NULL OR deleted_at = '')`;
        }

        const results = this.db.query<Record<string, any>>(sql, queryParams);
        return results.map(row => dbToObjectFormat<T>(row));
    }

    /**
     * Lazily load table columns to filter out non-existent fields
     */
    protected ensureTableColumns(): Set<string> {
        // Check if database is ready - if not, try to trigger initialization
        if (!this.db.isReady()) {
            console.warn(`⚠️ Database not ready for table columns check: ${this.tableName}`);
            // Try to trigger initialization synchronously - the DB might just need a nudge
            try {
                // Trigger async initialization but don't await - it sets isInitialized = true synchronously at the end
                this.db.initialize().catch(() => { });
            } catch {
                // Ignore - initialization might already be in progress
            }
            // Re-check after potential initialization trigger
            if (!this.db.isReady()) {
                // Still not ready - return empty set but mark this so callers can differentiate
                // between "no columns" and "DB not ready"
                return new Set();
            }
        }

        // Check if table exists before querying PRAGMA
        const tableExists = this.db.query<{ name: string }>(
            `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
            [this.tableName]
        );

        if (tableExists.length === 0) {
            console.warn(`⚠️ Table ${this.tableName} does not exist yet. Attempting to create it...`);
            // Try to ensure table exists
            try {
                this.db.ensureAllTablesExist();
                // Check again after ensuring tables exist
                const tableExistsAfter = this.db.query<{ name: string }>(
                    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
                    [this.tableName]
                );
                if (tableExistsAfter.length === 0) {
                    console.error(`❌ Table ${this.tableName} still does not exist after ensureAllTablesExist()`);
                    return new Set();
                }
            } catch (error) {
                console.error(`❌ Error ensuring table ${this.tableName} exists:`, error);
                return new Set();
            }
        }

        // Always refresh column cache to ensure we have latest columns after schema changes
        // This is critical - if columns are added after cache is created, we need fresh data
        const rows = this.db.query<{ name: string }>(`PRAGMA table_info(${this.tableName})`);

        if (rows.length === 0) {
            console.warn(`⚠️ PRAGMA table_info(${this.tableName}) returned no columns. Table may not exist or be empty.`);
            return new Set();
        }

        this.tableColumns = new Set(rows.map(r => r.name));
        return this.tableColumns;
    }

    /**
     * Clear column cache (useful after schema changes)
     */
    clearColumnCache(): void {
        this.tableColumns = null;
    }

    /**
     * Insert a new record
     */
    insert(data: Partial<T>): void {
        try {
            const dbData = objectToDbFormat(data as Record<string, any>);
            let columnsSet = this.ensureTableColumns();

            // If column set is empty and DB wasn't ready, this is a race condition.
            // The downstream sync already verified DB readiness, but the check can flicker.
            // Retry once after a micro-delay to give initialization a chance to complete.
            if (columnsSet.size === 0 && !this.db.isReady()) {
                console.warn(`⚠️ [${this.tableName}] Columns empty & DB not ready during insert - will skip this record gracefully`);
                // Don't throw - just skip this record. The downstream sync will catch and log it.
                // This prevents a cascade of 3500 error logs when sync starts before DB is fully initialized.
                throw new Error(`Database not ready for ${this.tableName} insert - will retry on next sync`);
            }

            // Add tenant_id if not present and tenant is logged in
            if (shouldFilterByTenant() && this.shouldFilterByTenant()) {
                const tenantId = getCurrentTenantId();
                if (tenantId) {
                    const tenantColumn = this.tenantColumn;
                    if (!dbData[tenantColumn] && columnsSet.has(tenantColumn)) {
                        dbData[tenantColumn] = tenantId;
                    }
                }
            }

            // Debug logging for contacts to diagnose column mapping issues
            if (this.tableName === 'contacts') {
                console.log('🔍 Inserting contact:', {
                    originalData: data,
                    dbData: dbData,
                    availableColumns: Array.from(columnsSet),
                    dbDataKeys: Object.keys(dbData)
                });
            }

            const keys = Object.keys(dbData)
                .filter(k => dbData[k] !== undefined && columnsSet.has(k));
            const values = keys.map(k => dbData[k]);
            const placeholders = keys.map(() => '?').join(', ');
            const columns = keys.join(', ');

            if (keys.length === 0) {
                const errorMsg = `No valid columns to insert for ${this.tableName}. Available columns: ${Array.from(columnsSet).join(', ')}, Data keys after conversion: ${Object.keys(dbData).join(', ')}`;
                console.error(`❌ ${errorMsg}`);
                console.error('Original data:', data);
                console.error('Converted data:', dbData);
                throw new Error(errorMsg);
            }

            // Debug logging for contacts
            if (this.tableName === 'contacts') {
                console.log('✅ Inserting contact with columns:', columns);
                console.log('✅ Values:', values);
            }

            try {
                this.db.execute(
                    `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders})`,
                    values
                );

                // Debug logging for contacts
                if (this.tableName === 'contacts') {
                    console.log('✅ Contact insert SQL executed successfully');
                    // Don't verify inside transaction - it might cause issues
                    // Verification will happen after transaction commits
                }

                if (!this.db.isInTransaction()) {
                    this.db.save();
                    // Queue for sync to cloud (desktop only) - get ID from data
                    const entityId = (data as any)?.id || (dbData as any)?.id;
                    if (entityId) {
                        this.queueForSync('create', entityId, data);
                    }
                }
            } catch (executeError: any) {
                // Check if this is a transaction-related error
                const errorMsg = (executeError?.message || String(executeError)).toLowerCase();
                console.error(`❌ SQL execution error for ${this.tableName}:`, executeError);
                console.error(`SQL: INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders})`);
                console.error(`Values:`, values);

                // If it's a transaction error, the transaction might already be rolled back
                if (errorMsg.includes('no transaction') || errorMsg.includes('transaction')) {
                    console.error('⚠️ Transaction may have been auto-rolled back by sql.js');
                }

                throw executeError; // Re-throw so transaction can handle rollback
            }
        } catch (error) {
            console.error(`❌ Error inserting into ${this.tableName}:`, error);
            console.error('Data:', data);
            throw error; // Re-throw so transaction can rollback
        }
    }

    /**
     * Update a record
     */
    update(id: string, data: Partial<T>): void {
        // Convert camelCase to snake_case for database
        const dbData = objectToDbFormat(data as Record<string, any>);
        const columnsSet = this.ensureTableColumns();

        // Add tenant_id if updating and column exists
        if (shouldFilterByTenant() && this.shouldFilterByTenant()) {
            const tenantId = getCurrentTenantId();
            if (tenantId) {
                const tenantColumn = this.tenantColumn;
                if (columnsSet.has(tenantColumn)) {
                    dbData[tenantColumn] = tenantId;
                }
            }
        }

        // Add user_id if updating and column exists
        if (shouldTrackUserId() && columnsSet.has('user_id')) {
            const userId = getCurrentUserId();
            if (userId) {
                dbData['user_id'] = userId;
            }
        }

        const keys = Object.keys(dbData)
            .filter(k => dbData[k] !== undefined && columnsSet.has(k));
        const setClause = keys.map(k => `${k} = ?`).join(', ');
        const values = keys.map(k => dbData[k]);
        const primaryKeyColumn = camelToSnake(this.primaryKey);

        let sql = `UPDATE ${this.tableName} SET ${setClause}, updated_at = datetime('now') WHERE ${primaryKeyColumn} = ?`;
        values.push(id);

        // Add tenant_id filter if tenant is logged in
        if (shouldFilterByTenant() && this.shouldFilterByTenant()) {
            const tenantId = getCurrentTenantId();
            if (tenantId) {
                const tenantColumn = this.tenantColumn;
                sql += ` AND ${tenantColumn} = ?`;
                values.push(tenantId);
            }
        }

        this.db.execute(sql, values);

        // Track or queue sync operation
        if (this.db.isInTransaction()) {
            // Track for later queueing after transaction commits
            BaseRepository.pendingSyncOperations.push({
                type: 'update',
                entityId: id,
                data,
                tableName: this.tableName
            });
        } else {
            // Queue immediately if not in transaction
            this.db.save();
            this.queueForSync('update', id, data);
        }
    }

    /**
     * Delete a record.
     * Uses soft delete (UPDATE SET deleted_at) when table has deleted_at column;
     * otherwise uses hard delete (DELETE FROM).
     */
    delete(id: string): void {
        const primaryKeyColumn = camelToSnake(this.primaryKey);
        const tenantFilter = shouldFilterByTenant() && this.shouldFilterByTenant();
        const tenantId = tenantFilter ? getCurrentTenantId() : null;

        if (this.tableSupportsSoftDelete()) {
            // Soft delete: set deleted_at timestamp
            let sql = `UPDATE ${this.tableName} SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE ${primaryKeyColumn} = ?`;
            const params: any[] = [id];
            if (tenantId) {
                sql += ` AND tenant_id = ?`;
                params.push(tenantId);
            }
            this.db.execute(sql, params);
        } else {
            // Hard delete for tables without deleted_at (e.g. users, metadata)
            let sql = `DELETE FROM ${this.tableName} WHERE ${primaryKeyColumn} = ?`;
            const params: any[] = [id];
            if (tenantId) {
                sql += ` AND tenant_id = ?`;
                params.push(tenantId);
            }
            this.db.execute(sql, params);
        }

        // Track or queue sync operation
        if (this.db.isInTransaction()) {
            // Track for later queueing after transaction commits
            BaseRepository.pendingSyncOperations.push({
                type: 'delete',
                entityId: id,
                data: null,
                tableName: this.tableName
            });
        } else {
            // Queue immediately if not in transaction
            this.db.save();
            this.queueForSync('delete', id, null);
        }
    }

    /**
     * Delete all records (filtered by tenant if tenant is logged in)
     */
    deleteAll(): void {
        if (shouldFilterByTenant() && this.shouldFilterByTenant()) {
            const tenantId = getCurrentTenantId();
            if (tenantId) {
                const tenantColumn = this.tenantColumn;
                this.db.execute(`DELETE FROM ${this.tableName} WHERE ${tenantColumn} = ?`, [tenantId]);
            } else {
                this.db.execute(`DELETE FROM ${this.tableName}`);
            }
        } else {
            this.db.execute(`DELETE FROM ${this.tableName}`);
        }
        if (!this.db.isInTransaction()) {
            this.db.save();
        }
    }

    /**
     * Delete all records without tenant filtering
     * Used when switching tenants to ensure clean state
     */
    deleteAllUnfiltered(): void {
        this.db.execute(`DELETE FROM ${this.tableName}`);
        if (!this.db.isInTransaction()) {
            this.db.save();
        }
    }

    /**
     * Count records
     * Tenant isolation: if table is tenant-scoped but no tenant in context, return 0.
     */
    count(): number {
        // Check if database is ready before querying
        if (!this.db.isReady()) {
            // Return 0 silently if database not ready (avoids console warnings during initialization)
            return 0;
        }
        if (this.shouldFilterByTenant() && !getCurrentTenantId()) {
            return 0;
        }
        let sql = `SELECT COUNT(*) as count FROM ${this.tableName}`;
        const params: any[] = [];

        // Add tenant_id filter if tenant is logged in
        if (shouldFilterByTenant() && this.shouldFilterByTenant()) {
            const tenantId = getCurrentTenantId();
            if (tenantId) {
                const tenantColumn = this.tenantColumn;
                sql += ` WHERE ${tenantColumn} = ?`;
                params.push(tenantId);
            }
        }
        // Exclude soft-deleted records when table supports it
        if (this.tableSupportsSoftDelete()) {
            sql += (params.length > 0 ? ' AND' : ' WHERE') + ` (deleted_at IS NULL OR deleted_at = '')`;
        }

        const results = this.db.query<{ count: number }>(sql, params);
        return results[0]?.count || 0;
    }

    /**
     * Queue operation for sync to cloud (desktop only)
     * Skips queueing if sync queueing is disabled (e.g., when syncing from cloud)
     */
    private queueForSync(type: 'create' | 'update' | 'delete', entityId: string, data: any): void {
        // Only queue on desktop (mobile uses cloud directly)
        if (isMobileDevice()) {
            return;
        }

        // Skip queueing if disabled (e.g., when syncing FROM cloud TO local)
        if (BaseRepository.syncQueueingDisabled) {
            console.debug(`[BaseRepository] Skipping sync queue for ${this.tableName}:${entityId} (sync queueing disabled - syncing from cloud)`);
            return;
        }

        try {
            // Single source of truth: sync_outbox (persistent, durable). SyncManager queue deprecated.
            const tenantId = getCurrentTenantId();
            const userId = getCurrentUserId();
            if (tenantId && this.db.isReady()) {
                const outbox = getSyncOutboxService();
                outbox.enqueue(tenantId, this.tableName, type, entityId, data || {}, userId ?? undefined);
                console.log(`[BaseRepository] ✅ Queued to outbox: ${type} ${this.tableName}:${entityId}`);
            }
        } catch (error) {
            console.debug(`[BaseRepository] Failed to queue sync for ${this.tableName}:${entityId}:`, error);
        }
    }

    /**
     * Check if record exists
     */
    exists(id: string): boolean {
        // Check if database is ready before querying
        if (!this.db.isReady()) {
            // Return false silently if database not ready (avoids console warnings during initialization)
            return false;
        }

        const primaryKeyColumn = camelToSnake(this.primaryKey);
        let sql = `SELECT COUNT(*) as count FROM ${this.tableName} WHERE ${primaryKeyColumn} = ?`;
        const params: any[] = [id];
        if (this.tableSupportsSoftDelete()) {
            sql += ` AND (deleted_at IS NULL OR deleted_at = '')`;
        }
        const results = this.db.query<{ count: number }>(sql, params);
        return (results[0]?.count || 0) > 0;
    }

    /**
     * Save all records (delete existing and insert new)
     * For tables with UNIQUE constraints (like users), use INSERT OR REPLACE
     */
    saveAll(records: T[]): void {
        try {
            // For certain tables, use INSERT OR REPLACE
            // This prevents UNIQUE constraint violations when saving the same records multiple times
            // and avoids cross-tenant collisions for system IDs (e.g., sys-acc-*, sys-cat-*)
            const useInsertOrReplace = this.tableName === 'users'
                || this.tableName === 'salary_components'
                || this.tableName === 'invoices'
                || this.tableName === 'bills'
                || this.tableName === 'accounts'
                || this.tableName === 'categories'
                || this.tableName === 'buildings'
                || this.tableName === 'projects'
                || this.tableName === 'properties'
                || this.tableName === 'units'
                || this.tableName === 'contacts'
                || this.tableName === 'inventory_items'
                || this.tableName === 'warehouses'
                || this.tableName === 'sales_returns'
                || this.tableName === 'vendors'
                || this.tableName === 'purchase_bills'
                || this.tableName === 'purchase_bill_items'
                || this.tableName === 'purchase_bill_payments'
                || this.tableName === 'shop_config'
                || this.tableName === 'shop_sales'
                || this.tableName === 'shop_sale_items'
                || this.tableName === 'inventory_stock'
                || this.tableName === 'transactions';

            if (useInsertOrReplace) {
                // For users, use INSERT OR REPLACE instead of DELETE + INSERT
                // This handles UNIQUE constraint on (tenant_id, username) gracefully
                if (records.length > 0) {
                    records.forEach((record, index) => {
                        try {
                            this.insertOrReplace(record);
                        } catch (insertError) {
                            console.error(`❌ Error inserting/replacing record ${index} into ${this.tableName}:`, insertError);
                            console.error('Failed record:', record);
                            throw insertError; // Re-throw to stop the process and rollback transaction
                        }
                    });
                    console.log(`✅ Completed inserting/replacing ${records.length} records to ${this.tableName}`);
                } else {
                    // When saving 0 records, delete to match desired state. FKs are disabled during
                    // saveState transaction, so we can safely delete in dependency order.
                    if (shouldFilterByTenant() && this.shouldFilterByTenant()) {
                        const tenantId = getCurrentTenantId();
                        if (tenantId) {
                            const tenantColumn = this.tenantColumn;
                            this.db.execute(`DELETE FROM ${this.tableName} WHERE ${tenantColumn} = ?`, [tenantId]);
                        } else {
                            // IMPORTANT: If we are supposed to filter by tenant but NO tenant is in context,
                            // we MUST NOT perform a global delete. This prevents accidental data loss
                            // during app loading or when session expires.
                            console.warn(`[BaseRepository] Skipping DELETE for ${this.tableName}: no tenantId in context`);
                        }
                    } else {
                        this.db.execute(`DELETE FROM ${this.tableName}`);
                    }
                }
            } else {
                // For other tables, use the original DELETE + INSERT approach
                if (shouldFilterByTenant() && this.shouldFilterByTenant()) {
                    const tenantId = getCurrentTenantId();
                    if (tenantId) {
                        const tenantColumn = this.tenantColumn;
                        this.db.execute(`DELETE FROM ${this.tableName} WHERE ${tenantColumn} = ?`, [tenantId]);
                    } else {
                        // Avoid global delete if no tenant context
                        console.warn(`[BaseRepository] Skipping global DELETE for ${this.tableName}: no tenantId in context`);
                    }
                } else {
                    this.db.execute(`DELETE FROM ${this.tableName}`);
                }

                if (records.length > 0) {
                    records.forEach((record, index) => {
                        try {
                            this.insert(record);
                        } catch (insertError) {
                            console.error(`❌ Error inserting record ${index} into ${this.tableName}:`, insertError);
                            console.error('Failed record:', record);
                            throw insertError; // Re-throw to stop the process and rollback transaction
                        }
                    });
                }
            }
        } catch (error) {
            console.error(`❌ Error saving records to ${this.tableName}:`, error);
            console.error(`Failed to save ${records.length} records to ${this.tableName}`);
            throw error; // Re-throw so caller knows save failed and transaction can rollback
        }
    }

    /**
     * Insert or replace a record (handles UNIQUE constraints gracefully)
     */
    private insertOrReplace(data: T): void {
        try {
            // Convert camelCase to snake_case for database
            const dbData = objectToDbFormat(data as Record<string, any>);
            const columnsSet = this.ensureTableColumns();

            // If column set is empty and DB wasn't ready, this is a race condition.
            if (columnsSet.size === 0 && !this.db.isReady()) {
                console.warn(`⚠️ [${this.tableName}] Columns empty & DB not ready during insertOrReplace - will skip this record gracefully`);
                throw new Error(`Database not ready for ${this.tableName} insertOrReplace - will retry on next sync`);
            }

            // Add tenant_id if needed
            if (shouldFilterByTenant() && this.shouldFilterByTenant()) {
                const tenantId = getCurrentTenantId();
                if (tenantId) {
                    const tenantColumn = this.tenantColumn;
                    if (!dbData[tenantColumn] && columnsSet.has(tenantColumn)) {
                        dbData[tenantColumn] = tenantId;
                    }
                }
            }

            // Add user_id if needed
            if (shouldTrackUserId() && columnsSet.has('user_id')) {
                const userId = getCurrentUserId();
                if (userId && !dbData['user_id']) {
                    dbData['user_id'] = userId;
                }
            }

            const keys = Object.keys(dbData)
                .filter(k => dbData[k] !== undefined && columnsSet.has(k));
            const values = keys.map(k => dbData[k]);
            const placeholders = keys.map(() => '?').join(', ');
            const columns = keys.join(', ');

            if (keys.length === 0) {
                const errorMsg = `No valid columns to insert for ${this.tableName}. Available columns: ${Array.from(columnsSet).join(', ')}, Data keys after conversion: ${Object.keys(dbData).join(', ')}`;
                console.error(`❌ ${errorMsg}`);
                console.error('Original data:', data);
                console.error('Converted data:', dbData);
                throw new Error(errorMsg);
            }

            try {
                // Use INSERT OR REPLACE to handle UNIQUE constraints
                this.db.execute(
                    `INSERT OR REPLACE INTO ${this.tableName} (${columns}) VALUES (${placeholders})`,
                    values
                );

                // Track or queue sync operation
                const entityId = (data as any)?.id || (dbData as any)?.id;
                if (entityId) {
                    if (this.db.isInTransaction()) {
                        // Track for later queueing after transaction commits
                        BaseRepository.pendingSyncOperations.push({
                            type: 'create',
                            entityId,
                            data,
                            tableName: this.tableName
                        });
                    } else {
                        // Queue immediately if not in transaction
                        this.db.save();
                        this.queueForSync('create', entityId, data);
                    }
                } else if (!this.db.isInTransaction()) {
                    this.db.save();
                }
            } catch (executeError: any) {
                const errorMsg = (executeError?.message || String(executeError)).toLowerCase();
                console.error(`❌ SQL execution error for ${this.tableName}:`, executeError);
                console.error(`SQL: INSERT OR REPLACE INTO ${this.tableName} (${columns}) VALUES (${placeholders})`);
                console.error(`Values:`, values);

                if (errorMsg.includes('no transaction') || errorMsg.includes('transaction')) {
                    console.error('⚠️ Transaction may have been auto-rolled back by sql.js');
                }

                throw executeError;
            }
        } catch (error) {
            console.error(`❌ Error inserting/replacing into ${this.tableName}:`, error);
            console.error('Data:', data);
            throw error;
        }
    }
}
