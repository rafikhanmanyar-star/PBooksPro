import { legacySqliteNoopAsync } from './_helpers';

export function needsMigration(): boolean {
  return false;
}

export async function runAllMigrations(): Promise<{ success: boolean; migrated?: boolean; recordCounts?: Record<string, number>; error?: string }> {
  return legacySqliteNoopAsync();
}
