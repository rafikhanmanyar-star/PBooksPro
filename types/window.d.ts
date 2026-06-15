/**
 * Electron preload exposes sqliteBridge on window (local-only mode).
 * Single declaration — do not redeclare in service files (strictNullChecks merge conflicts).
 */
type SchemaHealthResult = {
  ok: boolean;
  issues?: string[];
};

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
      querySync: (sql: string, params?: unknown[]) => { ok: boolean; rows?: unknown[]; error?: string };
      runSync: (
        sql: string,
        params?: unknown[]
      ) => { ok: boolean; error?: string; changes?: number; lastInsertRowid?: number };
      execSync: (sql: string) => { ok: boolean; error?: string };
      readDbBytesSync?: () => { ok: boolean; data?: number[] | null; error?: string };
      schemaHealth?: () => Promise<SchemaHealthResult>;
      isReadOnly?: () => Promise<boolean>;
      commitAllPending?: () => Promise<{ ok: boolean; error?: string }>;
      loadBlob?: () => Promise<unknown>;
      clearBlob?: () => Promise<unknown>;
    };
  }
}
