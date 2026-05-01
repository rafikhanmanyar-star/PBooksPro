/**
 * Drill-down report: Bank Accounts dashboard "Initial balance" column bucket (PostgreSQL).
 * Mirrors frontend logic in components/dashboard/bankAccountReportBalances.ts:
 *   Loan -> Loan column; Transfer -> Transfer; rental if any building chain;
 *   else project id from tx/bill/invoice; otherwise Initial balance (+ opening_balance on accounts).
 *
 * Usage (from repo root, loads .env):
 *   node scripts/bank-dashboard-unassigned-drill.cjs
 *   node scripts/bank-dashboard-unassigned-drill.cjs --tenant tenant_xxx
 *   node scripts/bank-dashboard-unassigned-drill.cjs --tenant tenant_xxx --account UBL
 *   node scripts/bank-dashboard-unassigned-drill.cjs --tenant tenant_xxx --summary
 *
 * Env: DATABASE_URL (required). Optional TENANT_ID if you prefer env over flag.
 */

'use strict';

const path = require('path');
const { Client } = require('pg');

const UNASSIGNED = '__unassigned__';

function parseArgs(argv) {
  let listTenants = false;
  let summary = false;
  let tenantId = (process.env.TENANT_ID || '').trim();
  let accountSubstring = '';

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list-tenants') listTenants = true;
    else if (a === '--summary') summary = true;
    else if (a === '--tenant' && argv[i + 1]) {
      tenantId = argv[++i];
    } else if (a === '--account' && argv[i + 1]) {
      accountSubstring = argv[++i];
    } else if (a.startsWith('--tenant=')) tenantId = a.slice('--tenant='.length).trim();
    else if (a.startsWith('--account=')) accountSubstring = a.slice('--account='.length).trim();
  }
  return { listTenants, summary, tenantId, accountSubstring };
}

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (_) {}

