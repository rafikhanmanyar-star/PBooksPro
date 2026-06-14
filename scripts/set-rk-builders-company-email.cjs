/**
 * Set RK Builders organization email for cloud unified login.
 *
 * Usage (Render / production — set PG_URL or DATABASE_URL in env):
 *   npm run set:rk-builders-company-email
 *   node scripts/set-rk-builders-company-email.cjs --env-file .env
 *
 * Or run in DBeaver / psql:
 *   UPDATE tenants SET email = 'rkbuilders@pbookspro.com',
 *     company_name = COALESCE(NULLIF(TRIM(company_name), ''), 'RK Builders'),
 *     updated_at = NOW()
 *   WHERE id = 'rk-builders-284d6d';
 */
'use strict';

const path = require('path');
const { Client } = require('pg');
const { existsSync } = require('fs');

const TENANT_ID = 'rk-builders-284d6d';
const COMPANY_EMAIL = 'rkbuilders@pbookspro.com';
const COMPANY_NAME = 'RK Builders';

const projectRoot = path.join(__dirname, '..');
try {
  const dotenv = require('dotenv');
  const envFileIdx = process.argv.indexOf('--env-file');
  const envFiles =
    envFileIdx >= 0 && process.argv[envFileIdx + 1]
      ? [process.argv[envFileIdx + 1]]
      : ['.env.production.render', '.env'];
  for (const f of envFiles) {
    const p = path.join(projectRoot, f);
    if (existsSync(p)) dotenv.config({ path: p });
  }
} catch (_) {}

const url = (process.env.PG_URL || process.env.DATABASE_URL || '').trim();
if (!url) {
  console.error('ERROR: Set PG_URL or DATABASE_URL (or pass --env-file).');
  process.exit(1);
}

let ssl = { rejectUnauthorized: false };
try {
  const host = new URL(url.replace(/^postgresql:\/\//, 'http://')).hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1') ssl = false;
} catch (_) {}

(async () => {
  const client = new Client({ connectionString: url, ssl, connectionTimeoutMillis: 20000 });
  await client.connect();
  try {
    const conflict = await client.query(
      `SELECT id, name FROM tenants
       WHERE LOWER(TRIM(email)) = LOWER($1) AND id <> $2
       LIMIT 1`,
      [COMPANY_EMAIL, TENANT_ID]
    );
    if (conflict.rows.length) {
      console.error(
        `ERROR: Email ${COMPANY_EMAIL} is already used by tenant ${conflict.rows[0].id} (${conflict.rows[0].name}).`
      );
      process.exit(1);
    }

    const r = await client.query(
      `UPDATE tenants
       SET email = $1,
           company_name = COALESCE(NULLIF(TRIM(company_name), ''), $2),
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, name, company_name, email`,
      [COMPANY_EMAIL, COMPANY_NAME, TENANT_ID]
    );

    if (!r.rows.length) {
      console.error(`ERROR: Tenant "${TENANT_ID}" not found.`);
      process.exit(1);
    }

    const row = r.rows[0];
    console.log('OK: RK Builders organization email updated.');
    console.log(`  Tenant:        ${row.name} (${row.id})`);
    console.log(`  Company email: ${row.email}`);
    console.log(`  Company name:  ${row.company_name}`);
    console.log('');
    console.log('Cloud login:');
    console.log(`  Company email: ${COMPANY_EMAIL}`);
    console.log('  Username:      Rafi');
    console.log('  Password:      Rafi1234  (or your set password)');
  } finally {
    await client.end();
  }
})().catch((err) => {
  console.error('FATAL:', err.message || err);
  process.exit(1);
});
