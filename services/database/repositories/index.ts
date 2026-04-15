/**
 * Repository Index
 * 
 * Exports all repository classes for easy importing.
 */

import { BaseRepository } from './baseRepository';
export { BaseRepository } from './baseRepository';
import { getNativeDatabaseService } from '../nativeDatabaseService';
import { getDatabaseService } from '../databaseService';
import { isLocalOnlyMode } from '../../../config/apiUrl';
import { dbToObjectFormat, objectToDbFormat } from '../columnMapper';

// Entity repositories will be created below
// For now, we'll create them as needed

// Placeholder exports - these will be implemented
export class UsersRepository extends BaseRepository<any> {
    constructor() { super('users'); }
}

export class AccountsRepository extends BaseRepository<any> {
    constructor() { super('accounts'); }
}

export class ContactsRepository extends BaseRepository<any> {
    constructor() { super('contacts'); }
}

export class VendorsRepository extends BaseRepository<any> {
    constructor() { super('vendors'); }
}

export class CategoriesRepository extends BaseRepository<any> {
    constructor() { super('categories'); }
}

export class PlCategoryMappingRepository extends BaseRepository<any> {
    constructor() { super('pl_category_mapping'); }
}

export class CashflowCategoryMappingRepository extends BaseRepository<any> {
    constructor() {
        super('cashflow_category_mapping');
    }

    /** Rows for tenant (includes legacy tenant_id = '' for single-tenant SQLite). */
    findAllForTenant(tenantId: string): { accountId: string; category: string }[] {
        const rows = this.db.query<{ account_id: string; category: string }>(
            `SELECT account_id, category FROM cashflow_category_mapping WHERE tenant_id = ? OR tenant_id = ''`,
            [tenantId]
        );
        return rows.map((r) => ({ accountId: r.account_id, category: r.category }));
    }
}

export class ProjectsRepository extends BaseRepository<any> {
    constructor() { super('projects'); }
}

export class BuildingsRepository extends BaseRepository<any> {
    constructor() { super('buildings'); }
}

export class PropertiesRepository extends BaseRepository<any> {
    constructor() { super('properties'); }
}

export class PropertyOwnershipHistoryRepository extends BaseRepository<any> {
    constructor() { super('property_ownership_history'); }
}

export class PropertyOwnershipRepository extends BaseRepository<any> {
    constructor() { super('property_ownership'); }
}

export class UnitsRepository extends BaseRepository<any> {
    constructor() { super('units'); }
}



export class TransactionsRepository extends BaseRepository<any> {
    private useNativeBackend: boolean = false;
    private nativeService: any = null;

    constructor() {
        super('transactions');
        if (typeof window !== 'undefined' && !isLocalOnlyMode()) {
            this.useNativeBackend = false;
            this.nativeService = null;
            return;
        }
        // Check if native backend is available and enabled
        try {
            this.nativeService = getNativeDatabaseService();
            const isAvailable = this.nativeService.isNativeAvailable();
            if (typeof window !== 'undefined') {
                const flag = localStorage.getItem('useNativeDatabase');
                this.useNativeBackend = flag !== null ? flag === 'true' && isAvailable : isAvailable;
            } else {
                this.useNativeBackend = isAvailable;
            }
        } catch (e) {
            this.useNativeBackend = false;
        }
    }

    /**
     * Find all transactions (uses native backend if available, otherwise sql.js)
     */
    findAll(): any[] {
        if (this.useNativeBackend && this.nativeService) {
            // For native backend, we need to load in chunks
            // But findAll() expects synchronous return, so we'll use sql.js for now
            // Components should use findAllPaginated() instead
            console.warn('⚠️ findAll() called - consider using findAllPaginated() for better performance with native backend');
        }
        return super.findAll();
    }

