#!/usr/bin/env node
/**
 * PostgreSQL: insert OR soft-delete a project installment invoice (defaults: RK Builders case).
 *
 * Insert: missing down payment row (e.g. synced from SQLite history).
 * Delete: soft-delete invoice + linked ledger transactions (matches backend softDeleteInvoice).
 *
 * Defaults (override with env or flags):
 *   tenant_id:        rk-builders-284d6d
 *   invoice id:       inv-gen-1775118620078-dp
 *   invoice_number:   P-INV-00856
 *   agreement_number: P-AGR-0095  (--agreement P-AGR-xxxx)  [insert only]
 *
 * Insert loads agreement + first unit, computes down payment from installment_plan + selling_price
 * (nearest 10,000). Override amount: --amount 2460000 or INSERT_DP_AMOUNT=2460000
 *
 * Delete requires id AND invoice_number to match the same row (safety check).
 *
 * Prerequisites:
 *   DATABASE_URL in repo root .env (or backend/.env)
 *   npm install (uses pg from project root)
 *
 * Usage (load DATABASE_URL from .env):
 *   dotenv -e .env -- node scripts/insert-pg-missing-dp-invoice.cjs
 *   dotenv -e .env -- node scripts/insert-pg-missing-dp-invoice.cjs --dry-run
 *   dotenv -e .env -- node scripts/insert-pg-missing-dp-invoice.cjs --amount 2460000
 *   dotenv -e .env -- node scripts/insert-pg-missing-dp-invoice.cjs --delete
 *   dotenv -e .env -- node scripts/insert-pg-missing-dp-invoice.cjs --delete --dry-run
 */

'use strict';

const path = require('path');
const { Client } = require('pg');

const projectRoot = path.join(__dirname, '..');
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(projectRoot, '.env') });
  dotenv.config({ path: path.join(projectRoot, 'backend', '.env') });
} catch (_) {}

const ROUND_TO = 10_000;
function roundToNearest(value, to) {
  return Math.round(value / to) * to;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const doDelete = args.includes('--delete');
  let agreementNumber = process.env.INSERT_AGREEMENT_NUMBER || 'P-AGR-0095';
  let amountOverride = process.env.INSERT_DP_AMOUNT ? Number(process.env.INSERT_DP_AMOUNT) : null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--agreement' && args[i + 1]) {
      agreementNumber = args[++i];
    } else if (args[i] === '--amount' && args[i + 1]) {
      amountOverride = Number(args[++i]);
    }
  }
  return { dryRun, doDelete, agreementNumber, amountOverride };
}

function computeDownPayment(sellingPrice, installmentPlan) {
  if (!installmentPlan || typeof installmentPlan !== 'object') return null;
  const pct = Number(installmentPlan.downPaymentPercentage);
  if (!Number.isFinite(pct) || pct <= 0) return null;
  const raw = sellingPrice * (pct / 100);
  const dp = raw > 0 ? roundToNearest(raw, ROUND_TO) : 0;
  return { amount: dp, pct };
}

async function runDelete(client, { dryRun, tenantId, invoiceId, invoiceNumber }) {
  const row = await client.query(
    `SELECT id, invoice_number, deleted_at, agreement_id, amount::text AS amount
     FROM invoices
     WHERE tenant_id = $1 AND id = $2 AND invoice_number = $3`,
    [tenantId, invoiceId, invoiceNumber]
  );
  if (row.rows.length === 0) {
    const byId = await client.query(
      `SELECT id, invoice_number, deleted_at FROM invoices WHERE tenant_id = $1 AND id = $2`,
      [tenantId, invoiceId]
    );
    const byNum = await client.query(
      `SELECT id, invoice_number, deleted_at FROM invoices WHERE tenant_id = $1 AND invoice_number = $2`,
      [tenantId, invoiceNumber]
    );
    const err = new Error(
      'No invoice matches both id and invoice_number. Same-row id+number is required.'
    );
    if (byId.rows.length) console.error('By id:', byId.rows[0]);
    if (byNum.rows.length) console.error('By number:', byNum.rows[0]);
    throw err;
  }

  const inv = row.rows[0];
  if (inv.deleted_at) {
    console.log('Invoice already soft-deleted:', { id: inv.id, invoice_number: inv.invoice_number });
    return;
  }

  const txCount = await client.query(
    `SELECT COUNT(*)::int AS c FROM transactions WHERE tenant_id = $1 AND invoice_id = $2 AND deleted_at IS NULL`,
    [tenantId, invoiceId]
  );
  const nTx = txCount.rows[0]?.c ?? 0;

  console.log('Soft-delete invoice (PostgreSQL)\n');
  console.log('Tenant:', tenantId);
  console.log('Invoice:', invoiceId, '/', invoiceNumber);
  console.log('Agreement_id:', inv.agreement_id || '(none)');
  console.log('Amount:', inv.amount);
  console.log('Active ledger rows linked (transactions):', nTx);
  if (dryRun) {
    console.log('\nDry run — no UPDATE.');
    return;
  }

  if (nTx > 0) {
    const u = await client.query(
      `UPDATE transactions
       SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE tenant_id = $1 AND invoice_id = $2 AND deleted_at IS NULL`,
      [tenantId, invoiceId]
    );
    console.log('Soft-deleted transactions:', u.rowCount);
  }

  const u2 = await client.query(
    `UPDATE invoices
     SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2 AND invoice_number = $3 AND deleted_at IS NULL`,
    [tenantId, invoiceId, invoiceNumber]
  );
  console.log('Soft-deleted invoice row(s):', u2.rowCount);
  console.log('\nDone.');
}

