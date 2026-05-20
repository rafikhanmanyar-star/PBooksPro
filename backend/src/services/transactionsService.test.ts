import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { updateTransaction, upsertTransaction, type TransactionRow } from './transactionsService.js';

const tenantId = 'tenant-1';
const settlementReference = 'VSET:journal-1';

function settlementMirror(overrides: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: 'tx-vset-1',
    tenant_id: tenantId,
    user_id: 'user-1',
    type: 'Expense',
    subtype: null,
    amount: '500.00',
    date: new Date(Date.UTC(2026, 4, 20)),
    description: 'Supplier prepaid settlement cash leg',
    reference: settlementReference,
    account_id: 'bank-1',
    from_account_id: null,
    to_account_id: null,
    category_id: 'cat-1',
    contact_id: null,
    vendor_id: 'vendor-1',
    project_id: 'project-1',
    building_id: null,
    property_id: null,
    unit_id: null,
    invoice_id: null,
    bill_id: 'bill-1',
    payslip_id: null,
    contract_id: null,
    agreement_id: null,
    batch_id: null,
    project_asset_id: null,
    owner_id: null,
    is_system: true,
    version: 3,
    deleted_at: null,
    created_at: new Date(Date.UTC(2026, 4, 20)),
    updated_at: new Date(Date.UTC(2026, 4, 20)),
    ...overrides,
  };
}

function clientWithExisting(row: TransactionRow) {
  return {
    async query(sql: string) {
      if (sql.includes('FROM transactions t WHERE t.id = $1 AND t.tenant_id = $2')) {
        return { rows: [row] };
      }
      if (sql.includes('UPDATE transactions SET')) {
        throw new Error('settlement mirror mutation reached UPDATE');
      }
      return { rows: [] };
    },
  };
}

const baseBody = {
  id: 'tx-vset-1',
  type: 'Expense',
  amount: 500,
  date: '2026-05-20',
  description: 'Supplier prepaid settlement cash leg',
  reference: settlementReference,
  accountId: 'bank-1',
  categoryId: 'cat-1',
  vendorId: 'vendor-1',
  projectId: 'project-1',
  billId: 'bill-1',
  isSystem: true,
  version: 3,
};

describe('settlement mirror transaction immutability', () => {
  it('blocks PUT from relinking a vendor-settlement cash mirror to another bill', async () => {
    const client = clientWithExisting(settlementMirror());

    await assert.rejects(
      updateTransaction(client as never, tenantId, 'tx-vset-1', {
        ...baseBody,
        billId: 'bill-2',
      }),
      /supplier prepaid settlement|settlement link/i
    );
  });

  it('blocks POST upsert from changing a vendor-settlement cash mirror amount', async () => {
    const client = clientWithExisting(settlementMirror());

    await assert.rejects(
      upsertTransaction(
        client as never,
        tenantId,
        {
          ...baseBody,
          amount: 750,
        },
        'user-1'
      ),
      /supplier prepaid settlement|settlement journal/i
    );
  });
});
