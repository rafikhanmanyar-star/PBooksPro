/**
 * useDatabaseTasks Hook
 * 
 * Manages tasks in SQL database instead of localStorage.
 */

import { useState, useEffect, useCallback } from 'react';
import { Task } from '../types';
import { getDatabaseService } from '../services/database/databaseService';

let dbInitialized = false;

async function ensureDatabaseInitialized(): Promise<void> {
    if (dbInitialized) return;
    const dbService = getDatabaseService();
    await dbService.initialize();
    dbInitialized = true;
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

    // Save tasks to database
    const saveTasks = useCallback(async (newTasks: Task[]) => {
        try {
            await ensureDatabaseInitialized();
            const dbService = getDatabaseService();

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

            dbService.save();
            setTasks(newTasks);
        } catch (error) {
            console.error('Failed to save tasks:', error);
        }
    }, []);

    return [tasks, saveTasks];
}

export default useDatabaseTasks;
