/**
 * Architecture v2 CI guard: domain module services must not execute raw SQL.
 * Legacy backend/src/services/** remains allowlisted during strangler migration.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const modulesRoot = path.join(here, '..', 'backend', 'src', 'modules');

const SQL_PATTERN = /\.(query|connect)\s*\(/;

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) files.push(full);
  }
  return files;
}

/** Pre-existing module services with SQL until migrated to repositories. */
const MODULE_SERVICE_ALLOWLIST = new Set([
  'reporting/services/customReportRunService.ts',
  'dashboard/services/dashboardSnapshotScheduler.ts',
]);

const violations = [];

for (const file of walk(modulesRoot)) {
  const rel = path.relative(modulesRoot, file).replace(/\\/g, '/');
  if (!rel.includes('/services/')) continue;
  if (rel.includes('/repositories/')) continue;
  if (MODULE_SERVICE_ALLOWLIST.has(rel)) continue;

  const content = fs.readFileSync(file, 'utf8');
  if (SQL_PATTERN.test(content)) {
    violations.push(rel);
  }
}

if (violations.length > 0) {
  console.error('[sql-guard] Module services with raw SQL (use TenantRepository instead):');
  for (const v of violations.sort()) {
    console.error(`  - modules/${v}`);
  }
  process.exit(1);
}

console.log('[sql-guard] OK — domain module services have no raw SQL');
