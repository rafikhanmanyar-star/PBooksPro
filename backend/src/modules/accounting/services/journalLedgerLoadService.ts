/**
 * Load journal_lines + journal_entries for unified GL reporting (PostgreSQL / LAN).
 */
import type pg from 'pg';
import { JournalRepository } from '../repositories/JournalRepository.js';
import type { JournalEntryRow, JournalLineRow, JournalLedgerInput } from '../../../financial/journalLedgerCore.js';
import type { DataScopeEnforcementContext } from '../../../auth/tenantRepositoryScope.js';

export type { JournalLedgerInput, JournalEntryRow, JournalLineRow };

export async function loadJournalLedgerInput(
  client: pg.PoolClient,
  tenantId: string,
  options?: { asOfDate?: string; scopeCtx?: DataScopeEnforcementContext }
): Promise<Pick<JournalLedgerInput, 'journalLines' | 'journalEntries'>> {
  return new JournalRepository(tenantId).loadLedgerInput(client, options);
}
