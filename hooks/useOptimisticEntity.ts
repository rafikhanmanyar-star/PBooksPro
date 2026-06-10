import { useCallback, useRef, useState } from 'react';

export type OptimisticSyncStatus = 'syncing' | 'saved' | 'failed';

export interface OptimisticRow<T extends { id: string }> {
  entity: T;
  status: OptimisticSyncStatus;
}

/**
 * Tracks temporary rows added optimistically before API confirmation.
 * Applicable to directory grids (owners, customers, vendors, projects).
 */
export function useOptimisticEntity<T extends { id: string }>() {
  const [rows, setRows] = useState<OptimisticRow<T>[]>([]);
  const pendingRef = useRef<Set<string>>(new Set());

  const addOptimistic = useCallback((entity: T) => {
    const id = entity.id;
    if (pendingRef.current.has(id)) return;
    pendingRef.current.add(id);
    setRows((prev) => [...prev, { entity, status: 'syncing' }]);
  }, []);

  const markSaved = useCallback((id: string) => {
    pendingRef.current.delete(id);
    setRows((prev) =>
      prev.map((r) => (r.entity.id === id ? { ...r, status: 'saved' as const } : r))
    );
    // Remove saved badge after brief display
    window.setTimeout(() => {
      setRows((prev) => prev.filter((r) => r.entity.id !== id));
    }, 2000);
  }, []);

  const markFailed = useCallback((id: string) => {
    pendingRef.current.delete(id);
    setRows((prev) => prev.filter((r) => r.entity.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    pendingRef.current.clear();
    setRows([]);
  }, []);

  const getStatus = useCallback(
    (id: string): OptimisticSyncStatus | undefined => rows.find((r) => r.entity.id === id)?.status,
    [rows]
  );

  return { optimisticRows: rows, addOptimistic, markSaved, markFailed, clearAll, getStatus };
}