    /**
     * Find transactions with pagination (native backend only)
     * Returns empty array if native backend not available
     */
    async findAllPaginated(params: {
        projectId?: string | null;
        vendorId?: string | null;
        limit?: number;
        offset?: number;
    } = {}): Promise<any[]> {
        if (this.useNativeBackend && this.nativeService) {
            try {
                return await this.nativeService.listTransactions({
                    projectId: params.projectId,
                    vendorId: params.vendorId,
                    limit: params.limit || 100,
                    offset: params.offset || 0,
                });
            } catch (error) {
                console.error('❌ Native backend query failed, falling back to sql.js:', error);
            }
        }

        // Fallback to sql.js with efficient SQL-level pagination
        let condition = undefined;
        let sqlParams: any[] = [];

        if (params.projectId && params.vendorId) {
            condition = 'project_id = ? AND vendor_id = ?';
            sqlParams = [params.projectId, params.vendorId];
        } else if (params.projectId) {
            condition = 'project_id = ?';
            sqlParams = [params.projectId];
        } else if (params.vendorId) {
            condition = 'vendor_id = ?';
            sqlParams = [params.vendorId];
        }

        return super.findAll({
            condition,
            params: sqlParams,
            limit: params.limit || 100,
            offset: params.offset || 0,
            orderBy: 'date',
            orderDir: 'DESC'
        });
    }

    /**
     * Get transaction totals (native backend only)
     */
    async getTotals(params: { projectId?: string | null, vendorId?: string | null } = {}): Promise<{ totalIncome: number; totalExpense: number }> {
        if (this.useNativeBackend && this.nativeService) {
            try {
                const result = await this.nativeService.getTotals(params);
                return {
                    totalIncome: result.totalIncome || 0,
                    totalExpense: result.totalExpense || 0,
                };
            } catch (error) {
                console.error('❌ Native backend totals query failed:', error);
            }
        }

        let whereClause = '';
        let sqlParams: any[] = [];

        if (params.projectId && params.vendorId) {
            whereClause = 'WHERE project_id = ? AND vendor_id = ?';
            sqlParams = [params.projectId, params.vendorId];
        } else if (params.projectId) {
            whereClause = 'WHERE project_id = ?';
            sqlParams = [params.projectId];
        } else if (params.vendorId) {
            whereClause = 'WHERE vendor_id = ?';
            sqlParams = [params.vendorId];
        }

        // Fallback: calculate from sql.js using optimized query
        const sql = `
            SELECT 
                SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) as total_income,
                SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END) as total_expense
            FROM transactions
            ${whereClause}
        `;
        const results = this.db.query<{ total_income: number; total_expense: number }>(
            sql,
            sqlParams
        );

        return {
            totalIncome: results[0]?.total_income || 0,
            totalExpense: results[0]?.total_expense || 0
        };
    }

    /**
     * Get transaction count
     */
    async getCount(params: { projectId?: string | null, vendorId?: string | null } = {}): Promise<number> {
        if (this.useNativeBackend && this.nativeService) {
            try {
                return await this.nativeService.getTransactionCount(params.projectId, params.vendorId);
            } catch (error) {
                console.error('❌ Native backend count query failed:', error);
            }
        }

        // Ensure database is ready before querying
        if (!this.db.isReady()) {
            try {
                await this.db.initialize();
            } catch (error) {
                // Database initialization failed, return 0 instead of warning
                return 0;
            }
        }

        let whereClause = '';
        let sqlParams: any[] = [];

        if (params.projectId && params.vendorId) {
            whereClause = 'WHERE project_id = ? AND vendor_id = ?';
            sqlParams = [params.projectId, params.vendorId];
        } else if (params.projectId) {
            whereClause = 'WHERE project_id = ?';
            sqlParams = [params.projectId];
        } else if (params.vendorId) {
            whereClause = 'WHERE vendor_id = ?';
            sqlParams = [params.vendorId];
        }

        // Fallback to sql.js
        const sql = `SELECT COUNT(*) as count FROM transactions ${whereClause}`;
        const results = this.db.query<{ count: number }>(sql, sqlParams);
        return results[0]?.count || 0;
    }

