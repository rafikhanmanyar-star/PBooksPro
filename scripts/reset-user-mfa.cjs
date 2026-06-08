/**
 * Clear MFA enrollment for a tenant user (forced login setup can be retried).
 *
 *   node scripts/reset-user-mfa.cjs --tenant rk-builders-284d6d --username Rafi
 */

'use strict';

const path = require('path');
const { Client } = require('pg');

const projectRoot = path.join(__dirname, '..');
try {
  require('dotenv').config({ path: path.join(projectRoot, '.env') });
  require('dotenv').config({ path: path.join(projectRoot, 'backend', '.env') });
  require('dotenv').config({ path: path.join(projectRoot, '.env.production') });
} catch (_) {}

function arg(name, fallback = '') {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1].trim() : fallback;
}

async function main() {
  const DATABASE_URL = (process.env.DATABASE_URL || process.env.PG_URL || '').trim();
  if (!DATABASE_URL) {
    console.error('ERROR: DATABASE_URL or PG_URL required');
    process.exit(1);
  }
  const tenantId = arg('--tenant', process.env.PG_TARGET_TENANT_ID || 'rk-builders-284d6d');
  const username = arg('--username', 'Rafi');

  let ssl = { rejectUnauthorized: false };
  try {
    const u = new URL(DATABASE_URL.replace(/^postgresql:\/\//, 'http://'));
    const host = (u.hostname || '').toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') ssl = false;
  } catch (_) {}

  const client = new Client({ connectionString: DATABASE_URL, ssl });
  await client.connect();
  try {
    const user = await client.query(
      `SELECT id, username FROM users WHERE tenant_id = $1 AND LOWER(username) = LOWER($2)`,
      [tenantId, username]
    );
    if (!user.rows.length) {
      console.error(`ERROR: No user "${username}" in tenant "${tenantId}"`);
      process.exit(1);
    }
    const userId = user.rows[0].id;
    await client.query(`DELETE FROM user_mfa_settings WHERE user_id = $1`, [userId]);
    console.log(`OK: MFA cleared for ${user.rows[0].username} (${userId}) in ${tenantId}`);
    console.log('Sign in again — MFA setup will start fresh.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('FATAL:', err.message || err);
  process.exit(1);
});
