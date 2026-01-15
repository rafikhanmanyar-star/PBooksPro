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

                // Load from local database first
                // First, let's check what tasks exist in the database (for debugging)
                // Use a safe query that handles missing columns gracefully
                let allTasks: Array<{ id: string; text: string; tenant_id: string | null; user_id: string | null }> = [];
                try {
                    allTasks = dbService.query<{
                        id: string;
                        text: string;
                        tenant_id: string | null;
                        user_id: string | null;
                    }>('SELECT id, text, tenant_id, user_id FROM tasks LIMIT 10');
                } catch (queryError: any) {
                    // If columns don't exist, try to add them and retry
                    if (queryError?.message?.includes('no such column')) {
                        console.warn('[useDatabaseTasks] Columns missing, running migration again...');
                        try {
                            migrateTenantColumns();
                            // Retry query
                            allTasks = dbService.query<{
                                id: string;
                                text: string;
                                tenant_id: string | null;
                                user_id: string | null;
                            }>('SELECT id, text, tenant_id, user_id FROM tasks LIMIT 10');
                        } catch (retryError) {
                            console.error('[useDatabaseTasks] Failed to add columns, using fallback query:', retryError);
                            // Fallback: query without tenant_id/user_id
                            try {
                                const fallbackTasks = dbService.query<{ id: string; text: string }>('SELECT id, text FROM tasks LIMIT 10');
                                allTasks = fallbackTasks.map(t => ({ ...t, tenant_id: null, user_id: null }));
                            } catch (fallbackError) {
                                console.error('[useDatabaseTasks] Fallback query also failed:', fallbackError);
                            }
                        }
                    } else {
                        throw queryError;
                    }
                }
                
                console.log(`[useDatabaseTasks] Total tasks in database: ${allTasks.length}`);
                if (allTasks.length > 0) {
                    console.log(`[useDatabaseTasks] Sample tasks in DB:`, allTasks.map(t => ({
                        id: t.id,
                        text: t.text?.substring(0, 20),
                        tenant_id: t.tenant_id,
                        user_id: t.user_id
                    })));
                }
                
                // Now query with filters - normalize IDs for query
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
                        'SELECT * FROM tasks WHERE tenant_id = ? AND user_id = ? ORDER BY created_at DESC',
                        [normalizedTenantId, normalizedUserId]
                    );
                } catch (queryError: any) {
                    // If columns don't exist, try to add them and retry
                    if (queryError?.message?.includes('no such column')) {
                        console.warn('[useDatabaseTasks] tenant_id/user_id columns missing, running migration...');
                        try {
                            migrateTenantColumns();
                            // Retry query
                            localResults = dbService.query<{
                                id: string;
                                text: string;
                                completed: number;
                                priority: string;
                                created_at: number;
                                tenant_id: string | null;
                                user_id: string | null;
                            }>(
                                'SELECT * FROM tasks WHERE tenant_id = ? AND user_id = ? ORDER BY created_at DESC',
                                [normalizedTenantId, normalizedUserId]
                            );
                        } catch (retryError) {
                            console.error('[useDatabaseTasks] Failed to query after migration:', retryError);
                            // Fallback: query all tasks (no filtering)
                            try {
                                const fallbackResults = dbService.query<{
                                    id: string;
                                    text: string;
                                    completed: number;
                                    priority: string;
                                    created_at: number;
                                }>('SELECT id, text, completed, priority, created_at FROM tasks ORDER BY created_at DESC');
                                localResults = fallbackResults.map(t => ({
                                    ...t,
                                    tenant_id: null,
                                    user_id: null
                                }));
                                console.warn('[useDatabaseTasks] Using fallback query (no tenant/user filtering)');
                            } catch (fallbackError) {
                                console.error('[useDatabaseTasks] Fallback query also failed:', fallbackError);
                                throw fallbackError;
                            }
                        }
                    } else {
                        throw queryError;
                    }
                }

                console.log(`[useDatabaseTasks] Found ${localResults.length} tasks matching tenantId="${tenantId}" and userId="${userId}"`);
                
                // If no results but we have tasks in DB, check if IDs don't match
                if (localResults.length === 0 && allTasks.length > 0) {
                    console.warn(`[useDatabaseTasks] ⚠️ No tasks found with current IDs, but tasks exist in DB!`);
                    console.warn(`[useDatabaseTasks] Current tenantId: "${tenantId}", Current userId: "${userId}"`);
                    console.warn(`[useDatabaseTasks] Tasks in DB have:`, allTasks.map(t => ({
                        tenant_id: `"${t.tenant_id}"`,
                        user_id: `"${t.user_id}"`
                    })));
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

            // Ensure tasks table exists (safety check)
            dbService.ensureAllTablesExist();
            
            // CRITICAL: Ensure tenant_id and user_id columns exist on tasks table
            // Run migration BEFORE any queries that use these columns
            try {
                migrateTenantColumns();
            } catch (migrationError) {
                console.error('[useDatabaseTasks] Tenant column migration failed during save:', migrationError);
                // Try to add columns directly as fallback
                try {
                    const tableCheck = dbService.query<{ name: string }>(
                        "SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'"
                    );
                    if (tableCheck.length > 0) {
                        try {
                            dbService.execute('ALTER TABLE tasks ADD COLUMN tenant_id TEXT');
                        } catch (e: any) {
                            if (!e?.message?.includes('duplicate column')) {
                                console.warn('[useDatabaseTasks] Could not add tenant_id:', e);
                            }
                        }
                        try {
                            dbService.execute('ALTER TABLE tasks ADD COLUMN user_id TEXT');
                        } catch (e: any) {
                            if (!e?.message?.includes('duplicate column')) {
                                console.warn('[useDatabaseTasks] Could not add user_id:', e);
                            }
                        }
                    }
                } catch (fallbackError) {
                    console.error('[useDatabaseTasks] Fallback column addition failed:', fallbackError);
                }
            }

            // Delete all existing tasks for this user and tenant (use normalized IDs)
            const normalizedTenantId = tenantId?.trim() || null;
            const normalizedUserId = userId?.trim() || null;
            
            dbService.execute(
                'DELETE FROM tasks WHERE tenant_id = ? AND user_id = ?',
                [normalizedTenantId, normalizedUserId]
            );

            // Insert all tasks with tenant_id and user_id (already normalized above)
            newTasks.forEach(task => {
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
            });

            // Persist to storage and wait for completion
            await dbService.saveAsync();
            
            // Verify the save by querying back (use normalized IDs)
            const verifyResults = dbService.query<{
                id: string;
                tenant_id: string | null;
                user_id: string | null;
            }>(
                'SELECT id, tenant_id, user_id FROM tasks WHERE tenant_id = ? AND user_id = ?',
                [normalizedTenantId, normalizedUserId]
            );
            
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

        // On error, reload from database to ensure consistency (use normalized IDs)
        try {
            const dbService = getDatabaseService();
            if (dbService.isReady() && normalizedTenantId && normalizedUserId) {
                const results = dbService.query<{
                    id: string;
                    text: string;
                    completed: number;
                    priority: string;
                    created_at: number;
                    tenant_id: string | null;
                    user_id: string | null;
                }>(
                    'SELECT * FROM tasks WHERE tenant_id = ? AND user_id = ? ORDER BY created_at DESC',
                    [normalizedTenantId, normalizedUserId]
                );

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
            console.error('Failed to reload tasks after save:', reloadError);
        }
    }, [tenantId, userId, user, tenant, isAuthenticated]);

    return [tasks, saveTasks];
}

export default useDatabaseTasks;
