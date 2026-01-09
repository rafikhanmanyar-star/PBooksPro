/**
 * useDatabaseTasks Hook
 * 
 * Manages tasks in SQL database instead of localStorage.
 */

import { useState, useEffect, useCallback } from 'react';
import { Task } from '../types';
import { getDatabaseService } from '../services/database/databaseService';

async function ensureDatabaseInitialized(): Promise<void> {
    const dbService = getDatabaseService();
    if (!dbService.isReady()) {
        await dbService.initialize();
    }
}

export function useDatabaseTasks(): [Task[], (tasks: Task[]) => void] {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Load tasks from database
    useEffect(() => {
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

                const results = dbService.query<{
                    id: string;
                    text: string;
                    completed: number;
                    priority: string;
                    created_at: number;
                }>('SELECT * FROM tasks ORDER BY created_at DESC');

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
    }, []);

    // Save tasks to database with optimistic updates
    const saveTasks = useCallback(async (newTasks: Task[]) => {
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

            // Start transaction-like operation
            // Delete all existing tasks
            dbService.execute('DELETE FROM tasks');

            // Insert all tasks
            newTasks.forEach(task => {
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
            });

            // Persist to storage and wait for completion
            await dbService.saveAsync();
            
            console.log(`Successfully saved ${newTasks.length} task(s) to database`);
        } catch (error) {
            console.error('Failed to save tasks to database:', error);
            // On error, reload from database to ensure consistency
            try {
                const dbService = getDatabaseService();
                if (dbService.isReady()) {
                    const results = dbService.query<{
                        id: string;
                        text: string;
                        completed: number;
                        priority: string;
                        created_at: number;
                    }>('SELECT * FROM tasks ORDER BY created_at DESC');

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
    }, []);

    return [tasks, saveTasks];
}

export default useDatabaseTasks;
