/**
 * Base Repository
 *
 * Provides common CRUD operations for all repositories.
 * Single-tenant, local-only SQLite architecture -- no tenant filtering,
 * no sync queueing, no cloud outbox.
 */

import { getDatabaseService } from '../databaseService';
import { objectToDbFormat, dbToObjectFormat, camelToSnake } from '../columnMapper';
import { getCurrentUserId, shouldTrackUserId } from '../userUtils';

export interface SqlOp {
    type: 'query' | 'run';
    sql: string;
    params?: unknown[];
}

export abstract class BaseRepository<T> {
    readonly tableName: string;
    protected primaryKey: string;
    private tableColumns: Set<string> | null = null;

    constructor(tableName: string, primaryKey: string = 'id') {
        this.tableName = tableName;
        this.primaryKey = primaryKey;
    }

    protected get db() {
        return getDatabaseService();
    }

    /**
     * Check if this table supports soft delete (has deleted_at column).
     */
    tableSupportsSoftDelete(): boolean {
        const columnsSet = this.ensureTableColumns();
        return columnsSet.has('deleted_at');
    }

    private softDeleteFilter(): { sql: string; params: any[] } {
        if (!this.tableSupportsSoftDelete()) return { sql: '', params: [] };
        return { sql: ' AND (deleted_at IS NULL OR deleted_at = \'\')', params: [] };
    }

    /** Large columns excluded from list queries by default. */
    private static readonly HEAVY_COLUMNS = new Set([
        'file_data', 'items', 'payload_json',
        'salary', 'adjustments', 'projects',
    ]);

    private static readonly DEFAULT_LIMIT = 50_000;

    /**
     * Build a column-selection clause, excluding heavy columns when requested.
     */
    buildSelectColumns(excludeHeavy: boolean): string {
        if (!excludeHeavy) return '*';
        const columnsSet = this.ensureTableColumns();
        if (columnsSet.size === 0) return '*';
        const selected = Array.from(columnsSet).filter(c => !BaseRepository.HEAVY_COLUMNS.has(c));
        return selected.length > 0 ? selected.join(', ') : '*';
    }

    /**
     * Find all records with options.
     * When soft delete is supported, excludes deleted records.
     */
    findAll(options: {
        limit?: number;
        offset?: number;
        orderBy?: string;
        orderDir?: 'ASC' | 'DESC';
        condition?: string;
        params?: any[];
        excludeHeavyColumns?: boolean;
    } = {}): T[] {
        const { limit, offset, orderBy, orderDir = 'DESC', condition, params = [], excludeHeavyColumns = false } = options;

        const cols = this.buildSelectColumns(excludeHeavyColumns);
        let sql = `SELECT ${cols} FROM ${this.tableName}`;
        const whereConditions: string[] = [];
        const whereParams: any[] = [];

        if (condition) {
            whereConditions.push(condition);
            whereParams.push(...params);
        }

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

        const effectiveLimit = limit ?? BaseRepository.DEFAULT_LIMIT;
        sql += ` LIMIT ${effectiveLimit}`;

        if (offset !== undefined) {
            sql += ` OFFSET ${offset}`;
        }

        const results = this.db.query<Record<string, any>>(sql, whereParams);
        return results.map(row => dbToObjectFormat<T>(row));
    }

    /**
     * Find by primary key
     */
    findById(id: string): T | null {
        const cols = this.buildSelectColumns(false);
        let sql = `SELECT ${cols} FROM ${this.tableName} WHERE ${camelToSnake(this.primaryKey)} = ?`;
        const params: any[] = [id];

        const softFilter = this.softDeleteFilter();
        if (softFilter.sql) {
            sql += ` AND (deleted_at IS NULL OR deleted_at = '')`;
        }

        const results = this.db.query<Record<string, any>>(sql, params);
        return results.length > 0 ? dbToObjectFormat<T>(results[0]) : null;
    }

