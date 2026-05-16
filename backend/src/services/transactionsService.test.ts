import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { upsertTransaction, type TransactionRow } from './transactionsService.js';

function vendorSettlementMirror(overrides: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: 'tx-vset-cash',
    tenant_id: 'tenant-1',
    user_id: 'user-1',
    type: 'Expense',
    subtype: 'vendor_settlement_cash',
    amount: '100',
    date: new Date('2026-04-20T00:00:00.000Z'),
    description: 'Supplier prepaid settlement cash',
    reference: 'VSET:je-1',
    account_id: 'bank-1',
    from_account_id: null,
    to_account_id: null,
    category_id: 'cat-1',
    contact_id: null,
    vendor_id: 'vendor-1',
    project_id: null,
    building_id: null,
    property_id: null,
    unit_id: null,
    invoice_id: null,
    bill_id: null,
    payslip_id: null,
    contract_id: null,
    agreement_id: null,
    batch_id: null,
    project_asset_id: null,
    owner_id: null,
    is_system: false,
    version: 1,
    deleted_at: null,
    created_at: new Date('2026-04-20T00:00:00.000Z'),
    updated_at: new Date('2026-04-20T00:00:00.000Z'),
    ...overrides,
  };
}

describe('upsertTransaction', () => {
  it('rejects POST upsert attempts to change vendor settlement cash mirror amounts', async () => {
    const existing = vendorSettlementMirror();
    let updateAttempted = false;
    const client = {
      async query(sql: string, params?: unknown[]) {
        if (sql.includes('FROM transactions t WHERE t.id = $1 AND t.tenant_id = $2')) {
          assert.deepEqual(params, ['tx-vset-cash', 'tenant-1']);
          return { rows: [existing] };
        }
        if (sql.includes('UPDATE transactions SET')) {
          updateAttempted = true;
          return { rows: [vendorSettlementMirror({ amount: '250', version: 2 })] };
        }
        throw new Error(`Unexpected query in test: ${sql}`);
      },
    } as unknown as pg.PoolClient;

    await assert.rejects(
      () =>
        upsertTransaction(
          client,
          'tenant-1',
          {
            id: 'tx-vset-cash',
            type: 'Expense',
            subtype: 'vendor_settlement_cash',
            amount: 250,
            date: '2026-04-20',
            description: 'Supplier prepaid settlement cash',
            reference: 'VSET:je-1',
            accountId: 'bank-1',
            categoryId: 'cat-1',
          },
          'user-1'
        ),
      /mirrors a supplier prepaid settlement journal/
    );
    assert.equal(updateAttempted, false);
  });
});
