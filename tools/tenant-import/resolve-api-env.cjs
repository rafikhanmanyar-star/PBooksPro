'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * AppData folder names used by PBooks Pro API Server installers.
 * - pbooks-pro: package.name (common on v1.2.x installed API servers)
 * - PBooks Pro API Server: electron productName (newer installs)
 */
const API_SERVER_APP_FOLDERS = [
  'pbooks-pro',
  'PBooks Pro API Server',
  'pbooks-pro-staging-api-server',
  'PBooks Pro Staging API Server',
];

/** Relative paths under each app folder where backend .env may live. */
const ENV_RELATIVE_PATHS = ['backend\\.env', '.env', 'backend\\.env.example'];

function parseEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function getAppDataRoaming() {
  return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
}

/**
 * All candidate .env paths (for error messages / debugging).
 * @returns {string[]}
 */
function listLocalEnvCandidates() {
  const appData = getAppDataRoaming();
  const out = [];
  for (const folder of API_SERVER_APP_FOLDERS) {
    for (const rel of ENV_RELATIVE_PATHS) {
      if (rel.endsWith('.example')) continue;
      out.push(path.join(appData, folder, ...rel.split('\\')));
    }
  }
  if (process.env.PBOOKS_API_SERVER_ENV?.trim()) {
    out.unshift(process.env.PBOOKS_API_SERVER_ENV.trim());
  }
  return out;
}

/**
 * Resolve local PostgreSQL URL from PBooks Pro API Server AppData config.
 * @returns {{ databaseUrl: string, envPath: string, appFolder: string } | null}
 */
function resolveLocalDatabaseUrlFromApiServer() {
  const explicit = process.env.PBOOKS_API_SERVER_ENV?.trim();
  if (explicit && fs.existsSync(explicit)) {
    const parsed = parseEnvFile(explicit);
    const databaseUrl = (parsed.DATABASE_URL || '').trim();
    if (databaseUrl) {
      return { databaseUrl, envPath: explicit, appFolder: path.dirname(explicit) };
    }
  }

  const appData = getAppDataRoaming();
  for (const folder of API_SERVER_APP_FOLDERS) {
    for (const rel of ENV_RELATIVE_PATHS) {
      if (rel.endsWith('.example')) continue;
      const envPath = path.join(appData, folder, ...rel.split('\\'));
      if (!fs.existsSync(envPath)) continue;
      const parsed = parseEnvFile(envPath);
      const databaseUrl = (parsed.DATABASE_URL || '').trim();
      if (databaseUrl) {
        return { databaseUrl, envPath, appFolder: folder };
      }
    }
  }
  return null;
}

/**
 * Optional vendor file next to the EXE or in AppData (cloud production URL).
 */
function resolveCloudSourceUrlFromFile() {
  const candidates = [];
  if (process.pkg) {
    candidates.push(path.join(path.dirname(process.execPath), 'cloud-source.env'));
  }
  candidates.push(
    path.join(getAppDataRoaming(), 'pbooks-pro', 'tenant-import', 'cloud-source.env'),
    path.join(getAppDataRoaming(), 'PBooks Pro Tenant Import', 'cloud-source.env')
  );
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const parsed = parseEnvFile(p);
    const url = (parsed.SOURCE_DATABASE_URL || parsed.DATABASE_URL || parsed.PG_URL || '').trim();
    if (url) return { sourceUrl: url, filePath: p };
  }
  return null;
}

function ensureTenantImportConfigDir() {
  const dir = path.join(getAppDataRoaming(), 'pbooks-pro', 'tenant-import');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = {
  parseEnvFile,
  resolveLocalDatabaseUrlFromApiServer,
  resolveCloudSourceUrlFromFile,
  ensureTenantImportConfigDir,
  listLocalEnvCandidates,
  API_SERVER_APP_FOLDERS,
};
