/**
 * useDatabaseState Hook
 *
 * Replacement for useLocalStorage that uses SQL database instead.
 * Single owner of DB persist for app state; see doc/DB_STATE_LOADER_SAVER_CONTRACT.md.
 */

import React, { useState, useEffect, useCallback, Dispatch, SetStateAction } from 'react';
import { AppState } from '../types';
import { getDatabaseService } from '../services/database/databaseService';
import { getUnifiedDatabaseService } from '../services/database/unifiedDatabaseService';
import { isMobileDevice } from '../utils/platformDetection';
// Lazy import AppStateRepository to avoid initialization issues during module load
let AppStateRepositoryClass: any = null;
let appStateRepoLoadPromise: Promise<any> | null = null;

async function getAppStateRepository(): Promise<any> {
    try {
        if (AppStateRepositoryClass) {
            return new AppStateRepositoryClass();
        }

        if (!appStateRepoLoadPromise) {
            appStateRepoLoadPromise = import('../services/database/repositories/appStateRepository')
                .then(mod => {
                    AppStateRepositoryClass = mod.AppStateRepository;
                    return AppStateRepositoryClass;
                })
                .catch(error => {
                    console.error('❌ [useDatabaseState] Failed to load AppStateRepository:', error);
                    throw new Error(`Failed to load AppStateRepository: ${error instanceof Error ? error.message : String(error)}`);
                });
        }

        const RepoClass = await appStateRepoLoadPromise;
        return new RepoClass();
    } catch (error) {
        console.error('❌ [useDatabaseState] Failed to instantiate AppStateRepository:', error);
        throw error;
    }
}

let dbInitialized = false;
let initializationPromise: Promise<void> | null = null;

/** Set on beforeunload when state is dirty; cleared when save succeeds. Next load can detect possible unsaved data. */
const DB_STATE_DIRTY_KEY = 'finance_app_state_dirty';

async function ensureDatabaseInitialized(): Promise<void> {
    if (dbInitialized) return;

    if (initializationPromise) {
        return initializationPromise;
    }

    initializationPromise = (async () => {
        try {

            // Initialize unified service first
            const unifiedService = getUnifiedDatabaseService();
            await unifiedService.initialize();

            // For desktop, also initialize local SQLite
            if (!isMobileDevice()) {
                const dbService = getDatabaseService();
                await dbService.initialize();
            } else {
            }

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
): UseDatabaseStateResult<T> {
    // Start with initial value immediately - don't block rendering
    const [storedValue, setStoredValue] = useState<T>(initialValue);
    const [isLoading, setIsLoading] = useState(true); // Start as true to indicate loading
    const saveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
    const pendingSaveRef = React.useRef<T | null>(null);
    const hasModifiedRef = React.useRef(false);

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
                    const appStateRepo = await getAppStateRepository();
                    const state = await appStateRepo.loadState();

                    if (isMounted && timeoutId) {
                        if (timeoutId) clearTimeout(timeoutId);

                        // Only update if the state hasn't been modified by the user in the meantime
                        if (!hasModifiedRef.current) {
                            // Always use loaded state from database (it's the source of truth)
                            setStoredValue(state as T);
                            setIsLoading(false);
                        } else {
                            // Preserve user changes; persist current state so DB is not left stale
                            setIsLoading(false);
                            const valueToSave = pendingSaveRef.current ?? (storedValue as T);
                            if (valueToSave && valueToSave !== initialValue) {
                                ensureDatabaseInitialized()
                                    .then(async () => {
                                        const appStateRepo = await getAppStateRepository();
                                        await appStateRepo.saveState(valueToSave as AppState);
                                    })
                                    .catch(() => {});
                            }
                        }
                    }
                } catch (loadError) {
                    console.error('❌ Failed to load state from database, using initial state:', loadError);
                    // Use initial state if load fails
                    if (isMounted && timeoutId) {
                        clearTimeout(timeoutId);
                        if (!hasModifiedRef.current) {
                            setStoredValue(initialValue);
                        }
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
                }).catch(() => { });

                if (isMounted && timeoutId) {
                    clearTimeout(timeoutId);
                    if (!hasModifiedRef.current) {
                        setStoredValue(initialValue);
                    }
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
            hasModifiedRef.current = true;

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
                        return; // Don't try to save if database isn't available
                    }

                    const appStateRepo = await getAppStateRepository();
                    await appStateRepo.saveState(valueToSave as AppState);
                    if (typeof localStorage !== 'undefined') localStorage.removeItem(DB_STATE_DIRTY_KEY);
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

    // Flush to DB (for AppContext: single owner of persist). Clears debounce and saves.
    const saveNow = useCallback(async (value?: T, options?: { disableSyncQueueing?: boolean }) => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        const valueToSave = value ?? pendingSaveRef.current ?? storedValue;
        if (!valueToSave) return;

        try {
            await ensureDatabaseInitialized();
            const appStateRepo = await getAppStateRepository();
            await appStateRepo.saveState(valueToSave as AppState, options?.disableSyncQueueing ?? false);
            if (typeof localStorage !== 'undefined') localStorage.removeItem(DB_STATE_DIRTY_KEY);
            pendingSaveRef.current = null;
        } catch (error) {
            console.error('⚠️ Failed to save state (saveNow):', error);
            throw error;
        }
    }, [storedValue]);

    // Save immediately when component unmounts (with error handling).
    // Always persist latest value (pending or current) when there is something to save;
    // previously we skipped when pendingSaveRef was set, which lost pending changes.
    useEffect(() => {
        return () => {
            // Clear any pending timeout so we don't double-save
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }

            const valueToSave = pendingSaveRef.current ?? storedValue;
            const hasSomethingToSave = valueToSave && valueToSave !== initialValue;
            if (!isLoading && hasSomethingToSave) {
                ensureDatabaseInitialized()
                    .then(async () => {
                        const appStateRepo = await getAppStateRepository();
                        await appStateRepo.saveState(valueToSave as AppState);
                    })
                    .catch((error) => {
                        const errorMsg = error?.message || String(error);
                        if (!errorMsg.includes('UNIQUE constraint')) {
                        }
                    })
                    .finally(() => {
                        setTimeout(() => {
                            pendingSaveRef.current = null;
                        }, 1000);
                    });
            }
        };
    }, [storedValue, isLoading, initialValue]);

    // beforeunload/pagehide: best-effort save only. Browsers do not wait for async work,
    // so close-time save is not guaranteed. We set a dirty flag so next load can detect it.
    useEffect(() => {
        const handleBeforeUnload = () => {
            const valueToSave = pendingSaveRef.current || storedValue;
            if (valueToSave && valueToSave !== initialValue) {
                try {
                    if (typeof localStorage !== 'undefined') {
                        localStorage.setItem(DB_STATE_DIRTY_KEY, Date.now().toString());
                    }
                    ensureDatabaseInitialized().then(async () => {
                        try {
                            const appStateRepo = await getAppStateRepository();
                            await appStateRepo.saveState(valueToSave as AppState);
                            if (typeof localStorage !== 'undefined') {
                                localStorage.removeItem(DB_STATE_DIRTY_KEY);
                            }
                        } catch {
                            // Ignore errors during unload
                        }
                    }).catch(() => {});
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

    return [storedValue, setValue, { saveNow }];
}

export type UseDatabaseStateResult<T> = [
    T,
    React.Dispatch<React.SetStateAction<T>>,
    { saveNow: (value?: T, options?: { disableSyncQueueing?: boolean }) => Promise<void> }
];
export default useDatabaseState;
