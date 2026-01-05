/**
 * useDatabaseState Hook
 * 
 * Replacement for useLocalStorage that uses SQL database instead.
 * Provides the same interface for seamless migration.
 */

import React, { useState, useEffect, useCallback, Dispatch, SetStateAction } from 'react';
import { AppState } from '../types';
import { getDatabaseService } from '../services/database/databaseService';
import { AppStateRepository } from '../services/database/repositories/appStateRepository';

let dbInitialized = false;
let initializationPromise: Promise<void> | null = null;

async function ensureDatabaseInitialized(): Promise<void> {
    if (dbInitialized) return;
    
    if (initializationPromise) {
        return initializationPromise;
    }

    initializationPromise = (async () => {
        try {
            console.log('[useDatabaseState] Getting database service...');
            const dbService = getDatabaseService();
            console.log('[useDatabaseState] Database service obtained, initializing...');
            await dbService.initialize();
            console.log('[useDatabaseState] Database initialized successfully');
            dbInitialized = true;
        } catch (error) {
            console.error('❌ [useDatabaseState] Database initialization failed:', error);
            console.error('❌ [useDatabaseState] Error details:', {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                name: error instanceof Error ? error.name : typeof error
            });
            throw error;
        }
    })();

    return initializationPromise;
}

export function useDatabaseState<T extends AppState>(
    key: string,
    initialValue: T
): [T, Dispatch<SetStateAction<T>>] {
    // Start with initial value immediately - don't block rendering
    const [storedValue, setStoredValue] = useState<T>(initialValue);
    const [isLoading, setIsLoading] = useState(true); // Start as true to indicate loading
    const saveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
    const pendingSaveRef = React.useRef<T | null>(null);

    // Load initial state from database
    useEffect(() => {
        let isMounted = true;
        let timeoutId: NodeJS.Timeout | null = null;

        const loadState = async () => {
            try {
                setIsLoading(true);
                
                // Add timeout to prevent infinite loading
                timeoutId = setTimeout(() => {
                    if (isMounted) {
                        console.warn('⚠️ Database load timeout - using initial state');
                        setStoredValue(initialValue);
                        setIsLoading(false);
                    }
                }, 10000); // 10 second timeout

                try {
                    await ensureDatabaseInitialized();
                } catch (initError) {
                    console.error('❌ Database initialization failed, using initial state:', initError);
                    // Use initial state if database fails
                    if (isMounted && timeoutId) {
                        clearTimeout(timeoutId);
                        setStoredValue(initialValue);
                        setIsLoading(false);
                    }
                    return;
                }
                
                if (!isMounted) {
                    if (timeoutId) clearTimeout(timeoutId);
                    return;
                }

                try {
                    const appStateRepo = new AppStateRepository();
                    const state = await appStateRepo.loadState();
                    
                    if (isMounted && timeoutId) {
                        clearTimeout(timeoutId);
                        // Always use loaded state from database (it's the source of truth)
                        // The database will have the initial state if it's a fresh install
                        console.log('✅ Loaded state from database:', {
                            users: state.users.length,
                            accounts: state.accounts.length,
                            transactions: state.transactions.length,
                            invoices: state.invoices.length,
                            contacts: state.contacts.length
                        });
                        setStoredValue(state as T);
                        setIsLoading(false);
                    }
                } catch (loadError) {
                    console.error('❌ Failed to load state from database, using initial state:', loadError);
                    // Use initial state if load fails
                    if (isMounted && timeoutId) {
                        clearTimeout(timeoutId);
                        setStoredValue(initialValue);
                        setIsLoading(false);
                    }
                }
            } catch (error) {
                console.error('❌ Unexpected error in loadState:', error);
                
                // Log error (but don't block)
                import('../services/errorLogger').then(({ getErrorLogger }) => {
                    getErrorLogger().logError(error instanceof Error ? error : new Error(String(error)), {
                        errorType: 'database_load',
                        componentStack: 'useDatabaseState hook'
                    });
                }).catch(() => {});
                
                if (isMounted && timeoutId) {
                    clearTimeout(timeoutId);
                    setStoredValue(initialValue);
                    setIsLoading(false);
                }
            }
        };

        // Load state immediately
        loadState();

        return () => {
            isMounted = false;
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [initialValue]);

    // Save state to database when it changes
    const setValue: Dispatch<SetStateAction<T>> = useCallback((value) => {
        try {
            const valueToStore = value instanceof Function ? value(storedValue) : value;
            setStoredValue(valueToStore);
            
            // Store pending save
            pendingSaveRef.current = valueToStore;

            // Clear existing timeout
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }

            // Debounce database writes (with error handling)
            saveTimeoutRef.current = setTimeout(async () => {
                const valueToSave = pendingSaveRef.current;
                if (!valueToSave) return;
                
                try {
                    try {
                        await ensureDatabaseInitialized();
                    } catch (initError) {
                        console.warn('⚠️ Database not available for save, state will be lost on reload:', initError);
                        return; // Don't try to save if database isn't available
                    }
                    
                    const appStateRepo = new AppStateRepository();
                    await appStateRepo.saveState(valueToSave as AppState);
                    console.log('✅ State saved to database');
                    pendingSaveRef.current = null;
                } catch (error) {
                    console.error('⚠️ Failed to save state to database:', error);
                    
                    // Log error but don't throw
                    try {
                        const { getErrorLogger } = await import('../services/errorLogger');
                        getErrorLogger().logError(error instanceof Error ? error : new Error(String(error)), {
                            errorType: 'database_save',
                            componentStack: 'useDatabaseState hook'
                        });
                    } catch (logError) {
                        console.error('Failed to log database save error:', logError);
                    }
                }
            }, 2000); // 2 second debounce - prevents blocking navigation with frequent saves

        } catch (error) {
            console.error('Failed to update state:', error);
        }
    }, [storedValue]);
    
    // Immediate save function (for critical operations)
    const saveImmediately = useCallback(async () => {
        const valueToSave = pendingSaveRef.current || storedValue;
        if (!valueToSave) return;
        
        try {
            await ensureDatabaseInitialized();
            const appStateRepo = new AppStateRepository();
            await appStateRepo.saveState(valueToSave as AppState);
            console.log('✅ State saved immediately to database');
            pendingSaveRef.current = null;
        } catch (error) {
            console.error('⚠️ Failed to save state immediately:', error);
        }
    }, [storedValue]);

    // Save immediately when component unmounts (with error handling)
    useEffect(() => {
        return () => {
            // Clear any pending timeout
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
            
            // Save immediately on unmount
            if (!isLoading) {
                const valueToSave = pendingSaveRef.current || storedValue;
                if (valueToSave && valueToSave !== initialValue) {
                    ensureDatabaseInitialized()
                        .then(() => {
                            const appStateRepo = new AppStateRepository();
                            return appStateRepo.saveState(valueToSave as AppState);
                        })
                        .catch((error) => {
                            console.warn('⚠️ Failed to save state on unmount:', error);
                            // Don't throw - just log
                        });
                }
            }
        };
    }, [storedValue, isLoading, initialValue]);
    
    // Add window unload handler to save state before page closes
    useEffect(() => {
        const handleBeforeUnload = () => {
            // Save immediately before page unloads
            const valueToSave = pendingSaveRef.current || storedValue;
            if (valueToSave && valueToSave !== initialValue) {
                // Use synchronous storage if possible
                try {
                    ensureDatabaseInitialized().then(() => {
                        const appStateRepo = new AppStateRepository();
                        appStateRepo.saveState(valueToSave as AppState).catch(() => {
                            // Ignore errors during unload
                        });
                    }).catch(() => {
                        // Ignore errors during unload
                    });
                } catch (e) {
                    // Ignore errors during unload
                }
            }
        };
        
        window.addEventListener('beforeunload', handleBeforeUnload);
        window.addEventListener('pagehide', handleBeforeUnload);
        
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            window.removeEventListener('pagehide', handleBeforeUnload);
        };
    }, [storedValue, initialValue]);

    return [storedValue, setValue];
}

export default useDatabaseState;
