/**
 * useDatabaseState Hook
 *
 * In-memory app state store for PostgreSQL/API mode.
 * State is loaded from the server in AppContext; this hook does not persist to SQLite.
 * See doc/DB_STATE_LOADER_SAVER_CONTRACT.md.
 */

import React, { useState, useEffect, useCallback, Dispatch, SetStateAction } from 'react';
import { AppState } from '../types';
import { _setAppDataLoading } from '../context/appStateStore';

export function useDatabaseState<T extends AppState>(
  key: string,
  initialValue: T,
  _reloadTrigger?: string | null
): UseDatabaseStateResult<T> {
  const [storedValue, setStoredValue] = useState<T>(initialValue);
  const [isLoading, setIsLoading] = useState(true);
  const hasLoadedFromDbRef = React.useRef(false);

  useEffect(() => {
    setStoredValue(initialValue);
    hasLoadedFromDbRef.current = true;
    setIsLoading(false);
  }, [initialValue]);

  const setValue: Dispatch<SetStateAction<T>> = useCallback((value) => {
    const valueToStore = value instanceof Function ? value(storedValue) : value;
    setStoredValue(valueToStore);
  }, [storedValue]);

  const saveNow = useCallback(async (value?: T) => {
    const valueToSave = value ?? storedValue;
    if (valueToSave) {
      setStoredValue(valueToSave as T);
    }
  }, [storedValue]);

  const markDbLoadComplete = useCallback(() => {
    hasLoadedFromDbRef.current = true;
  }, []);

  useEffect(() => {
    _setAppDataLoading(isLoading);
  }, [isLoading]);

  return [storedValue, setValue, { saveNow, markDbLoadComplete, isLoading }];
}

export type UseDatabaseStateResult<T> = [
  T,
  React.Dispatch<React.SetStateAction<T>>,
  {
    saveNow: (value?: T, options?: { disableSyncQueueing?: boolean }) => Promise<void>;
    markDbLoadComplete: () => void;
    isLoading: boolean;
  }
];

export default useDatabaseState;
