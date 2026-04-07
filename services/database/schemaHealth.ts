/**
 * Schema health / read-only state from the Electron main process (SQLite bridge).
 */

export type SchemaHealthLevel = 'ok' | 'warning' | 'error';

export interface SchemaHealthResult {
  level: SchemaHealthLevel;
  readOnly: boolean;
  blocking: boolean;
  version: number;
  messages: string[];
  warnings: string[];
  errors: string[];
  orphanFkSamples: { table: string; detail: string }[];
  integrityOk?: boolean;
}

declare global {
  interface Window {
    sqliteBridge?: {
      schemaHealth?: () => Promise<SchemaHealthResult>;
      isReadOnly?: () => Promise<boolean>;
    };
  }
}

export async function fetchSchemaHealth(): Promise<SchemaHealthResult | null> {
  try {
    const fn = window.sqliteBridge?.schemaHealth;
    if (!fn) return null;
    return await fn();
  } catch {
    return null;
  }
}

export async function fetchIsDatabaseReadOnly(): Promise<boolean> {
  try {
    const fn = window.sqliteBridge?.isReadOnly;
    if (!fn) return false;
    return await fn();
  } catch {
    return false;
  }
}
