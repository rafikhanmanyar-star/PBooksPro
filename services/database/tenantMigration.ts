/**
 * Tenant Migration
 * 
 * Adds tenant_id columns to all relevant tables for multi-tenant support.
 */

import { getDatabaseService } from './databaseService';
import { getCurrentTenantId } from './tenantUtils';
import { getCurrentUserId } from './userUtils';

/**
 * Tables that should have tenant_id column
 * Excludes: metadata, error_log, app_settings, license_settings (global tables)
 */
const TABLES_WITH_TENANT_ID = [
    'users',
    'accounts',
    'contacts',
    'categories',
    'projects',
    'buildings',
    'properties',
    'units',
    'transactions',
    'invoices',
    'bills',
    'budgets',
    'quotations',
    'documents',
    // Note: rental_agreements uses org_id (for organization) and contact_id (for tenant contact), NOT tenant_id
    // Do NOT include 'rental_agreements' here - it's handled separately
    'project_agreements',
    'contracts',
    'vendors',
    'recurring_invoice_templates',
    'transaction_log',
    'pm_cycle_allocations'
];

/**
 * Add tenant_id column to a table if it doesn't exist
 */
function addTenantIdColumn(tableName: string): void {
    const db = getDatabaseService();

    try {
        // Check if table exists first
        const tableExists = db.query<{ name: string }>(
            `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
            [tableName]
        );

        if (tableExists.length === 0) {
            // Table doesn't exist yet, skip (it will be created with columns by schema)
            return;
        }

        // Check if column already exists - use try-catch in case of any query issues
        let columns: Array<{ name: string }> = [];
        try {
            columns = db.query<{ name: string }>(`PRAGMA table_info(${tableName})`);
        } catch (pragmaError) {
            console.warn(`⚠️ Could not check columns for ${tableName}, attempting to add column anyway:`, pragmaError);
            // Continue to try adding the column
        }

        const hasTenantId = columns.some(col => col.name === 'org_id' || col.name === 'tenant_id');

        if (hasTenantId) {
            // Column already exists, check if it's the right name
            const hasOrgId = columns.some(col => col.name === 'org_id');
            const hasLegacyOrgTenantId = columns.some(col => col.name === 'org_tenant_id');
            if (!hasOrgId && columns.some(col => col.name === 'tenant_id')) {
                // For rental_agreements, tenant_id refers to contact, so we need org_id
                if (tableName === 'rental_agreements') {
                    try {
                        db.execute(`ALTER TABLE ${tableName} ADD COLUMN org_id TEXT`);
                        console.log(`✅ Added org_id column to ${tableName}`);
                    } catch (addError: any) {
                        // Column might already exist, ignore
                        if (!addError?.message?.includes('duplicate column')) {
                            console.warn(`⚠️ Could not add org_id to ${tableName}:`, addError);
                        }
                    }
                }
            }
            // Backfill org_id from legacy org_tenant_id if available
            if (tableName === 'rental_agreements' && hasLegacyOrgTenantId) {
                try {
                    db.execute(`UPDATE ${tableName} SET org_id = org_tenant_id WHERE org_id IS NULL`);
                    console.log(`✅ Backfilled org_id from org_tenant_id in ${tableName}`);
                } catch (backfillError: any) {
                    console.warn(`⚠️ Could not backfill org_id in ${tableName}:`, backfillError);
                }
            }
            return;
        }

        // Add tenant_id column (use org_id for rental_agreements to avoid conflict)
        const columnName = tableName === 'rental_agreements' ? 'org_id' : 'tenant_id';
        let columnAdded = false;

        try {
            db.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} TEXT`);
            console.log(`✅ Added ${columnName} column to ${tableName}`);
            columnAdded = true;
        } catch (addError: any) {
            // Column might already exist (race condition), ignore duplicate column errors
            if (addError?.message?.includes('duplicate column')) {
                console.log(`ℹ️ Column ${columnName} already exists in ${tableName}`);
                columnAdded = true; // Column exists, so we can update
            } else {
                console.error(`❌ Error adding ${columnName} to ${tableName}:`, addError);
                // Don't try to update if column addition failed
                return;
            }
        }

        // Only update if column was successfully added or already exists
        if (columnAdded) {
            // Verify column exists before updating (double-check)
            try {
                const verifyColumns = db.query<{ name: string }>(`PRAGMA table_info(${tableName})`);
                const columnExists = verifyColumns.some(col => col.name === columnName);

                if (!columnExists) {
                    console.warn(`⚠️ Column ${columnName} was not found in ${tableName} after addition, skipping update`);
                    return;
                }

                // If there's existing data and we have a current tenant, set it
                const currentTenantId = getCurrentTenantId();
                if (currentTenantId) {
                    try {
                        db.execute(`UPDATE ${tableName} SET ${columnName} = ? WHERE ${columnName} IS NULL`, [currentTenantId]);
                        console.log(`✅ Updated existing records in ${tableName} with tenant_id`);
                    } catch (updateError: any) {
                        // If update fails with "no such column", the column addition might have failed silently
                        if (updateError?.message?.includes('no such column')) {
                            console.error(`❌ Column ${columnName} does not exist in ${tableName} - ALTER TABLE may have failed silently`);
                        } else {
                            console.warn(`⚠️ Could not update existing records in ${tableName}:`, updateError);
                        }
                    }
                }
            } catch (verifyError) {
                console.warn(`⚠️ Could not verify column ${columnName} in ${tableName}:`, verifyError);
            }
        }
    } catch (error) {
        console.error(`❌ Error adding tenant_id to ${tableName}:`, error);
        // Don't throw - continue with other tables
    }
}

