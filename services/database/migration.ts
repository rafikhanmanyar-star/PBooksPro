/**
 * Migration Service
 * 
 * Handles migration from localStorage to SQL database.
 * This is a one-time migration that should be run when the app first loads
 * with the new SQL database system.
 */

import { AppState, LATEST_DATA_VERSION } from '../../types';
import { getDatabaseService } from './databaseService';
import { AppStateRepository } from './repositories/appStateRepository';

export interface MigrationResult {
    success: boolean;
    migrated: boolean;
    error?: string;
    recordCounts?: {
        [key: string]: number;
    };
}

/**
 * Check if migration is needed
 */
export function needsMigration(): boolean {
    // Check if database exists
    const dbExists = localStorage.getItem('finance_db') !== null;
    
    // Check if migration flag exists
    const migrationFlag = localStorage.getItem('migrated_to_sql');
    
    // If database exists and migration flag is set, no migration needed
    if (dbExists && migrationFlag === 'true') {
        return false;
    }
    
    // Check if old localStorage data exists
    const oldState = localStorage.getItem('finance_app_state_v4');
    if (!oldState) {
        // No old data, just initialize new database
        return false;
    }
    
    // Migration needed if old data exists but database doesn't or migration flag not set
    return true;
}

/**
 * Migrate data from localStorage to SQL database
 */
export async function migrateFromLocalStorage(
    onProgress?: (progress: number, message: string) => void
): Promise<MigrationResult> {
    try {
        onProgress?.(5, 'Initializing database...');
        // Initialize database
        const dbService = getDatabaseService();
        await dbService.initialize();
        onProgress?.(10, 'Database initialized');

        // Check if already migrated
        if (!needsMigration()) {
            return {
                success: true,
                migrated: false,
                recordCounts: {}
            };
        }

        // Load old state from localStorage
        onProgress?.(20, 'Loading data from localStorage...');
        const oldStateJson = localStorage.getItem('finance_app_state_v4');
        if (!oldStateJson) {
            // No old data to migrate
            onProgress?.(100, 'No data to migrate');
            localStorage.setItem('migrated_to_sql', 'true');
            return {
                success: true,
                migrated: false,
                recordCounts: {}
            };
        }

        onProgress?.(30, 'Parsing data...');
        let oldState: AppState;
        try {
            oldState = JSON.parse(oldStateJson);
        } catch (error) {
            return {
                success: false,
                migrated: false,
                error: `Failed to parse old state: ${error instanceof Error ? error.message : String(error)}`
            };
        }

        // Validate state version
        if (oldState.version && oldState.version < LATEST_DATA_VERSION) {
            console.warn(`Old state version ${oldState.version} is less than current ${LATEST_DATA_VERSION}`);
        }

        // Migrate data to database
        onProgress?.(40, 'Migrating data to database...');
        const appStateRepo = new AppStateRepository();
        await appStateRepo.saveState(oldState);
        onProgress?.(80, 'Data migration complete');

        // Count records
        const recordCounts: { [key: string]: number } = {
            users: oldState.users?.length || 0,
            accounts: oldState.accounts?.length || 0,
            contacts: oldState.contacts?.length || 0,
            categories: oldState.categories?.length || 0,
            projects: oldState.projects?.length || 0,
            buildings: oldState.buildings?.length || 0,
            properties: oldState.properties?.length || 0,
            units: oldState.units?.length || 0,
            transactions: oldState.transactions?.length || 0,
            invoices: oldState.invoices?.length || 0,
            bills: oldState.bills?.length || 0,
            budgets: oldState.budgets?.length || 0,
            rentalAgreements: oldState.rentalAgreements?.length || 0,
            projectAgreements: oldState.projectAgreements?.length || 0,
            contracts: oldState.contracts?.length || 0,
            employees: oldState.employees?.length || 0,
            payrollCycles: oldState.payrollCycles?.length || 0,
            payslips: oldState.payslips?.length || 0,
            tasks: oldState.tasks?.length || 0
        };

        // Set migration flag
        onProgress?.(90, 'Finalizing migration...');
        localStorage.setItem('migrated_to_sql', 'true');
        
        // Optionally backup old localStorage data
        const backupKey = `finance_app_state_v4_backup_${Date.now()}`;
        localStorage.setItem(backupKey, oldStateJson);

        // Optionally remove old data (commented out for safety - user can clean up manually)
        // localStorage.removeItem('finance_app_state_v4');

        onProgress?.(100, 'Migration completed successfully');
        return {
            success: true,
            migrated: true,
            recordCounts
        };
    } catch (error) {
        console.error('Migration failed:', error);
        return {
            success: false,
            migrated: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

/**
 * Migrate tasks from localStorage
 */
export async function migrateTasks(): Promise<void> {
    try {
        const dbService = getDatabaseService();
        await dbService.initialize();

        const tasksJson = localStorage.getItem('tasks');
        if (!tasksJson) return;

        const tasks = JSON.parse(tasksJson);
        if (!Array.isArray(tasks)) return;

        // Convert tasks to database format
        tasks.forEach((task: any) => {
            dbService.execute(
                `INSERT OR REPLACE INTO tasks (id, text, completed, priority, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    task.id,
                    task.text,
                    task.completed ? 1 : 0,
                    task.priority || 'medium',
                    task.createdAt || Date.now(),
                    Date.now()
                ]
            );
        });

        dbService.save();
    } catch (error) {
        console.error('Failed to migrate tasks:', error);
    }
}

/**
 * Migrate license settings from localStorage
 */
export async function migrateLicenseSettings(): Promise<void> {
    try {
        const dbService = getDatabaseService();
        await dbService.initialize();

        const installDate = localStorage.getItem('app_install_date');
        const licenseKey = localStorage.getItem('app_license_key');
        const deviceId = localStorage.getItem('app_device_id');

        // Only migrate install date if it doesn't already exist in database
        // This preserves the original install date during upgrades
        if (installDate) {
            const existing = dbService.query<{ value: string }>(
                'SELECT value FROM license_settings WHERE key = ?',
                ['app_install_date']
            );
            
            // Only insert if it doesn't exist - never overwrite existing install date
            if (!existing || existing.length === 0 || !existing[0]?.value) {
                dbService.execute(
                    'INSERT INTO license_settings (key, value, updated_at) VALUES (?, ?, datetime("now"))',
                    ['app_install_date', installDate]
                );
            }
        }

        if (licenseKey) {
            dbService.execute(
                'INSERT OR REPLACE INTO license_settings (key, value, updated_at) VALUES (?, ?, datetime("now"))',
                ['app_license_key', licenseKey]
            );
        }

        if (deviceId) {
            dbService.execute(
                'INSERT OR REPLACE INTO license_settings (key, value, updated_at) VALUES (?, ?, datetime("now"))',
                ['app_device_id', deviceId]
            );
        }

        dbService.save();
    } catch (error) {
        console.error('Failed to migrate license settings:', error);
    }
}

/**
 * Run all migrations
 */
export async function runAllMigrations(
    onProgress?: (progress: number, message: string) => void
): Promise<MigrationResult> {
    try {
        // Migrate main app state
        const mainResult = await migrateFromLocalStorage(onProgress);
        
        if (!mainResult.success) {
            return mainResult;
        }

        // Migrate tasks
        if (mainResult.migrated) {
            onProgress?.(95, 'Migrating additional data...');
            await migrateTasks();
            await migrateLicenseSettings();
        }

        return {
            ...mainResult,
            success: true
        };
    } catch (error) {
        onProgress?.(0, `Migration failed: ${error instanceof Error ? error.message : String(error)}`);
        return {
            success: false,
            migrated: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}
