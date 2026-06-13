import { useCallback, useEffect, useState } from 'react';
import { isLocalOnlyMode } from '../config/apiUrl';

/**
 * LAN/API rental reports: server-computed ledger with optimistic local overlay while refreshing.
 * Local SQLite edition uses `localResult` only (instant).
 */
export function useServerRentalReportLedger<T>(options: {
  localResult: T;
  fetchServer: () => Promise<T>;
  filterKey: string;
  /** Shown before the first server response (API mode only). */
  initialEmpty?: T;
}): {
  localOnly: boolean;
  result: T;
  loading: boolean;
  updating: boolean;
  error: string | null;
  beginUpdating: () => void;
  requestRefresh: () => void;
} {
  const { localResult, fetchServer, filterKey, initialEmpty } = options;
  const localOnly = isLocalOnlyMode();
  const [serverResult, setServerResult] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const beginUpdating = useCallback(() => {
    setUpdating(true);
  }, []);

  const requestRefresh = useCallback(() => {
    setUpdating(true);
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (localOnly) {
      setServerResult(null);
      setError(null);
      setUpdating(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchServer()
      .then((r) => {
        if (cancelled) return;
        setServerResult(r);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setServerResult(null);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setUpdating(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [localOnly, refreshKey, filterKey, fetchServer]);

  const result = localOnly
    ? localResult
    : updating
      ? localResult
      : serverResult ?? (loading ? (initialEmpty ?? localResult) : localResult);

  return {
    localOnly,
    result,
    loading,
    updating,
    error,
    beginUpdating,
    requestRefresh,
  };
}
