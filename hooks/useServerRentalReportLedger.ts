import { useCallback, useEffect, useState } from 'react';

/**
 * Rental reports: server-computed ledger with optimistic local overlay while refreshing.
 */
export function useServerRentalReportLedger<T>(options: {
  localResult: T;
  fetchServer: () => Promise<T>;
  filterKey: string;
  /** Shown before the first server response. */
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
  }, [refreshKey, filterKey, fetchServer]);

  const result = updating
    ? localResult
    : serverResult ?? (loading ? (initialEmpty ?? localResult) : localResult);

  return {
    localOnly: false,
    result,
    loading,
    updating,
    error,
    beginUpdating,
    requestRefresh,
  };
}
