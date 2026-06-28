#!/usr/bin/env npx tsx
/**
 * P0-E — Migrate a tenant from legacy Income/Expense Summary posting to GL-native P&L accounts.
 *
 * Strategy: forward reclassification ONLY. Historical journals are never mutated. A single balanced
 * reclassification entry moves the accumulated Income/Expense Summary balances into the resolved
 * revenue/expense accounts (attributed by category via category_account_mapping), then the
 * gl_native_pl flag is flipped so all future postings are GL-native.
 *
 *   npm run pl:migrate --prefix backend -- --tenant taj-builders            # dry-run (default)
 *   npm run pl:migrate --prefix backend -- --tenant taj-builders --apply    # post reclass + flip flag
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
if (!process.env.DATABASE_URL) {
  const productionEnv = path.join(root, '.env.production');
  if (fs.existsSync(productionEnv)) dotenv.config({ path: productionEnv });
}
await import('../loadEnv.js');

import type pg from 'pg';
import { getPool } from '../db/pool.js';
import { createFinancialPostingService } from '../modules/accounting/services/FinancialPostingService.js';
import { clearGlNativePlCache } from '../modules/accounting/services/glNativePlFlag.js';
import {
  UNCATEGORIZED_REVENUE_ACCOUNT_ID,
  UNCATEGORIZED_EXPENSE_ACCOUNT_ID,
  SYS_INCOME_SUMMARY_ACCOUNT_ID,
  SYS_EXPENSE_SUMMARY_ACCOUNT_ID,
} from '../constants/systemChartDefs.js';

const EPS = 0.01;

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  const next = process.argv[idx + 1];
  return next && !next.startsWith('--') ? next.trim() : '';
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
const round = (n: number) => Math.round(n * 100) / 100;

interface ReclassLeg {
  glAccountId: string;
  amount: number; // positive magnitude
}

/**
 * Attribute the net Income/Expense Summary balance to target revenue/expense accounts by category.
 * For each summary account, sum its journal-line activity grouped by the source row's category,
 * resolving the target account via category_account_mapping (fallback: uncategorized).
 */
async function buildReclass(
  client: pg.PoolClient,
  tenantId: string,
  summaryAccountId: string,
  fallbackAccountId: string,
  side: 'income' | 'expense'
): Promise<{ summaryNet: number; legs: ReclassLeg[] }> {
  // Net signed balance on the summary account (credit-normal equity): credit - debit.
  const balRes = await client.query<{ net: string }>(
    `SELECT COALESCE(SUM(jl.credit_amount - jl.debit_amount), 0)::text AS net
     FROM journal_lines jl
     INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
     WHERE je.tenant_id = $1 AND jl.account_id = $2`,
    [tenantId, summaryAccountId]
  );
  const summaryNet = round(Number(balRes.rows[0]?.net ?? 0)); // income: positive credit; expense: negative

  // Attribute by category through the source transaction/bill, mapped to a target account.
  const attrRes = await client.query<{ gl_account_id: string | null; amount: string }>(
    `SELECT COALESCE(m.gl_account_id, $3) AS gl_account_id,
            SUM(jl.credit_amount - jl.debit_amount)::text AS amount
     FROM journal_lines jl
     INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
     LEFT JOIN transactions t ON je.source_module = 'transaction' AND t.id = je.source_id
     LEFT JOIN bills b        ON je.source_module = 'bill'        AND b.id = je.source_id
     LEFT JOIN category_account_mapping m
            ON m.category_id = COALESCE(t.category_id, b.category_id)
           AND m.tenant_id IN ($1, '__system__')
     WHERE je.tenant_id = $1 AND jl.account_id = $2
     GROUP BY COALESCE(m.gl_account_id, $3)`,
    [tenantId, summaryAccountId, fallbackAccountId]
  );

  const legs: ReclassLeg[] = attrRes.rows
    .map((r) => ({ glAccountId: r.gl_account_id ?? fallbackAccountId, amount: round(Number(r.amount)) }))
    .filter((l) => Math.abs(l.amount) >= EPS);

  // For income, revenue accounts carry credit balances (positive amount = credit to revenue).
  // For expense, expense accounts carry debit balances (negative net = debit to expense).
  return { summaryNet, legs };
}

