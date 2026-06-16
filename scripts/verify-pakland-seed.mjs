import dotenv from 'dotenv';
import pg from 'pg';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.production.render');
if (existsSync(envPath)) dotenv.config({ path: envPath });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const tenantId = 'pakland-001';

try {
  const r = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM projects WHERE tenant_id = $1 AND deleted_at IS NULL) AS projects,
       (SELECT COUNT(*)::int FROM units WHERE tenant_id = $1 AND deleted_at IS NULL) AS units,
       (SELECT COUNT(*)::int FROM project_agreements WHERE tenant_id = $1 AND deleted_at IS NULL) AS selling_agreements,
       (SELECT COUNT(*)::int FROM installment_plans WHERE tenant_id = $1 AND deleted_at IS NULL) AS marketing_plans,
       (SELECT COUNT(*)::int FROM buildings WHERE tenant_id = $1 AND deleted_at IS NULL) AS buildings,
       (SELECT COUNT(*)::int FROM properties WHERE tenant_id = $1 AND deleted_at IS NULL) AS properties,
       (SELECT COUNT(*)::int FROM rental_agreements WHERE tenant_id = $1 AND deleted_at IS NULL) AS rental_agreements,
       (SELECT COUNT(*)::int FROM contacts WHERE tenant_id = $1 AND deleted_at IS NULL) AS contacts,
       (SELECT COUNT(*)::int FROM vendors WHERE tenant_id = $1 AND deleted_at IS NULL) AS vendors,
       (SELECT COUNT(*)::int FROM purchase_orders WHERE tenant_id = $1 AND deleted_at IS NULL) AS purchase_orders,
       (SELECT COUNT(*)::int FROM goods_receipts WHERE tenant_id = $1 AND deleted_at IS NULL) AS goods_receipts,
       (SELECT COUNT(*)::int FROM invoices WHERE tenant_id = $1 AND deleted_at IS NULL) AS invoices,
       (SELECT COUNT(*)::int FROM bills WHERE tenant_id = $1 AND deleted_at IS NULL) AS bills,
       (SELECT COUNT(*)::int FROM transactions WHERE tenant_id = $1 AND deleted_at IS NULL) AS transactions,
       (SELECT COUNT(*)::int FROM journal_entries WHERE tenant_id = $1) AS journal_entries,
       (SELECT COUNT(*)::int FROM payroll_employees WHERE tenant_id = $1 AND deleted_at IS NULL) AS employees,
       (SELECT COUNT(*)::int FROM accounts WHERE tenant_id = $1 AND type = 'EQUITY' AND is_permanent = FALSE) AS investor_accounts`,
    [tenantId]
  );
  console.log(JSON.stringify(r.rows[0], null, 2));
} finally {
  await pool.end();
}
