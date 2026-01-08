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
 * Excludes: metadata, error_log, app_settings, license_settings, tasks (global tables)
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
    'rental_agreements', // Note: This already has tenant_id but it refers to contact, we need org_tenant_id
    'project_agreements',
    'contracts',
    'recurring_invoice_templates',
    'salary_components',
    'staff',
    'employees',
    'payroll_cycles',
    'payslips',
    'legacy_payslips',
    'bonus_records',
    'payroll_adjustments',
    'loan_advance_records',
    'attendance_records',
    'tax_configurations',
    'statutory_configurations',
    'transaction_log'
];

/**
 * Add tenant_id column to a table if it doesn't exist
 */
function addTenantIdColumn(tableName: string): void {
    const db = getDatabaseService();
    
    try {
        // Check if column already exists
        const columns = db.query<{ name: string }>(`PRAGMA table_info(${tableName})`);
        const hasTenantId = columns.some(col => col.name === 'org_tenant_id' || col.name === 'tenant_id');
        
        if (hasTenantId) {
            // Column already exists, check if it's the right name
            const hasOrgTenantId = columns.some(col => col.name === 'org_tenant_id');
            if (!hasOrgTenantId && columns.some(col => col.name === 'tenant_id')) {
                // For rental_agreements, tenant_id refers to contact, so we need org_tenant_id
                if (tableName === 'rental_agreements') {
                    db.execute(`ALTER TABLE ${tableName} ADD COLUMN org_tenant_id TEXT`);
                    console.log(`✅ Added org_tenant_id column to ${tableName}`);
                }
            }
            return;
        }
        
        // Add tenant_id column (use org_tenant_id for rental_agreements to avoid conflict)
        const columnName = tableName === 'rental_agreements' ? 'org_tenant_id' : 'tenant_id';
        db.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} TEXT`);
        console.log(`✅ Added ${columnName} column to ${tableName}`);
        
        // If there's existing data and we have a current tenant, set it
        const currentTenantId = getCurrentTenantId();
        if (currentTenantId) {
            try {
                db.execute(`UPDATE ${tableName} SET ${columnName} = ? WHERE ${columnName} IS NULL`, [currentTenantId]);
                console.log(`✅ Updated existing records in ${tableName} with tenant_id`);
            } catch (updateError) {
                console.warn(`⚠️ Could not update existing records in ${tableName}:`, updateError);
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
        // Check if column already exists
        const columns = db.query<{ name: string }>(`PRAGMA table_info(${tableName})`);
        const hasUserId = columns.some(col => col.name === 'user_id');
        
        if (hasUserId) {
            return; // Column already exists
        }
        
        // Add user_id column
        db.execute(`ALTER TABLE ${tableName} ADD COLUMN user_id TEXT`);
        console.log(`✅ Added user_id column to ${tableName}`);
        
        // If there's existing data and we have a current user, set it
        const currentUserId = getCurrentUserId();
        if (currentUserId) {
            try {
                db.execute(`UPDATE ${tableName} SET user_id = ? WHERE user_id IS NULL`, [currentUserId]);
                console.log(`✅ Updated existing records in ${tableName} with user_id`);
            } catch (updateError) {
                console.warn(`⚠️ Could not update existing records in ${tableName}:`, updateError);
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

