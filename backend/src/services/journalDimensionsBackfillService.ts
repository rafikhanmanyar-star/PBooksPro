/**
 * Backfill journal_entries / journal_lines building_id (and line project_id) from source documents.
 * Journal tables are immutable — update triggers are disabled briefly per tenant batch.
 */
import type pg from 'pg';

export type JournalDimensionsBackfillSummary = {
  tenantId: string;
  dryRun: boolean;
  totalJournalEntries: number;
  entriesMissingProjectBefore: number;
  entriesMissingBuildingBefore: number;
  entriesUpdatedFromTransactions: number;
  entriesUpdatedFromInvoices: number;
  entriesUpdatedFromBills: number;
  entriesUpdatedFromVendorClearing: number;
  linesUpdatedFromEntries: number;
  entriesMissingProjectAfter: number;
  entriesMissingBuildingAfter: number;
  entriesWithBuildingAfter: number;
};

async function assertJournalDimensionColumns(client: pg.PoolClient): Promise<void> {
  const r = await client.query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'journal_entries'
         AND column_name = 'building_id'
     ) AS ok`
  );
  if (!r.rows[0]?.ok) {
    throw new Error(
      'journal_entries.building_id is missing. Run migration 121 first:\n' +
        '  npm run db:migrate:staging   (staging)\n' +
        '  npm run db:migrate:production   (production)\n' +
        '  npm run db:migrate:lan   (root .env)\n' +
        'Then use the matching backfill script:\n' +
        '  npm run db:backfill-journal-dimensions:staging -- --all\n' +
        '  npm run db:backfill-journal-dimensions:production -- --all\n' +
        '  npm run db:backfill-journal-dimensions -- --all'
    );
  }
}

async function ensureJournalImmutabilityTriggers(client: pg.PoolClient): Promise<void> {
  await client.query(`
    CREATE OR REPLACE FUNCTION deny_journal_entries_mutation()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION 'journal_entries are immutable';
    END;
    $$;

    CREATE OR REPLACE FUNCTION deny_journal_lines_mutation()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RAISE EXCEPTION 'journal_lines are immutable';
    END;
    $$;

    DROP TRIGGER IF EXISTS journal_entries_immutable_upd ON journal_entries;
    CREATE TRIGGER journal_entries_immutable_upd
      BEFORE UPDATE ON journal_entries
      FOR EACH ROW
      EXECUTE PROCEDURE deny_journal_entries_mutation();

    DROP TRIGGER IF EXISTS journal_entries_immutable_del ON journal_entries;
    CREATE TRIGGER journal_entries_immutable_del
      BEFORE DELETE ON journal_entries
      FOR EACH ROW
      EXECUTE PROCEDURE deny_journal_entries_mutation();

    DROP TRIGGER IF EXISTS journal_lines_immutable_upd ON journal_lines;
    CREATE TRIGGER journal_lines_immutable_upd
      BEFORE UPDATE ON journal_lines
      FOR EACH ROW
      EXECUTE PROCEDURE deny_journal_lines_mutation();

    DROP TRIGGER IF EXISTS journal_lines_immutable_del ON journal_lines;
    CREATE TRIGGER journal_lines_immutable_del
      BEFORE DELETE ON journal_lines
      FOR EACH ROW
      EXECUTE PROCEDURE deny_journal_lines_mutation();
  `);
}

async function countEntries(
  client: pg.PoolClient,
  tenantId: string,
  filter: 'total' | 'missing_project' | 'missing_building' | 'with_building'
): Promise<number> {
  let cond = '';
  if (filter === 'missing_project') {
    cond = ` AND (je.project_id IS NULL OR TRIM(je.project_id) = '')`;
  } else if (filter === 'missing_building') {
    cond = ` AND (je.building_id IS NULL OR TRIM(je.building_id) = '')`;
  } else if (filter === 'with_building') {
    cond = ` AND je.building_id IS NOT NULL AND TRIM(je.building_id) <> ''`;
  }
  const r = await client.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM journal_entries je WHERE je.tenant_id = $1${cond}`,
    [tenantId]
  );
  return Number(r.rows[0]?.c ?? 0);
}