    /**
     * Find by condition
     */
    findBy(condition: string, params: any[] = []): T[] {
        const cols = this.buildSelectColumns(false);
        let sql = `SELECT ${cols} FROM ${this.tableName} WHERE ${condition}`;
        const queryParams = [...params];

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
        if (!this.db.isReady()) {
            try {
                this.db.initialize().catch(() => { });
            } catch {
                // Ignore
            }
            if (!this.db.isReady()) {
                return new Set();
            }
        }

        const tableExists = this.db.query<{ name: string }>(
            `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
            [this.tableName]
        );

        if (tableExists.length === 0) {
            try {
                this.db.ensureAllTablesExist();
                const tableExistsAfter = this.db.query<{ name: string }>(
                    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
                    [this.tableName]
                );
                if (tableExistsAfter.length === 0) {
                    if (this.db.isReady()) {
                        console.error(`Table ${this.tableName} still does not exist after ensureAllTablesExist()`);
                    }
                    return new Set();
                }
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                if (msg.includes('No database open')) {
                    (this.db as { invalidateConnection?: () => void }).invalidateConnection?.();
                } else if (this.db.isReady()) {
                    console.error(`Error ensuring table ${this.tableName} exists:`, error);
                }
                return new Set();
            }
        }

        const rows = this.db.query<{ name: string }>(`PRAGMA table_info(${this.tableName})`);
        if (rows.length === 0) {
            return new Set();
        }

        this.tableColumns = new Set(rows.map(r => r.name));
        return this.tableColumns;
    }

    clearColumnCache(): void {
        this.tableColumns = null;
    }

    /**
     * Insert a new record.
     * Automatically sets tenant_id to 'local' if column exists.
     */
    insert(data: Partial<T>): void {
        try {
            const dbData = objectToDbFormat(data as Record<string, any>);
            const columnsSet = this.ensureTableColumns();

            if (columnsSet.size === 0 && !this.db.isReady()) {
                throw new Error(`Database not ready for ${this.tableName} insert`);
            }

            // Always set tenant_id to 'local' for compatibility
            if (columnsSet.has('tenant_id') && !dbData['tenant_id']) {
                dbData['tenant_id'] = 'local';
            }

            const keys = Object.keys(dbData)
                .filter(k => dbData[k] !== undefined && columnsSet.has(k));
            const values = keys.map(k => dbData[k]);
            const placeholders = keys.map(() => '?').join(', ');
            const columns = keys.join(', ');

            if (keys.length === 0) {
                const errorMsg = `No valid columns to insert for ${this.tableName}. Available columns: ${Array.from(columnsSet).join(', ')}, Data keys: ${Object.keys(dbData).join(', ')}`;
                console.error(errorMsg);
                throw new Error(errorMsg);
            }

            this.db.execute(
                `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders})`,
                values
            );

            if (!this.db.isInTransaction()) {
                this.db.save();
            }
        } catch (error) {
            console.error(`Error inserting into ${this.tableName}:`, error);
            throw error;
        }
    }

    /**
     * Update a record
     */
    update(id: string, data: Partial<T>): void {
        const dbData = objectToDbFormat(data as Record<string, any>);
        const columnsSet = this.ensureTableColumns();

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

        let sql: string;
        if (columnsSet.has('updated_at')) {
            sql = `UPDATE ${this.tableName} SET ${setClause}, updated_at = datetime('now') WHERE ${primaryKeyColumn} = ?`;
        } else {
            sql = `UPDATE ${this.tableName} SET ${setClause} WHERE ${primaryKeyColumn} = ?`;
        }
        values.push(id);

        this.db.execute(sql, values);

        if (!this.db.isInTransaction()) {
            this.db.save();
        }
    }

    /**
     * Delete a record.
     * Uses soft delete when table has deleted_at column; otherwise hard delete.
     */
    delete(id: string): void {
        const primaryKeyColumn = camelToSnake(this.primaryKey);

        if (this.tableSupportsSoftDelete()) {
            const columnsSet = this.ensureTableColumns();
            const updatedAtClause = columnsSet.has('updated_at') ? ", updated_at = datetime('now')" : '';
            const sql = `UPDATE ${this.tableName} SET deleted_at = datetime('now')${updatedAtClause} WHERE ${primaryKeyColumn} = ?`;
            this.db.execute(sql, [id]);
        } else {
            const sql = `DELETE FROM ${this.tableName} WHERE ${primaryKeyColumn} = ?`;
            this.db.execute(sql, [id]);
        }

        if (!this.db.isInTransaction()) {
            this.db.save();
        }
    }

    /**
     * Delete all records
     */
    deleteAll(): void {
        this.db.execute(`DELETE FROM ${this.tableName}`);
        if (!this.db.isInTransaction()) {
            this.db.save();
        }
    }

    /**
     * Delete all records (alias kept for compatibility)
     */
    deleteAllUnfiltered(): void {
        this.deleteAll();
    }

    /**
     * Count records
     */
    count(): number {
        if (!this.db.isReady()) {
            return 0;
        }
        let sql = `SELECT COUNT(*) as count FROM ${this.tableName}`;
        if (this.tableSupportsSoftDelete()) {
            sql += ` WHERE (deleted_at IS NULL OR deleted_at = '')`;
        }
        const results = this.db.query<{ count: number }>(sql);
        return results[0]?.count || 0;
    }

    /**
     * Check if record exists
     */
    exists(id: string): boolean {
        if (!this.db.isReady()) {
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
     * Save all records (upsert + orphan cleanup).
     * IMPORTANT: when records is empty we do NOT delete existing rows.
     * An empty in-memory array usually means the state hasn't been loaded yet
     * (e.g. app just started), not that the user deleted everything.
     * Explicit deletion uses deleteAll() instead.
     */
    saveAll(records: T[], options: { skipOrphanCleanup?: boolean } = {}): void {
        if (records.length === 0) {
            return;
        }

        try {
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
                || this.tableName === 'inventory_stock'
                || this.tableName === 'transactions'
                || this.tableName === 'project_agreements'
                || this.tableName === 'rental_agreements'
                || this.tableName === 'contracts'
                || this.tableName === 'quotations'
                || this.tableName === 'budgets'
                || this.tableName === 'documents'
                || this.tableName === 'pm_cycle_allocations'
                || this.tableName === 'recurring_invoice_templates'
                || this.tableName === 'installment_plans'
                || this.tableName === 'plan_amenities'
                || this.tableName === 'project_received_assets'
                || this.tableName === 'personal_categories'
                || this.tableName === 'personal_transactions';

            if (useInsertOrReplace) {
                const columnsSet = this.ensureTableColumns();
                if (columnsSet.size === 0) return;

                // Use ALL table columns as the fixed key set so INSERT OR REPLACE
                // never omits a column and silently nullifies existing data.
                const allTableKeys = Array.from(columnsSet);

                const BATCH_SIZE = 100;
                for (let i = 0; i < records.length; i += BATCH_SIZE) {
                    const batch = records.slice(i, i + BATCH_SIZE);

                    const columns = allTableKeys.join(', ');
                    const singlePlaceholder = `(${allTableKeys.map(() => '?').join(', ')})`;

                    const allValues: unknown[] = [];
                    const placeholders: string[] = [];
                    for (const record of batch) {
                        const prepared = this.prepareRecordForDb(record, columnsSet, allTableKeys);
                        if (!prepared) continue;
                        allValues.push(...prepared.values);
                        placeholders.push(singlePlaceholder);
                    }

                    if (placeholders.length > 0) {
                        this.db.execute(
                            `INSERT OR REPLACE INTO ${this.tableName} (${columns}) VALUES ${placeholders.join(', ')}`,
                            allValues
                        );
                    }
                }

                if (!options.skipOrphanCleanup) {
                    const primaryKeyColumn = camelToSnake(this.primaryKey);
                    const idsToKeep = new Set(
                        records.map(r => {
                            const rec = r as Record<string, any>;
                            return rec[this.primaryKey] || rec.id;
                        }).filter(Boolean)
                    );

                    const existing = this.db.query<Record<string, any>>(
                        `SELECT ${primaryKeyColumn} as _pk FROM ${this.tableName}`,
                        []
                    );

                    const idsToDelete = existing
                        .map(row => row._pk as string)
                        .filter(id => !idsToKeep.has(id));

                    if (idsToDelete.length > 0) {
                        const BATCH = 500;
                        for (let i = 0; i < idsToDelete.length; i += BATCH) {
                            const batch = idsToDelete.slice(i, i + BATCH);
                            const placeholders = batch.map(() => '?').join(',');
                            this.db.execute(
                                `DELETE FROM ${this.tableName} WHERE ${primaryKeyColumn} IN (${placeholders})`,
                                batch
                            );
                        }
                    }
                }
            } else {
                this.db.execute(`DELETE FROM ${this.tableName}`);
                const columnsSet = this.ensureTableColumns();
                if (columnsSet.size === 0) return;

                const allTableKeys = Array.from(columnsSet);
                const BATCH_SIZE = 100;
                for (let i = 0; i < records.length; i += BATCH_SIZE) {
                    const batch = records.slice(i, i + BATCH_SIZE);

                    const columns = allTableKeys.join(', ');
                    const singlePlaceholder = `(${allTableKeys.map(() => '?').join(', ')})`;

                    const allValues: unknown[] = [];
                    const placeholders: string[] = [];
                    for (const record of batch) {
                        const prepared = this.prepareRecordForDb(record, columnsSet, allTableKeys);
                        if (!prepared) continue;
                        allValues.push(...prepared.values);
                        placeholders.push(singlePlaceholder);
                    }

                    if (placeholders.length > 0) {
                        this.db.execute(
                            `INSERT INTO ${this.tableName} (${columns}) VALUES ${placeholders.join(', ')}`,
                            allValues
                        );
                    }
                }
            }
        } catch (error) {
            console.error(`Error saving records to ${this.tableName}:`, error);
            throw error;
        }
    }

    /**
     * Build SQL operations for a batch of records suitable for async transactionAsync.
     * Uses multi-row INSERT OR REPLACE for dramatically fewer IPC round-trips.
     * @param records - Records to upsert
     * @param options - skipOrphanCleanup: skip SELECT+DELETE of orphaned rows
     */
    buildSaveAllOps(records: T[], options: { skipOrphanCleanup?: boolean } = {}): SqlOp[] {
        if (records.length === 0) return [];
        const ops: SqlOp[] = [];
        const columnsSet = this.ensureTableColumns();
        if (columnsSet.size === 0) return [];

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
            || this.tableName === 'inventory_stock'
            || this.tableName === 'transactions'
            || this.tableName === 'project_agreements'
            || this.tableName === 'rental_agreements'
            || this.tableName === 'contracts'
            || this.tableName === 'quotations'
            || this.tableName === 'budgets'
            || this.tableName === 'documents'
            || this.tableName === 'pm_cycle_allocations'
            || this.tableName === 'recurring_invoice_templates'
            || this.tableName === 'installment_plans'
            || this.tableName === 'plan_amenities'
            || this.tableName === 'project_received_assets'
            || this.tableName === 'personal_categories'
            || this.tableName === 'personal_transactions';

        if (useInsertOrReplace) {
            ops.push(...this.buildBatchInsertOrReplaceOps(records, columnsSet));

            if (!options.skipOrphanCleanup) {
                const primaryKeyColumn = camelToSnake(this.primaryKey);
                const idsToKeep = new Set(
                    records.map(r => {
                        const rec = r as Record<string, any>;
                        return rec[this.primaryKey] || rec.id;
                    }).filter(Boolean)
                );
                ops.push({ type: 'query', sql: `SELECT ${primaryKeyColumn} as _pk FROM ${this.tableName}`, params: [] });
            }
        } else {
            ops.push({ type: 'run', sql: `DELETE FROM ${this.tableName}`, params: [] });
            ops.push(...this.buildBatchInsertOps(records, columnsSet));
        }
        return ops;
    }

    /**
     * Public wrapper for buildBatchInsertOrReplaceOps for use by AppStateRepository.
     */
    buildBatchInsertOrReplaceOps_public(records: T[]): SqlOp[] {
        const columnsSet = this.ensureTableColumns();
        if (columnsSet.size === 0) return [];
        return this.buildBatchInsertOrReplaceOps(records, columnsSet);
    }

    /**
     * Build multi-row INSERT OR REPLACE statements in batches of up to 100 rows.
     */
    private buildBatchInsertOrReplaceOps(records: T[], columnsSet: Set<string>): SqlOp[] {
        const ops: SqlOp[] = [];
        const allTableKeys = Array.from(columnsSet);
        const BATCH_SIZE = 100;

        for (let i = 0; i < records.length; i += BATCH_SIZE) {
            const batch = records.slice(i, i + BATCH_SIZE);
            const columns = allTableKeys.join(', ');
            const singlePlaceholder = `(${allTableKeys.map(() => '?').join(', ')})`;

            const allValues: unknown[] = [];
            const placeholders: string[] = [];
            for (const record of batch) {
                const prepared = this.prepareRecordForDb(record, columnsSet, allTableKeys);
                if (!prepared) continue;
                allValues.push(...prepared.values);
                placeholders.push(singlePlaceholder);
            }

            if (placeholders.length > 0) {
                ops.push({
                    type: 'run',
                    sql: `INSERT OR REPLACE INTO ${this.tableName} (${columns}) VALUES ${placeholders.join(', ')}`,
                    params: allValues,
                });
            }
        }
        return ops;
    }

    /**
     * Build multi-row INSERT statements in batches.
     */
    private buildBatchInsertOps(records: T[], columnsSet: Set<string>): SqlOp[] {
        const ops: SqlOp[] = [];
        const allTableKeys = Array.from(columnsSet);
        const BATCH_SIZE = 100;

        for (let i = 0; i < records.length; i += BATCH_SIZE) {
            const batch = records.slice(i, i + BATCH_SIZE);
            const columns = allTableKeys.join(', ');
            const singlePlaceholder = `(${allTableKeys.map(() => '?').join(', ')})`;

            const allValues: unknown[] = [];
            const placeholders: string[] = [];
            for (const record of batch) {
                const prepared = this.prepareRecordForDb(record, columnsSet, allTableKeys);
                if (!prepared) continue;
                allValues.push(...prepared.values);
                placeholders.push(singlePlaceholder);
            }

            if (placeholders.length > 0) {
                ops.push({
                    type: 'run',
                    sql: `INSERT INTO ${this.tableName} (${columns}) VALUES ${placeholders.join(', ')}`,
                    params: allValues,
                });
            }
        }
        return ops;
    }

    /**
     * Prepare a single record for database insertion.
     * Returns the column keys and corresponding values.
     * If fixedKeys is given, uses those keys (for multi-row batching consistency).
     */
    private prepareRecordForDb(data: T, columnsSet: Set<string>, fixedKeys?: string[]): { keys: string[]; values: unknown[] } | null {
        const dbData = objectToDbFormat(data as Record<string, any>);

        if (columnsSet.has('tenant_id') && !dbData['tenant_id']) {
            dbData['tenant_id'] = 'local';
        }

        if (shouldTrackUserId() && columnsSet.has('user_id')) {
            const userId = getCurrentUserId();
            if (userId && !dbData['user_id']) {
                dbData['user_id'] = userId;
            }
        }

        const keys = fixedKeys ?? Object.keys(dbData).filter(k => dbData[k] !== undefined && columnsSet.has(k));
        if (keys.length === 0) return null;

        const values = keys.map(k => dbData[k] !== undefined ? dbData[k] : null);
        return { keys, values };
    }

    /**
     * Insert or replace a record (handles UNIQUE constraints gracefully)
     */
    private insertOrReplace(data: T): void {
        try {
            const dbData = objectToDbFormat(data as Record<string, any>);
            const columnsSet = this.ensureTableColumns();

            if (columnsSet.size === 0 && !this.db.isReady()) {
                throw new Error(`Database not ready for ${this.tableName} insertOrReplace`);
            }

            // Always set tenant_id to 'local' for compatibility
            if (columnsSet.has('tenant_id') && !dbData['tenant_id']) {
                dbData['tenant_id'] = 'local';
            }

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
                const errorMsg = `No valid columns to insert for ${this.tableName}. Available columns: ${Array.from(columnsSet).join(', ')}, Data keys: ${Object.keys(dbData).join(', ')}`;
                console.error(errorMsg);
                throw new Error(errorMsg);
            }

            this.db.execute(
                `INSERT OR REPLACE INTO ${this.tableName} (${columns}) VALUES (${placeholders})`,
                values
            );

            if (!this.db.isInTransaction()) {
                this.db.save();
            }
        } catch (error) {
            console.error(`Error inserting/replacing into ${this.tableName}:`, error);
            throw error;
        }
    }
}
