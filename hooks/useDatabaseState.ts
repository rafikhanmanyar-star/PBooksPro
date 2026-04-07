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
import { isLocalOnlyMode } from '../config/apiUrl';
import { isMobileDevice } from '../utils/platformDetection';

/** Local-only: no debounce — every state push schedules an immediate save (critical path uses saveNow anyway). */
const PERSIST_DEBOUNCE_MS = isLocalOnlyMode() ? 0 : 2000;
import { AppStateRepository } from '../services/database/repositories/appStateRepository';

function getAppStateRepository() {
    return new AppStateRepository();
}

let dbInitialized = false;
let initializationPromise: Promise<void> | null = null;

/** Set on beforeunload when state is dirty; cleared when save succeeds. Next load can detect possible unsaved data. */
const DB_STATE_DIRTY_KEY = 'finance_app_state_dirty';

async function ensureDatabaseInitialized(): Promise<void> {
    if (dbInitialized) return;
    if (!isLocalOnlyMode()) return;

    if (initializationPromise) {
        return initializationPromise;
    }

    initializationPromise = (async () => {
        try {
            const unifiedService = getUnifiedDatabaseService();
            await unifiedService.initialize();

            if (!isMobileDevice()) {
                const dbService = getDatabaseService();
                await dbService.initialize();
                if (!dbService.isReady()) {
                    // No company DB open yet — silently skip; will retry on next call.
                    return;
                }
            }

            dbInitialized = true;
        } catch (error) {
            console.error('❌ [useDatabaseState] Database initialization failed:', error);
            throw error;
        } finally {
            initializationPromise = null;
        }
    })();

    return initializationPromise;
}

/**
 * Optional reload trigger: when this value changes (e.g. active company id),
 * the hook will re-run load from DB. Use when DB is opened later (e.g. user
 * selects a company after cold start) so state is loaded from the correct company DB.
 */
export function useDatabaseState<T extends AppState>(
    key: string,
    initialValue: T,
    reloadTrigger?: string | null
): UseDatabaseStateResult<T> {
    // Start with initial value immediately - don't block rendering
    const [storedValue, setStoredValue] = useState<T>(initialValue);
    const [isLoading, setIsLoading] = useState(true); // Start as true to indicate loading
    const saveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
    const pendingSaveRef = React.useRef<T | null>(null);
    const hasModifiedRef = React.useRef(false);
    // Guard: never save to DB until we've loaded from it at least once.
    // Prevents writing empty initialState and wiping real data.
    const hasLoadedFromDbRef = React.useRef(false);

    // Load initial state from database (and re-load when reloadTrigger changes, e.g. company opened)
    useEffect(() => {
        let isMounted = true;
        let timeoutId: NodeJS.Timeout | null = null;

        const loadState = async () => {
            try {
                setIsLoading(true);

                // LAN / API mode: state is loaded from server in AppContext; keep in-memory store only (no SQLite).
                if (!isLocalOnlyMode()) {
                    if (isMounted) {
                        setStoredValue(initialValue);
                        hasLoadedFromDbRef.current = true;
                        setIsLoading(false);
                    }
                    return;
                }

                // Local-only multi-company: skip DB access until a company is selected (avoids "No database open" IPC).
                // When AppProvider passes activeCompany.id as reloadTrigger, load runs and hasLoadedFromDbRef is set — required for saveNow to persist.
                if (isLocalOnlyMode() && (reloadTrigger === null || reloadTrigger === undefined)) {
                    if (isMounted) {
                        setStoredValue(initialValue);
                        setIsLoading(false);
                    }
                    return;
                }

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

                // Skip load when no company DB is open (multi-company mode: avoids noisy warnings)
                const dbService = getDatabaseService();
                if (!dbService.isReady()) {
                    if (isMounted && timeoutId) {
                        clearTimeout(timeoutId);
                        setStoredValue(initialValue);
                        setIsLoading(false);
                    }
                    return;
                }

                try {
                    const appStateRepo = getAppStateRepository();
                    const state = await appStateRepo.loadState();

                    if (isMounted && timeoutId) {
                        if (timeoutId) clearTimeout(timeoutId);

                        // Only update if the state hasn't been modified by the user in the meantime
                        hasLoadedFromDbRef.current = true;
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
                                        const appStateRepo = getAppStateRepository();
                                        await appStateRepo.saveState(valueToSave as AppState, true);
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
    }, [initialValue, reloadTrigger]);

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
                if (!hasLoadedFromDbRef.current) return;
                if (!isLocalOnlyMode()) {
                    pendingSaveRef.current = null;
                    return;
                }

                try {
                    try {
                        await ensureDatabaseInitialized();
                    } catch (initError) {
                        return; // Don't try to save if database isn't available
                    }

                    const appStateRepo = getAppStateRepository();
                    await appStateRepo.saveState(valueToSave as AppState, false);
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
            }, PERSIST_DEBOUNCE_MS);

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
        if (!hasLoadedFromDbRef.current) return;

        if (!isLocalOnlyMode()) {
            setStoredValue(valueToSave as T);
            pendingSaveRef.current = null;
            return;
        }

        try {
            await ensureDatabaseInitialized();
            const dbService = getDatabaseService();
            if (!dbService.isReady()) {
                await dbService.initialize();
            }
            if (!dbService.isReady()) {
                throw new Error('Cannot save: no company database is open. Your changes are only in memory until you open a company file.');
            }
            const appStateRepo = getAppStateRepository();
            await appStateRepo.saveState(valueToSave as AppState, options?.disableSyncQueueing ?? false);
            const eds = dbService as unknown as { commitAllPendingToDisk?: () => Promise<{ ok: boolean }> };
            if (typeof eds.commitAllPendingToDisk === 'function') {
                await eds.commitAllPendingToDisk();
            }
            // Keep hook value in sync with what was persisted (avoids stale storedValue vs reducer state).
            setStoredValue(valueToSave as T);
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
            if (!isLoading && hasSomethingToSave && hasLoadedFromDbRef.current && isLocalOnlyMode()) {
                ensureDatabaseInitialized()
                    .then(async () => {
                        const appStateRepo = getAppStateRepository();
                        await appStateRepo.saveState(valueToSave as AppState, true);
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
            if (!isLocalOnlyMode()) return;
            if (!hasLoadedFromDbRef.current) return;
            const valueToSave = pendingSaveRef.current || storedValue;
            if (valueToSave && valueToSave !== initialValue) {
                try {
                    if (typeof localStorage !== 'undefined') {
                        localStorage.setItem(DB_STATE_DIRTY_KEY, Date.now().toString());
                    }
                    ensureDatabaseInitialized().then(async () => {
                        try {
                            const appStateRepo = getAppStateRepository();
                            await appStateRepo.saveState(valueToSave as AppState, true);
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

    /** Call after AppContext loads state via loadState + setStoredState so saveNow works even if this hook's async load has not finished yet (avoids silent no-op saves). */
    const markDbLoadComplete = useCallback(() => {
        hasLoadedFromDbRef.current = true;
    }, []);

    return [storedValue, setValue, { saveNow, markDbLoadComplete }];
}

export type UseDatabaseStateResult<T> = [
    T,
    React.Dispatch<React.SetStateAction<T>>,
    {
        saveNow: (value?: T, options?: { disableSyncQueueing?: boolean }) => Promise<void>;
        markDbLoadComplete: () => void;
    }
];
export default useDatabaseState;
