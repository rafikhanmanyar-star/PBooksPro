/**
 * Electron SQLite Storage Helper
 *
 * Provides typed wrappers for sqliteBridge IPC when running in Electron.
 * Used by SyncManager, LockManager, and OfflineLockManager to persist
 * sync queue and locks to native SQLite instead of localStorage.
 */

declare global {
  interface Window {
    sqliteBridge?: {
      query: (sql: string, params?: unknown[]) => Promise<{ ok: boolean; rows?: unknown[]; error?: string }>;
      run: (sql: string, params?: unknown[]) => Promise<{ ok: boolean; changes?: number; lastInsertRowid?: number; error?: string }>;
      exec: (sql: string) => Promise<{ ok: boolean; error?: string }>;
    };
  }
}

/** Check if we're in Electron with native SQLite bridge available */
export function isElectronWithSqlite(): boolean {
  return typeof window !== 'undefined' && !!window.sqliteBridge?.query;
}

/** Query helper - returns rows or empty array on error */
export async function sqliteQuery<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const bridge = window.sqliteBridge;
  if (!bridge?.query) return [];
  const result = await bridge.query(sql, params);
  if (!result.ok || !result.rows) return [];
  return result.rows as T[];
}

/** Run helper - execute INSERT/UPDATE/DELETE */
export async function sqliteRun(
  sql: string,
  params: unknown[] = []
): Promise<{ ok: boolean; changes?: number }> {
  const bridge = window.sqliteBridge;
  if (!bridge?.run) return { ok: false };
  const result = await bridge.run(sql, params);
  return { ok: result.ok ?? false, changes: result.changes };
}
