/**
 * Enable RBAC Data Scope flags in .env.staging only (staging pilot).
 * Keeps RBAC_V2_APPROVAL_MATRIX=false per cutover plan.
 *
 * Usage: node scripts/enable-rbac-data-scope-staging-env.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve('.env.staging');
if (!existsSync(envPath)) {
  console.error('Missing .env.staging — copy from .env.staging.example first.');
  process.exit(1);
}

const UPSERT = {
  RBAC_V2_ROLE_MANAGEMENT: 'true',
  RBAC_V2_SOD: 'true',
  RBAC_V2_BREAK_GLASS: 'true',
  RBAC_V2_AUTHORIZATION_ENGINE: 'true',
  RBAC_V2_DATA_SCOPE: 'true',
  RBAC_V2_APPROVAL_MATRIX: 'false',
  VITE_RBAC_V2_ROLE_MANAGEMENT: 'true',
  VITE_RBAC_V2_BREAK_GLASS: 'true',
  VITE_RBAC_V2_DATA_SCOPE: 'true',
  VITE_RBAC_V2_APPROVAL_MATRIX: 'false',
};

const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
const seen = new Set();
const out = [];

for (const line of lines) {
  const m = line.match(/^([A-Z0-9_]+)=/);
  if (m && UPSERT[m[1]] !== undefined) {
    out.push(`${m[1]}=${UPSERT[m[1]]}`);
    seen.add(m[1]);
  } else {
    out.push(line);
  }
}

for (const [key, value] of Object.entries(UPSERT)) {
  if (!seen.has(key)) {
    if (out.length > 0 && out[out.length - 1] !== '') out.push('');
    out.push('# RBAC V2 — Data Scope staging pilot');
    for (const [k, v] of Object.entries(UPSERT)) {
      if (!seen.has(k)) out.push(`${k}=${v}`);
    }
    break;
  }
}

writeFileSync(envPath, out.join('\n').replace(/\n*$/, '\n'));
console.log('Updated .env.staging RBAC flags:');
for (const key of Object.keys(UPSERT)) {
  console.log(`  ${key}=${UPSERT[key]}`);
}
console.log('\nRestart staging API and rebuild/relaunch client (npm run test:staging).');
