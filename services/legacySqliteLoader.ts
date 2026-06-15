/**
 * Dynamic loader for deprecated offline SQLite stack.
 * API builds resolve to legacy-sqlite-stubs; offline builds use legacy-sqlite.
 */
import { IS_LEGACY_SQLITE_BUILD } from '../config/runtimeMode';
import { isLocalOnlyMode } from '../config/apiUrl';

function assertLegacyRuntime(): void {
  if (!IS_LEGACY_SQLITE_BUILD || !isLocalOnlyMode()) {
    throw new Error('Legacy SQLite is unavailable in PostgreSQL mode.');
  }
}

export async function loadDatabaseServiceModule() {
  if (!IS_LEGACY_SQLITE_BUILD) {
    return import('./legacy-sqlite-stubs/databaseService');
  }
  assertLegacyRuntime();
  return import('./legacy-sqlite/databaseService');
}

export async function getLegacyDatabaseService() {
  const mod = await loadDatabaseServiceModule();
  return mod.getDatabaseService();
}

export async function loadUnifiedDatabaseServiceModule() {
  if (!IS_LEGACY_SQLITE_BUILD) {
    return import('./legacy-sqlite-stubs/unifiedDatabaseService');
  }
  assertLegacyRuntime();
  return import('./legacy-sqlite/unifiedDatabaseService');
}

export async function getLegacyUnifiedDatabaseService() {
  const mod = await loadUnifiedDatabaseServiceModule();
  return mod.getUnifiedDatabaseService();
}

export async function loadMigrationModule() {
  if (!IS_LEGACY_SQLITE_BUILD) {
    return import('./legacy-sqlite-stubs/migration');
  }
  assertLegacyRuntime();
  return import('./legacy-sqlite/migration');
}

export async function loadAppStateRepositoryModule() {
  if (!IS_LEGACY_SQLITE_BUILD) {
    return import('./legacy-sqlite-stubs/repositories/appStateRepository');
  }
  assertLegacyRuntime();
  return import('./legacy-sqlite/repositories/appStateRepository');
}
