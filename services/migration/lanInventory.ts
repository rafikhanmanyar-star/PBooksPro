/**
 * Historical inventory of client-side SQLite entry points (Architecture v2.1 Phase 6).
 * Offline SQLite was removed — API modules below are the active data path.
 */

/** @deprecated Retired in Phase 6 — kept for migration script grep maintenance only. */
export const RETIRED_SQLITE_ENTRY_MODULES = [
  'services/legacy-sqlite/** (deleted)',
  'electron/sqliteBridge.cjs (excluded from API client builds)',
] as const;

export const API_FIRST_MODULES = [
  'services/api/appStateApi.ts',
  'services/api/journalApi.ts',
  'services/api/contactsModuleApi.ts',
  'services/api/repositories/contactsApi.ts',
  'services/api/repositories/*',
] as const;

/** Backend modules with PostgreSQL REST (see backend/src/modules/). */
export const BACKEND_REST_MODULES = ['accounts', 'contacts', 'journal', 'rental-agreements', 'users'] as const;