/**
 * Add user_id column to a table if it doesn't exist
 */
function addUserIdColumn(tableName: string): void {
    const db = getDatabaseService();

    try {
        // Check if table exists first
        const tableExists = db.query<{ name: string }>(
            `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
            [tableName]
        );

        if (tableExists.length === 0) {
            // Table doesn't exist yet, skip (it will be created with columns by schema)
            return;
        }

        // Check if column already exists - use try-catch in case of any query issues
        let columns: Array<{ name: string }> = [];
        try {
            columns = db.query<{ name: string }>(`PRAGMA table_info(${tableName})`);
        } catch (pragmaError) {
            console.warn(`⚠️ Could not check columns for ${tableName}, attempting to add column anyway:`, pragmaError);
            // Continue to try adding the column
        }

        const hasUserId = columns.some(col => col.name === 'user_id');

        if (hasUserId) {
            return; // Column already exists
        }

        // Add user_id column
        let columnAdded = false;

        try {
            db.execute(`ALTER TABLE ${tableName} ADD COLUMN user_id TEXT`);
            console.log(`✅ Added user_id column to ${tableName}`);
            columnAdded = true;
        } catch (addError: any) {
            // Column might already exist (race condition), ignore duplicate column errors
            if (addError?.message?.includes('duplicate column')) {
                console.log(`ℹ️ Column user_id already exists in ${tableName}`);
                columnAdded = true; // Column exists, so we can update
            } else {
                console.error(`❌ Error adding user_id to ${tableName}:`, addError);
                // Don't try to update if column addition failed
                return;
            }
        }

        // Only update if column was successfully added or already exists
        if (columnAdded) {
            // Verify column exists before updating (double-check)
            try {
                const verifyColumns = db.query<{ name: string }>(`PRAGMA table_info(${tableName})`);
                const columnExists = verifyColumns.some(col => col.name === 'user_id');

                if (!columnExists) {
                    console.warn(`⚠️ Column user_id was not found in ${tableName} after addition, skipping update`);
                    return;
                }

                // If there's existing data and we have a current user, set it
                const currentUserId = getCurrentUserId();
                if (currentUserId) {
                    try {
                        db.execute(`UPDATE ${tableName} SET user_id = ? WHERE user_id IS NULL`, [currentUserId]);
                        console.log(`✅ Updated existing records in ${tableName} with user_id`);
                    } catch (updateError: any) {
                        // If update fails with "no such column", the column addition might have failed silently
                        if (updateError?.message?.includes('no such column')) {
                            console.error(`❌ Column user_id does not exist in ${tableName} - ALTER TABLE may have failed silently`);
                        } else {
                            console.warn(`⚠️ Could not update existing records in ${tableName}:`, updateError);
                        }
                    }
                }
            } catch (verifyError) {
                console.warn(`⚠️ Could not verify column user_id in ${tableName}:`, verifyError);
            }
        }
    } catch (error) {
        console.error(`❌ Error adding user_id to ${tableName}:`, error);
        // Don't throw - continue with other tables
    }
}

/**
 * Run tenant migration - adds tenant_id and user_id columns to all relevant tables
 */
export function migrateTenantColumns(): void {
    const db = getDatabaseService();

    if (!db.isReady()) {
        console.warn('⚠️ Database not ready, skipping tenant migration');
        return;
    }

    console.log('🔄 Running tenant and user migration...');

    try {
        TABLES_WITH_TENANT_ID.forEach(tableName => {
            addTenantIdColumn(tableName);
            addUserIdColumn(tableName);
        });

        console.log('✅ Tenant and user migration completed');
    } catch (error) {
        console.error('❌ Error during tenant migration:', error);
        // Don't throw - allow app to continue
    }
}