async function main() {
  const { dryRun, doDelete, agreementNumber, amountOverride } = parseArgs();

  const tenantId = process.env.INSERT_TENANT_ID || 'rk-builders-284d6d';
  const invoiceId = process.env.INSERT_INVOICE_ID || 'inv-gen-1775118620078-dp';
  const invoiceNumber = process.env.INSERT_INVOICE_NUMBER || 'P-INV-00856';

  const databaseUrl = process.env.DATABASE_URL || process.env.PG_URL;
  if (!databaseUrl) {
    console.error('Set DATABASE_URL in .env (repo root or backend).');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    if (doDelete) {
      await runDelete(client, { dryRun, tenantId, invoiceId, invoiceNumber });
      return;
    }

    const dup = await client.query(
      `SELECT id, invoice_number FROM invoices WHERE tenant_id = $1 AND (id = $2 OR invoice_number = $3)`,
      [tenantId, invoiceId, invoiceNumber]
    );
    if (dup.rows.length > 0) {
      console.log('Already exists (no insert):', dup.rows);
      return;
    }

    const pa = await client.query(
      `SELECT id, client_id, project_id, selling_price, issue_date, description, selling_price_category_id, installment_plan
       FROM project_agreements
       WHERE tenant_id = $1 AND agreement_number = $2 AND deleted_at IS NULL`,
      [tenantId, agreementNumber]
    );
    if (pa.rows.length === 0) {
      console.error(`No project_agreements row for tenant=${tenantId} agreement_number=${agreementNumber}`);
      process.exit(1);
    }
    const row = pa.rows[0];
    const agreementId = row.id;
    const sellingPrice = Number(row.selling_price);
    let installmentPlan = row.installment_plan;
    if (typeof installmentPlan === 'string') {
      try {
        installmentPlan = JSON.parse(installmentPlan);
      } catch {
        installmentPlan = null;
      }
    }

    const unitR = await client.query(
      `SELECT unit_id FROM project_agreement_units WHERE agreement_id = $1 LIMIT 1`,
      [agreementId]
    );
    const unitId = unitR.rows[0]?.unit_id || null;

    let amount;
    let descPct = '';
    if (amountOverride != null && Number.isFinite(amountOverride) && amountOverride > 0) {
      amount = amountOverride;
      descPct = installmentPlan && Number.isFinite(Number(installmentPlan.downPaymentPercentage))
        ? String(installmentPlan.downPaymentPercentage)
        : '?';
    } else {
      const computed = computeDownPayment(sellingPrice, installmentPlan);
      if (!computed || computed.amount <= 0) {
        console.error(
          'Could not compute down payment from installment_plan. Pass explicit amount: --amount <n> or INSERT_DP_AMOUNT='
        );
        process.exit(1);
      }
      amount = computed.amount;
      descPct = String(computed.pct);
    }

    const issueDate = row.issue_date
      ? row.issue_date instanceof Date
        ? row.issue_date.toISOString().slice(0, 10)
        : String(row.issue_date).slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const description = `Down Payment (${descPct}%) - ${row.description || ''}`.trim();

    const payload = {
      id: invoiceId,
      tenant_id: tenantId,
      invoice_number: invoiceNumber,
      contact_id: row.client_id,
      amount,
      paid_amount: 0,
      status: 'Unpaid',
      issue_date: issueDate,
      due_date: issueDate,
      invoice_type: 'Installment',
      description,
      project_id: row.project_id,
      unit_id: unitId,
      category_id: row.selling_price_category_id || null,
      agreement_id: agreementId,
    };

    console.log('Insert missing down-payment invoice (PostgreSQL)\n');
    console.log('Tenant:', tenantId);
    console.log('Agreement:', agreementNumber, '→', agreementId);
    console.log('Invoice id / number:', invoiceId, '/', invoiceNumber);
    console.log('Amount:', amount, 'PKR (agreement selling_price:', sellingPrice + ')');
    console.log('Unit:', unitId || '(none)');
    if (dryRun) {
      console.log('\nDry run — no INSERT.');
      return;
    }

    await client.query(
      `INSERT INTO invoices (
         id, tenant_id, invoice_number, contact_id, amount, paid_amount, status,
         issue_date, due_date, invoice_type, description,
         project_id, building_id, property_id, unit_id, category_id, agreement_id,
         security_deposit_charge, service_charges, rental_month, user_id,
         version, deleted_at, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8::date, $9::date, $10, $11,
         $12, NULL, NULL, $13, $14, $15,
         NULL, NULL, NULL, NULL,
         1, NULL, NOW(), NOW()
       )`,
      [
        payload.id,
        payload.tenant_id,
        payload.invoice_number,
        payload.contact_id,
        payload.amount,
        payload.paid_amount,
        payload.status,
        payload.issue_date,
        payload.due_date,
        payload.invoice_type,
        payload.description,
        payload.project_id,
        payload.unit_id,
        payload.category_id,
        payload.agreement_id,
      ]
    );

    console.log('\nDone. You can delete the agreement from the app when ready.');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
