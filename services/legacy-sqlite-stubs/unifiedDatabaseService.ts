import { legacySqliteUnavailable, LegacySqliteStubClass } from './_helpers';

class UnifiedDatabaseServiceStub {
  async initialize(): Promise<void> {
    legacySqliteUnavailable('UnifiedDatabaseService');
  }
}

let instance: UnifiedDatabaseServiceStub | null = null;

export function getUnifiedDatabaseService(): UnifiedDatabaseServiceStub {
  if (!instance) instance = new UnifiedDatabaseServiceStub();
  return instance;
}

export type DatabaseMode = 'api';

export { LegacySqliteStubClass as DatabaseService };
