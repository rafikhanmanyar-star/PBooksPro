import dotenv from 'dotenv';
import pg from 'pg';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve('.env.staging');
if (existsSync(envPath)) dotenv.config({ path: envPath });
const url = process.env.DATABASE_URL || process.env.PG_URL;
if (!url) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url });
try {
  const db = await pool.query('SELECT current_database() AS db');
  console.log('database:', db.rows[0].db);

  const tenants = await pool.query(
    `SELECT id, COALESCE(NULLIF(TRIM(company_name), ''), name) AS display_name
     FROM tenants ORDER BY display_name`
  );
  console.log('tenants:', tenants.rows.length);
  for (const t of tenants.rows) console.log(`  ${t.id}  ${t.display_name}`);

  const mig = await pool.query(
    `SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 10`
  ).catch(() => ({ rows: [] }));
  if (mig.rows.length) {
    console.log('recent migrations:', mig.rows.map((r) => r.version).join(', '));
  } else {
    const alt = await pool.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'rbac_%' ORDER BY tablename`
    );
    console.log('rbac tables:', alt.rows.map((r) => r.tablename).join(', '));
  }

  for (const t of tenants.rows) {
    const users = await pool.query(
      `SELECT COUNT(*)::int AS n FROM users WHERE tenant_id = $1 AND COALESCE(is_active, TRUE) = TRUE`,
      [t.id]
    );
    const assigned = await pool.query(
      `SELECT COUNT(DISTINCT ur.user_id)::int AS n
       FROM rbac_user_roles ur
       INNER JOIN users u ON u.id = ur.user_id AND u.tenant_id = ur.tenant_id
       WHERE ur.tenant_id = $1 AND COALESCE(u.is_active, TRUE) = TRUE
         AND COALESCE(ur.is_active, TRUE) = TRUE`,
      [t.id]
    );
    console.log(`tenant ${t.display_name}: active_users=${users.rows[0].n} with_rbac_assignment=${assigned.rows[0].n}`);
  }
} finally {
  await pool.end();
}
