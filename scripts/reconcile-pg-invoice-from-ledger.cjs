#!/usr/bin/env node
/**
 * Reconcile invoices.paid_amount + invoices.status from active Income transactions
 * (same rules as backend recalculateInvoicePaymentAggregates).
 *
 * Use when an invoice shows Paid/partial paid but ledger queries show no payment,
 * or after fixing soft-deleted payment rows.
 *
 * Usage (repo root, DATABASE_URL in .env):
 *   dotenv -e .env -- node scripts/reconcile-pg-invoice-from-ledger.cjs
 *   dotenv -e .env -- node scripts/reconcile-pg-invoice-from-ledger.cjs --tenant rk-builders-284d6d --invoice INV-00135
 *   dotenv -e .env -- node scripts/reconcile-pg-invoice-from-ledger.cjs --tenant rk-builders-284d6d --invoice INV-00135 --dry-run
 *   dotenv -e .env -- node scripts/reconcile-pg-invoice-from-ledger.cjs --tenant rk-builders-284d6d --invoice INV-00135 --restore-payments
 *
 * --restore-payments  Sets deleted_at = NULL on Income rows linked to this invoice (brings payments back in the app).
 * Without it, only the invoice row is realigned to whatever active (non-deleted) Income sums to.
 */

'use strict';

const { Client } = require('pg');

const DEFAULT_TENANT = 'rk-builders-284d6d';
const DEFAULT_INVOICE = 'INV-00135';

function parseArgs(argv) {
  let tenant = DEFAULT_TENANT;
  let invoiceNumber = DEFAULT_INVOICE;
  let dryRun = false;
  let restorePayments = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--restore-payments') restorePayments = true;
    else if (a === '--tenant' && argv[i + 1]) tenant = argv[++i];
    else if (a === '--invoice' && argv[i + 1]) invoiceNumber = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log(`Usage: dotenv -e .env -- node scripts/reconcile-pg-invoice-from-ledger.cjs [options]
  --tenant <id>     default: ${DEFAULT_TENANT}
  --invoice <num>   default: ${DEFAULT_INVOICE}
  --restore-payments  undelete soft-deleted Income linked to this invoice, then reconcile
  --dry-run         print changes only`);
      process.exit(0);
    }
  }
  return { tenant, invoiceNumber, dryRun, restorePayments };
}

