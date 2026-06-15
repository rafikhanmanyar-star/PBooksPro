/**
 * @deprecated Legacy SQLite was removed in Architecture v2.1 Phase 4.
 * Stub imports remain for lazy-loaded offline-only components until fully cleaned up.
 */

const removed = (): never => {
  throw new Error('Legacy SQLite was removed. Use apiClient → PostgreSQL.');
};

export async function loadDatabaseServiceModule(): Promise<never> {
  return removed();
}

export async function getLegacyDatabaseService(): Promise<never> {
  return removed();
}

export async function loadUnifiedDatabaseServiceModule(): Promise<never> {
  return removed();
}

export async function getLegacyUnifiedDatabaseService(): Promise<never> {
  return removed();
}

export async function loadMigrationModule(): Promise<never> {
  return removed();
}

export async function loadAppStateRepositoryModule(): Promise<never> {
  return removed();
}
