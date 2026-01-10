/**
 * Repository Index
 * 
 * Exports all repository classes for easy importing.
 */

import { BaseRepository } from './baseRepository';
export { BaseRepository } from './baseRepository';
import { getNativeDatabaseService } from '../nativeDatabaseService';
import { getDatabaseService } from '../databaseService';
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

export class CategoriesRepository extends BaseRepository<any> {
    constructor() { super('categories'); }
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

export class UnitsRepository extends BaseRepository<any> {
    constructor() { super('units'); }
}

export class TransactionsRepository extends BaseRepository<any> {
    private useNativeBackend: boolean = false;
    private nativeService: any = null;

    constructor() {
        super('transactions');
        // Check if native backend is available and enabled
        try {
            this.nativeService = getNativeDatabaseService();
            const isAvailable = this.nativeService.isNativeAvailable();
            console.log('🔍 TransactionsRepository: Native service available?', isAvailable);

            // Enable native backend by default if available (can be disabled via feature flag)
            // Check localStorage for feature flag
            if (typeof window !== 'undefined') {
                const flag = localStorage.getItem('useNativeDatabase');
                console.log('🔍 TransactionsRepository: Feature flag value:', flag);
                if (flag !== null) {
                    this.useNativeBackend = flag === 'true' && isAvailable;
                    console.log('🔍 TransactionsRepository: Using feature flag, useNativeBackend =', this.useNativeBackend);
                } else {
                    // No flag set, use default (enabled if available)
                    this.useNativeBackend = isAvailable;
                    console.log('🔍 TransactionsRepository: No feature flag, using default, useNativeBackend =', this.useNativeBackend);
                }
            } else {
                this.useNativeBackend = isAvailable;
                console.log('🔍 TransactionsRepository: Not in browser, useNativeBackend =', this.useNativeBackend);
            }
        } catch (e) {
            // Native service not available, use sql.js
            console.error('❌ TransactionsRepository: Failed to load native service:', e);
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
        limit?: number;
        offset?: number;
    } = {}): Promise<any[]> {
        if (this.useNativeBackend && this.nativeService) {
            try {
                return await this.nativeService.listTransactions({
                    projectId: params.projectId,
                    limit: params.limit || 100,
                    offset: params.offset || 0,
                });
            } catch (error) {
                console.error('❌ Native backend query failed, falling back to sql.js:', error);
            }
        }

        // Fallback to sql.js with efficient SQL-level pagination
        return super.findAll({
            condition: params.projectId ? 'project_id = ?' : undefined,
            params: params.projectId ? [params.projectId] : [],
            limit: params.limit || 100,
            offset: params.offset || 0,
            orderBy: 'date',
            orderDir: 'DESC'
        });
    }

    /**
     * Get transaction totals (native backend only)
     */
    async getTotals(params: { projectId?: string | null } = {}): Promise<{ totalIncome: number; totalExpense: number }> {
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
        // Fallback: calculate from sql.js using optimized query
        const sql = `
            SELECT 
                SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) as total_income,
                SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END) as total_expense
            FROM transactions
            ${params.projectId ? 'WHERE project_id = ?' : ''}
        `;
        const results = this.db.query<{ total_income: number; total_expense: number }>(
            sql,
            params.projectId ? [params.projectId] : []
        );

        return {
            totalIncome: results[0]?.total_income || 0,
            totalExpense: results[0]?.total_expense || 0
        };
    }

    /**
     * Get transaction count
     */
    async getCount(params: { projectId?: string | null } = {}): Promise<number> {
        if (this.useNativeBackend && this.nativeService) {
            try {
                return await this.nativeService.getTransactionCount(params.projectId);
            } catch (error) {
                console.error('❌ Native backend count query failed:', error);
            }
        }

        // Fallback to sql.js
        const sql = `SELECT COUNT(*) as count FROM transactions ${params.projectId ? 'WHERE project_id = ?' : ''}`;
        const results = this.db.query<{ count: number }>(sql, params.projectId ? [params.projectId] : []);
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

export class RecurringTemplatesRepository extends BaseRepository<any> {
    constructor() { super('recurring_invoice_templates'); }
}

export class SalaryComponentsRepository extends BaseRepository<any> {
    constructor() { super('salary_components'); }
}

export class StaffRepository extends BaseRepository<any> {
    constructor() { super('staff'); }
}

export class EmployeesRepository extends BaseRepository<any> {
    constructor() { super('employees'); }
}

export class PayrollCyclesRepository extends BaseRepository<any> {
    constructor() { super('payroll_cycles'); }
}

export class PayslipsRepository extends BaseRepository<any> {
    constructor() { super('payslips'); }
}

export class LegacyPayslipsRepository extends BaseRepository<any> {
    constructor() { super('legacy_payslips'); }
}

export class BonusRecordsRepository extends BaseRepository<any> {
    constructor() { super('bonus_records'); }
}

export class PayrollAdjustmentsRepository extends BaseRepository<any> {
    constructor() { super('payroll_adjustments'); }
}

export class LoanAdvanceRecordsRepository extends BaseRepository<any> {
    constructor() { super('loan_advance_records'); }
}

export class AttendanceRecordsRepository extends BaseRepository<any> {
    constructor() { super('attendance_records'); }
}

export class TaxConfigurationsRepository extends BaseRepository<any> {
    constructor() { super('tax_configurations'); }
}

export class StatutoryConfigurationsRepository extends BaseRepository<any> {
    constructor() { super('statutory_configurations'); }
}

export class TransactionLogRepository extends BaseRepository<any> {
    constructor() { super('transaction_log'); }
}

export class ErrorLogRepository extends BaseRepository<any> {
    constructor() { super('error_log'); }
}

export class TasksRepository extends BaseRepository<any> {
    constructor() { super('tasks'); }
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

export class ChatMessagesRepository extends BaseRepository<any> {
    constructor() { 
        super('chat_messages'); 
    }
    
    /**
     * Chat messages are local only and should not be filtered by tenant
     */
    protected shouldFilterByTenant(): boolean {
        return false;
    }
    
    /**
     * Override insert to use INSERT OR IGNORE to prevent duplicate key errors
     * Messages can arrive from both API response and WebSocket, causing duplicates
     */
    insert(data: Partial<any>): void {
        try {
            const dbData = objectToDbFormat(data as Record<string, any>);
            const columnsSet = this.ensureTableColumns();
            
            const keys = Object.keys(dbData)
                .filter(k => dbData[k] !== undefined && columnsSet.has(k));
            const values = keys.map(k => dbData[k]);
            const placeholders = keys.map(() => '?').join(', ');
            const columns = keys.join(', ');

            if (keys.length === 0) {
                const errorMsg = `No valid columns to insert for ${this.tableName}. Available columns: ${Array.from(columnsSet).join(', ')}, Data keys after conversion: ${Object.keys(dbData).join(', ')}`;
                console.error(`❌ ${errorMsg}`);
                throw new Error(errorMsg);
            }

            // Use INSERT OR IGNORE to prevent duplicate key errors
            // Messages can arrive from both API response and WebSocket
            this.db.execute(
                `INSERT OR IGNORE INTO ${this.tableName} (${columns}) VALUES (${placeholders})`,
                values
            );

            if (!this.db.isInTransaction()) {
                this.db.save();
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
        return results.map(row => dbToObjectFormat(row));
    }
    
    /**
     * Mark messages as read
     */
    markAsRead(senderId: string, recipientId: string): void {
        const sql = `
            UPDATE chat_messages 
            SET read_at = datetime('now')
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
            'INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime("now"))',
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
