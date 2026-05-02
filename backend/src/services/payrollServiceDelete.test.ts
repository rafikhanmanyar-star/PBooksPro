import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { deletePayrollRun } from './payrollService.js';

type QueryResult = {
  rows: unknown[];
  rowCount?: number;
};

function compactSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

describe('deletePayrollRun', () => {
  it('clears materialized payroll ledger rows for employees in the deleted run', async () => {
    const ledgerDeletes: string[] = [];
    let runDeleted = false;
    let payslipDeleted = false;

    const client = {
      async query(sql: string, values?: unknown[]): Promise<QueryResult> {
        const q = compactSql(sql);

        if (q.startsWith('SELECT DISTINCT employee_id FROM payslips')) {
          assert.deepEqual(values, ['run1', 'tenant1']);
          return { rows: [{ employee_id: 'emp1' }] };
        }

        if (q.startsWith('UPDATE payslips SET deleted_at = NOW()')) {
          assert.deepEqual(values, ['run1', 'tenant1']);
          assert.equal(runDeleted, true);
          payslipDeleted = true;
          return { rows: [], rowCount: 1 };
        }

        if (q.startsWith('UPDATE payroll_runs SET deleted_at = NOW()')) {
          assert.deepEqual(values, ['run1', 'tenant1']);
          runDeleted = true;
          return { rows: [], rowCount: 1 };
        }

        if (q.startsWith('SELECT id, payroll_run_id, net_pay::text, created_at FROM payslips')) {
          assert.equal(payslipDeleted, true);
          assert.deepEqual(values, ['tenant1', 'emp1']);
          return { rows: [] };
        }

        if (q.startsWith('DELETE FROM payroll_transactions WHERE tenant_id = $1 AND employee_id = $2')) {
          assert.deepEqual(values, ['tenant1', 'emp1']);
          ledgerDeletes.push('emp1');
          return { rows: [], rowCount: 2 };
        }

        throw new Error(`Unexpected query: ${q}`);
      },
    } as unknown as pg.PoolClient;

    const ok = await deletePayrollRun(client, 'tenant1', 'run1');

    assert.equal(ok, true);
    assert.equal(runDeleted, true);
    assert.equal(payslipDeleted, true);
    assert.deepEqual(ledgerDeletes, ['emp1']);
  });
});
