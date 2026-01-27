/**
 * Budget Migration Utilities
 * 
 * Handles migration from old budget format (with monthly allocations)
 * to new budget format (total project budgets)
 */

import { Budget } from '../../types';
import { getDatabaseService } from './databaseService';

interface OldBudget {
    id: string;
    categoryId: string;
    month: string;
    amount: number;
    projectId?: string;
}

/**
 * Check if database has old budget structure (with month field)
 */
export function hasOldBudgetStructure(): boolean {
    try {
        const db = getDatabaseService();
        if (!db.isReady()) return false;
        
        // Check if budgets table has month column
        const tableInfo = db.query<{ name: string }>('PRAGMA table_info(budgets)');
        return tableInfo.some(col => col.name === 'month');
    } catch (error) {
        console.error('Error checking budget structure:', error);
        return false;
    }
}

/**
 * Migrate budgets from old structure to new structure
 * Consolidates monthly budgets into total budgets per category/project
 */
export function migrateBudgetsToNewStructure(): { success: boolean; migrated: number; error?: string } {
    try {
        const db = getDatabaseService();
        if (!db.isReady()) {
            return { success: false, migrated: 0, error: 'Database not initialized' };
        }

        console.log('🔄 Starting budget migration from monthly to total budgets...');

        // Check if we need to migrate
        if (!hasOldBudgetStructure()) {
            console.log('✅ Budget structure is already up to date');
            return { success: true, migrated: 0 };
        }

        // Load all old budgets
        const oldBudgets = db.query<OldBudget>('SELECT * FROM budgets');
        console.log(`📊 Found ${oldBudgets.length} old budget entries`);

        if (oldBudgets.length === 0) {
            // No budgets to migrate, just update the schema
            updateBudgetSchema();
            return { success: true, migrated: 0 };
        }

        // Group budgets by category and project, summing amounts
        const consolidatedBudgets = new Map<string, Budget>();
        
        oldBudgets.forEach(oldBudget => {
            // Create a key for category + project combination
            const key = oldBudget.projectId 
                ? `${oldBudget.categoryId}-${oldBudget.projectId}`
                : oldBudget.categoryId;
            
            if (consolidatedBudgets.has(key)) {
                // Add to existing budget
                const existing = consolidatedBudgets.get(key)!;
                existing.amount += oldBudget.amount;
            } else {
                // Create new consolidated budget
                const newBudget: Budget = {
                    id: key, // New ID format without month
                    categoryId: oldBudget.categoryId,
                    amount: oldBudget.amount,
                    projectId: oldBudget.projectId
                };
                consolidatedBudgets.set(key, newBudget);
            }
        });

        console.log(`📊 Consolidated into ${consolidatedBudgets.size} total budgets`);

        // Update the schema first
        updateBudgetSchema();

        // Insert consolidated budgets
        db.transaction([
            () => {
                // Clear old budgets
                db.execute('DELETE FROM budgets');
                
                // Insert consolidated budgets
                consolidatedBudgets.forEach(budget => {
                    db.execute(
                        'INSERT INTO budgets (id, category_id, amount, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))',
                        [budget.id, budget.categoryId, budget.amount, budget.projectId || null]
                    );
                });
            }
        ]);

        db.save();
        console.log('✅ Budget migration completed successfully');
        
        return { success: true, migrated: consolidatedBudgets.size };
    } catch (error) {
        console.error('❌ Budget migration failed:', error);
        return {
            success: false,
            migrated: 0,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

/**
 * Update budget table schema to new structure
 */
function updateBudgetSchema(): void {
    const db = getDatabaseService();
    
    console.log('🔄 Updating budget table schema...');
    
    try {
        // Check if column exists before trying to drop it
        const columns = db.query<{ name: string }>('PRAGMA table_info(budgets)');
        const hasMonth = columns.some(col => col.name === 'month');
        const hasProjectId = columns.some(col => col.name === 'project_id');
        
        if (!hasMonth && hasProjectId) {
            console.log('✅ Schema already updated');
            return;
        }

        // SQLite doesn't support dropping columns easily, so we:
        // 1. Create new table with correct schema
        // 2. Copy data (if any)
        // 3. Drop old table
        // 4. Rename new table

        db.transaction([
            () => {
                // Create new budgets table with updated schema
                db.execute(`
                    CREATE TABLE IF NOT EXISTS budgets_new (
                        id TEXT PRIMARY KEY,
                        category_id TEXT NOT NULL,
                        amount REAL NOT NULL,
                        project_id TEXT,
                        created_at TEXT NOT NULL DEFAULT (datetime('now')),
                        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
                        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                        UNIQUE(category_id, project_id)
                    )
                `);

                // Note: Data will be inserted by the calling migration function
                // This just sets up the new structure

                // Drop old table
                db.execute('DROP TABLE IF EXISTS budgets');

                // Rename new table
                db.execute('ALTER TABLE budgets_new RENAME TO budgets');
            }
        ]);

        console.log('✅ Budget schema updated successfully');
    } catch (error) {
        console.error('❌ Failed to update budget schema:', error);
        throw error;
    }
}

/**
 * Migrate budgets array from old format to new format (for in-memory state)
 */
export function migrateBudgetsArray(budgets: any[]): Budget[] {
    if (!budgets || budgets.length === 0) {
        return [];
    }

    // Check if budgets have old format (with month field)
    const hasOldFormat = budgets.some(b => 'month' in b);
    
    if (!hasOldFormat) {
        // Already in new format
        return budgets as Budget[];
    }

    console.log('🔄 Migrating budget array from old format...');
    
    // Consolidate monthly budgets into totals
    const consolidatedMap = new Map<string, Budget>();
    
    budgets.forEach((oldBudget: any) => {
        const key = oldBudget.projectId 
            ? `${oldBudget.categoryId}-${oldBudget.projectId}`
            : oldBudget.categoryId;
        
        if (consolidatedMap.has(key)) {
            const existing = consolidatedMap.get(key)!;
            existing.amount += oldBudget.amount || 0;
        } else {
            consolidatedMap.set(key, {
                id: key,
                categoryId: oldBudget.categoryId,
                amount: oldBudget.amount || 0,
                projectId: oldBudget.projectId
            });
        }
    });

    const result = Array.from(consolidatedMap.values());
    console.log(`✅ Migrated ${budgets.length} monthly budgets to ${result.length} total budgets`);
    
    return result;
}