async function runDimensionUpdates(client: pg.PoolClient, tenantId: string): Promise<{
  fromTransactions: number;
  fromInvoices: number;
  fromBills: number;
  fromVendorClearing: number;
  linesFromEntries: number;
}> {
  await ensureJournalImmutabilityTriggers(client);
  await client.query(`ALTER TABLE journal_entries DISABLE TRIGGER journal_entries_immutable_upd`);
  await client.query(`ALTER TABLE journal_lines DISABLE TRIGGER journal_lines_immutable_upd`);

  const tx = await client.query(
    `UPDATE journal_entries je
     SET
       building_id = COALESCE(NULLIF(TRIM(je.building_id), ''), NULLIF(TRIM(t.building_id), '')),
       project_id = COALESCE(NULLIF(TRIM(je.project_id), ''), NULLIF(TRIM(t.project_id), ''))
     FROM transactions t
     WHERE je.tenant_id = $1
       AND je.source_module = 'transaction'
       AND je.source_id = t.id
       AND t.deleted_at IS NULL`,
    [tenantId]
  );

  const inv = await client.query(
    `UPDATE journal_entries je
     SET
       building_id = COALESCE(
         NULLIF(TRIM(je.building_id), ''),
         NULLIF(TRIM(i.building_id), ''),
         NULLIF(TRIM(p.building_id), '')
       ),
       project_id = COALESCE(NULLIF(TRIM(je.project_id), ''), NULLIF(TRIM(i.project_id), ''))
     FROM invoices i
     LEFT JOIN properties p ON p.id = i.property_id AND p.tenant_id = i.tenant_id AND p.deleted_at IS NULL
     WHERE je.tenant_id = $1
       AND je.source_module = 'invoice'
       AND je.source_id = i.id
       AND i.deleted_at IS NULL`,
    [tenantId]
  );

  const bill = await client.query(
    `UPDATE journal_entries je
     SET
       building_id = COALESCE(
         NULLIF(TRIM(je.building_id), ''),
         NULLIF(TRIM(b.building_id), ''),
         NULLIF(TRIM(p.building_id), '')
       ),
       project_id = COALESCE(NULLIF(TRIM(je.project_id), ''), NULLIF(TRIM(b.project_id), ''))
     FROM bills b
     LEFT JOIN properties p ON p.id = b.property_id AND p.tenant_id = b.tenant_id AND p.deleted_at IS NULL
     WHERE je.tenant_id = $1
       AND je.source_module = 'bill'
       AND je.source_id = b.id
       AND b.deleted_at IS NULL`,
    [tenantId]
  );

  const vendor = await client.query(
    `UPDATE journal_entries je
     SET
       building_id = COALESCE(
         NULLIF(TRIM(je.building_id), ''),
         NULLIF(TRIM(b.building_id), ''),
         NULLIF(TRIM(p.building_id), '')
       ),
       project_id = COALESCE(NULLIF(TRIM(je.project_id), ''), NULLIF(TRIM(b.project_id), ''))
     FROM bills b
     LEFT JOIN properties p ON p.id = b.property_id AND p.tenant_id = b.tenant_id AND p.deleted_at IS NULL
     WHERE je.tenant_id = $1
       AND je.source_module = 'vendor_bill_advance_clearing'
       AND je.source_id = b.id
       AND b.deleted_at IS NULL`,
    [tenantId]
  );

  const lines = await client.query(
    `UPDATE journal_lines jl
     SET
       building_id = COALESCE(NULLIF(TRIM(jl.building_id), ''), NULLIF(TRIM(je.building_id), '')),
       project_id = COALESCE(NULLIF(TRIM(jl.project_id), ''), NULLIF(TRIM(je.project_id), ''))
     FROM journal_entries je
     WHERE je.id = jl.journal_entry_id AND je.tenant_id = $1`,
    [tenantId]
  );

  await client.query(`ALTER TABLE journal_entries ENABLE TRIGGER journal_entries_immutable_upd`);
  await client.query(`ALTER TABLE journal_lines ENABLE TRIGGER journal_lines_immutable_upd`);

  return {
    fromTransactions: tx.rowCount ?? 0,
    fromInvoices: inv.rowCount ?? 0,
    fromBills: bill.rowCount ?? 0,
    fromVendorClearing: vendor.rowCount ?? 0,
    linesFromEntries: lines.rowCount ?? 0,
  };
}

