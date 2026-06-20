/**
 * Load env files predictably when the API is started from the monorepo root (`npm run dev:backend`)
 * or from `backend/`. Default `dotenv/config` only reads `.env` from `process.cwd()`, so `backend/.env`
 * was often ignored.
 */
import { config } from 'dotenv';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface EnvLoadDiagnostic {
  path: string;
  exists: boolean;
  keysMerged: number;
}

const envLoadDiagnostics: EnvLoadDiagnostic[] = [];

function mergeEnvFile(relativeSegments: string[]): void {
  const path = join(__dirname, ...relativeSegments);
  const exists = existsSync(path);
  const result = config({ path });
  envLoadDiagnostics.push({
    path,
    exists,
    keysMerged: result.parsed ? Object.keys(result.parsed).length : 0,
  });
}

/** `backend/.env` — primary config for the API server */
mergeEnvFile(['..', '.env']);

/** Optional monorepo root `.env` — fills vars not set in backend/.env (does not override) */
mergeEnvFile(['..', '..', '.env']);

/** Files attempted by loadEnv.ts (for RBAC / startup diagnostics). */
export function getEnvLoadDiagnostics(): readonly EnvLoadDiagnostic[] {
  return envLoadDiagnostics;
}