    /**
     * Check if native backend is enabled
     */
    isNativeEnabled(): boolean {
        const result = this.useNativeBackend && this.nativeService?.isNativeAvailable() === true;
        console.log('🔍 TransactionsRepository.isNativeEnabled():', result, {
            useNativeBackend: this.useNativeBackend,
            hasNativeService: !!this.nativeService,
            serviceIsAvailable: this.nativeService?.isNativeAvailable()
        });
        return result;
    }
}

export class InvoicesRepository extends BaseRepository<any> {
    constructor() { super('invoices'); }
}

export class BillsRepository extends BaseRepository<any> {
    constructor() { super('bills'); }
}

export class BudgetsRepository extends BaseRepository<any> {
    constructor() { super('budgets'); }
}

export class RentalAgreementsRepository extends BaseRepository<any> {
    constructor() { super('rental_agreements'); }
}

export class ProjectAgreementsRepository extends BaseRepository<any> {
    constructor() { super('project_agreements'); }
}

export class ContractsRepository extends BaseRepository<any> {
    constructor() { super('contracts'); }
}

export class InstallmentPlansRepository extends BaseRepository<any> {
    constructor() { super('installment_plans'); }
}

export class PlanAmenitiesRepository extends BaseRepository<any> {
    constructor() { super('plan_amenities'); }
}

export class RecurringTemplatesRepository extends BaseRepository<any> {
    constructor() { super('recurring_invoice_templates'); }
}


export class TransactionLogRepository extends BaseRepository<any> {
    constructor() { super('transaction_log'); }
}

export class ErrorLogRepository extends BaseRepository<any> {
    constructor() { super('error_log'); }
}


export class QuotationsRepository extends BaseRepository<any> {
    constructor() { super('quotations'); }
}

export class DocumentsRepository extends BaseRepository<any> {
    constructor() { super('documents'); }
}

export class PMCycleAllocationsRepository extends BaseRepository<any> {
    constructor() { super('pm_cycle_allocations'); }
}



export class SalesReturnsRepository extends BaseRepository<any> {
    constructor() { super('sales_returns'); }
}

export class ProjectReceivedAssetsRepository extends BaseRepository<any> {
    constructor() { super('project_received_assets'); }
}





export class ChatMessagesRepository extends BaseRepository<any> {
    constructor() {
        super('chat_messages');
    }