export async function backfillJournalDimensionsForTenant(
  client: pg.PoolClient,
  tenantId: string,
  options?: { dryRun?: boolean }
): Promise<JournalDimensionsBackfillSummary> {
  await assertJournalDimensionColumns(client);
  const dryRun = options?.dryRun === true;

  const totalJournalEntries = await countEntries(client, tenantId, 'total');
  const entriesMissingProjectBefore = await countEntries(client, tenantId, 'missing_project');
  const entriesMissingBuildingBefore = await countEntries(client, tenantId, 'missing_building');

  let counts = {
    fromTransactions: 0,
    fromInvoices: 0,
    fromBills: 0,
    fromVendorClearing: 0,
    linesFromEntries: 0,
  };

  if (!dryRun) {
    counts = await runDimensionUpdates(client, tenantId);
  }

  const entriesMissingProjectAfter = dryRun
    ? entriesMissingProjectBefore
    : await countEntries(client, tenantId, 'missing_project');
  const entriesMissingBuildingAfter = dryRun
    ? entriesMissingBuildingBefore
    : await countEntries(client, tenantId, 'missing_building');
  const entriesWithBuildingAfter = dryRun
    ? await countEntries(client, tenantId, 'with_building')
    : await countEntries(client, tenantId, 'with_building');

  return {
    tenantId,
    dryRun,
    totalJournalEntries,
    entriesMissingProjectBefore,
    entriesMissingBuildingBefore,
    entriesUpdatedFromTransactions: counts.fromTransactions,
    entriesUpdatedFromInvoices: counts.fromInvoices,
    entriesUpdatedFromBills: counts.fromBills,
    entriesUpdatedFromVendorClearing: counts.fromVendorClearing,
    linesUpdatedFromEntries: counts.linesFromEntries,
    entriesMissingProjectAfter,
    entriesMissingBuildingAfter,
    entriesWithBuildingAfter,
  };
}

export function printJournalDimensionsBackfillSummary(summary: JournalDimensionsBackfillSummary): void {
  console.log('\n=== Journal dimension backfill audit ===');
  console.log(`Tenant: ${summary.tenantId}${summary.dryRun ? ' (dry run)' : ''}`);
  console.log(`Total journal entries: ${summary.totalJournalEntries}`);
  console.log(`Entries missing project (before): ${summary.entriesMissingProjectBefore}`);
  console.log(`Entries missing building (before): ${summary.entriesMissingBuildingBefore}`);
  if (!summary.dryRun) {
    console.log(`Entries touched from transactions: ${summary.entriesUpdatedFromTransactions}`);
    console.log(`Entries touched from invoices: ${summary.entriesUpdatedFromInvoices}`);
    console.log(`Entries touched from bills: ${summary.entriesUpdatedFromBills}`);
    console.log(`Entries touched from vendor clearing: ${summary.entriesUpdatedFromVendorClearing}`);
    console.log(`Journal lines synced from entries: ${summary.linesUpdatedFromEntries}`);
  }
  console.log(`Entries missing project (after): ${summary.entriesMissingProjectAfter}`);
  console.log(`Entries missing building (after): ${summary.entriesMissingBuildingAfter}`);
  console.log(`Entries with building_id set (after): ${summary.entriesWithBuildingAfter}`);
  console.log('========================================\n');
}
