#!/usr/bin/env node
/**
 * PostgreSQL diagnostic: list units matching a name (e.g. G-01), linked project agreements,
 * and invoices (including soft-deleted) for those units. Also flags P-INV-* numbers that
 * appear only on deleted rows (common cause of "duplicate key" when generating new invoices).
 *
 * Usage (from repo root, with DATABASE_URL in .env):
 *   dotenv -e .env -- node scripts/diag-pg-invoices-unit.cjs
 *   dotenv -e .env -- node scripts/diag-pg-invoices-unit.cjs "G-01"
 *   dotenv -e .env -- node scripts/diag-pg-invoices-unit.cjs "G-01" "your-tenant-uuid"
 *
 * If tenant is omitted, lists distinct tenant_id counts per table for the unit match.
 */

'use strict';

const { Client } = require('pg');
const path = require('path');

const unitPattern = process.argv[2] || 'G-01';
const tenantFilter = process.argv[3] || null;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || String(url).trim() === '') {
    console.error('DATABASE_URL is not set. Run: dotenv -e .env -- node scripts/diag-pg-invoices-unit.cjs');
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    const unitSql = `
      SELECT id, tenant_id, unit_number, project_id, owner_contact_id
      FROM units
      WHERE unit_number ILIKE $1
      ORDER BY tenant_id, unit_number
    `;
    const { rows: units } = await client.query(unitSql, [`%${unitPattern}%`]);
    console.log(`\n=== Units matching unit_number ILIKE '%${unitPattern}%' (${units.length} row(s)) ===\n`);
    console.table(units);

    if (units.length === 0) {
      console.log('No units found. Try a different pattern.');
      return;
    }

    const unitIds = units.map((u) => u.id);
    const tenants = tenantFilter ? [tenantFilter] : [...new Set(units.map((u) => u.tenant_id))];

    for (const tenantId of tenants) {
      const uids = units.filter((u) => u.tenant_id === tenantId).map((u) => u.id);
      if (uids.length === 0) continue;

      console.log(`\n--- Tenant ${tenantId} ---\n`);

      const pa = await client.query(
        `SELECT pa.id, pa.agreement_number, pa.status, pa.project_id, pau.unit_id, u.unit_number AS unit_number
         FROM project_agreements pa
         INNER JOIN project_agreement_units pau ON pau.agreement_id = pa.id
         INNER JOIN units u ON u.id = pau.unit_id AND u.tenant_id = pa.tenant_id
         WHERE pa.tenant_id = $1 AND pau.unit_id = ANY($2::text[]) AND pa.deleted_at IS NULL
         ORDER BY pa.agreement_number`,
        [tenantId, uids]
      );
      console.log(`Project agreements for unit(s) (${pa.rows.length}):`);
      console.table(pa.rows);

      const inv = await client.query(
        `SELECT i.id, i.invoice_number, i.invoice_type, i.agreement_id, i.unit_id, i.status,
                i.deleted_at IS NOT NULL AS is_deleted,
                i.deleted_at
         FROM invoices i
         WHERE i.tenant_id = $1 AND i.unit_id = ANY($2::text[])
         ORDER BY i.invoice_number, i.deleted_at NULLS FIRST`,
        [tenantId, uids]
      );
      console.log(`Invoices for unit_id in (${uids.join(', ')}) — includes soft-deleted (${inv.rows.length}):`);
      console.table(inv.rows);

      const prefix = 'P-INV-';
      const maxRow = await client.query(
        `SELECT MAX(
           CAST(SUBSTRING(invoice_number FROM ${prefix.length + 1}) AS INTEGER)
         ) AS max_suffix
         FROM invoices
         WHERE tenant_id = $1
           AND invoice_number LIKE $2 || '%'
           AND SUBSTRING(invoice_number FROM ${prefix.length + 1}) ~ '^[0-9]+$'`,
        [tenantId, prefix]
      );
      console.log(`Max P-INV-* numeric suffix (all rows, including deleted): ${maxRow.rows[0]?.max_suffix ?? 'null'}`);

      const dupCheck = await client.query(
        `SELECT invoice_number, COUNT(*)::int AS cnt,
                SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END)::int AS active_cnt,
                SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END)::int AS deleted_cnt
         FROM invoices
         WHERE tenant_id = $1 AND invoice_number LIKE $2 || '%'
         GROUP BY invoice_number
         HAVING COUNT(*) > 1`,
        [tenantId, prefix]
      );
      if (dupCheck.rows.length > 0) {
        console.log('\n*** DUPLICATE invoice_number rows (same tenant+number, multiple rows):');
        console.table(dupCheck.rows);
      }

      const deletedOnlyNumbers = await client.query(
        `WITH n AS (
           SELECT invoice_number,
                  BOOL_OR(deleted_at IS NULL) AS has_active,
                  BOOL_OR(deleted_at IS NOT NULL) AS has_deleted
           FROM invoices
           WHERE tenant_id = $1 AND invoice_number LIKE $2 || '%'
           GROUP BY invoice_number
         )
         SELECT invoice_number FROM n WHERE has_deleted AND NOT has_active`,
        [tenantId, prefix]
      );
      if (deletedOnlyNumbers.rows.length > 0) {
        console.log(
          `\nNumbers that exist ONLY as soft-deleted (reuse would violate UNIQUE): ${deletedOnlyNumbers.rows.length} distinct`
        );
        console.table(deletedOnlyNumbers.rows.slice(0, 30));
        if (deletedOnlyNumbers.rows.length > 30) console.log('(truncated; first 30 shown)');
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
