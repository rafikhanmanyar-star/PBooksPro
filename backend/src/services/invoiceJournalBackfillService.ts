import type pg from 'pg';
import { bootstrapTenantChart } from './tenantBootstrap.js';
import type { InvoiceRow } from './invoicesService.js';
import {
  ensureInvoiceJournalMirror,
  buildJournalLinesFromInvoice,
  shouldSkipInvoiceJournalMirror,
  INVOICE_JOURNAL_SOURCE_MODULE,
} from './invoiceJournalPostingService.js';
import { syncInvoiceJournalMirror } from './invoiceJournalPostingService.js';

const INV_SELECT = `SELECT id, tenant_id, invoice_number, contact_id, amount, paid_amount, status, issue_date, due_date,
  invoice_type, description, project_id, building_id, property_id, unit_id, category_id, agreement_id,
  security_deposit_charge, service_charges, rental_month, user_id, version, deleted_at, created_at, updated_at
  FROM invoices WHERE tenant_id = $1 AND deleted_at IS NULL`;

export type InvoiceJournalBackfillOptions = {
  dryRun?: boolean;
  replaceExisting?: boolean;
  onProgress?: (msg: string) => void;
};

export type InvoiceJournalBackfillStats = {
  tenantId: string;
  candidates: number;
  posted: number;
  replaced: number;
  skippedMirrorRule: number;
  skippedNoLines: number;
  failed: number;
  errors: { invoiceId: string; message: string }[];
};

export async function backfillInvoiceJournalMirrorsForTenant(
  client: pg.PoolClient,
  tenantId: string,
  options: InvoiceJournalBackfillOptions = {}
): Promise<InvoiceJournalBackfillStats> {
  await bootstrapTenantChart(client, tenantId, { legacyIds: false });

  const r = await client.query<InvoiceRow>(`${INV_SELECT} ORDER BY issue_date ASC, id ASC`, [tenantId]);
  const stats: InvoiceJournalBackfillStats = {
    tenantId,
    candidates: r.rows.length,
    posted: 0,
    replaced: 0,
    skippedMirrorRule: 0,
    skippedNoLines: 0,
    failed: 0,
    errors: [],
  };

  for (const row of r.rows) {
    try {
      if (shouldSkipInvoiceJournalMirror(row)) {
        stats.skippedMirrorRule++;
        if (options.replaceExisting && !options.dryRun) {
          await syncInvoiceJournalMirror(client, tenantId, row, row.user_id, { replaceExisting: true });
        }
        continue;
      }
      if (!buildJournalLinesFromInvoice(row)) {
        stats.skippedNoLines++;
        continue;
      }

      if (options.dryRun) continue;

      if (options.replaceExisting) {
        await syncInvoiceJournalMirror(client, tenantId, row, row.user_id, { replaceExisting: true });
        stats.replaced++;
        continue;
      }

      const result = await ensureInvoiceJournalMirror(client, tenantId, row, row.user_id);
      if (result.skipped === 'already_posted') continue;
      if (result.skipped === 'mirror_rule') stats.skippedMirrorRule++;
      else if (result.skipped === 'no_lines') stats.skippedNoLines++;
      else if (result.journalEntryId) stats.posted++;
    } catch (e) {
      stats.failed++;
      stats.errors.push({
        invoiceId: row.id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  void INVOICE_JOURNAL_SOURCE_MODULE;
  options.onProgress?.(
    `tenant=${tenantId} invoices posted=${stats.posted} replaced=${stats.replaced} failed=${stats.failed}`
  );
  return stats;
}
