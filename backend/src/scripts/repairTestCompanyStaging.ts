#!/usr/bin/env npx tsx
/**
 * Repair test-company staging data + re-post GL mirrors for balanced balance sheet.
 *
 * Loads `.env.staging` when present (falls back to root `.env`).
 *
 *   npm run repair:test-company-staging --prefix backend
 *   npm run repair:test-company-staging --prefix backend -- --dry-run
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import type pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const stagingEnv = path.join(root, '.env.staging');
if (fs.existsSync(stagingEnv)) {
  dotenv.config({ path: stagingEnv });
} else {
  dotenv.config({ path: path.join(root, '.env') });
}

import { getPool } from '../db/pool.js';
import { softDeleteTransaction } from '../services/transactionsService.js';
import { replaceAllTransactionJournalMirrorsForTenant } from '../services/transactionJournalBackfillService.js';
import { backfillInvoiceJournalMirrorsForTenant } from '../services/invoiceJournalBackfillService.js';
import { backfillBillJournalMirrorsForTenant } from '../services/billJournalBackfillService.js';
import { getBalanceSheetReportJson } from '../services/balanceSheetReportService.js';

const TENANT_ID = 'test-company';
const PROJECT_ID = '1780802019442';
const BAD_TX_ID = 'txn-bp-1780891339259-bill_e042754ea624465b83208abfb09e6cc4';

/** Wipe tenant journal (staging repair only — requires bypassing immutability triggers). */
async function purgeTenantJournal(client: pg.PoolClient, tenantId: string): Promise<void> {
  await client.query(`SET session_replication_role = replica`);
  try {
    await client.query(`DELETE FROM journal_reversals WHERE tenant_id = $1`, [tenantId]);
    await client.query(
      `DELETE FROM journal_lines
       WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE tenant_id = $1)`,
      [tenantId]
    );
    await client.query(`DELETE FROM journal_entries WHERE tenant_id = $1`, [tenantId]);
  } finally {
    await client.query(`SET session_replication_role = DEFAULT`);
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const pool = getPool();
  const client = await pool.connect();

  try {
    console.log(`Repair test-company staging (dryRun=${dryRun})`);

    const badTx = await client.query(
      `SELECT id, amount, description FROM transactions WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [TENANT_ID, BAD_TX_ID]
    );
    if (badTx.rows[0]) {
      console.log(`Removing erroneous PKR ${badTx.rows[0].amount} bill payment: ${badTx.rows[0].description}`);
      if (!dryRun) {
        await client.query('BEGIN');
        await softDeleteTransaction(client, TENANT_ID, BAD_TX_ID);
        await client.query('COMMIT');
      }
    } else {
      console.log('Erroneous 500k bill payment already removed or not found.');
    }

    /** Align installment invoice total with agreement selling price (25,000). */
    const agreement = await client.query<{ id: string; selling_price: string }>(
      `SELECT id, selling_price FROM project_agreements WHERE tenant_id = $1 AND project_id = $2 AND status = 'Active' LIMIT 1`,
      [TENANT_ID, PROJECT_ID]
    );
    if (agreement.rows[0]) {
      const sellingPrice = Number(agreement.rows[0].selling_price);
      const inv = await client.query<{ id: string; amount: string; invoice_number: string }>(
        `SELECT id, amount, invoice_number FROM invoices
         WHERE tenant_id = $1 AND agreement_id = $2 AND invoice_type = 'Installment' AND deleted_at IS NULL
         ORDER BY issue_date ASC`,
        [TENANT_ID, agreement.rows[0].id]
      );
      const total = inv.rows.reduce((s, r) => s + Number(r.amount), 0);
      if (total > sellingPrice + 0.01 && inv.rows.length > 0) {
        const last = inv.rows[inv.rows.length - 1];
        const excess = total - sellingPrice;
        const newAmt = Math.max(0, Number(last.amount) - excess);
        console.log(
          `Adjusting ${last.invoice_number} amount ${last.amount} → ${newAmt} (agreement selling price ${sellingPrice})`
        );
        if (!dryRun) {
          await client.query(
            `UPDATE invoices SET amount = $3, version = version + 1, updated_at = NOW()
             WHERE id = $1 AND tenant_id = $2`,
            [last.id, TENANT_ID, newAmt]
          );
        }
      }
    }

    if (dryRun) {
      console.log('Dry run — skipping journal backfill.');
      return;
    }

    await client.query('BEGIN');

    console.log('Purging tenant journal for clean GL rebuild…');
    await purgeTenantJournal(client, TENANT_ID);

    const invStats = await backfillInvoiceJournalMirrorsForTenant(client, TENANT_ID, {
      replaceExisting: false,
      onProgress: (m) => console.log(m),
    });
    const billStats = await backfillBillJournalMirrorsForTenant(client, TENANT_ID, {
      replaceExisting: false,
      onProgress: (m) => console.log(m),
    });
    const txStats = await replaceAllTransactionJournalMirrorsForTenant(client, TENANT_ID, {
      onProgress: (m) => console.log(m),
    });

    await client.query('COMMIT');

    console.log('Backfill results:', { invStats, billStats, txStats });

    const bsClient = await pool.connect();
    try {
      const asOf = new Date().toISOString().slice(0, 10);
      const report = await getBalanceSheetReportJson(bsClient, TENANT_ID, asOf, PROJECT_ID);
      console.log('\nBalance sheet (City center) after repair:');
      console.log(`  Balanced: ${report.isBalanced}`);
      console.log(`  Discrepancy: ${report.discrepancy}`);
      console.log(`  Assets: ${report.totals.assets} | Liab: ${report.totals.liabilities} | Equity: ${report.totals.equity}`);
      if (report.validation.length) {
        const messages = (report.validation as { code: string; message: string }[]).map((v) => v.message);
        console.log('  Validation:', messages.join('; '));
      }

      const consolidated = await getBalanceSheetReportJson(bsClient, TENANT_ID, asOf, 'all');
      console.log('\nBalance sheet (consolidated) after repair:');
      console.log(`  Balanced: ${consolidated.isBalanced}`);
      console.log(`  Discrepancy: ${consolidated.discrepancy}`);
      console.log(`  Assets: ${consolidated.totals.assets} | Liab: ${consolidated.totals.liabilities} | Equity: ${consolidated.totals.equity}`);
    } finally {
      bsClient.release();
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
