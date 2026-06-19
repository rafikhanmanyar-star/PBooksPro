import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseDebouncedSearchOptions {
  /** Initial input value. */
  initialValue?: string;
  /** Debounce delay in milliseconds. */
  delayMs?: number;
}

export interface UseDebouncedSearchResult {
  /** Live input value (updates immediately). */
  value: string;
  /** Debounced value (updates after delay). */
  debouncedValue: string;
  /** Set the live input value. */
  setValue: (next: string) => void;
  /** True while live value differs from debounced value. */
  isDebouncing: boolean;
  /**
   * Monotonic token bumped on each debounced value commit.
   * Compare after async work to ignore stale responses.
   */
  debounceGeneration: number;
  /** Returns true when `generation` matches the latest debounced generation. */
  isLatestGeneration: (generation: number) => boolean;
}

/**
 * Debounced search input with stale-generation guards for async fetch handlers.
 */
export function useDebouncedSearch(options: UseDebouncedSearchOptions = {}): UseDebouncedSearchResult {
  const { initialValue = '', delayMs = 300 } = options;
  const [value, setValueState] = useState(initialValue);
  const [debouncedValue, setDebouncedValue] = useState(initialValue);
  const [debounceGeneration, setDebounceGeneration] = useState(0);
  const latestGenerationRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      setDebouncedValue(value);
      latestGenerationRef.current += 1;
      setDebounceGeneration(latestGenerationRef.current);
    }, delayMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, delayMs]);

  const setValue = useCallback((next: string) => {
    setValueState(next);
  }, []);

  const isLatestGeneration = useCallback((generation: number) => {
    return generation === latestGenerationRef.current;
  }, []);

  return {
    value,
    debouncedValue,
    setValue,
    isDebouncing: value !== debouncedValue,
    debounceGeneration,
    isLatestGeneration,
  };
}
