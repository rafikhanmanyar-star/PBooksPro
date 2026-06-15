/** Shared helpers for API-mode legacy SQLite stubs (never called in PostgreSQL builds). */

export function legacySqliteUnavailable(name = 'Legacy SQLite'): never {
  const err = new Error(`${name} is unavailable in PostgreSQL mode. Use apiClient instead.`);
  err.name = 'LegacySqliteUnavailableError';
  throw err;
}

export class LegacySqliteStubClass {
  constructor() {
    legacySqliteUnavailable(this.constructor.name);
  }
}

export const legacySqliteNoopAsync = async (): Promise<never> => legacySqliteUnavailable();
