/**
 * useDatabaseTasks Hook
 * 
 * Manages tasks in SQL database. Tasks are user-specific and tenant-specific.
 * Each user in an organization has their own tasks list.
 */

import { useState, useEffect, useCallback } from 'react';
import { Task } from '../types';
import { getDatabaseService } from '../services/database/databaseService';
import { getCurrentTenantId } from '../services/database/tenantUtils';
import { getCurrentUserId } from '../services/database/userUtils';
import { useAuth } from '../context/AuthContext';

async function ensureDatabaseInitialized(): Promise<void> {
    const dbService = getDatabaseService();
    if (!dbService.isReady()) {
        await dbService.initialize();
    }
}

export function useDatabaseTasks(): [Task[], (tasks: Task[]) => void] {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { user, tenant } = useAuth();

    // Get tenant_id and user_id - prefer AuthContext, fallback to localStorage
    const tenantId = tenant?.id || getCurrentTenantId();
    const userId = user?.id || getCurrentUserId();

    // Load tasks from database - filtered by user_id and tenant_id
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

                // Query tasks filtered by tenant_id and user_id
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
    }, [tenantId, userId]); // Reload when user or tenant changes

    // Save tasks to database with optimistic updates
    const saveTasks = useCallback(async (newTasks: Task[]) => {
        // Don't save if user/tenant not available
        if (!tenantId || !userId) {
            console.warn('Cannot save tasks: user or tenant not available');
            return;
        }

        // Optimistic update: Update UI immediately
        setTasks(newTasks);

        // Save to database in the background
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
            
            console.log(`Successfully saved ${newTasks.length} task(s) to database for user ${userId} in tenant ${tenantId}`);
        } catch (error) {
            console.error('Failed to save tasks to database:', error);
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

                    // Revert to actual database state on error
                    setTasks(loadedTasks);
                }
            } catch (reloadError) {
                console.error('Failed to reload tasks after save error:', reloadError);
            }
        }
    }, [tenantId, userId]);

    return [tasks, saveTasks];
}

export default useDatabaseTasks;
