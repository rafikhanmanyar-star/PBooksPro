import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '../../../.env.staging') });

import { getPool } from '../db/pool.js';
import { loadJournalLedgerInput } from '../services/journalLedgerLoadService.js';
import { computeAccountBalancesFromJournal } from '../financial/journalLedgerCore.js';

const pool = getPool();
const c = await pool.connect();
const jl = await loadJournalLedgerInput(c, 'test-company', { asOfDate: '2026-06-08' });
const acc = await c.query(
  `SELECT id, name, type FROM accounts WHERE id IN ('sys-acc-cash','sys-acc-ar','sys-acc-ap','sys-acc-income-summary','sys-acc-expense-summary','sys-acc-sec-liability')`
);
const accounts = acc.rows.map((r: { id: string; name: string; type: string }) => ({
  id: r.id,
  name: r.name,
  type: r.type,
}));
const bals = computeAccountBalancesFromJournal({ ...jl, accounts }, '2026-06-08', {});
console.log('Consolidated balances:');
for (const [id, b] of bals) {
  const name = accounts.find((a) => a.id === id)?.name ?? id;
  if (Math.abs(b.signedBalance) > 0.01) console.log(`  ${name}: ${b.signedBalance}`);
}
const proj = computeAccountBalancesFromJournal({ ...jl, accounts }, '2026-06-08', { projectId: '1780802019442' });
console.log('City center balances:');
for (const [id, b] of proj) {
  const name = accounts.find((a) => a.id === id)?.name ?? id;
  if (Math.abs(b.signedBalance) > 0.01) console.log(`  ${name}: ${b.signedBalance}`);
}
c.release();
await pool.end();
