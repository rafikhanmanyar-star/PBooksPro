/**
 * Architecture v2.1 runtime constants.
 * PostgreSQL is the single database engine for Desktop and Cloud editions.
 */

export const ARCHITECTURE_VERSION = '2.1' as const;

/** When true, new development must use PostgreSQL via apiClient — not SQLite. */
export const POSTGRES_ONLY_DEFAULT = true;

/**
 * Legacy offline SQLite is opt-in only via `VITE_LOCAL_ONLY=true` at build time.
 * Primary Electron and web builds set `VITE_LOCAL_ONLY=false`.
 */
export const LEGACY_SQLITE_OPT_IN_ENV = 'VITE_LOCAL_ONLY' as const;