async function main() {
  const { listTenants, summary, tenantId: tenantArg, accountSubstring } = parseArgs(process.argv);
  const url = (process.env.DATABASE_URL || '').trim();
  if (!url) {
    console.error('DATABASE_URL is not set (e.g. in .env at repo root).');
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  if (listTenants) {
    const r = await client.query(`
      SELECT id, name
      FROM tenants
      ORDER BY name NULLS LAST, id
      LIMIT 100
    `);
    console.table(r.rows);
    await client.end();
    return;
  }

  let tenantId = tenantArg;
  if (!tenantId) {
    const t = await client.query(`
      SELECT id, name FROM tenants ORDER BY name NULLS LAST, id LIMIT 5
    `);
    if (t.rows.length === 0) {
      console.error('No tenants found.');
      await client.end();
      process.exit(1);
    }
    if (t.rows.length > 1) {
      console.error('Multiple tenants; pass --tenant <id>. First few:');
      console.table(t.rows);
      await client.end();
      process.exit(1);
    }
    tenantId = t.rows[0].id;
    console.log(`Using single tenant: ${tenantId}${t.rows[0].name ? ` (${t.rows[0].name})` : ''}\n`);
  }

  /** Matches resolveBankReportColumnKey fallback bucket (__unassigned__ key; UI labels it Initial balance). */
  const sqlAccounts = `
    SELECT a.id,
           a.name,
           a.type,
           COALESCE(a.opening_balance, 0)::numeric AS opening_balance
    FROM accounts a
    WHERE a.deleted_at IS NULL
      AND a.tenant_id = $1
      AND (a.type = 'Bank' OR a.type = 'Cash')
    ORDER BY a.name`;

  let accClause = '';
  const params = [tenantId];
  if (accountSubstring.trim()) {
    accClause = ` AND LOWER(a.name) LIKE $2`;
    params.push(`%${accountSubstring.trim().toLowerCase()}%`);
  }

  const banks = await client.query(sqlAccounts.replace('ORDER BY', accClause + ' ORDER BY'), params);

  if (banks.rows.length === 0) {
    console.log('No bank/cash accounts match.');
    await client.end();
    return;
  }

  if (summary) {
    const openSum = banks.rows.reduce((s, a) => s + (Number(a.opening_balance) || 0), 0);
    const sumSql = `
      WITH bank_ids AS (
        SELECT unnest($2::text[]) AS id
      ),
      enriched AS (
        SELECT
          t.account_id,
          t.type,
          CASE WHEN t.type = 'Income' THEN t.amount::numeric ELSE -(t.amount::numeric) END AS signed_eff,
          CASE
            WHEN t.type = 'Loan' THEN '__loan__'
            WHEN t.type = 'Transfer' THEN '__transfer__'
            WHEN NULLIF(trim(COALESCE(t.building_id, b.building_id, i.building_id, '')), '') IS NOT NULL
              THEN '__buildings__'
            WHEN NULLIF(trim(COALESCE(t.project_id, b.project_id, i.project_id, '')), '') IS NOT NULL
              THEN trim(COALESCE(t.project_id, b.project_id, i.project_id, ''))
            ELSE $3
          END AS column_key
        FROM transactions t
        INNER JOIN bank_ids bk ON bk.id = t.account_id
        LEFT JOIN bills b ON b.id = t.bill_id AND b.deleted_at IS NULL AND b.tenant_id = t.tenant_id
        LEFT JOIN invoices i ON i.id = t.invoice_id AND i.deleted_at IS NULL AND i.tenant_id = t.tenant_id
        WHERE t.deleted_at IS NULL AND t.tenant_id = $1
          AND t.type IN ('Income', 'Expense')
      )
      SELECT type, SUM(signed_eff)::numeric AS total_dashboard_effect
      FROM enriched
      WHERE column_key = $3
      GROUP BY type
      ORDER BY type
    `;
    const ids = banks.rows.map((r) => r.id);
    const agg = await client.query(sumSql, [tenantId, ids, UNASSIGNED]);
    let txNet = 0;
    console.log('='.repeat(72));
    console.log(`TENANT SUMMARY (${banks.rows.length} bank/cash accounts matching filter)`);
    console.log(`Total opening balances (Initial balance column, from chart-of-accounts): ${openSum.toLocaleString()}`);
    console.log('\nIncome/Expense by type contributing to Initial balance column:');
    if (agg.rows.length === 0) {
      console.log('  (none)');
    } else {
      for (const row of agg.rows) {
        const v = Number(row.total_dashboard_effect);
        txNet += v;
        row.total_dashboard_effect = v;
      }
      console.table(agg.rows.map((row) => ({ type: row.type, total: Number(row.total_dashboard_effect) })));
      console.log(`  Net Income+Expense component: ${txNet.toLocaleString()}`);
    }
    console.log(`\nImplied column total (opening + transaction component): ${(openSum + txNet).toLocaleString()}`);
    console.log('='.repeat(72));
    console.log('');
  }

  console.log(`Bank/cash accounts (${banks.rows.length}):\n`);

  for (const acc of banks.rows) {
    const opening = Number(acc.opening_balance) || 0;
    console.log('='.repeat(72));
    console.log(`${acc.name} (${acc.type}) — id ${acc.id}`);
    console.log(`Opening balance (Initial balance column in dashboard): ${opening.toLocaleString()}`);

    const simple = `
      WITH enriched AS (
        SELECT
          t.id,
          t.date,
          t.type,
          NULLIF(trim(COALESCE(t.subtype, '')), '') AS subtype,
          t.amount,
          t.description,
          NULLIF(trim(COALESCE(t.building_id, b.building_id, i.building_id, '')), '') AS chain_building,
          NULLIF(trim(COALESCE(t.project_id, b.project_id, i.project_id, '')), '') AS chain_project,
          CASE
            WHEN t.type = 'Loan' THEN '__loan__'
            WHEN t.type = 'Transfer' THEN '__transfer__'
            WHEN NULLIF(trim(COALESCE(t.building_id, b.building_id, i.building_id, '')), '') IS NOT NULL
              THEN '__buildings__'
            WHEN NULLIF(trim(COALESCE(t.project_id, b.project_id, i.project_id, '')), '') IS NOT NULL
              THEN trim(COALESCE(t.project_id, b.project_id, i.project_id, ''))
            ELSE $3
          END AS column_key
        FROM transactions t
        LEFT JOIN bills b ON b.id = t.bill_id AND b.deleted_at IS NULL AND b.tenant_id = t.tenant_id
        LEFT JOIN invoices i ON i.id = t.invoice_id AND i.deleted_at IS NULL AND i.tenant_id = t.tenant_id
        WHERE t.deleted_at IS NULL AND t.tenant_id = $1 AND t.account_id = $2
          AND t.type IN ('Income', 'Expense')
      ),
      contrib AS (
        SELECT *,
          CASE WHEN type = 'Income' THEN amount::numeric ELSE -(amount::numeric) END AS signed_effect_to_unassigned
        FROM enriched
        WHERE column_key = $3
      )
      SELECT *
      FROM contrib
      ORDER BY date, id
    `;

    const ie = await client.query(simple, [tenantId, acc.id, UNASSIGNED]);

    let txSum = 0;
    const lines = ie.rows.map((r) => {
      const amt = Number(r.signed_effect_to_unassigned);
      txSum += amt;
      return {
        date: String(r.date).slice(0, 10),
        type: r.type,
        subtype: r.subtype || '',
        amount_dashboard: amt,
        project_chain: r.chain_project || '',
        building_chain: r.chain_building || '',
        description: r.description ? String(r.description).slice(0, 80) : '',
        id: r.id,
      };
    });

    const dashUnassignedTotal = opening + txSum;

    console.log('\nIncome/Expense in Initial balance bucket (no building chain, no project on tx/bill/invoice):');
    if (lines.length === 0) {
      console.log('  (no such transactions)');
    } else {
      const byType = {};
      for (const row of ie.rows) {
        const ty = row.type;
        const a = Number(row.signed_effect_to_unassigned);
        byType[ty] = (byType[ty] || 0) + a;
      }
      console.log('  Subtotal by type (dashboard-signed effect):');
      console.table(
        Object.entries(byType).map(([type, total]) => ({ type, dashboard_net_initial_balance_bucket: total }))
      );
      console.log('  Line items:');
      console.table(lines);
      console.log(`  Sum (Income + Expense components): ${txSum.toLocaleString()}`);
    }

    console.log(`\n--- Initial balance column total (opening + Income/Expense above): ${dashUnassignedTotal.toLocaleString()}`);
    console.log(
      'Note: Transfer and Loan use Transfer / Loan columns only, not the Initial balance column.\n'
    );
  }

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
