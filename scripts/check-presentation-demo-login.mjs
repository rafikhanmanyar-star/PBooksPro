import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const envIdx = process.argv.indexOf('--env-file');
const envFile = envIdx >= 0 ? process.argv[envIdx + 1] : '.env.production.render';
const p = resolve(process.cwd(), envFile);
if (existsSync(p)) dotenv.config({ path: p });

const ssl = /render\.com|amazonaws\.com|rds\./i.test(process.env.DATABASE_URL || '')
  ? { rejectUnauthorized: false }
  : undefined;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl });
try {
  const presentation = await pool.query(`
    SELECT t.id, t.name, t.email AS tenant_email, u.id AS user_id, u.username, u.email AS user_email,
           ut.id AS membership_id
    FROM tenants t
    LEFT JOIN users u ON u.tenant_id = t.id AND u.is_active = TRUE
    LEFT JOIN user_tenants ut ON ut.user_id = u.id AND ut.tenant_id = t.id
    WHERE t.id LIKE 'demo-company%' OR LOWER(TRIM(t.email)) = 'demo@company.com'
    ORDER BY t.id, u.username
  `);
  console.log('Presentation demo orgs:');
  console.table(presentation.rows);

  const website = await pool.query(`
    SELECT t.id, t.name, t.email AS tenant_email, u.username, ut.id AS membership_id
    FROM tenants t
    JOIN users u ON u.tenant_id = t.id AND LOWER(u.username) = 'demo'
    LEFT JOIN user_tenants ut ON ut.user_id = u.id AND ut.tenant_id = t.id
    WHERE t.id = 'pbooks-demo'
  `);
  console.log('\nWebsite auto-login demo (pbooks-demo):');
  console.table(website.rows);
} finally {
  await pool.end();
}
