import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import {
  insertJournalEntry,
  reverseJournalEntry,
  getJournalWithLines,
  isJournalReversed,
  type CreateJournalBody,
} from '../../../services/journalService.js';

/**
 * Tenant-scoped journal persistence. All GL writes go through this repository.
 */
export class JournalRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async insertEntry(
    client: pg.PoolClient,
    input: CreateJournalBody,
    journalEntryIdOverride?: string,
    options?: { allowClosedPeriod?: boolean }
  ): Promise<{ journalEntryId: string }> {
    return insertJournalEntry(client, this.tenantId, input, journalEntryIdOverride, options);
  }

  async reverseEntry(
    client: pg.PoolClient,
    originalJournalEntryId: string,
    reason: string,
    createdBy: string | null
  ): Promise<{ reversalJournalEntryId: string }> {
    return reverseJournalEntry(client, this.tenantId, originalJournalEntryId, reason, createdBy);
  }

  async getWithLines(
    client: pg.PoolClient,
    journalEntryId: string
  ): Promise<{ entry: Record<string, unknown>; lines: Record<string, unknown>[] } | null> {
    return getJournalWithLines(client, journalEntryId, this.tenantId);
  }

  async isReversed(client: pg.PoolClient, journalEntryId: string): Promise<boolean> {
    return isJournalReversed(client, journalEntryId, this.tenantId);
  }

  async findActiveBySource(
    client: pg.PoolClient,
    sourceModule: string,
    sourceId: string
  ): Promise<string | null> {
    const r = await client.query<{ id: string }>(
      `SELECT je.id FROM journal_entries je
       WHERE je.tenant_id = $1 AND je.source_module = $2 AND je.source_id = $3
         AND NOT EXISTS (
           SELECT 1 FROM journal_reversals jr
           WHERE jr.original_journal_entry_id = je.id AND jr.tenant_id = $1
         )
       ORDER BY je.created_at DESC, je.id DESC
       LIMIT 1`,
      [this.tenantId, sourceModule, sourceId]
    );
    return r.rows[0]?.id ?? null;
  }
}
