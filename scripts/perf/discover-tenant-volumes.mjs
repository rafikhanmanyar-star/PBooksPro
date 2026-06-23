#!/usr/bin/env node
import dotenv from 'dotenv';
import pg from 'pg';
import { resolve } from 'node:path';

const envFile = process.argv[2] ?? '.env.staging';
dotenv.config({ path: resolve(envFile) });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const atp = await pool.query(
    `SELECT id, name, company_name FROM tenants
     WHERE id ILIKE '%atp%' OR name ILIKE '%atp%' OR company_name ILIKE '%atp%'
     LIMIT 10`
  );
  console.log('ATP tenants:', JSON.stringify(atp.rows, null, 2));

  const top = await pool.query(`
    SELECT t.id, t.name, t.company_name,
      (SELECT COUNT(*)::int FROM transactions tx WHERE tx.tenant_id = t.id AND tx.deleted_at IS NULL) AS transactions,
      (SELECT COUNT(*)::int FROM invoices i WHERE i.tenant_id = t.id AND i.deleted_at IS NULL) AS invoices,
      (SELECT COUNT(*)::int FROM bills b WHERE b.tenant_id = t.id AND b.deleted_at IS NULL) AS bills,
      (SELECT COUNT(*)::int FROM contacts c WHERE c.tenant_id = t.id AND c.deleted_at IS NULL) AS contacts,
      (SELECT COUNT(*)::int FROM units u WHERE u.tenant_id = t.id AND u.deleted_at IS NULL) AS units,
      (SELECT COUNT(*)::int FROM properties p WHERE p.tenant_id = t.id AND p.deleted_at IS NULL) AS properties,
      (SELECT COUNT(*)::int FROM contracts ct WHERE ct.tenant_id = t.id AND ct.deleted_at IS NULL) AS contracts
    FROM tenants t
    ORDER BY transactions DESC NULLS LAST
    LIMIT 10`);
  console.log('Top tenants by transactions:', JSON.stringify(top.rows, null, 2));
} finally {
  await pool.end();
}
