/**
 * Base Repository
 * 
 * Provides common CRUD operations for all repositories.
 */

import { getDatabaseService } from '../databaseService';
import { objectToDbFormat, dbToObjectFormat, camelToSnake } from '../columnMapper';

export abstract class BaseRepository<T> {
    protected tableName: string;
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
     * Find all records with options
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

        let sql = `SELECT * FROM ${this.tableName}`;
        if (condition) {
            sql += ` WHERE ${condition}`;
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

        const results = this.db.query<Record<string, any>>(sql, params);
        return results.map(row => dbToObjectFormat<T>(row));
    }

    /**
     * Find by primary key
     */
    findById(id: string): T | null {
        const results = this.db.query<Record<string, any>>(
            `SELECT * FROM ${this.tableName} WHERE ${camelToSnake(this.primaryKey)} = ?`,
            [id]
        );
        return results.length > 0 ? dbToObjectFormat<T>(results[0]) : null;
    }

    /**
     * Find by condition
     */
    findBy(condition: string, params: any[] = []): T[] {
        const results = this.db.query<Record<string, any>>(
            `SELECT * FROM ${this.tableName} WHERE ${condition}`,
            params
        );
        return results.map(row => dbToObjectFormat<T>(row));
    }

    /**
     * Lazily load table columns to filter out non-existent fields
     */
    private ensureTableColumns(): Set<string> {
        // Always refresh column cache to ensure we have latest columns after schema changes
        // This is critical - if columns are added after cache is created, we need fresh data
        const rows = this.db.query<{ name: string }>(`PRAGMA table_info(${this.tableName})`);
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
            const columnsSet = this.ensureTableColumns();

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
        const keys = Object.keys(dbData)
            .filter(k => dbData[k] !== undefined && columnsSet.has(k));
        const setClause = keys.map(k => `${k} = ?`).join(', ');
        const values = keys.map(k => dbData[k]);
        const primaryKeyColumn = camelToSnake(this.primaryKey);
        values.push(id);

        this.db.execute(
            `UPDATE ${this.tableName} SET ${setClause}, updated_at = datetime('now') WHERE ${primaryKeyColumn} = ?`,
            values
        );
        if (!this.db.isInTransaction()) {
            this.db.save();
        }
    }

    /**
     * Delete a record
     */
    delete(id: string): void {
        const primaryKeyColumn = camelToSnake(this.primaryKey);
        this.db.execute(
            `DELETE FROM ${this.tableName} WHERE ${primaryKeyColumn} = ?`,
            [id]
        );
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
     * Count records
     */
    count(): number {
        const results = this.db.query<{ count: number }>(
            `SELECT COUNT(*) as count FROM ${this.tableName}`
        );
        return results[0]?.count || 0;
    }

    /**
     * Check if record exists
     */
    exists(id: string): boolean {
        const primaryKeyColumn = camelToSnake(this.primaryKey);
        const results = this.db.query<{ count: number }>(
            `SELECT COUNT(*) as count FROM ${this.tableName} WHERE ${primaryKeyColumn} = ?`,
            [id]
        );
        return (results[0]?.count || 0) > 0;
    }

    /**
     * Save all records (delete existing and insert new)
     */
    saveAll(records: T[]): void {
        try {
            console.log(`🔄 saveAll called for ${this.tableName} with ${records.length} records`);

            // Delete all existing records
            this.db.execute(`DELETE FROM ${this.tableName}`);
            console.log(`🗑️ Deleted all existing records from ${this.tableName}`);

            // Insert all new records
            if (records.length > 0) {
                console.log(`📥 Starting to insert ${records.length} records into ${this.tableName}`);
                records.forEach((record, index) => {
                    try {
                        console.log(`  → Inserting record ${index + 1}/${records.length} into ${this.tableName}`);
                        this.insert(record);
                        console.log(`  ✅ Successfully inserted record ${index + 1} into ${this.tableName}`);
                    } catch (insertError) {
                        console.error(`❌ Error inserting record ${index} into ${this.tableName}:`, insertError);
                        console.error('Failed record:', record);
                        throw insertError; // Re-throw to stop the process and rollback transaction
                    }
                });

                // Log successful save (for debugging)
                console.log(`✅ Completed inserting ${records.length} records to ${this.tableName}`);

                // Verify the save for contacts (after transaction commits)
                if (this.tableName === 'contacts' && records.length > 0) {
                    // Note: Verification happens after transaction commits in appStateRepository
                    // This is just a log to track the save operation
                    console.log(`📝 Contact save completed: ${records.length} contacts processed`);
                }
            } else {
                console.log(`📦 ${this.tableName} table cleared (no records to save)`);
            }
        } catch (error) {
            console.error(`❌ Error saving records to ${this.tableName}:`, error);
            console.error(`Failed to save ${records.length} records to ${this.tableName}`);
            throw error; // Re-throw so caller knows save failed and transaction can rollback
        }
    }
}
