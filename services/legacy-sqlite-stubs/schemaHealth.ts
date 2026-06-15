import { legacySqliteNoopAsync } from './_helpers';

export type SchemaHealthResult = { ok: boolean; version?: number; issues?: string[] };

export async function fetchSchemaHealth(): Promise<SchemaHealthResult> {
  return legacySqliteNoopAsync();
}
