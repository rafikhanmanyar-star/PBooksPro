/**
 * Copy one tenant's data from a source PostgreSQL database to a target PostgreSQL database.
 *
 * Usage:
 *   $env:SOURCE_DATABASE_URL="postgresql://..."; $env:TARGET_DATABASE_URL="postgresql://..."
 *   npm run copy-tenant:postgres -- --dry-run --source-tenant pakland-001 --create-tenant --wipe
 */

'use strict';

const path = require('path');

try {
  const dotenv = require('dotenv');
  const projectRoot = path.join(__dirname, '..');
  dotenv.config({ path: path.join(projectRoot, '.env') });
  dotenv.config({ path: path.join(projectRoot, 'backend', '.env') });
} catch (_) {}

const { copyTenantPostgresToPostgres, parseCopyArgs } = require('./lib/tenant-postgres-copy-core.cjs');

async function main() {
  const opts = parseCopyArgs();
  if (!opts.sourceUrl) {
    console.error('ERROR: SOURCE_DATABASE_URL (or DATABASE_URL in .env) is required.');
    process.exit(1);
  }
  if (!opts.targetUrl) {
    console.error('ERROR: TARGET_DATABASE_URL is required.');
    console.error('  $env:TARGET_DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"');
    process.exit(1);
  }
  await copyTenantPostgresToPostgres(opts);
}

main().catch((err) => {
  console.error('\nFATAL:', err.message || err);
  process.exit(1);
});
