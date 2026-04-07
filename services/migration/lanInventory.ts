/**
 * Inventory of client-side SQLite / repository entry points for LAN migration.
 * Priority: financial engine → core AR/AP → payroll/inventory.
 *
 * Grep maintenance (run from repo root):
 *   rg "getDatabaseService|sqliteBridge|AppStateRepository" --glob "*.{ts,tsx}"
 */

export const SQLITE_ENTRY_MODULES = [
  'services/database/repositories/appStateRepository.ts',
  'services/database/repositories/baseRepository.ts',
  'services/financialEngine/journalEngine.ts (local branch)',
  'hooks/useDatabaseState.ts (local branch)',
  'context/AppContext.tsx (local branch)',
  'electron/preload.cjs / sqliteBridge',
] as const;

export const API_FIRST_MODULES = [
  'services/api/appStateApi.ts',
  'services/api/journalApi.ts',
  'services/api/contactsModuleApi.ts',
  'services/api/repositories/contactsApi.ts',
  'services/api/repositories/*',
] as const;

/** Backend modules with PostgreSQL REST (see backend/src/routes/). */
export const BACKEND_REST_MODULES = ['accounts', 'contacts', 'journal', 'rental-agreements', 'users'] as const;
