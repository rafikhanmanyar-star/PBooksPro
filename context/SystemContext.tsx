import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import packageJson from '../package.json';
import {
  PBOOKS_SESSION_DATA_SOURCE_KEY,
} from '../config/apiUrl';
import { useAuth } from './AuthContext';
import { systemApi } from '../services/api/systemApi';
import {
  getLocalDesktopSystemInfo,
  type SystemFeatureKey,
  type SystemFeatures,
  type SystemInfo,
} from '../shared/systemFeatures';

const SYSTEM_INFO_CACHE_KEY = 'pbooks_system_info';

type SystemContextValue = {
  edition: SystemInfo['edition'] | null;
  version: string | null;
  features: SystemFeatures | null;
  isLoading: boolean;
  error: string | null;
  isFeatureEnabled: (feature: SystemFeatureKey) => boolean;
  refreshSystemInfo: () => Promise<void>;
};

const SystemContext = createContext<SystemContextValue | undefined>(undefined);

function readCachedSystemInfo(): SystemInfo | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SYSTEM_INFO_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SystemInfo;
  } catch {
    return null;
  }
}

function writeCachedSystemInfo(info: SystemInfo): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(SYSTEM_INFO_CACHE_KEY, JSON.stringify(info));
  } catch {
    /* ignore quota */
  }
}

function clearCachedSystemInfo(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(SYSTEM_INFO_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

function shouldFetchSystemInfoFromApi(): boolean {
  if (typeof window === 'undefined') return false;
  const token = localStorage.getItem('auth_token');
  if (!token) return false;

  return true;
}

function getOfflineDesktopSystemInfo(): SystemInfo {
  const version =
    (import.meta.env.APP_VERSION as string | undefined) || packageJson.version || '0.0.0';
  return getLocalDesktopSystemInfo(version);
}

export const SystemProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(() => readCachedSystemInfo());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applySystemInfo = useCallback((info: SystemInfo) => {
    setSystemInfo(info);
    writeCachedSystemInfo(info);
    setError(null);
  }, []);

  const refreshSystemInfo = useCallback(async () => {
    if (!shouldFetchSystemInfoFromApi()) {
      applySystemInfo(getOfflineDesktopSystemInfo());
      return;
    }

    setIsLoading(true);
    try {
      const info = await systemApi.getInfo();
      applySystemInfo(info);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load system information';
      setError(message);
      setSystemInfo((prev) => {
        const fallback = prev ?? getOfflineDesktopSystemInfo();
        writeCachedSystemInfo(fallback);
        return fallback;
      });
    } finally {
      setIsLoading(false);
    }
  }, [applySystemInfo]);

  useEffect(() => {
    if (!isAuthenticated) {
      setSystemInfo(null);
      setError(null);
      setIsLoading(false);
      clearCachedSystemInfo();
      return;
    }

    const cached = readCachedSystemInfo();
    if (cached) {
      setSystemInfo(cached);
    }

    void refreshSystemInfo();
  }, [isAuthenticated, refreshSystemInfo]);

  const isFeatureEnabled = useCallback(
    (feature: SystemFeatureKey): boolean => {
      return systemInfo?.features[feature] === true;
    },
    [systemInfo]
  );

  const value = useMemo<SystemContextValue>(
    () => ({
      edition: systemInfo?.edition ?? null,
      version: systemInfo?.version ?? null,
      features: systemInfo?.features ?? null,
      isLoading,
      error,
      isFeatureEnabled,
      refreshSystemInfo,
    }),
    [systemInfo, isLoading, error, isFeatureEnabled, refreshSystemInfo]
  );

  return <SystemContext.Provider value={value}>{children}</SystemContext.Provider>;
};

export function useSystemContext(): SystemContextValue {
  const ctx = useContext(SystemContext);
  if (!ctx) {
    throw new Error('useSystemContext must be used within SystemProvider');
  }
  return ctx;
}

/** Safe accessor when provider may be absent (e.g. tests). */
export function useSystemOptional(): SystemContextValue | null {
  return useContext(SystemContext) ?? null;
}
