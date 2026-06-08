import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  integrationTestsEnabled,
  INTEGRATION_TENANT_ID,
  prepareIntegrationTenant,
  withRollbackTransaction,
} from '../test/integrationHarness.js';
import type { TransactionRow } from './transactionsService.js';
import {
  hasActiveTransactionJournalMirror,
  reverseTransactionJournalMirror,
  syncTransactionJournalMirror,
} from './transactionJournalPostingService.js';
import { getAccountById } from './accountsService.js';

const SYS_CASH = 'sys-acc-cash';
const SYS_CLEARING = 'sys-acc-clearing';

function incomeRow(id: string, amount: number): TransactionRow {
  return {
    id,
    tenant_id: INTEGRATION_TENANT_ID,
    user_id: null,
    type: 'Income',
    subtype: null,
    amount: String(amount),
    date: new Date('2026-03-15'),
    description: 'Integration test income',
    reference: null,
    account_id: SYS_CASH,
    from_account_id: null,
    to_account_id: null,
    category_id: null,
    contact_id: null,
    vendor_id: null,
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
    created_at: new Date(),
    updated_at: new Date(),
  };
}

async function insertTestTransaction(
  client: import('pg').PoolClient,
  row: TransactionRow
): Promise<void> {
  await client.query(
    `INSERT INTO transactions (
       id, tenant_id, user_id, type, subtype, amount, date, description, reference,
       account_id, from_account_id, to_account_id, category_id, contact_id, vendor_id,
       project_id, building_id, property_id, unit_id, invoice_id, bill_id, payslip_id,
       contract_id, agreement_id, batch_id, project_asset_id, owner_id, is_system,
       version, deleted_at, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7::date, $8, $9,
       $10, $11, $12, $13, $14, $15,
       $16, $17, $18, $19, $20, $21, $22,
       $23, $24, $25, $26, $27, $28,
       $29, $30, NOW(), NOW()
     )`,
    [
      row.id,
      row.tenant_id,
      row.user_id,
      row.type,
      row.subtype,
      row.amount,
      row.date,
      row.description,
      row.reference,
      row.account_id,
      row.from_account_id,
      row.to_account_id,
      row.category_id,
      row.contact_id,
      row.vendor_id,
      row.project_id,
      row.building_id,
      row.property_id,
      row.unit_id,
      row.invoice_id,
      row.bill_id,
      row.payslip_id,
      row.contract_id,
      row.agreement_id,
      row.batch_id,
      row.project_asset_id,
      row.owner_id,
      row.is_system,
      row.version,
      row.deleted_at,
    ]
  );
}

async function journalLinesBalanceForEntry(
  client: import('pg').PoolClient,
  journalEntryId: string
): Promise<{ debit: number; credit: number }> {
  const r = await client.query<{ debit: string; credit: string }>(
    `SELECT COALESCE(SUM(debit_amount), 0)::text AS debit, COALESCE(SUM(credit_amount), 0)::text AS credit
     FROM journal_lines WHERE journal_entry_id = $1`,
    [journalEntryId]
  );
  return {
    debit: Number(r.rows[0]?.debit ?? 0),
    credit: Number(r.rows[0]?.credit ?? 0),
  };
}

function balanceDelta(before: number, after: number): number {
  return after - before;
}

const describeIntegration = integrationTestsEnabled() ? describe : describe.skip;

