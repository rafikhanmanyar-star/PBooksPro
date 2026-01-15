/**
 * useDatabaseTasks Hook
 * 
 * Manages tasks in both local SQL database and cloud API.
 * Tasks are user-specific and tenant-specific.
 * Each user in an organization has their own tasks list.
 * 
 * When authenticated: Saves to both local DB and cloud API
 * When offline: Saves only to local DB
 */

import { useState, useEffect, useCallback } from 'react';
import { Task } from '../types';
import { getDatabaseService } from '../services/database/databaseService';
import { getCurrentTenantId } from '../services/database/tenantUtils';
import { getCurrentUserId } from '../services/database/userUtils';
import { useAuth } from '../context/AuthContext';
import { TasksApiRepository } from '../services/api/repositories/tasksApi';
import { migrateTenantColumns } from '../services/database/tenantMigration';

async function ensureDatabaseInitialized(): Promise<void> {
    const dbService = getDatabaseService();
    if (!dbService.isReady()) {
        await dbService.initialize();
    }
}

export function useDatabaseTasks(): [Task[], (tasks: Task[]) => void] {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { user, tenant, isAuthenticated } = useAuth();

    // Get tenant_id and user_id - prefer AuthContext, fallback to localStorage
    // Normalize IDs (trim whitespace, ensure string type)
    const tenantId = (tenant?.id || getCurrentTenantId())?.trim() || null;
    const userId = (user?.id || getCurrentUserId())?.trim() || null;
    
    // Debug: Log the IDs being used
    useEffect(() => {
        console.log(`[useDatabaseTasks] Current IDs - tenantId: "${tenantId}", userId: "${userId}"`);
        console.log(`[useDatabaseTasks] AuthContext - tenant?.id: "${tenant?.id}", user?.id: "${user?.id}"`);
        console.log(`[useDatabaseTasks] localStorage - tenant_id: "${getCurrentTenantId()}", user_id: "${getCurrentUserId()}"`);
    }, [tenantId, userId, tenant?.id, user?.id]);

    // Load tasks from both local database and cloud API (when authenticated)
    useEffect(() => {
        // Don't load if user/tenant not available
        if (!tenantId || !userId) {
            setIsLoading(false);
            setTasks([]);
            return;
        }

        let isMounted = true;

        const loadTasks = async () => {
            try {
                console.log(`[useDatabaseTasks] Loading tasks for tenantId: ${tenantId}, userId: ${userId}, isAuthenticated: ${isAuthenticated}`);
                
                await ensureDatabaseInitialized();
                if (!isMounted) return;

                const dbService = getDatabaseService();
                
                // Double-check database is ready
                if (!dbService.isReady()) {
                    console.warn('[useDatabaseTasks] Database not ready, retrying...');
                    await dbService.initialize();
                    if (!isMounted) return;
                }

                // Ensure tasks table exists (safety check)
                dbService.ensureAllTablesExist();
                
                // CRITICAL: Ensure tenant_id and user_id columns exist on tasks table
                // Check and add columns directly to avoid migration issues
                try {
                    // Check if table exists
                    const tableCheck = dbService.query<{ name: string }>(
                        "SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'"
                    );
                    
                    if (tableCheck.length > 0) {
                        // Table exists, check if columns exist
                        let columns: Array<{ name: string }> = [];
                        try {
                            columns = dbService.query<{ name: string }>('PRAGMA table_info(tasks)');
                        } catch (pragmaError) {
                            console.warn('[useDatabaseTasks] Could not check columns, will try to add them:', pragmaError);
                        }
                        
                        const hasTenantId = columns.some(col => col.name === 'tenant_id');
                        const hasUserId = columns.some(col => col.name === 'user_id');
                        
                        // Add missing columns
                        if (!hasTenantId) {
                            try {
                                dbService.execute('ALTER TABLE tasks ADD COLUMN tenant_id TEXT');
                                console.log('[useDatabaseTasks] ✅ Added tenant_id column to tasks table');
                            } catch (e: any) {
                                if (e?.message?.includes('duplicate column')) {
                                    console.log('[useDatabaseTasks] tenant_id column already exists');
                                } else {
                                    console.error('[useDatabaseTasks] Failed to add tenant_id:', e);
                                }
                            }
                        }
                        
                        if (!hasUserId) {
                            try {
                                dbService.execute('ALTER TABLE tasks ADD COLUMN user_id TEXT');
                                console.log('[useDatabaseTasks] ✅ Added user_id column to tasks table');
                            } catch (e: any) {
                                if (e?.message?.includes('duplicate column')) {
                                    console.log('[useDatabaseTasks] user_id column already exists');
                                } else {
                                    console.error('[useDatabaseTasks] Failed to add user_id:', e);
                                }
                            }
                        }
                    }
                    
                    // Also run the full migration for other tables
                    try {
                        migrateTenantColumns();
                    } catch (migrationError) {
                        console.warn('[useDatabaseTasks] Full migration failed (but tasks columns should be OK):', migrationError);
                    }
                } catch (error) {
                    console.error('[useDatabaseTasks] Error ensuring tasks columns exist:', error);
                    // Continue anyway - the query error handling will catch it
                }

                // Load from local database - normalize IDs for query
                const normalizedTenantId = tenantId?.trim() || null;
                const normalizedUserId = userId?.trim() || null;
                
                let localResults: Array<{
                    id: string;
                    text: string;
                    completed: number;
                    priority: string;
                    created_at: number;
                    tenant_id: string | null;
                    user_id: string | null;
                }> = [];
                
                // Query strategy: First try to get all columns, then filter in JavaScript
                // This avoids SQL.js schema cache issues
                try {
                    // First, verify columns exist by querying them explicitly
                    const columnCheck = dbService.query<{ name: string }>('PRAGMA table_info(tasks)');
                    const columnNames = columnCheck.map(col => col.name);
                    const hasTenantId = columnNames.includes('tenant_id');
                    const hasUserId = columnNames.includes('user_id');
                    
                    console.log(`[useDatabaseTasks] Tasks table columns: ${columnNames.join(', ')}`);
                    console.log(`[useDatabaseTasks] Has tenant_id: ${hasTenantId}, Has user_id: ${hasUserId}`);
                    
                    if (hasTenantId && hasUserId) {
                        // Columns exist, try filtered query
                        try {
                            localResults = dbService.query<{
                                id: string;
                                text: string;
                                completed: number;
                                priority: string;
                                created_at: number;
                                tenant_id: string | null;
                                user_id: string | null;
                            }>(
                                'SELECT id, text, completed, priority, created_at, tenant_id, user_id FROM tasks WHERE tenant_id = ? AND user_id = ? ORDER BY created_at DESC',
                                [normalizedTenantId, normalizedUserId]
                            );
                            console.log(`[useDatabaseTasks] ✅ Filtered query successful: ${localResults.length} tasks`);
                        } catch (filteredError: any) {
                            console.warn('[useDatabaseTasks] Filtered query failed, trying unfiltered query:', filteredError);
                            // Fallback: Query all tasks, filter in JavaScript
                            const allTasks = dbService.query<{
                                id: string;
                                text: string;
                                completed: number;
                                priority: string;
                                created_at: number;
                                tenant_id: string | null;
                                user_id: string | null;
                            }>('SELECT id, text, completed, priority, created_at, tenant_id, user_id FROM tasks ORDER BY created_at DESC');
                            
                            // Filter in JavaScript
                            localResults = allTasks.filter(task => 
                                task.tenant_id === normalizedTenantId && 
                                task.user_id === normalizedUserId
                            );
                            console.log(`[useDatabaseTasks] ✅ Unfiltered query + JS filter: ${allTasks.length} total, ${localResults.length} matching`);
                        }
                    } else {
                        // Columns don't exist, query without them and filter in JS
                        console.warn('[useDatabaseTasks] Columns missing, querying without tenant_id/user_id');
                        const allTasks = dbService.query<{
                            id: string;
                            text: string;
                            completed: number;
                            priority: string;
                            created_at: number;
                        }>('SELECT id, text, completed, priority, created_at FROM tasks ORDER BY created_at DESC');
                        
                        localResults = allTasks.map(t => ({
                            ...t,
                            tenant_id: null,
                            user_id: null
                        }));
                        console.log(`[useDatabaseTasks] ⚠️ Queried ${allTasks.length} tasks without tenant/user filtering (columns missing)`);
                    }
                } catch (queryError: any) {
                    console.error('[useDatabaseTasks] Query failed:', queryError);
                    // Last resort: Try basic query without tenant_id/user_id
                    try {
                        const basicTasks = dbService.query<{
                            id: string;
                            text: string;
                            completed: number;
                            priority: string;
                            created_at: number;
                        }>('SELECT id, text, completed, priority, created_at FROM tasks ORDER BY created_at DESC');
                        
                        localResults = basicTasks.map(t => ({
                            ...t,
                            tenant_id: null,
                            user_id: null
                        }));
                        console.warn(`[useDatabaseTasks] ⚠️ Using basic query fallback: ${basicTasks.length} tasks`);
                    } catch (fallbackError) {
                        console.error('[useDatabaseTasks] All query attempts failed:', fallbackError);
                        throw fallbackError;
                    }
                }

                console.log(`[useDatabaseTasks] Found ${localResults.length} tasks matching tenantId="${normalizedTenantId}" and userId="${normalizedUserId}"`);
                
                // Debug: If no results, check what's in the database
                if (localResults.length === 0) {
                    try {
                        const debugTasks = dbService.query<{
                            id: string;
                            tenant_id: string | null;
                            user_id: string | null;
                        }>('SELECT id, tenant_id, user_id FROM tasks LIMIT 5');
                        if (debugTasks.length > 0) {
                            console.warn(`[useDatabaseTasks] ⚠️ No tasks found with current IDs, but ${debugTasks.length} tasks exist in DB!`);
                            console.warn(`[useDatabaseTasks] Current tenantId: "${normalizedTenantId}", Current userId: "${normalizedUserId}"`);
                            console.warn(`[useDatabaseTasks] Sample tasks in DB:`, debugTasks.map(t => ({
                                id: t.id,
                                tenant_id: `"${t.tenant_id}"`,
                                user_id: `"${t.user_id}"`
                            })));
                        }
                    } catch (debugError) {
                        // Ignore debug query errors
                    }
                }
                
                if (localResults.length > 0) {
                    console.log(`[useDatabaseTasks] Sample local task:`, {
                        id: localResults[0].id,
                        text: localResults[0].text,
                        tenant_id: localResults[0].tenant_id,
                        user_id: localResults[0].user_id
                    });
                }

                let loadedTasks: Task[] = localResults.map(row => ({
                    id: row.id,
                    text: row.text,
                    completed: row.completed === 1,
                    priority: row.priority as 'low' | 'medium' | 'high',
                    createdAt: row.created_at
                }));

                // If authenticated, also load from cloud API and merge
                if (isAuthenticated && user && tenant) {
                    try {
                        console.log(`[useDatabaseTasks] Loading from cloud API...`);
                        const tasksApiRepo = new TasksApiRepository();
                        const cloudTasks = await tasksApiRepo.findAll();
                        
                        console.log(`[useDatabaseTasks] Found ${cloudTasks.length} tasks in cloud API`);
                        
                        // Convert cloud tasks to Task format (cloud uses different timestamp format)
                        const cloudTasksFormatted: Task[] = cloudTasks.map(task => ({
                            id: task.id,
                            text: task.text,
                            completed: task.completed,
                            priority: task.priority,
                            createdAt: typeof task.createdAt === 'number' 
                                ? task.createdAt 
                                : new Date(task.createdAt).getTime()
                        }));

                        // Merge: Cloud takes precedence (more recent), but keep local tasks not in cloud
                        const cloudTaskIds = new Set(cloudTasksFormatted.map(t => t.id));
                        const localOnlyTasks = loadedTasks.filter(t => !cloudTaskIds.has(t.id));
                        loadedTasks = [...cloudTasksFormatted, ...localOnlyTasks];

                        console.log(`[useDatabaseTasks] After merge: ${loadedTasks.length} total tasks (${cloudTasksFormatted.length} from cloud, ${localOnlyTasks.length} local-only)`);

                        // Sync merged tasks to local database for offline access
                        // Only update if we have tasks to sync (don't delete if cloud is empty)
                        if (loadedTasks.length > 0) {
                            // Delete existing tasks for this user (use normalized IDs)
                            const normalizedTenantId = tenantId?.trim() || null;
                            const normalizedUserId = userId?.trim() || null;
                            
                            dbService.execute(
                                'DELETE FROM tasks WHERE tenant_id = ? AND user_id = ?',
                                [normalizedTenantId, normalizedUserId]
                            );

                            // Insert merged tasks into local database (use normalized IDs)
                            loadedTasks.forEach(task => {
                                dbService.execute(
                                    'INSERT OR REPLACE INTO tasks (id, text, completed, priority, created_at, updated_at, tenant_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                                    [
                                        task.id,
                                        task.text,
                                        task.completed ? 1 : 0,
                                        task.priority,
                                        task.createdAt,
                                        Date.now(),
                                        normalizedTenantId,
                                        normalizedUserId
                                    ]
                                );
                            });

                            await dbService.saveAsync();
                            console.log(`[useDatabaseTasks] Synced ${loadedTasks.length} tasks to local database`);
                        } else {
                            console.log(`[useDatabaseTasks] No tasks to sync (cloud returned empty, keeping local)`);
                        }
                    } catch (apiError) {
                        console.warn('[useDatabaseTasks] Failed to load tasks from cloud API, using local only:', apiError);
                        // Continue with local tasks only - don't delete them!
                    }
                } else {
                    console.log(`[useDatabaseTasks] Not authenticated, using local tasks only`);
                }

                if (isMounted) {
                    console.log(`[useDatabaseTasks] Setting ${loadedTasks.length} tasks in state`);
                    setTasks(loadedTasks);
                    setIsLoading(false);
                }
            } catch (error) {
                console.error('[useDatabaseTasks] Failed to load tasks:', error);
                if (isMounted) {
                    setTasks([]);
                    setIsLoading(false);
                }
            }
        };

        loadTasks();

        return () => {
            isMounted = false;
        };
    }, [tenantId, userId, user, tenant, isAuthenticated]); // Reload when user or tenant changes

    // Save tasks to both local database and cloud API (when authenticated)
    const saveTasks = useCallback(async (newTasks: Task[]) => {
        // Don't save if user/tenant not available
        if (!tenantId || !userId) {
            console.warn('[useDatabaseTasks] Cannot save tasks: user or tenant not available', { tenantId, userId });
            return;
        }

        console.log(`[useDatabaseTasks] Saving ${newTasks.length} tasks for tenantId: ${tenantId}, userId: ${userId}`);

        // Optimistic update: Update UI immediately
        setTasks(newTasks);

        const tasksApiRepo = new TasksApiRepository();

        // Save to local database (always)
        try {
            await ensureDatabaseInitialized();
            const dbService = getDatabaseService();

            // Double-check database is ready
            if (!dbService.isReady()) {
                console.warn('Database not ready for save, initializing...');
                await dbService.initialize();
            }

            // Normalize IDs first (needed for all operations)
            const normalizedTenantId = tenantId?.trim() || null;
            const normalizedUserId = userId?.trim() || null;
            
            // Ensure tasks table exists (safety check)
            dbService.ensureAllTablesExist();
            
            // CRITICAL: Verify columns exist before trying to INSERT
            // Check columns using PRAGMA to avoid SQL.js schema cache issues
            let hasTenantId = false;
            let hasUserId = false;
            
            try {
                const columnCheck = dbService.query<{ name: string }>('PRAGMA table_info(tasks)');
                const columnNames = columnCheck.map(col => col.name);
                hasTenantId = columnNames.includes('tenant_id');
                hasUserId = columnNames.includes('user_id');
                
                console.log(`[useDatabaseTasks] Save: Tasks table columns: ${columnNames.join(', ')}`);
                console.log(`[useDatabaseTasks] Save: Has tenant_id: ${hasTenantId}, Has user_id: ${hasUserId}`);
                
                // If columns don't exist, try to add them
                if (!hasTenantId) {
                    try {
                        dbService.execute('ALTER TABLE tasks ADD COLUMN tenant_id TEXT');
                        hasTenantId = true;
                        console.log('[useDatabaseTasks] ✅ Added tenant_id column during save');
                    } catch (e: any) {
                        if (e?.message?.includes('duplicate column')) {
                            hasTenantId = true; // Column exists, SQL.js cache issue
                            console.log('[useDatabaseTasks] tenant_id exists (duplicate column error)');
                        } else {
                            console.error('[useDatabaseTasks] Failed to add tenant_id:', e);
                        }
                    }
                }
                
                if (!hasUserId) {
                    try {
                        dbService.execute('ALTER TABLE tasks ADD COLUMN user_id TEXT');
                        hasUserId = true;
                        console.log('[useDatabaseTasks] ✅ Added user_id column during save');
                    } catch (e: any) {
                        if (e?.message?.includes('duplicate column')) {
                            hasUserId = true; // Column exists, SQL.js cache issue
                            console.log('[useDatabaseTasks] user_id exists (duplicate column error)');
                        } else {
                            console.error('[useDatabaseTasks] Failed to add user_id:', e);
                        }
                    }
                }
            } catch (pragmaError) {
                console.error('[useDatabaseTasks] Could not check/add columns:', pragmaError);
                // Try migration as fallback
                try {
                    migrateTenantColumns();
                    // Re-check columns after migration
                    const recheck = dbService.query<{ name: string }>('PRAGMA table_info(tasks)');
                    hasTenantId = recheck.some(col => col.name === 'tenant_id');
                    hasUserId = recheck.some(col => col.name === 'user_id');
                } catch (migrationError) {
                    console.error('[useDatabaseTasks] Migration also failed:', migrationError);
                }
            }

            // Delete all existing tasks for this user and tenant
            // Use column-aware delete query
            if (hasTenantId && hasUserId) {
                try {
                    dbService.execute(
                        'DELETE FROM tasks WHERE tenant_id = ? AND user_id = ?',
                        [normalizedTenantId, normalizedUserId]
                    );
                } catch (deleteError: any) {
                    if (deleteError?.message?.includes('no such column')) {
                        console.warn('[useDatabaseTasks] Delete failed (columns missing), will delete all and re-insert');
                        // Delete all tasks as fallback
                        dbService.execute('DELETE FROM tasks');
                    } else {
                        throw deleteError;
                    }
                }
            } else {
                // Columns don't exist, delete all tasks (no filtering possible)
                console.warn('[useDatabaseTasks] Columns missing, deleting all tasks (no filtering)');
                dbService.execute('DELETE FROM tasks');
            }

            // Insert all tasks - use column-aware INSERT
            newTasks.forEach(task => {
                if (hasTenantId && hasUserId) {
                    // Columns exist, use full INSERT
                    try {
                        dbService.execute(
                            'INSERT INTO tasks (id, text, completed, priority, created_at, updated_at, tenant_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                            [
                                task.id,
                                task.text,
                                task.completed ? 1 : 0,
                                task.priority,
                                task.createdAt,
                                Date.now(),
                                normalizedTenantId,
                                normalizedUserId
                            ]
                        );
                    } catch (insertError: any) {
                        if (insertError?.message?.includes('no such column')) {
                            // Columns don't actually exist, try without them
                            console.warn('[useDatabaseTasks] INSERT with columns failed, trying without tenant_id/user_id');
                            dbService.execute(
                                'INSERT INTO tasks (id, text, completed, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
                                [
                                    task.id,
                                    task.text,
                                    task.completed ? 1 : 0,
                                    task.priority,
                                    task.createdAt,
                                    Date.now()
                                ]
                            );
                        } else {
                            throw insertError;
                        }
                    }
                } else {
                    // Columns don't exist, INSERT without them
                    console.warn('[useDatabaseTasks] Inserting task without tenant_id/user_id (columns missing)');
                    dbService.execute(
                        'INSERT INTO tasks (id, text, completed, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
                        [
                            task.id,
                            task.text,
                            task.completed ? 1 : 0,
                            task.priority,
                            task.createdAt,
                            Date.now()
                        ]
                    );
                }
            });

            // Persist to storage and wait for completion
            await dbService.saveAsync();
            
            // Verify the save by querying back (use column-aware query)
            let verifyResults: Array<{ id: string; tenant_id: string | null; user_id: string | null }> = [];
            try {
                if (hasTenantId && hasUserId) {
                    verifyResults = dbService.query<{
                        id: string;
                        tenant_id: string | null;
                        user_id: string | null;
                    }>(
                        'SELECT id, tenant_id, user_id FROM tasks WHERE tenant_id = ? AND user_id = ?',
                        [normalizedTenantId, normalizedUserId]
                    );
                } else {
                    // Columns don't exist, just count all tasks
                    const allTasks = dbService.query<{ id: string }>('SELECT id FROM tasks');
                    verifyResults = allTasks.map(t => ({ ...t, tenant_id: null, user_id: null }));
                }
            } catch (verifyError: any) {
                if (verifyError?.message?.includes('no such column')) {
                    // Fallback: just count tasks
                    const allTasks = dbService.query<{ id: string }>('SELECT id FROM tasks');
                    verifyResults = allTasks.map(t => ({ ...t, tenant_id: null, user_id: null }));
                    console.warn('[useDatabaseTasks] Verification query failed (columns missing), using fallback');
                } else {
                    console.warn('[useDatabaseTasks] Verification query failed:', verifyError);
                }
            }
            
            console.log(`[useDatabaseTasks] ✅ Successfully saved ${newTasks.length} task(s) to local database`);
            console.log(`[useDatabaseTasks] Verification: Found ${verifyResults.length} tasks in DB after save`);
            if (verifyResults.length > 0) {
                console.log(`[useDatabaseTasks] Sample saved task:`, {
                    id: verifyResults[0].id,
                    tenant_id: verifyResults[0].tenant_id,
                    user_id: verifyResults[0].user_id
                });
            }
        } catch (error) {
            console.error('❌ Failed to save tasks to local database:', error);
            // Continue to try cloud save even if local fails
        }

        // Save to cloud API (if authenticated)
        if (isAuthenticated && user && tenant) {
            try {
                // Save each task to cloud API
                const savePromises = newTasks.map(task => {
                    return tasksApiRepo.create({
                        id: task.id,
                        text: task.text,
                        completed: task.completed,
                        priority: task.priority,
                        createdAt: task.createdAt
                    }).catch(err => {
                        console.warn(`Failed to save task ${task.id} to cloud:`, err);
                        return null;
                    });
                });

                await Promise.all(savePromises);
                console.log(`✅ Successfully saved ${newTasks.length} task(s) to cloud API for user ${userId} in tenant ${tenantId}`);
            } catch (error) {
                console.error('❌ Failed to save tasks to cloud API:', error);
                // Don't revert UI - local save succeeded, cloud sync can retry later
            }
        } else {
            console.log('ℹ️ Not authenticated, tasks saved to local database only');
        }

        // On error, reload from database to ensure consistency (use column-aware query)
        try {
            const dbService = getDatabaseService();
            if (dbService.isReady() && normalizedTenantId && normalizedUserId) {
                // Check if columns exist before querying
                let results: Array<{
                    id: string;
                    text: string;
                    completed: number;
                    priority: string;
                    created_at: number;
                    tenant_id: string | null;
                    user_id: string | null;
                }> = [];
                
                try {
                    const columnCheck = dbService.query<{ name: string }>('PRAGMA table_info(tasks)');
                    const columnNames = columnCheck.map(col => col.name);
                    const hasCols = columnNames.includes('tenant_id') && columnNames.includes('user_id');
                    
                    if (hasCols) {
                        results = dbService.query<{
                            id: string;
                            text: string;
                            completed: number;
                            priority: string;
                            created_at: number;
                            tenant_id: string | null;
                            user_id: string | null;
                        }>(
                            'SELECT id, text, completed, priority, created_at, tenant_id, user_id FROM tasks WHERE tenant_id = ? AND user_id = ? ORDER BY created_at DESC',
                            [normalizedTenantId, normalizedUserId]
                        );
                    } else {
                        // Columns missing, query all and filter in JS
                        const allTasks = dbService.query<{
                            id: string;
                            text: string;
                            completed: number;
                            priority: string;
                            created_at: number;
                        }>('SELECT id, text, completed, priority, created_at FROM tasks ORDER BY created_at DESC');
                        
                        results = allTasks.map(t => ({
                            ...t,
                            tenant_id: null,
                            user_id: null
                        }));
                    }
                } catch (queryError: any) {
                    if (queryError?.message?.includes('no such column')) {
                        // Fallback: query without columns
                        const allTasks = dbService.query<{
                            id: string;
                            text: string;
                            completed: number;
                            priority: string;
                            created_at: number;
                        }>('SELECT id, text, completed, priority, created_at FROM tasks ORDER BY created_at DESC');
                        
                        results = allTasks.map(t => ({
                            ...t,
                            tenant_id: null,
                            user_id: null
                        }));
                    } else {
                        throw queryError;
                    }
                }

                const loadedTasks: Task[] = results.map(row => ({
                    id: row.id,
                    text: row.text,
                    completed: row.completed === 1,
                    priority: row.priority as 'low' | 'medium' | 'high',
                    createdAt: row.created_at
                }));

                // Update state with actual database state
                setTasks(loadedTasks);
            }
        } catch (reloadError) {
            console.error('[useDatabaseTasks] Failed to reload tasks after save:', reloadError);
        }
    }, [tenantId, userId, user, tenant, isAuthenticated]);

    return [tasks, saveTasks];
}

export default useDatabaseTasks;
