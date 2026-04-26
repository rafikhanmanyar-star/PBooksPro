import { useState, useEffect, useRef, useCallback, Dispatch, SetStateAction } from 'react';

function useLocalStorage<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  // Ref to keep track of the current value to avoid stale closures in timeout
  const valueRef = useRef(storedValue);

  useEffect(() => {
    valueRef.current = storedValue;
  }, [storedValue]);

  // Debounce the write to localStorage
  useEffect(() => {
    const handler = setTimeout(() => {
      try {
        window.localStorage.setItem(key, JSON.stringify(valueRef.current));
      } catch (error) {
        console.error("Failed to save to local storage", error);
      }
    }, 1000); // Wait 1 second after last change before writing

    return () => {
      clearTimeout(handler);
    };
  }, [storedValue, key]);

  const setValue = useCallback<Dispatch<SetStateAction<T>>>((value) => {
    try {
      setStoredValue((prev) => (value instanceof Function ? value(prev) : value));
    } catch (error) {
      console.error(error);
    }
  }, []);

  return [storedValue, setValue];
}

export default useLocalStorage;
