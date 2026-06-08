import type pg from 'pg';
import { bootstrapTenantChart } from './tenantBootstrap.js';
import type { BillRow } from './billsService.js';
import {
  ensureBillJournalMirror,
  buildJournalLinesFromBill,
  shouldSkipBillJournalMirror,
  syncBillJournalMirror,
} from './billJournalPostingService.js';

const BILL_SELECT = `SELECT id, tenant_id, bill_number, contact_id, vendor_id, amount, paid_amount, status, issue_date, due_date,
  description, category_id, project_id, building_id, property_id, project_agreement_id, contract_id, staff_id,
  expense_bearer_type, expense_category_items, document_path, document_id, user_id, version, deleted_at, created_at, updated_at
  FROM bills WHERE tenant_id = $1 AND deleted_at IS NULL`;

export type BillJournalBackfillOptions = {
  dryRun?: boolean;
  replaceExisting?: boolean;
  onProgress?: (msg: string) => void;
};

export type BillJournalBackfillStats = {
  tenantId: string;
  candidates: number;
  posted: number;
  replaced: number;
  skippedMirrorRule: number;
  skippedNoLines: number;
  failed: number;
  errors: { billId: string; message: string }[];
};

export async function backfillBillJournalMirrorsForTenant(
  client: pg.PoolClient,
  tenantId: string,
  options: BillJournalBackfillOptions = {}
): Promise<BillJournalBackfillStats> {
  await bootstrapTenantChart(client, tenantId, { legacyIds: false });

  const r = await client.query<BillRow>(`${BILL_SELECT} ORDER BY issue_date ASC, id ASC`, [tenantId]);
  const stats: BillJournalBackfillStats = {
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
      if (shouldSkipBillJournalMirror(row)) {
        stats.skippedMirrorRule++;
        continue;
      }
      if (!buildJournalLinesFromBill(row)) {
        stats.skippedNoLines++;
        continue;
      }

      if (options.dryRun) continue;

      if (options.replaceExisting) {
        await syncBillJournalMirror(client, tenantId, row, row.user_id, { replaceExisting: true });
        stats.replaced++;
        continue;
      }

      const result = await ensureBillJournalMirror(client, tenantId, row, row.user_id);
      if (result.skipped === 'already_posted') continue;
      if (result.skipped === 'mirror_rule') stats.skippedMirrorRule++;
      else if (result.skipped === 'no_lines') stats.skippedNoLines++;
      else if (result.journalEntryId) stats.posted++;
    } catch (e) {
      stats.failed++;
      stats.errors.push({
        billId: row.id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  options.onProgress?.(`tenant=${tenantId} bills posted=${stats.posted} replaced=${stats.replaced} failed=${stats.failed}`);
  return stats;
}
