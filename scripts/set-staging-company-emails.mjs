import dotenv from 'dotenv';
import pg from 'pg';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.staging');
if (existsSync(envPath)) dotenv.config({ path: envPath });

function companyEmail(companyName, tenantId) {
  const slug = (companyName || tenantId).toLowerCase().replace(/[^a-z0-9]+/g, '') || tenantId.replace(/[^a-z0-9]+/g, '');
  return `${slug}@pbookspro.com`;
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const tenants = await pool.query(`SELECT id, name FROM tenants WHERE id !~ '^__'`);
  for (const t of tenants.rows) {
    const email = companyEmail(t.name, t.id);
    await pool.query('UPDATE tenants SET email = $1, updated_at = NOW() WHERE id = $2', [email, t.id]);
    console.log(`${t.id} (${t.name}) -> ${email}`);
  }
  const verify = await pool.query(`SELECT id, name, email FROM tenants WHERE id !~ '^__' ORDER BY id`);
  console.log(JSON.stringify(verify.rows, null, 2));
} finally {
  await pool.end();
}
