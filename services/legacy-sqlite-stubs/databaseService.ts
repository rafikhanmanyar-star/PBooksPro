import { legacySqliteUnavailable, legacySqliteNoopAsync } from './_helpers';

export default class DatabaseServiceStub {}

export function getDatabaseService(): never {
  return legacySqliteUnavailable('getDatabaseService');
}

export async function clearAllDatabaseStorage(): Promise<never> {
  return legacySqliteNoopAsync();
}
