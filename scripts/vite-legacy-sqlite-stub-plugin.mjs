/**
 * Vite plugin: redirect legacy-sqlite → stubs and block sql.js in API builds.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LEGACY = `${path.sep}services${path.sep}legacy-sqlite${path.sep}`;
const STUBS = `${path.sep}services${path.sep}legacy-sqlite-stubs${path.sep}`;

const SQLJS_STUB = `
export default function initSqlJs() {
  throw new Error('sql.js is unavailable in PostgreSQL mode');
}
`;

function toStubPath(resolved) {
  const normalized = path.normalize(resolved);
  if (!normalized.includes(LEGACY)) return null;
  return normalized.replace(LEGACY, STUBS);
}

export function legacySqliteStubPlugin() {
  const sqliteEnabled = process.env.VITE_LOCAL_ONLY === 'true';

  if (sqliteEnabled) {
    return { name: 'legacy-sqlite-full' };
  }

  return {
    name: 'legacy-sqlite-stub',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === 'sql.js' || source.startsWith('sql.js/')) {
        return '\0legacy-sqlite-stub:sql.js';
      }

      if (!importer) return null;

      let resolved = source;
      if (source.startsWith('.')) {
        resolved = path.resolve(path.dirname(importer), source);
      } else if (source.includes('legacy-sqlite')) {
        resolved = path.isAbsolute(source) ? source : path.resolve(ROOT, source);
      } else {
        return null;
      }

      const stubPath = toStubPath(resolved);
      if (!stubPath) return null;

      const candidates = [
        stubPath,
        `${stubPath}.ts`,
        path.join(stubPath, 'index.ts'),
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return candidate;
        }
      }
      if (fs.existsSync(stubPath) && fs.statSync(stubPath).isDirectory()) {
        return path.join(stubPath, 'index.ts');
      }
      return stubPath.endsWith('.ts') ? stubPath : `${stubPath}.ts`;
    },
    load(id) {
      if (id === '\0legacy-sqlite-stub:sql.js') {
        return SQLJS_STUB;
      }
      return null;
    },
  };
}
