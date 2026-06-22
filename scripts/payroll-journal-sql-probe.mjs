/**
 * Probe payroll journal report SQL against staging DB.
 */
import pg from 'pg';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv(file) {
  const p = resolve(process.cwd(), file);
  try {
    const text = readFileSync(p, 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    /* ignore */
  }
}

loadEnv('.env.staging');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const tenantId = 'test-company';

const sql = `SELECT pr.id AS run_id,
              (pr.month || ' ' || pr.year::text) AS payroll_period,
              pr.status AS run_status,
              COALESCE(pr.total_amount, 0)::text AS approved_amount,
              je.id AS journal_entry_id,
              je.reference AS journal_reference,
              (
                SELECT COALESCE(SUM(jl.debit_amount), 0)::text
                FROM journal_lines jl
                WHERE jl.journal_entry_id = je.id
                  AND jl.account_id = 'sys-acc-expense-summary'
              ) AS expense_amount,
              (
                SELECT COALESCE(SUM(jl.credit_amount), 0)::text
                FROM journal_lines jl
                WHERE jl.journal_entry_id = je.id
                  AND jl.account_id = 'sys-acc-ap'
              ) AS liability_amount
       FROM payroll_runs pr
       LEFT JOIN LATERAL (
         SELECT je2.id, je2.reference
         FROM journal_entries je2
         WHERE je2.tenant_id = pr.tenant_id
           AND je2.source_module = 'payroll_run'
           AND je2.source_id = pr.id
         ORDER BY je2.created_at DESC
         LIMIT 1
       ) je ON true
       WHERE pr.tenant_id = $1 AND pr.deleted_at IS NULL AND pr.year = 2026
       ORDER BY pr.year DESC`;

try {
  const r = await pool.query(sql, [tenantId]);
  console.log(JSON.stringify({ rowCount: r.rows.length, rows: r.rows }, null, 2));
  const audit = await pool.query(
    `SELECT module, audit_action, action, summary, created_at FROM change_log
     WHERE tenant_id = $1 AND module = 'payroll'
     ORDER BY created_at DESC LIMIT 10`,
    [tenantId]
  );
  console.log('CHANGE_LOG', JSON.stringify(audit.rows, null, 2));
  const journals = await pool.query(
    `SELECT id, source_module, source_id, reference, created_at FROM journal_entries
     WHERE tenant_id = $1 AND source_module = 'payroll_run'
     ORDER BY created_at DESC LIMIT 5`,
    [tenantId]
  );
  console.log('PAYROLL_JOURNALS', JSON.stringify(journals.rows, null, 2));
} finally {
  await pool.end();
}