    /**
     * Override insert to use INSERT OR IGNORE to prevent duplicate key errors
     * Messages can arrive from both API response and WebSocket, causing duplicates
     */
    insert(data: Partial<any>): void {
        try {
            console.log(`📝 [ChatMessagesRepository] Starting insert for ${this.tableName}`);
            console.log(`📝 [ChatMessagesRepository] Database ready: ${this.db.isReady()}`);
            console.log(`📝 [ChatMessagesRepository] Original data:`, data);

            // Ensure database is ready and table exists
            if (!this.db.isReady()) {
                console.error(`❌ [ChatMessagesRepository] Database not ready for insert`);
                throw new Error('Database not ready');
            }

            // Ensure table exists before proceeding
            const tableExists = this.db.query<{ name: string }>(
                `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
                [this.tableName]
            );

            if (tableExists.length === 0) {
                console.warn(`⚠️ [ChatMessagesRepository] Table ${this.tableName} does not exist. Creating it...`);
                this.db.ensureAllTablesExist();

                // Verify table was created
                const tableExistsAfter = this.db.query<{ name: string }>(
                    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
                    [this.tableName]
                );

                if (tableExistsAfter.length === 0) {
                    console.error(`❌ [ChatMessagesRepository] Failed to create table ${this.tableName}`);
                    throw new Error(`Table ${this.tableName} does not exist and could not be created`);
                }
                console.log(`✅ [ChatMessagesRepository] Table ${this.tableName} created successfully`);
            }

            const dbData = objectToDbFormat(data as Record<string, any>);
            console.log(`📝 [ChatMessagesRepository] Converted data (db format):`, dbData);

            const columnsSet = this.ensureTableColumns();
            console.log(`📝 [ChatMessagesRepository] Available columns:`, Array.from(columnsSet));
            console.log(`📝 [ChatMessagesRepository] Data keys after conversion:`, Object.keys(dbData));

            const keys = Object.keys(dbData)
                .filter(k => dbData[k] !== undefined && columnsSet.has(k));
            const values = keys.map(k => dbData[k]);
            const placeholders = keys.map(() => '?').join(', ');
            const columns = keys.join(', ');

            console.log(`📝 [ChatMessagesRepository] Filtered keys:`, keys);
            console.log(`📝 [ChatMessagesRepository] SQL columns:`, columns);
            console.log(`📝 [ChatMessagesRepository] Values:`, values);

            if (keys.length === 0) {
                const errorMsg = `No valid columns to insert for ${this.tableName}. Available columns: ${Array.from(columnsSet).join(', ')}, Data keys after conversion: ${Object.keys(dbData).join(', ')}`;
                console.error(`❌ ${errorMsg}`);
                console.error(`❌ [ChatMessagesRepository] Database ready: ${this.db.isReady()}`);
                console.error(`❌ [ChatMessagesRepository] Table exists: ${tableExists.length > 0}`);
                throw new Error(errorMsg);
            }

            // Use INSERT OR IGNORE to prevent duplicate key errors
            // Messages can arrive from both API response and WebSocket
            console.log(`📝 [ChatMessagesRepository] Executing INSERT OR IGNORE...`);
            this.db.execute(
                `INSERT OR IGNORE INTO ${this.tableName} (${columns}) VALUES (${placeholders})`,
                values
            );
            console.log(`✅ [ChatMessagesRepository] Insert executed successfully`);

            if (!this.db.isInTransaction()) {
                this.db.save();
                console.log(`✅ [ChatMessagesRepository] Database saved`);
            }
        } catch (error) {
            console.error(`❌ Error inserting into ${this.tableName}:`, error);
            console.error('Data:', data);
            throw error;
        }
    }

    /**
     * Get conversation between two users
     */
    getConversation(userId1: string, userId2: string): any[] {
        const sql = `
            SELECT * FROM chat_messages 
            WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
            ORDER BY created_at ASC
        `;
        const results = this.db.query<Record<string, any>>(sql, [userId1, userId2, userId2, userId1]);
        return results.map(row => dbToObjectFormat(row));
    }

    /**
     * Get all conversations for a user (list of users they've chatted with)
     */
    getConversationsForUser(userId: string): any[] {
        console.log(`📝 [ChatMessagesRepository] getConversationsForUser called for userId: ${userId}`);
        console.log(`📝 [ChatMessagesRepository] Database ready: ${this.db.isReady()}`);

        if (!this.db.isReady()) {
            console.warn(`⚠️ [ChatMessagesRepository] Database not ready for getConversationsForUser`);
            return [];
        }

        // Ensure table exists
        const tableExists = this.db.query<{ name: string }>(
            `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
            [this.tableName]
        );

        if (tableExists.length === 0) {
            console.warn(`⚠️ [ChatMessagesRepository] Table ${this.tableName} does not exist for getConversationsForUser`);
            return [];
        }

        const sql = `
            SELECT DISTINCT 
                CASE 
                    WHEN sender_id = ? THEN recipient_id 
                    ELSE sender_id 
                END as other_user_id,
                CASE 
                    WHEN sender_id = ? THEN recipient_name 
                    ELSE sender_name 
                END as other_user_name,
                MAX(created_at) as last_message_time
            FROM chat_messages 
            WHERE sender_id = ? OR recipient_id = ?
            GROUP BY other_user_id
            ORDER BY last_message_time DESC
        `;
        const results = this.db.query<Record<string, any>>(sql, [userId, userId, userId, userId]);
        console.log(`📝 [ChatMessagesRepository] Found ${results.length} conversations for user ${userId}`);
        return results.map(row => dbToObjectFormat(row));
    }

    /**
     * Mark messages as read
     */
    markAsRead(senderId: string, recipientId: string): void {
        const sql = `
            UPDATE chat_messages 
            SET read_at = datetime(\'now\')
            WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL
        `;
        this.db.execute(sql, [senderId, recipientId]);
        if (!this.db.isInTransaction()) {
            this.db.save();
        }
    }

    /**
     * Get unread message count for a user
     */
    getUnreadCount(userId: string): number {
        const sql = `
            SELECT COUNT(*) as count 
            FROM chat_messages 
            WHERE recipient_id = ? AND read_at IS NULL
        `;
        const results = this.db.query<{ count: number }>(sql, [userId]);
        return results[0]?.count || 0;
    }

}

export interface PersonalCategoryRow {
    id: string;
    tenantId?: string;
    name: string;
    type: 'Income' | 'Expense';
    sortOrder?: number;
    version?: number;
    deletedAt?: string;
    createdAt?: string;
    updatedAt?: string;
}

export class PersonalCategoriesRepository extends BaseRepository<PersonalCategoryRow> {
    constructor() {
        super('personal_categories');
    }

