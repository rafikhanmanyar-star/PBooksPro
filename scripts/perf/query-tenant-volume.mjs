#!/usr/bin/env node
import dotenv from 'dotenv';
import pg from 'pg';
import { resolve } from 'node:path';

const tenantId = process.argv[2];
const envFile = process.argv[3] ?? '.env.production.render';
if (!tenantId) {
  console.error('Usage: node scripts/perf/query-tenant-volume.mjs <tenantId> [envFile]');
  process.exit(1);
}
dotenv.config({ path: resolve(envFile) });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const queries = {
  transactions: `SELECT COUNT(*)::int AS c FROM transactions WHERE tenant_id = $1 AND deleted_at IS NULL`,
  invoices: `SELECT COUNT(*)::int AS c FROM invoices WHERE tenant_id = $1 AND deleted_at IS NULL`,
  bills: `SELECT COUNT(*)::int AS c FROM bills WHERE tenant_id = $1 AND deleted_at IS NULL`,
  contacts: `SELECT COUNT(*)::int AS c FROM contacts WHERE tenant_id = $1 AND deleted_at IS NULL`,
  units: `SELECT COUNT(*)::int AS c FROM units WHERE tenant_id = $1 AND deleted_at IS NULL`,
  properties: `SELECT COUNT(*)::int AS c FROM properties WHERE tenant_id = $1 AND deleted_at IS NULL`,
  contracts: `SELECT COUNT(*)::int AS c FROM contracts WHERE tenant_id = $1 AND deleted_at IS NULL`,
  rentalAgreements: `SELECT COUNT(*)::int AS c FROM rental_agreements WHERE tenant_id = $1 AND deleted_at IS NULL`,
  projectAgreements: `SELECT COUNT(*)::int AS c FROM project_agreements WHERE tenant_id = $1 AND deleted_at IS NULL`,
  projects: `SELECT COUNT(*)::int AS c FROM projects WHERE tenant_id = $1 AND deleted_at IS NULL`,
  accounts: `SELECT COUNT(*)::int AS c FROM accounts WHERE tenant_id = $1 AND deleted_at IS NULL`,
  categories: `SELECT COUNT(*)::int AS c FROM categories WHERE tenant_id = $1 AND deleted_at IS NULL`,
};

const out = { tenantId, envFile };
for (const [key, sql] of Object.entries(queries)) {
  try {
    const r = await pool.query(sql, [tenantId]);
    out[key] = r.rows[0]?.c ?? 0;
  } catch (e) {
    out[key] = { error: e.message };
  }
}
console.log(JSON.stringify(out, null, 2));
await pool.end();
