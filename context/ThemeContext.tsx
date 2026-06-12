import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export const THEME_STORAGE_KEY = 'theme';

/** User preference — may follow OS when set to system. */
export type ThemePreference = 'light' | 'dark' | 'system';

/** Resolved appearance applied to the document. */
export type ThemeMode = 'light' | 'dark';

function getSystemDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveThemeMode(preference: ThemePreference): ThemeMode {
  if (preference === 'system') return getSystemDark() ? 'dark' : 'light';
  return preference;
}

function readStoredPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {
    /* ignore */
  }
  return 'system';
}

/** Resolve theme on first paint: explicit saved value, else system. */
export function resolveInitialTheme(): ThemeMode {
  return resolveThemeMode(readStoredPreference());
}

export function applyThemeToDocument(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', theme === 'dark' ? '#0f172a' : '#f8fafc');
  }
}

type ThemeContextValue = {
  /** Resolved light/dark applied to the UI */
  theme: ThemeMode;
  /** User preference including system */
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  /** @deprecated Use setPreference — kept for header toggle compatibility */
  setTheme: (t: ThemeMode) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readStoredPreference());
  const [theme, setThemeState] = useState<ThemeMode>(() => resolveThemeMode(readStoredPreference()));

  const applyPreference = useCallback((p: ThemePreference) => {
    const resolved = resolveThemeMode(p);
    setPreferenceState(p);
    setThemeState(resolved);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, p);
    } catch {
      /* ignore */
    }
    applyThemeToDocument(resolved);
  }, []);

  const setPreference = useCallback(
    (p: ThemePreference) => {
      applyPreference(p);
    },
    [applyPreference]
  );

  const setTheme = useCallback(
    (t: ThemeMode) => {
      applyPreference(t);
    },
    [applyPreference]
  );

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  useEffect(() => {
    if (preference !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const resolved = resolveThemeMode('system');
      setThemeState(resolved);
      applyThemeToDocument(resolved);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY || !e.newValue) return;
      if (e.newValue === 'light' || e.newValue === 'dark' || e.newValue === 'system') {
        applyPreference(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [applyPreference]);

  const value = useMemo(
    () => ({ theme, preference, setPreference, setTheme, toggleTheme }),
    [theme, preference, setPreference, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}

/** Safe for components that may render outside provider (e.g. tests). */
export function useThemeOptional(): ThemeContextValue | null {
  return useContext(ThemeContext);
}