    findByType(type: 'Income' | 'Expense'): PersonalCategoryRow[] {
        return this.findAll({
            condition: 'type = ?',
            params: [type],
            orderBy: 'sort_order',
            orderDir: 'ASC',
        });
    }
}

export interface PersonalTransactionRow {
    id: string;
    tenantId?: string;
    accountId: string;
    personalCategoryId: string;
    type: 'Income' | 'Expense';
    amount: number;
    transactionDate: string;
    description?: string;
    version?: number;
    deletedAt?: string;
    createdAt?: string;
    updatedAt?: string;
}

export class PersonalTransactionsRepository extends BaseRepository<PersonalTransactionRow> {
    constructor() {
        super('personal_transactions');
    }

    findAllOrderByDate(options: { limit?: number; offset?: number; condition?: string; params?: any[] } = {}): PersonalTransactionRow[] {
        const { limit = 5000, offset = 0, condition, params = [] } = options;
        let sql = 'SELECT * FROM personal_transactions';
        const whereParams: any[] = [];
        if (condition) {
            sql += ` WHERE ${condition}`;
            whereParams.push(...params);
        }
        sql += ' ORDER BY transaction_date DESC, created_at DESC LIMIT ? OFFSET ?';
        whereParams.push(limit, offset);
        const results = this.db.query<Record<string, any>>(sql, whereParams);
        return results.map(row => dbToObjectFormat<PersonalTransactionRow>(row));
    }
}

export class AppSettingsRepository {
    private db = getDatabaseService();

    getSetting(key: string): any {
        const result = this.db.query<{ value: string }>(
            'SELECT value FROM app_settings WHERE key = ?',
            [key]
        );
        if (result.length === 0) return null;
        try {
            return JSON.parse(result[0].value);
        } catch {
            return result[0].value;
        }
    }

    setSetting(key: string, value: any): void {
        const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);
        this.db.execute(
            'INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))',
            [key, jsonValue]
        );
        // Don't call save() here if we're in a transaction - it will be saved after transaction commits
        if (!this.db.isInTransaction()) {
            this.db.save();
        }
    }

    loadAllSettings(): any {
        const results = this.db.query<{ key: string; value: string }>(
            'SELECT key, value FROM app_settings'
        );
        const settings: any = {};
        results.forEach(row => {
            try {
                settings[row.key] = JSON.parse(row.value);
            } catch {
                settings[row.key] = row.value;
            }
        });
        return settings;
    }

    saveAllSettings(settings: any): void {
        Object.entries(settings).forEach(([key, value]) => {
            // Save all values including null/undefined to ensure settings are properly persisted
            // For null/undefined/empty string, we'll delete the setting to clear it
            if (value === null || value === undefined || value === '') {
                // Delete the setting if it's null/undefined/empty (clear it)
                this.db.execute('DELETE FROM app_settings WHERE key = ?', [key]);
            } else {
                // Always save the setting if it has a value
                this.setSetting(key, value);
            }
        });
        // Ensure database is saved after updating settings
        if (!this.db.isInTransaction()) {
            this.db.save();
        }
    }
}

// Helper function to get database service
// Moved to top
