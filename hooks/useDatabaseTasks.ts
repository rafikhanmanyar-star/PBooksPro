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
    const tenantId = tenant?.id || getCurrentTenantId();
    const userId = user?.id || getCurrentUserId();

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
                await ensureDatabaseInitialized();
                if (!isMounted) return;

                const dbService = getDatabaseService();
                
                // Double-check database is ready
                if (!dbService.isReady()) {
                    console.warn('Database not ready, retrying...');
                    await dbService.initialize();
                    if (!isMounted) return;
                }

                // Ensure tasks table exists (safety check)
                dbService.ensureAllTablesExist();

                // Load from local database first
                const localResults = dbService.query<{
                    id: string;
                    text: string;
                    completed: number;
                    priority: string;
                    created_at: number;
                    tenant_id: string | null;
                    user_id: string | null;
                }>(
                    'SELECT * FROM tasks WHERE tenant_id = ? AND user_id = ? ORDER BY created_at DESC',
                    [tenantId, userId]
                );

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
                        const tasksApiRepo = new TasksApiRepository();
                        const cloudTasks = await tasksApiRepo.findAll();
                        
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

                        // Sync cloud tasks to local database for offline access
                        if (cloudTasksFormatted.length > 0) {
                            // Delete existing tasks for this user
                            dbService.execute(
                                'DELETE FROM tasks WHERE tenant_id = ? AND user_id = ?',
                                [tenantId, userId]
                            );

                            // Insert cloud tasks into local database
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
                                        tenantId,
                                        userId
                                    ]
                                );
                            });

                            await dbService.saveAsync();
                        }
                    } catch (apiError) {
                        console.warn('Failed to load tasks from cloud API, using local only:', apiError);
                        // Continue with local tasks only
                    }
                }

                if (isMounted) {
                    setTasks(loadedTasks);
                    setIsLoading(false);
                }
            } catch (error) {
                console.error('Failed to load tasks:', error);
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
            console.warn('Cannot save tasks: user or tenant not available');
            return;
        }

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

            // Delete all existing tasks for this user and tenant
            dbService.execute(
                'DELETE FROM tasks WHERE tenant_id = ? AND user_id = ?',
                [tenantId, userId]
            );

            // Insert all tasks with tenant_id and user_id
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
                        tenantId,
                        userId
                    ]
                );
            });

            // Persist to storage and wait for completion
            await dbService.saveAsync();
            
            console.log(`✅ Successfully saved ${newTasks.length} task(s) to local database for user ${userId} in tenant ${tenantId}`);
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

        // On error, reload from database to ensure consistency
        try {
            const dbService = getDatabaseService();
            if (dbService.isReady() && tenantId && userId) {
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
                    [tenantId, userId]
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
