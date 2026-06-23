import pg from 'pg';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envLine = readFileSync(resolve(root, '.env.production'), 'utf8')
  .split('\n')
  .find((l) => l.startsWith('DATABASE_URL='));
const connectionString = envLine?.slice('DATABASE_URL='.length).trim();
const pool = new pg.Pool({ connectionString });
const r = await pool.query(
  `SELECT id, name, email, status, registration_reference FROM tenants
   WHERE id = $1 OR LOWER(email) = $2 OR LOWER(name) LIKE '%taj%'`,
  ['taj-builders', 'taj@pbooks.com']
);
console.log(JSON.stringify(r.rows, null, 2));
const users = await pool.query(
  `SELECT id, tenant_id, username, email, is_active FROM users WHERE tenant_id = $1 OR LOWER(username) = 'admin' AND tenant_id = $1`,
  ['taj-builders']
);
console.log('users:', JSON.stringify(users.rows, null, 2));
await pool.end();