async function main(): Promise<void> {
  const tenantId = arg('tenant') || 'taj-builders';
  const apply = flag('apply');
  const pool = getPool();
  const client = await pool.connect();

  try {
    const t = await client.query<{ name: string; gl_native_pl: boolean }>(
      `SELECT name, gl_native_pl FROM tenants WHERE id = $1`,
      [tenantId]
    );
    if (t.rows.length === 0) throw new Error(`Tenant "${tenantId}" not found.`);
    console.log(`Tenant: ${t.rows[0].name} (${tenantId}) — gl_native_pl=${t.rows[0].gl_native_pl}`);
    if (t.rows[0].gl_native_pl) {
      console.log('Already GL-native. Nothing to do.');
      return;
    }

    const income = await buildReclass(client, tenantId, SYS_INCOME_SUMMARY_ACCOUNT_ID, UNCATEGORIZED_REVENUE_ACCOUNT_ID, 'income');
    const expense = await buildReclass(client, tenantId, SYS_EXPENSE_SUMMARY_ACCOUNT_ID, UNCATEGORIZED_EXPENSE_ACCOUNT_ID, 'expense');

    // Build balanced reclass legs:
    //  Income Summary credit balance → Dr Income Summary, Cr Revenue accounts.
    //  Expense Summary debit balance  → Dr Expense accounts, Cr Expense Summary.
    const lines: { accountId: string; debitAmount: number; creditAmount: number }[] = [];

    if (Math.abs(income.summaryNet) >= EPS) {
      lines.push({ accountId: SYS_INCOME_SUMMARY_ACCOUNT_ID, debitAmount: round(income.summaryNet), creditAmount: 0 });
      for (const leg of income.legs) {
        lines.push({ accountId: leg.glAccountId, debitAmount: 0, creditAmount: leg.amount });
      }
    }
    if (Math.abs(expense.summaryNet) >= EPS) {
      // expense.summaryNet is negative (debit balance); magnitude credited back to summary
      lines.push({ accountId: SYS_EXPENSE_SUMMARY_ACCOUNT_ID, debitAmount: 0, creditAmount: round(-expense.summaryNet) });
      for (const leg of expense.legs) {
        // leg.amount is negative (debit-normal expense); debit the expense account by magnitude
        lines.push({ accountId: leg.glAccountId, debitAmount: round(-leg.amount), creditAmount: 0 });
      }
    }

    const totalDr = round(lines.reduce((s, l) => s + l.debitAmount, 0));
    const totalCr = round(lines.reduce((s, l) => s + l.creditAmount, 0));

    console.log('\nReclassification preview:');
    console.table(lines);
    console.log(`Totals — Dr ${totalDr.toFixed(2)} / Cr ${totalCr.toFixed(2)} (diff ${(totalDr - totalCr).toFixed(2)})`);

    if (lines.length === 0) {
      console.log('No summary balances to reclassify. Flipping flag only.');
    } else if (Math.abs(totalDr - totalCr) >= EPS) {
      throw new Error(`Reclass entry not balanced (diff ${(totalDr - totalCr).toFixed(2)}). Aborting — investigate category attribution.`);
    }

    if (!apply) {
      console.log('\nDRY RUN — no changes written. Re-run with --apply to post the reclass entry and enable gl_native_pl.');
      return;
    }

    await client.query('BEGIN');
    try {
      if (lines.length > 0) {
        const posting = createFinancialPostingService(tenantId, client);
        const today = new Date().toISOString().slice(0, 10);
        await posting.postManualJournal(client, {
          entryDate: today,
          reference: `PL-RECLASS:${tenantId}`,
          description: 'P0-E reclassification: Income/Expense Summary → GL-native revenue/expense accounts',
          sourceModule: 'pl_reclass',
          sourceId: tenantId,
          createdBy: null,
          lines,
        }, { allowClosedPeriod: true });
      }
      await client.query(`UPDATE tenants SET gl_native_pl = TRUE, updated_at = NOW() WHERE id = $1`, [tenantId]);
      await client.query('COMMIT');
      clearGlNativePlCache(tenantId);
      console.log('\nApplied. gl_native_pl enabled for tenant.');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