describeIntegration('transactionJournalPosting integration (PostgreSQL)', () => {
  it('posts balanced journal mirror for income and increases cash balance by posted amount', async () => {
    await withRollbackTransaction(async (client) => {
      await prepareIntegrationTenant(client);

      const beforeCash = Number((await getAccountById(client, INTEGRATION_TENANT_ID, SYS_CASH))!.balance);

      const txId = `int_tx_${randomUUID().slice(0, 8)}`;
      const row = incomeRow(txId, 250);

      await insertTestTransaction(client, row);
      const { journalEntryId } = await syncTransactionJournalMirror(
        client,
        INTEGRATION_TENANT_ID,
        row,
        null
      );

      assert.ok(journalEntryId, 'expected journal entry id');
      assert.equal(
        await hasActiveTransactionJournalMirror(client, INTEGRATION_TENANT_ID, txId),
        true
      );

      const { debit, credit } = await journalLinesBalanceForEntry(client, journalEntryId!);
      assert.ok(Math.abs(debit - credit) < 0.01, 'journal entry must balance');
      assert.ok(Math.abs(debit - 250) < 0.01);

      const afterCash = Number((await getAccountById(client, INTEGRATION_TENANT_ID, SYS_CASH))!.balance);
      assert.ok(
        Math.abs(balanceDelta(beforeCash, afterCash) - 250) < 0.01,
        'cash balance delta from journal lines'
      );

      const lineAccounts = await client.query<{ account_id: string }>(
        `SELECT account_id FROM journal_lines WHERE journal_entry_id = $1 ORDER BY account_id`,
        [journalEntryId]
      );
      const ids = lineAccounts.rows.map((x) => x.account_id).sort();
      assert.deepEqual(ids, [SYS_CASH, SYS_CLEARING].sort());
    });
  });

  it('replaces journal mirror when transaction amount changes', async () => {
    await withRollbackTransaction(async (client) => {
      await prepareIntegrationTenant(client);

      const beforeCash = Number((await getAccountById(client, INTEGRATION_TENANT_ID, SYS_CASH))!.balance);

      const txId = `int_tx_${randomUUID().slice(0, 8)}`;
      let row = incomeRow(txId, 100);
      await insertTestTransaction(client, row);
      await syncTransactionJournalMirror(client, INTEGRATION_TENANT_ID, row, null);

      row = { ...row, amount: '175', version: 2 };
      await client.query(`UPDATE transactions SET amount = $2, version = $3 WHERE id = $1`, [
        txId,
        row.amount,
        row.version,
      ]);

      const { journalEntryId: secondId } = await syncTransactionJournalMirror(
        client,
        INTEGRATION_TENANT_ID,
        row,
        null
      );
      assert.ok(secondId);
      assert.equal(
        await hasActiveTransactionJournalMirror(client, INTEGRATION_TENANT_ID, txId),
        true
      );

      const afterCash = Number((await getAccountById(client, INTEGRATION_TENANT_ID, SYS_CASH))!.balance);
      assert.ok(Math.abs(balanceDelta(beforeCash, afterCash) - 175) < 0.01);
    });
  });

  it('reverses journal mirror on transaction removal', async () => {
    await withRollbackTransaction(async (client) => {
      await prepareIntegrationTenant(client);

      const beforeCash = Number((await getAccountById(client, INTEGRATION_TENANT_ID, SYS_CASH))!.balance);

      const txId = `int_tx_${randomUUID().slice(0, 8)}`;
      const row = incomeRow(txId, 90);
      await insertTestTransaction(client, row);
      await syncTransactionJournalMirror(client, INTEGRATION_TENANT_ID, row, null);

      await reverseTransactionJournalMirror(client, INTEGRATION_TENANT_ID, txId, null);
      assert.equal(
        await hasActiveTransactionJournalMirror(client, INTEGRATION_TENANT_ID, txId),
        false
      );

      const afterCash = Number((await getAccountById(client, INTEGRATION_TENANT_ID, SYS_CASH))!.balance);
      assert.ok(Math.abs(balanceDelta(beforeCash, afterCash)) < 0.01, 'balance unchanged after reversal');
    });
  });

  it('posts expense mirror debiting clearing and crediting cash', async () => {
    await withRollbackTransaction(async (client) => {
      await prepareIntegrationTenant(client);

      const txId = `int_tx_${randomUUID().slice(0, 8)}`;
      const row: TransactionRow = {
        ...incomeRow(txId, 80),
        type: 'Expense',
        amount: '80',
      };

      await insertTestTransaction(client, row);
      const { journalEntryId } = await syncTransactionJournalMirror(
        client,
        INTEGRATION_TENANT_ID,
        row,
        null
      );
      assert.ok(journalEntryId);

      const lines = await client.query<{ account_id: string; debit_amount: string; credit_amount: string }>(
        `SELECT account_id, debit_amount, credit_amount FROM journal_lines WHERE journal_entry_id = $1 ORDER BY account_id`,
        [journalEntryId]
      );
      const sysClearing = lines.rows.find((l) => l.account_id === SYS_CLEARING);
      const cash = lines.rows.find((l) => l.account_id === SYS_CASH);
      assert.ok(sysClearing && Number(sysClearing.debit_amount) === 80);
      assert.ok(cash && Number(cash.credit_amount) === 80);
    });
  });
});
