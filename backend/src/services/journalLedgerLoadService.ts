/**
 * Load journal_lines + journal_entries for unified GL reporting (PostgreSQL / LAN).
 */
import type pg from 'pg';
import { GLOBAL_SYSTEM_TENANT_ID } from '../constants/globalSystemChart.js';
import type { JournalEntryRow, JournalLineRow, JournalLedgerInput } from '../financial/journalLedgerCore.js';

export type { JournalLedgerInput, JournalEntryRow, JournalLineRow };

export async function loadJournalLedgerInput(
  client: pg.PoolClient,
  tenantId: string,
  options?: { asOfDate?: string }
): Promise<Pick<JournalLedgerInput, 'journalLines' | 'journalEntries'>> {
  const params: unknown[] = [tenantId];
  let dateCond = '';
  if (options?.asOfDate) {
    dateCond = ` AND je.entry_date <= $${params.length + 1}::date`;
    params.push(options.asOfDate);
  }

  const linesR = await client.query(
    `SELECT
      jl.journal_entry_id AS journal_entry_id,
      jl.account_id AS account_id,
      jl.debit_amount::float AS debit_amount,
      jl.credit_amount::float AS credit_amount,
      jl.line_number AS line_number,
      jl.project_id AS project_id
    FROM journal_lines jl
    INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE je.tenant_id = $1${dateCond}
    ORDER BY je.entry_date ASC, je.id ASC, jl.line_number ASC`,
    params
  );

  const entriesR = await client.query(
    `SELECT
      je.id AS id,
      je.entry_date::text AS entry_date,
      je.reference AS reference,
      je.description AS description,
      je.source_module AS source_module,
      je.source_id AS source_id,
      je.project_id AS project_id,
      EXISTS (
        SELECT 1 FROM journal_reversals jr
        WHERE jr.original_journal_entry_id = je.id AND jr.tenant_id = je.tenant_id
      ) AS is_reversed
    FROM journal_entries je
    WHERE je.tenant_id = $1${dateCond}`,
    params
  );

  const journalLines: JournalLineRow[] = (linesR.rows as Record<string, unknown>[]).map((r) => ({
    journalEntryId: String(r.journal_entry_id),
    accountId: String(r.account_id),
    debitAmount: Number(r.debit_amount),
    creditAmount: Number(r.credit_amount),
    lineNumber: Number(r.line_number),
    projectId: r.project_id != null ? String(r.project_id) : null,
  }));

  const journalEntries: JournalEntryRow[] = (entriesR.rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    entryDate: String(r.entry_date).slice(0, 10),
    reference: r.reference != null ? String(r.reference) : undefined,
    description: r.description != null ? String(r.description) : null,
    sourceModule: r.source_module != null ? String(r.source_module) : null,
    sourceId: r.source_id != null ? String(r.source_id) : null,
    projectId: r.project_id != null ? String(r.project_id) : null,
    isReversed: Boolean(r.is_reversed),
  }));

  void GLOBAL_SYSTEM_TENANT_ID;
  return { journalLines, journalEntries };
}
