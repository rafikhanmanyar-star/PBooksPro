/**
 * Fallback hook that uses localStorage if database fails
 * This ensures the app always works, even if SQL database is unavailable
 */

import { useState, useEffect, useCallback, Dispatch, SetStateAction } from 'react';
import { AppState } from '../types';

export function useDatabaseStateFallback<T extends AppState>(
    key: string,
    initialValue: T
): [T, Dispatch<SetStateAction<T>>] {
    const [storedValue, setStoredValue] = useState<T>(() => {
        try {
            const item = window.localStorage.getItem(key);
            return item ? JSON.parse(item) : initialValue;
        } catch (error) {
            console.error('Failed to load from localStorage:', error);
            return initialValue;
        }
    });

    const setValue: Dispatch<SetStateAction<T>> = useCallback((value) => {
        try {
            const valueToStore = value instanceof Function ? value(storedValue) : value;
            setStoredValue(valueToStore);
            
            // Debounce localStorage writes
            const timeoutId = setTimeout(() => {
                try {
                    window.localStorage.setItem(key, JSON.stringify(valueToStore));
                } catch (error) {
                    console.error('Failed to save to localStorage:', error);
                }
            }, 1000); // 1 second debounce

            return () => clearTimeout(timeoutId);
        } catch (error) {
            console.error('Failed to update state:', error);
        }
    }, [storedValue, key]);

    return [storedValue, setValue];
}
