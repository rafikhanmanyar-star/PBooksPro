import { legacySqliteNoopAsync } from './_helpers';

export async function flushAppStateToDatabase(): Promise<void> {
  await legacySqliteNoopAsync();
}
