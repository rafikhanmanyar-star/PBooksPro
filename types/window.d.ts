/**
 * Electron preload exposes sqliteBridge on window (local-only mode).
 * Consolidated here so strict typecheck slices can reference it without pulling every service file.
 */
export {};

declare global {
  interface Window {
    sqliteBridge?: {
      query: (sql: string, params?: unknown[]) => Promise<{ ok: boolean; rows?: unknown[]; error?: string }>;
      run: (
        sql: string,
        params?: unknown[]
      ) => Promise<{ ok: boolean; changes?: number; lastInsertRowid?: number; error?: string }>;
      exec: (sql: string) => Promise<{ ok: boolean; error?: string }>;
      transaction: (
        operations: Array<{ type: string; sql: string; params?: unknown[] }>
      ) => Promise<{ ok: boolean; results?: unknown[]; error?: string }>;
      querySync?: (sql: string, params?: unknown[]) => { ok: boolean; rows?: unknown[]; error?: string };
      runSync?: (
        sql: string,
        params?: unknown[]
      ) => { ok: boolean; error?: string; changes?: number; lastInsertRowid?: number };
      execSync?: (sql: string) => { ok: boolean; error?: string };
      schemaHealth?: () => Promise<Record<string, unknown>>;
      isReadOnly?: () => Promise<boolean>;
      commitAllPending?: () => Promise<{ ok: boolean; error?: string }>;
    };
  }
}