async function recalculateInvoicePaymentAggregates(client, tenantId, invoiceId) {
  const invR = await client.query(
    `SELECT id, amount, status, paid_amount, invoice_number
     FROM invoices
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [invoiceId, tenantId]
  );
  const inv = invR.rows[0];
  if (!inv) {
    console.error('Invoice not found or soft-deleted for this tenant.');
    return null;
  }
  if (inv.status === 'Draft') {
    console.log('Invoice is Draft; skipping aggregate update.');
    return inv;
  }

  const sumR = await client.query(
    `SELECT COALESCE(SUM(amount), 0)::text AS sum FROM transactions
     WHERE tenant_id = $1 AND invoice_id = $2 AND deleted_at IS NULL
       AND LOWER(TRIM(type)) = 'income'`,
    [tenantId, invoiceId]
  );
  const paid = Math.max(0, Number(sumR.rows[0]?.sum ?? 0));
  const amt = Number(inv.amount);
  let newStatus;
  if (paid >= amt - 0.1) newStatus = 'Paid';
  else if (paid > 0.1) newStatus = 'Partially Paid';
  else newStatus = 'Unpaid';

  return {
    before: {
      paid_amount: Number(inv.paid_amount),
      status: inv.status,
    },
    after: { paid_amount: paid, status: newStatus },
    invoiceId: inv.id,
    invoiceNumber: inv.invoice_number,
  };
}

async function main() {
  const { tenant, invoiceNumber, dryRun, restorePayments } = parseArgs(process.argv);

  const url = process.env.DATABASE_URL;
  if (!url || String(url).trim() === '') {
    console.error('DATABASE_URL is not set. Run: dotenv -e .env -- node scripts/reconcile-pg-invoice-from-ledger.cjs');
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    const invLookup = await client.query(
      `SELECT id, invoice_number, amount, paid_amount, status,
              property_id, building_id, description
       FROM invoices
       WHERE tenant_id = $1 AND invoice_number = $2 AND deleted_at IS NULL`,
      [tenant, invoiceNumber]
    );

    if (invLookup.rows.length === 0) {
      console.error(`No active invoice ${invoiceNumber} for tenant ${tenant}.`);
      process.exit(1);
    }

    const invoiceRow = invLookup.rows[0];
    const invoiceId = invoiceRow.id;

    console.log('\n=== Invoice (before) ===');
    console.table([invoiceRow]);

    const txsActive = await client.query(
      `SELECT id, type, amount, date, description, deleted_at
       FROM transactions
       WHERE tenant_id = $1 AND invoice_id = $2 AND LOWER(TRIM(type)) = 'income'
       ORDER BY date, id`,
      [tenant, invoiceId]
    );

    console.log(`\n=== Income transactions for invoice_id (${txsActive.rows.length} row(s), incl. soft-deleted) ===`);
    console.table(txsActive.rows);

    if (restorePayments) {
      const deleted = txsActive.rows.filter((r) => r.deleted_at != null);
      if (deleted.length === 0) {
        console.log('\n--restore-payments: no soft-deleted Income rows to restore.');
      } else {
        console.log(`\n--restore-payments: will restore ${deleted.length} Income row(s) (soft-deleted).`);
      }
    }

    if (dryRun) {
      const planPreview = await recalculateInvoicePaymentAggregates(client, tenant, invoiceId);
      console.log('\n=== Reconcile plan (active Income only — current DB, no writes) ===');
      console.log(JSON.stringify(planPreview, null, 2));
      if (restorePayments) {
        const wouldRestore = txsActive.rows.filter((r) => r.deleted_at != null).length;
        const sumAll = await client.query(
          `SELECT COALESCE(SUM(amount), 0)::text AS sum FROM transactions
           WHERE tenant_id = $1 AND invoice_id = $2 AND LOWER(TRIM(type)) = 'income'`,
          [tenant, invoiceId]
        );
        const paidIfRestored = Math.max(0, Number(sumAll.rows[0]?.sum ?? 0));
        const amt = Number(invoiceRow.amount);
        let st = 'Unpaid';
        if (paidIfRestored >= amt - 0.1) st = 'Paid';
        else if (paidIfRestored > 0.1) st = 'Partially Paid';
        console.log(
          `\nIf --restore-payments were applied (${wouldRestore} row(s)): invoice would reconcile to paid_amount=${paidIfRestored}, status=${st}.`
        );
      }
      console.log('\nDry run: no UPDATE executed.');
      return;
    }

    await client.query('BEGIN');
    try {
      if (restorePayments) {
        const u = await client.query(
          `UPDATE transactions
           SET deleted_at = NULL, version = version + 1, updated_at = NOW()
           WHERE tenant_id = $1 AND invoice_id = $2 AND deleted_at IS NOT NULL
             AND LOWER(TRIM(type)) = 'income'`,
          [tenant, invoiceId]
        );
        if ((u.rowCount ?? 0) > 0) {
          console.log(`\nRestored ${u.rowCount} soft-deleted Income transaction(s).`);
        }
      }

      const plan = await recalculateInvoicePaymentAggregates(client, tenant, invoiceId);
      if (!plan || !plan.after) {
        await client.query('ROLLBACK');
        process.exit(1);
      }

      console.log('\n=== Reconcile plan ===');
      console.log(JSON.stringify(plan, null, 2));

      await client.query(
        `UPDATE invoices
         SET paid_amount = $3, status = $4, version = version + 1, updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [invoiceId, tenant, plan.after.paid_amount, plan.after.status]
      );
      await client.query('COMMIT');
      console.log('\nDone: invoice paid_amount and status updated.');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
