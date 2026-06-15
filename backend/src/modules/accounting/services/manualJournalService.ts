import type pg from 'pg';
import { roundMoney } from '../../../financial/validation.js';
import { recordDomainMutation } from '../../../core/recordDomainMutation.js';
import { createFinancialPostingService } from './FinancialPostingService.js';
import type { CreateJournalBody } from './journalService.js';

/** Immutable journal rows use version 1 in change_log / realtime payloads. */
const JOURNAL_ENTRY_VERSION = 1;

export type JournalEntryEmitPayload = {
  id: string;
  journalEntryId: string;
  entryDate: string;
  reference?: string;
  description?: string;
  sourceModule?: string | null;
  sourceId?: string | null;
  version: number;
  amount?: number;
  reversed?: boolean;
  reversalJournalEntryId?: string;
  originalJournalEntryId?: string;
};

function debitTotal(body: CreateJournalBody): number {
  return roundMoney(body.lines.reduce((sum, line) => sum + (line.debitAmount ?? 0), 0));
}

export function buildJournalEntryEmitPayload(
  journalEntryId: string,
  body: CreateJournalBody,
  extra?: Partial<JournalEntryEmitPayload>
): JournalEntryEmitPayload {
  return {
    id: journalEntryId,
    journalEntryId,
    entryDate: body.entryDate,
    reference: body.reference ?? undefined,
    description: body.description ?? undefined,
    sourceModule: body.sourceModule ?? undefined,
    sourceId: body.sourceId ?? undefined,
    version: JOURNAL_ENTRY_VERSION,
    amount: debitTotal(body),
    ...extra,
  };
}

export async function postManualJournalWithAudit(
  client: pg.PoolClient,
  tenantId: string,
  body: CreateJournalBody,
  actorUserId: string | null
): Promise<{ journalEntryId: string; emitPayload: JournalEntryEmitPayload }> {
  const result = await createFinancialPostingService(tenantId).postManualJournal(client, body, {
    actorUserId,
  });
  const emitPayload = buildJournalEntryEmitPayload(result.journalEntryId, body);

  await recordDomainMutation(client, {
    tenantId,
    userId: actorUserId,
    module: 'accounting',
    entityType: 'journal_entry',
    entityId: result.journalEntryId,
    action: 'create',
    auditAction: 'manual_journal_post',
    summary: body.description ?? 'Manual journal entry posted',
    newValue: emitPayload,
    version: JOURNAL_ENTRY_VERSION,
  });

  return { journalEntryId: result.journalEntryId, emitPayload };
}

export async function reverseManualJournalWithAudit(
  client: pg.PoolClient,
  tenantId: string,
  originalJournalEntryId: string,
  reason: string,
  actorUserId: string | null
): Promise<{
  reversalJournalEntryId: string;
  originalEmitPayload: JournalEntryEmitPayload;
  reversalEmitPayload: JournalEntryEmitPayload;
}> {
  const result = await createFinancialPostingService(tenantId).reverseJournal(
    client,
    originalJournalEntryId,
    reason,
    actorUserId
  );

  const originalEmitPayload: JournalEntryEmitPayload = {
    id: originalJournalEntryId,
    journalEntryId: originalJournalEntryId,
    entryDate: '',
    version: JOURNAL_ENTRY_VERSION,
    reversed: true,
    reversalJournalEntryId: result.reversalJournalEntryId,
  };

  const reversalEmitPayload: JournalEntryEmitPayload = {
    id: result.reversalJournalEntryId,
    journalEntryId: result.reversalJournalEntryId,
    entryDate: '',
    version: JOURNAL_ENTRY_VERSION,
    originalJournalEntryId,
  };

  await recordDomainMutation(client, {
    tenantId,
    userId: actorUserId,
    module: 'accounting',
    entityType: 'journal_entry',
    entityId: originalJournalEntryId,
    action: 'update',
    auditAction: 'manual_journal_reverse',
    summary: `Journal entry reversed: ${reason}`,
    newValue: originalEmitPayload,
    version: JOURNAL_ENTRY_VERSION,
  });

  await recordDomainMutation(client, {
    tenantId,
    userId: actorUserId,
    module: 'accounting',
    entityType: 'journal_entry',
    entityId: result.reversalJournalEntryId,
    action: 'create',
    auditAction: 'manual_journal_reversal',
    summary: `Reversal journal for ${originalJournalEntryId}`,
    newValue: reversalEmitPayload,
    version: JOURNAL_ENTRY_VERSION,
  });

  return {
    reversalJournalEntryId: result.reversalJournalEntryId,
    originalEmitPayload,
    reversalEmitPayload,
  };
}
